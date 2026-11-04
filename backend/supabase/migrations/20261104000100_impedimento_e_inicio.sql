-- Duas regras novas: o gestor resolve impedimentos e o cronograma começa por setor.

/* ── Início da operação ─────────────────────────────────────────────────── */

-- Setor sem data não gera ordem: cadastrar não dispara o cronograma.
alter table public.sector
  add column start_date date,
  add column started_by uuid;

-- As ordens de antes desta regra nasceram sem ninguém iniciar o setor. Nenhuma pode ter
-- resposta: se tiver, para tudo em vez de apagar trabalho de alguém.
do $$
begin
  if exists (
    select 1 from public.work_order w
    where w.status <> 'open' or w.returned_reason is not null
      or exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null)
  ) then
    raise exception 'Existe ordem com resposta ou decisão do gestor: nada foi alterado.';
  end if;
  delete from public.work_order;
end;
$$;

/*
 * Grava as ordens dos períodos recebidos, agora por setor (schedule.ts decide quais:
 * é lá que fica a regra da data de início). Setor sem período não gera nada.
 * Idempotente, como antes.
 */
create or replace function public.gerar_ordens(periodos jsonb, origem text default 'manual')
returns table (ordens integer, itens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ordens integer;
  n_itens integer;
begin
  with p as (
    select * from jsonb_to_recordset(periodos)
      as x(sector_code text, frequency public.frequency, period_start date, period_end date)
  ), grupos as (
    select distinct coalesce(e.parent_id, e.id) as equipment_id, pi.sector_code, pi.frequency
    from public.plan_item pi
    join public.equipment e on e.id = pi.equipment_id
    where pi.status = 'active'
  ), novas as (
    insert into public.work_order (equipment_id, sector_code, frequency, period_start, period_end, due_date)
    select g.equipment_id, g.sector_code, g.frequency, p.period_start, p.period_end, p.period_end
    from grupos g
    join p on p.frequency = g.frequency and p.sector_code = g.sector_code
    on conflict (equipment_id, sector_code, frequency, period_start) do nothing
    returning 1
  )
  select count(*) into n_ordens from novas;

  with p as (
    select * from jsonb_to_recordset(periodos)
      as x(sector_code text, frequency public.frequency, period_start date, period_end date)
  ), novos as (
    insert into public.work_order_item (work_order_id, plan_item_id)
    select wo.id, pi.id
    from public.work_order wo
    join p on p.frequency = wo.frequency and p.period_start = wo.period_start and p.sector_code = wo.sector_code
    join public.plan_item pi
      on pi.status = 'active' and pi.frequency = wo.frequency and pi.sector_code = wo.sector_code
    join public.equipment e on e.id = pi.equipment_id and coalesce(e.parent_id, e.id) = wo.equipment_id
    where wo.status in ('open', 'in_progress', 'blocked')
    on conflict (work_order_id, plan_item_id) do nothing
    returning 1
  )
  select count(*) into n_itens from novos;

  insert into public.generation_log (origin, ran_by, window_start, window_end, orders_created, items_created)
  select origem, auth.uid(), min(x.period_start), max(x.period_end), n_ordens, n_itens
  from jsonb_to_recordset(periodos) as x(period_start date, period_end date);

  return query select n_ordens, n_itens;
end;
$$;

/* Corrige um início errado: só enquanto ninguém mexeu em nenhuma ordem do setor. */
create function public.desfazer_inicio_setor(setor text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.work_order w
    where w.sector_code = setor
      and (w.status <> 'open' or w.returned_reason is not null
        or exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null))
  ) then
    raise exception 'O setor já tem respostas: não dá para desfazer o início.';
  end if;
  delete from public.work_order where sector_code = setor;
  update public.sector set start_date = null, started_by = null where code = setor;
end;
$$;

revoke execute on function public.desfazer_inicio_setor(text) from public, anon;
grant execute on function public.desfazer_inicio_setor(text) to authenticated;

/* ── Impedimento ────────────────────────────────────────────────────────── */

-- O que o gestor resolveu: o celular mostra até o funcionário concluir de novo.
alter table public.work_order add column released_note text;

-- Liberar apaga a resposta do item; o que ela dizia fica aqui.
alter table public.audit_log add column details jsonb;
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('validar', 'devolver', 'cancelar', 'liberar'));

/*
 * O gestor resolveu o que impedia: os itens "não consegui" voltam a pendentes e o
 * funcionário é avisado no celular. As outras respostas da ordem ficam como estão.
 * Precisa ser função: o gestor não altera work_order_item diretamente.
 */
