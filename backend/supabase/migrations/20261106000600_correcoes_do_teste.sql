-- Correções do teste com vários agentes.

/* Gestor desativado perde o acesso na hora, mesmo com o token ainda válido: o bloqueio é banned_until. */
create or replace function public.current_company_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.company_id
  from public.app_user u
  join public.company c on c.id = u.company_id
  join auth.users conta on conta.id = u.user_id
  where u.user_id = auth.uid() and u.role = 'manager' and c.active
    and (conta.banned_until is null or conta.banned_until <= now());
$$;

/* Antes de convidar: convidar de novo uma conta pendente devolve a mesma conta, não um erro. */
create function public.conta_por_email(endereco text) returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(endereco);
$$;
revoke execute on function public.conta_por_email(text) from public, anon, authenticated;
grant execute on function public.conta_por_email(text) to service_role;

/* A pasta da foto é o id da própria linha: a rota do celular assina com a chave secreta. */
alter table public.equipment add constraint equipment_foto_propria
  check (photo_path is null or split_part(photo_path, '/', 1) = id::text);
alter table public.worker add constraint worker_foto_propria
  check (photo_path is null or split_part(photo_path, '/', 1) = id::text);

/* Permissões: projetos com exposição automática dão tudo a anon e authenticated, e o grant por coluna não restringe nada. */
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke all on public.device, public.device_activation from authenticated;
grant select (id, company_id, name, last_seen_at, revoked_at, created_by, created_at) on public.device to authenticated;
grant update (revoked_at, name) on public.device to authenticated;
grant select (company_id, name, expires_at, used_at, created_by, created_at) on public.device_activation to authenticated;
grant insert (code_hash, name, expires_at) on public.device_activation to authenticated;

-- O código é de curta duração, e celular revogado precisa de código novo.
alter table public.device_activation add constraint device_activation_curta
  check (expires_at <= created_at + interval '1 hour');

create function public.manter_revogado() returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'Celular revogado precisa de um código novo.';
  end if;
  return new;
end;
$$;
create trigger manter_revogado before update of revoked_at on public.device
for each row execute function public.manter_revogado();

/* opId é único por empresa: uma empresa não descobre nem consome o de outra. */
alter table public.sync_op drop constraint sync_op_pkey;
alter table public.sync_op add primary key (company_id, op_id);

/*
 * Uma operação ruim não derruba o lote: antes, um valor inválido devolvia 500 e a fila do
 * celular ficava presa para sempre. Reenvio repete a recusa em vez de parecer entregue,
 * envios simultâneos do mesmo opId viram duplicate, e não se conclui ordem sem nenhuma resposta.
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
        select * into ordem from public.work_order where id = (op->>'orderId')::uuid;
      else
        select i.work_order_id into item_ordem from public.work_order_item i where i.id = (op->>'itemId')::uuid;
        select * into ordem from public.work_order where id = item_ordem;
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
