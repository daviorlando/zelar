-- Correções da auditoria: corridas entre celular e gestor, decisões do quadro numa só
-- transação, auditoria gravada pelo banco, atividade da planilha identificada pelo conteúdo
-- e limite no bucket das fotos de funcionário.

/* ── Atividade da planilha: identificada pelo conteúdo, não pela linha ───── */

-- Setor, frequência, tag (sem tag, os nomes), texto e ocorrência, calculados pelo importador
-- (backend/tools/importer/casar.ts). O painel não mexe nesta coluna: atividade editada ou
-- excluída continua casando com a linha da planilha que a originou. Aba e linha ficam só
-- para ordenar; inserir linha no meio ou renomear a aba não muda a identidade de nada.
-- As importadas antes ganham a chave na próxima importação.
alter table public.plan_item add column source_key text;
alter table public.plan_item drop constraint plan_item_company_source_key;
alter table public.plan_item add constraint plan_item_company_source_key unique (company_id, source_key);

/* ── Auditoria: gravada pelo banco a cada mudança de situação ───────────── */

/*
 * Toda decisão sobre a ordem fica registrada, venha do painel, de uma função ou de um PATCH
 * direto na API. Andamento pelo celular (responder, concluir) e o recálculo da situação pelas
 * respostas não são decisão e não entram. Liberar impedimento continua registrado pela
 * própria liberar_impedimento(), que não muda a situação diretamente.
 */
create function public.auditar_situacao() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acao text;
  motivo text;
  detalhes jsonb;
  pulados integer;
begin
  if new.status = 'done' then
    acao := 'validar';
    -- Itens que o funcionário não soube responder: o gestor aceitou ao validar.
    select count(*) into pulados from public.work_order_item i where i.work_order_id = new.id and i.result = 'skipped';
    if pulados > 0 then detalhes := jsonb_build_object('pulados', pulados); end if;
  elsif new.status = 'cancelled' then
    acao := 'cancelar';
    motivo := new.cancel_reason;
  elsif new.status in ('open', 'in_progress', 'blocked') and old.status not in ('open', 'in_progress', 'blocked') then
    acao := 'devolver';
    motivo := new.returned_reason;
  else
    return null;
  end if;

  insert into public.audit_log (actor, action, work_order_id, reason, details)
  values (auth.uid(), acao, new.id, motivo, detalhes);
  return null;
end;
$$;

revoke execute on function public.auditar_situacao() from public, anon, authenticated;

create trigger auditar_situacao after update of status on public.work_order
for each row when (old.status is distinct from new.status) execute function public.auditar_situacao();

-- Ninguém grava auditoria à mão: só o gatilho acima e as funções do banco.
drop policy "gestor registra decisões" on public.audit_log;
revoke insert on public.audit_log from authenticated;

/* ── Decisões do quadro: trava a ordem, confere e muda numa só transação ─── */

/*
 * O gestor conferiu as respostas: a ordem está concluída. Item que o funcionário não soube
 * responder não impede, mas precisa do aceite do gestor (fica contado na auditoria).
 */
create function public.validar_ordem(ordem uuid, aceita_pulados boolean default false) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  situacao public.work_order_status;
  pulados integer;
begin
  select w.status into situacao from public.work_order w
  where w.id = ordem and w.company_id = public.current_company_id()
  for update;
  if not found then raise exception 'Ordem não encontrada.'; end if;

  -- "Não consegui" é verificação pendente: não pode virar Concluída.
  if exists (select 1 from public.work_order_item i where i.work_order_id = ordem and i.result = 'blocked') then
    raise exception 'Esta ordem tem item impedido. Devolva ao funcionário e libere o item.';
  end if;
  select count(*) into pulados from public.work_order_item i where i.work_order_id = ordem and i.result = 'skipped';
  if pulados > 0 and not coalesce(aceita_pulados, false) then
    raise exception 'Esta ordem tem % sem resposta. Abra a ordem e confirme.', pulados;
  end if;
  if situacao <> 'awaiting_validation' then
    raise exception 'Só dá para validar o que está aguardando validação.';
  end if;

  update public.work_order set status = 'done', validated_at = now(), validated_by = auth.uid()
  where id = ordem;
end;
$$;