create function public.liberar_impedimento(ordem uuid, resolucao text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text := btrim(coalesce(resolucao, ''));
  apagados jsonb;
begin
  if texto = '' then raise exception 'Escreva o que foi resolvido.'; end if;

  update public.work_order set released_note = texto where id = ordem and status = 'blocked';
  if not found then raise exception 'Só dá para liberar uma ordem impedida.'; end if;

  select jsonb_agg(jsonb_build_object(
      'item', i.id, 'motivo', i.block_reason, 'funcionario', i.executed_by, 'quando', i.device_time))
    into apagados
  from public.work_order_item i
  where i.work_order_id = ordem and i.result = 'blocked';

  insert into public.audit_log (actor, action, work_order_id, reason, details)
  values (auth.uid(), 'liberar', ordem, texto, apagados);

  update public.work_order_item set
    result = null, measured_value = null, block_reason = null, executed_by = null,
    device_time = null, received_at = null
  where work_order_id = ordem and result = 'blocked';

  perform public.recalcular_ordem(ordem);
end;
$$;

revoke execute on function public.liberar_impedimento(uuid, text) from public, anon;
grant execute on function public.liberar_impedimento(uuid, text) to authenticated;

/*
 * Igual à anterior, com duas mudanças no finish: recusa ordem com item impedido
 * ("não consegui" deixa a verificação pendente, escopo seção 6) e limpa o aviso de
 * liberação. A recusa cobre app antigo e fila offline; o app novo nem deixa concluir.
 */
create or replace function public.sincronizar(funcionario uuid, operacoes jsonb)
returns table (op_id text, status text, motivo text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  op jsonb;
  ordem public.work_order;
  item_ordem uuid;
  st text;
  mot text;
begin
  if not exists (select 1 from public.worker w where w.id = funcionario and w.active) then
    raise exception 'funcionário inexistente ou desativado';
  end if;

  for op in select * from jsonb_array_elements(operacoes) loop
    st := 'accepted';
    mot := null;
    if exists (select 1 from public.sync_op s where s.op_id = op->>'opId') then
      op_id := op->>'opId'; status := 'duplicate'; motivo := null;
      return next;
      continue;
    end if;

    -- Ordem alvo: direto (finish) ou pelo item (answer/clear).
    if op->>'type' = 'finish' then
      select * into ordem from public.work_order where id = (op->>'orderId')::uuid;
    else
      select i.work_order_id into item_ordem from public.work_order_item i where i.id = (op->>'itemId')::uuid;
      select * into ordem from public.work_order where id = item_ordem;
    end if;

    if ordem.id is null then
      st := 'rejected'; mot := 'ordem ou item não encontrado';
    elsif ordem.assigned_worker_id is distinct from funcionario
      and ordem.sector_code not in (select ws.sector_code from public.worker_sector ws where ws.worker_id = funcionario) then
      st := 'rejected'; mot := 'ordem de outro setor';
    elsif ordem.status not in ('open', 'in_progress', 'blocked') then
      st := 'rejected'; mot := 'ordem já finalizada, validada ou cancelada';
    elsif op->>'type' = 'answer' then
      update public.work_order_item set
        result = (op->>'result')::public.item_result,
        measured_value = (op->>'value')::numeric,
        block_reason = op->>'reason',
        executed_by = funcionario,
        device_time = (op->>'deviceTime')::timestamptz,
        received_at = now()
      where id = (op->>'itemId')::uuid;
      perform public.recalcular_ordem(ordem.id);
    elsif op->>'type' = 'clear' then
      update public.work_order_item set
        result = null, measured_value = null, block_reason = null, executed_by = null,
        device_time = null, received_at = now()
      where id = (op->>'itemId')::uuid;
      perform public.recalcular_ordem(ordem.id);
    elsif op->>'type' = 'finish' then
      if exists (select 1 from public.work_order_item i where i.work_order_id = ordem.id and i.result = 'blocked') then
        st := 'rejected'; mot := 'item impedido: espera o gestor';
      else
        update public.work_order set
          status = 'awaiting_validation',
          finished_at = coalesce((op->>'deviceTime')::timestamptz, now()),
          assigned_worker_id = coalesce(assigned_worker_id, funcionario),
          returned_reason = null,
          released_note = null
        where id = ordem.id;
      end if;
    else
      st := 'rejected'; mot := 'tipo de operação desconhecido';
    end if;

    insert into public.sync_op (op_id, worker_id, kind, payload, status, reason)
    values (op->>'opId', funcionario, coalesce(op->>'type', '?'), op, st, mot);

    op_id := op->>'opId'; status := st; motivo := mot;
    return next;
    ordem := null;
    item_ordem := null;
  end loop;
end;
$$;
