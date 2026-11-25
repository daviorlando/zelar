-- Correções da sincronização: lote de funcionário desativado fica guardado como recusa,
-- celular atrasado não sobrescreve a resposta do colega, desfazer apaga as fotos do item
-- e as contagens por setor saem do banco.

/* ── Envio: "ignored" para o que chegou atrasado ────────────────────────── */

-- Ignorada: a operação era válida, mas outro funcionário respondeu o item depois. O celular
-- tira da fila sem pedir atenção (não há o que ele fazer); o registro fica para o gestor.
alter table public.sync_op drop constraint sync_op_status_check;
alter table public.sync_op add constraint sync_op_status_check check (status in ('accepted', 'rejected', 'ignored'));

/* ── Sincronizar: desativado, resposta atrasada e desfazer ──────────────── */

/*
 * Igual à anterior (20261110000000), com três mudanças:
 * - Funcionário desativado: cada operação fica gravada como recusada, em vez de uma exceção
 *   que desfazia tudo. O celular para de reenviar e o gestor tem o registro (sync_op).
 * - "answer" só grava se o item não tem resposta mais nova (device_time, com 2 min de folga
 *   para relógios desacertados); "clear" só desfaz resposta do próprio funcionário.
 *   Senão o celular que ficou dias sem internet apagava ou trocava a resposta do colega.
 *   A operação fica como "ignored", com o motivo.
 * - "clear" apaga as fotos e áudios do item (evidence): o gestor via a foto do problema
 *   num item desfeito. O arquivo continua no bucket, só sai do quadro.
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
  ativo boolean;
begin
  select w.company_id, w.active into empresa, ativo from public.worker w where w.id = funcionario;
  if empresa is null then
    raise exception 'funcionário inexistente';
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
      -- Ordem alvo: direto (finish) ou pelo item (answer/clear). Desativado não trava nada.
      if not ativo then
        null;
      elsif op->>'type' = 'finish' then
        select * into ordem from public.work_order where id = (op->>'orderId')::uuid for update;
      else
        select i.work_order_id into item_ordem from public.work_order_item i where i.id = (op->>'itemId')::uuid;
        select * into ordem from public.work_order where id = item_ordem for update;
      end if;

      if not ativo then
        st := 'rejected'; mot := 'funcionário desativado';
      elsif ordem.id is null or ordem.company_id <> empresa then
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
          update public.work_order_item i set
            result = (op->>'result')::public.item_result,
            measured_value = (op->>'value')::numeric,
            block_reason = op->>'reason',
            executed_by = funcionario,
            device_time = (op->>'deviceTime')::timestamptz,
            received_at = now()
          where i.id = (op->>'itemId')::uuid
            -- 2 min de folga: device_time vem do relógio de cada celular, e um relógio um
            -- pouco atrasado não pode perder a resposta que de fato veio depois.
            and (i.device_time is null or i.device_time <= (op->>'deviceTime')::timestamptz + interval '2 minutes');
          if found then
            perform public.recalcular_ordem(ordem.id);
          else
            st := 'ignored'; mot := 'item já tem resposta mais nova';
          end if;
        end if;
      elsif op->>'type' = 'clear' then
        update public.work_order_item i set
          result = null, measured_value = null, block_reason = null, executed_by = null,
          device_time = null, received_at = now()
        where i.id = (op->>'itemId')::uuid
          and (i.result is null or i.executed_by = funcionario);
        if found then
          delete from public.evidence e where e.work_order_item_id = (op->>'itemId')::uuid;
          perform public.recalcular_ordem(ordem.id);
        else
          st := 'ignored'; mot := 'item respondido por outro funcionário';
        end if;
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

/* ── Contagens por setor: somadas no banco ──────────────────────────────── */

/*
 * O que a Implantação e a lista de setores mostram de cada setor. Antes o painel baixava as
 * linhas e contava, e o limite de 1000 linhas por consulta (max_rows) cortava sem avisar.
 * security_invoker: cada gestor vê só a própria empresa pelo RLS das tabelas.
 * ordens_por_frequencia: equipamentos principais com atividade em cada frequência, que é o
 * número de ordens por período que a prévia do início multiplica.
 * tocado: já tem resposta ou decisão, e o início não pode mais ser desfeito.
 */
create view public.resumo_do_setor with (security_invoker = true) as
select
  s.company_id,
  s.code,
  (select count(*) from public.equipment e
    where e.company_id = s.company_id and e.sector_code = s.code and e.parent_id is null and e.archived_at is null) as equipamentos,
  (select count(*) from public.plan_item p
    where p.company_id = s.company_id and p.sector_code = s.code and p.status = 'active') as atividades,
  (select count(*) from public.worker_sector ws join public.worker w on w.id = ws.worker_id
    where ws.company_id = s.company_id and ws.sector_code = s.code and w.active) as responsaveis,
  (select coalesce(jsonb_object_agg(g.frequency, g.n), '{}')
    from (select p.frequency, count(distinct coalesce(e.parent_id, e.id)) as n
          from public.plan_item p join public.equipment e on e.id = p.equipment_id
          where p.company_id = s.company_id and p.sector_code = s.code and p.status = 'active'
          group by p.frequency) g) as ordens_por_frequencia,
  exists (select 1 from public.work_order w
    where w.company_id = s.company_id and w.sector_code = s.code
      and (w.status <> 'open' or w.returned_reason is not null
        or exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null))) as tocado
from public.sector s;

revoke all on public.resumo_do_setor from anon, authenticated;
grant select on public.resumo_do_setor to authenticated;
