-- Respostas do celular voltando ao painel (escopo v0.5, seção 8.2).
-- Cada operação do aparelho tem um op_id gerado lá; repetir o envio devolve
-- "duplicate" e não aplica de novo. Fotos e áudios vão para o bucket privado
-- "evidence", ligados ao item da ordem.

create table public.sync_op (
  op_id text primary key check (length(op_id) between 16 and 64),
  worker_id uuid not null references public.worker (id),
  kind text not null,
  payload jsonb not null,
  status text not null check (status in ('accepted', 'rejected')),
  reason text,
  received_at timestamptz not null default now()
);
create index sync_op_worker on public.sync_op (worker_id, received_at desc);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  work_order_item_id uuid not null references public.work_order_item (id) on delete cascade,
  kind text not null check (kind in ('photo', 'audio')),
  storage_path text not null unique,
  sha256 text not null,
  size_bytes integer not null,
  uploaded_by uuid references public.worker (id),
  uploaded_at timestamptz not null default now()
);
create index evidence_item on public.evidence (work_order_item_id);

/*
 * Situação da ordem a partir dos itens, enquanto o executante trabalha:
 * algum "não consegui" → impedida; alguma resposta → em execução; nenhuma → a fazer.
 * Finalizada, validada ou cancelada não muda por aqui.
 */
create function public.recalcular_ordem(ordem uuid) returns void
language sql
security definer
set search_path = public
as $$
  update public.work_order w set status = case
      when exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result = 'blocked') then 'blocked'
      when exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null) then 'in_progress'
      else 'open'
    end::public.work_order_status
  where w.id = ordem and w.status in ('open', 'in_progress', 'blocked');
$$;

/*
 * Aplica, em ordem, as operações enviadas por um aparelho para um funcionário.
 *   answer: {opId, type, itemId, result, value?, reason?, deviceTime}
 *   clear:  {opId, type, itemId}                (Desfazer depois de já ter enviado)
 *   finish: {opId, type, orderId, deviceTime}
 * Devolve uma linha por operação: accepted, duplicate ou rejected (com motivo).
 * Só aceita ordens dos setores do funcionário (ou atribuídas a ele) e ainda abertas.
 */
create function public.sincronizar(funcionario uuid, operacoes jsonb)
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
      update public.work_order set
        status = 'awaiting_validation',
        finished_at = coalesce((op->>'deviceTime')::timestamptz, now()),
        assigned_worker_id = coalesce(assigned_worker_id, funcionario),
        returned_reason = null
      where id = ordem.id;
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

-- Só o servidor (API do celular, com a chave secreta) aplica operações.
revoke execute on function public.recalcular_ordem(uuid) from public, anon, authenticated;
revoke execute on function public.sincronizar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sincronizar(uuid, jsonb) to service_role;

alter table public.sync_op enable row level security;
alter table public.evidence enable row level security;
create policy "gestor lê envios" on public.sync_op for select to authenticated using (true);
create policy "gestor lê evidências" on public.evidence for select to authenticated using (true);
grant select on public.sync_op, public.evidence to authenticated;
grant select, insert on public.evidence to service_role;

-- Fotos e áudios das respostas: bucket privado, lido pelo painel por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 4194304)
on conflict (id) do nothing;

create policy "gestor lê evidências do bucket" on storage.objects
  for select to authenticated using (bucket_id = 'evidence');