/* Volta para o funcionário completar. As respostas ficam; ele vê a ordem de novo no celular. */
create function public.devolver_ordem(ordem uuid, motivo text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text := btrim(coalesce(motivo, ''));
  alvo public.work_order;
begin
  if texto = '' then raise exception 'Escreva o motivo da devolução.'; end if;

  select * into alvo from public.work_order w
  where w.id = ordem and w.company_id = public.current_company_id()
  for update;
  if not found then raise exception 'Ordem não encontrada.'; end if;
  -- Revisão diária saiu do plano: ordem antiga não volta para o celular.
  if alvo.status not in ('awaiting_validation', 'done') or alvo.frequency = 'daily' then
    raise exception 'Só dá para devolver o que foi concluído pelo funcionário, e revisão diária não volta mais.';
  end if;

  update public.work_order set
    status = 'open', returned_reason = texto, validated_at = null, validated_by = null, finished_at = null
  where id = ordem;
  -- Situação de novo pelas respostas: em execução, impedida ou a fazer.
  perform public.recalcular_ordem(ordem);
end;
$$;

/* Tira a ordem do quadro (equipamento parado, por exemplo). Exige motivo. */
create function public.cancelar_ordem(ordem uuid, motivo text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text := btrim(coalesce(motivo, ''));
  situacao public.work_order_status;
begin
  if texto = '' then raise exception 'Escreva o motivo do cancelamento.'; end if;

  select w.status into situacao from public.work_order w
  where w.id = ordem and w.company_id = public.current_company_id()
  for update;
  if not found then raise exception 'Ordem não encontrada.'; end if;
  if situacao = 'cancelled' then raise exception 'A ordem já estava cancelada.'; end if;

  update public.work_order set status = 'cancelled', cancel_reason = texto, cancelled_at = now(), cancelled_by = auth.uid()
  where id = ordem;
end;
$$;

revoke execute on function public.validar_ordem(uuid, boolean) from public, anon;
revoke execute on function public.devolver_ordem(uuid, text) from public, anon;
revoke execute on function public.cancelar_ordem(uuid, text) from public, anon;
grant execute on function public.validar_ordem(uuid, boolean) to authenticated;
grant execute on function public.devolver_ordem(uuid, text) to authenticated;
grant execute on function public.cancelar_ordem(uuid, text) to authenticated;

/* ── Desfazer início: trava as ordens do setor antes de conferir ────────── */

-- Igual à anterior. Sem a trava, uma resposta do celular chegando entre a conferência e o
-- delete era apagada junto com a ordem.
create or replace function public.desfazer_inicio_setor(setor text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa uuid := public.current_company_id();
begin
  if empresa is null then raise exception 'Sem empresa.'; end if;
  perform 1 from public.work_order w where w.company_id = empresa and w.sector_code = setor for update;
  if exists (
    select 1 from public.work_order w
    where w.company_id = empresa and w.sector_code = setor
      and (w.status <> 'open' or w.returned_reason is not null
        or exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null))
  ) then
    raise exception 'O setor já tem respostas: não dá para desfazer o início.';
  end if;
  delete from public.work_order where company_id = empresa and sector_code = setor;
  update public.sector set start_date = null, started_by = null where company_id = empresa and code = setor;
end;
$$;

/* ── Ajuste das ordens: atividade sem equipamento também sai ────────────── */

-- Igual à anterior, com left join: item de atividade que perdeu o equipamento nunca saía.
create or replace function public.ajustar_ordens_da_empresa(empresa uuid) returns table (itens integer, ordens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  n_itens integer;
  n_ordens integer;
  afetadas uuid[];
begin
  with fora as (
    delete from public.work_order_item i
    using public.work_order wo, public.plan_item pi
      left join public.equipment e on e.id = pi.equipment_id
    where wo.id = i.work_order_id
      and pi.id = i.plan_item_id
      and wo.company_id = empresa
      and wo.status in ('open', 'in_progress', 'blocked')
      and i.result is null
      and (pi.status <> 'active'
           or pi.equipment_id is null
           or pi.frequency <> wo.frequency
           or pi.sector_code <> wo.sector_code
           or coalesce(e.parent_id, e.id) <> wo.equipment_id)
    returning i.work_order_id
  )
  select count(*), array_agg(distinct work_order_id) into n_itens, afetadas from fora;

  with vazias as (
    delete from public.work_order wo
    where wo.id = any (coalesce(afetadas, '{}'))
      and wo.status = 'open'
      and not exists (select 1 from public.work_order_item i where i.work_order_id = wo.id)
    returning 1
  )
  select count(*) into n_ordens from vazias;

  perform public.recalcular_ordem(x) from unnest(coalesce(afetadas, '{}')) as x;
  return query select n_itens, n_ordens;
end;
$$;

/* ── Sincronizar: trava a ordem antes de conferir a situação ────────────── */

/*
 * Igual à anterior (20261106000600), com "for update" ao ler a ordem: um "finish" do celular
 * esperava o gestor só no update e então sobrescrevia o cancelamento ou a validação que
 * acabara de acontecer. Travada, a ordem é lida já com a decisão do gestor.
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
  empresa uuid;
begin
  select w.company_id into empresa from public.worker w where w.id = funcionario and w.active;
  if empresa is null then
    raise exception 'funcionário inexistente ou desativado';
  end if;

  for op in select * from jsonb_array_elements(operacoes) loop
    st := 'accepted';
    mot := null;
    ordem := null;
    item_ordem := null;

    select s.status, s.reason into st, mot from public.sync_op s where s.company_id = empresa and s.op_id = op->>'opId';
    if found then
      op_id := op->>'opId';
      status := case when st = 'rejected' then 'rejected' else 'duplicate' end;
      motivo := mot;
      return next;
      continue;
    end if;
    st := 'accepted';
    mot := null;

    begin
      -- Ordem alvo: direto (finish) ou pelo item (answer/clear).
      if op->>'type' = 'finish' then
        select * into ordem from public.work_order where id = (op->>'orderId')::uuid for update;
      else
        select i.work_order_id into item_ordem from public.work_order_item i where i.id = (op->>'itemId')::uuid;
        select * into ordem from public.work_order where id = item_ordem for update;
      end if;

      if ordem.id is null or ordem.company_id <> empresa then
        st := 'rejected'; mot := 'ordem ou item não encontrado';
      elsif ordem.assigned_worker_id is distinct from funcionario
        and ordem.sector_code not in (select ws.sector_code from public.worker_sector ws where ws.worker_id = funcionario) then
        st := 'rejected'; mot := 'ordem de outro setor';
      elsif ordem.status not in ('open', 'in_progress', 'blocked') then
        st := 'rejected'; mot := 'ordem já finalizada, validada ou cancelada';
      elsif op->>'type' = 'answer' then
        if op->>'result' is null then
          st := 'rejected'; mot := 'resposta sem resultado';
        else
          update public.work_order_item set
            result = (op->>'result')::public.item_result,
            measured_value = (op->>'value')::numeric,
            block_reason = op->>'reason',
            executed_by = funcionario,
            device_time = (op->>'deviceTime')::timestamptz,
            received_at = now()
          where id = (op->>'itemId')::uuid;
          perform public.recalcular_ordem(ordem.id);
        end if;
      elsif op->>'type' = 'clear' then
        update public.work_order_item set
          result = null, measured_value = null, block_reason = null, executed_by = null,
          device_time = null, received_at = now()
        where id = (op->>'itemId')::uuid;
        perform public.recalcular_ordem(ordem.id);
      elsif op->>'type' = 'finish' then
        if exists (select 1 from public.work_order_item i where i.work_order_id = ordem.id and i.result = 'blocked') then
          st := 'rejected'; mot := 'item impedido: espera o gestor';
        elsif not exists (select 1 from public.work_order_item i where i.work_order_id = ordem.id and i.result is not null) then
          st := 'rejected'; mot := 'ordem sem nenhuma resposta';
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
    exception
      when unique_violation then
        -- Outro pedido gravou o mesmo opId neste instante: o desta chamada foi desfeito.
        st := 'duplicate'; mot := null;
      when data_exception then
        st := 'rejected'; mot := 'dados inválidos';
        insert into public.sync_op (op_id, worker_id, kind, payload, status, reason)
        values (op->>'opId', funcionario, coalesce(op->>'type', '?'), op, st, mot);
    end;

    op_id := op->>'opId'; status := st; motivo := mot;
    return next;
  end loop;
end;
$$;

/* ── Fotos de funcionário: mesmo limite das fotos de máquina ────────────── */

update storage.buckets set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'worker-photos';
