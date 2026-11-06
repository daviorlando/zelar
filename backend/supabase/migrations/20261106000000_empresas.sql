-- Várias empresas no mesmo banco: cada linha pertence a uma empresa e o gestor só enxerga a sua.
-- Tudo o que já existe passa a ser da Eco Gesso. O painel antigo continua funcionando durante
-- a troca: quem insere não precisa mandar company_id (vem do gestor conectado ou da linha-pai).

create table public.company (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.company (id, name) values ('e0000000-0000-4000-8000-000000000001', 'Eco Gesso');

-- Perfil de quem entra no painel. Conta do Auth sem linha aqui não enxerga nada.
create table public.app_user (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.company (id) on delete restrict,
  role text not null check (role in ('super_admin', 'manager')),
  created_at timestamptz not null default now(),
  -- Super-admin cuida das empresas e não pertence a nenhuma; gestor pertence a exatamente uma.
  check ((role = 'super_admin') = (company_id is null))
);
create index app_user_company on public.app_user (company_id);

insert into public.app_user (user_id, company_id, role)
select id, 'e0000000-0000-4000-8000-000000000001', 'manager' from auth.users;

/*
 * Empresa do gestor conectado. Consulta a tabela em vez de ler o token: desativar a empresa
 * ou o gestor vale na hora. Null para quem não é gestor ativo: as políticas não liberam nada.
 */
create function public.current_company_id() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.company_id
  from public.app_user u
  join public.company c on c.id = u.company_id
  where u.user_id = auth.uid() and u.role = 'manager' and c.active;
$$;

revoke execute on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated, service_role;

/* ── company_id em todas as tabelas ─────────────────────────────────────── */

do $$
declare
  t text;
begin
  foreach t in array array['sector', 'equipment', 'plan_item', 'worker', 'worker_sector', 'work_order',
                           'work_order_item', 'sync_op', 'evidence', 'generation_log', 'audit_log'] loop
    execute format(
      'alter table public.%I add column company_id uuid not null default %L references public.company (id) on delete restrict',
      t, 'e0000000-0000-4000-8000-000000000001');
    execute format('create index %I on public.%I (company_id)', t || '_company', t);
    -- Sem padrão por tabela: a Eco Gesso foi só para preencher o que já existia.
    execute format('alter table public.%I alter column company_id drop default', t);
  end loop;
end;
$$;

-- Tabelas sem linha-pai: a empresa vem do gestor conectado. Sem gestor (chave secreta), o
-- padrão é null e o insert falha em vez de cair na empresa errada.
alter table public.sector alter column company_id set default public.current_company_id();
alter table public.equipment alter column company_id set default public.current_company_id();
alter table public.plan_item alter column company_id set default public.current_company_id();
alter table public.worker alter column company_id set default public.current_company_id();

/* ── Setor: o código só é único dentro da empresa ───────────────────────── */

alter table public.equipment drop constraint equipment_sector_code_fkey;
alter table public.plan_item drop constraint plan_item_sector_code_fkey;
alter table public.worker_sector drop constraint worker_sector_sector_code_fkey;
alter table public.work_order drop constraint work_order_sector_code_fkey;
alter table public.sector drop constraint sector_pkey;
alter table public.sector add primary key (company_id, code);

alter table public.equipment add constraint equipment_sector_fkey
  foreign key (company_id, sector_code) references public.sector (company_id, code);
alter table public.plan_item add constraint plan_item_sector_fkey
  foreign key (company_id, sector_code) references public.sector (company_id, code);
alter table public.worker_sector add constraint worker_sector_sector_fkey
  foreign key (company_id, sector_code) references public.sector (company_id, code);
alter table public.work_order add constraint work_order_sector_fkey
  foreign key (company_id, sector_code) references public.sector (company_id, code);

-- Duas empresas podem ter a mesma tag e a mesma planilha.
alter table public.equipment drop constraint equipment_tag_key;
alter table public.equipment add constraint equipment_company_tag_key unique (company_id, tag);
alter table public.plan_item drop constraint plan_item_source_sheet_source_row_key;
alter table public.plan_item add constraint plan_item_company_source_key unique (company_id, source_sheet, source_row);

/* ── Coerência entre linhas ─────────────────────────────────────────────── */

/*
 * Preenche company_id a partir da linha-pai e recusa referência a outra empresa.
 * As FKs de uuid continuam simples (os embeds do PostgREST dependem delas), então esta
 * regra é o que impede um gestor de apontar para o funcionário ou a máquina de outra empresa.
 */
create function public.conferir_empresa() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dono uuid;
  outras uuid[];
begin
  case tg_table_name
    when 'equipment' then
      dono := new.company_id;
      outras := array[(select company_id from public.equipment where id = new.parent_id)];
    when 'plan_item' then
      dono := new.company_id;
      outras := array[(select company_id from public.equipment where id = new.equipment_id)];
    when 'worker_sector' then
      select company_id into dono from public.worker where id = new.worker_id;
    when 'work_order' then
      select company_id into dono from public.equipment where id = new.equipment_id;
      outras := array[(select company_id from public.worker where id = new.assigned_worker_id)];
    when 'work_order_item' then
      select company_id into dono from public.work_order where id = new.work_order_id;
      outras := array[
        (select company_id from public.plan_item where id = new.plan_item_id),
        (select company_id from public.worker where id = new.executed_by)];
    when 'evidence' then
      select company_id into dono from public.work_order_item where id = new.work_order_item_id;
      outras := array[(select company_id from public.worker where id = new.uploaded_by)];
    when 'audit_log' then
      select company_id into dono from public.work_order where id = new.work_order_id;
    when 'sync_op' then
      select company_id into dono from public.worker where id = new.worker_id;
  end case;

  if dono is null then
    raise exception 'Empresa não identificada em %.', tg_table_name using errcode = '23503';
  end if;
  if new.company_id is distinct from dono and new.company_id is not null then
    raise exception 'Registro de outra empresa em %.', tg_table_name using errcode = '23503';
  end if;
  if exists (select 1 from unnest(outras) o where o is not null and o <> dono) then
    raise exception 'Referência a outra empresa em %.', tg_table_name using errcode = '23503';
  end if;
  new.company_id := dono;
  return new;
end;
$$;

revoke execute on function public.conferir_empresa() from public, anon, authenticated;

create trigger empresa_coerente before insert or update of company_id, parent_id on public.equipment
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, equipment_id on public.plan_item
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, worker_id on public.worker_sector
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, equipment_id, assigned_worker_id on public.work_order
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, work_order_id, plan_item_id, executed_by on public.work_order_item
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, work_order_item_id, uploaded_by on public.evidence
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, work_order_id on public.audit_log
for each row execute function public.conferir_empresa();
create trigger empresa_coerente before insert or update of company_id, worker_id on public.sync_op
for each row execute function public.conferir_empresa();

/* ── Políticas: de using (true) para "só a minha empresa" ───────────────── */

-- Mantém nome e operação de cada política; troca só a condição.
do $$
declare
  p record;
  cond text := 'company_id = (select public.current_company_id())';
begin
  for p in
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public'
      and tablename in ('sector', 'equipment', 'plan_item', 'worker', 'worker_sector', 'work_order',
                        'work_order_item', 'sync_op', 'evidence', 'generation_log', 'audit_log')
  loop
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, cond);
    elsif p.cmd = 'UPDATE' then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, cond, cond);
    elsif p.tablename = 'audit_log' then
      -- O autor continua sendo sempre quem está conectado.
      execute format('alter policy %I on public.%I with check (%s and actor = auth.uid())', p.policyname, p.tablename, cond);
    else
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, cond);
    end if;
  end loop;
end;
$$;

alter table public.company enable row level security;
alter table public.app_user enable row level security;
create policy "gestor lê a própria empresa" on public.company
  for select to authenticated using (id = (select public.current_company_id()));
create policy "cada um lê o próprio perfil" on public.app_user
  for select to authenticated using (user_id = auth.uid());

-- Escritas nessas duas só pelo servidor, depois de conferir o super-admin.
grant select on public.company, public.app_user to authenticated;
grant select, insert, update, delete on public.company, public.app_user to service_role;

/* ── Storage: a pasta do arquivo é o id do funcionário ou do item ───────── */

drop policy "gestor lê fotos" on storage.objects;
drop policy "gestor envia fotos" on storage.objects;
drop policy "gestor troca fotos" on storage.objects;
drop policy "gestor apaga fotos" on storage.objects;
drop policy "gestor lê evidências do bucket" on storage.objects;

create function public.foto_de_funcionario_da_empresa(caminho text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.worker w
    where w.id::text = (storage.foldername(caminho))[1] and w.company_id = public.current_company_id()
  );
$$;

create function public.evidencia_da_empresa(caminho text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_order_item i
    where i.id::text = (storage.foldername(caminho))[1] and i.company_id = public.current_company_id()
  );
$$;

revoke execute on function public.foto_de_funcionario_da_empresa(text) from public, anon;
revoke execute on function public.evidencia_da_empresa(text) from public, anon;
grant execute on function public.foto_de_funcionario_da_empresa(text) to authenticated;
grant execute on function public.evidencia_da_empresa(text) to authenticated;

create policy "gestor lê fotos" on storage.objects for select to authenticated
  using (bucket_id = 'worker-photos' and public.foto_de_funcionario_da_empresa(name));
create policy "gestor envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-photos' and public.foto_de_funcionario_da_empresa(name));
create policy "gestor troca fotos" on storage.objects for update to authenticated
  using (bucket_id = 'worker-photos' and public.foto_de_funcionario_da_empresa(name))
  with check (bucket_id = 'worker-photos' and public.foto_de_funcionario_da_empresa(name));
create policy "gestor apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'worker-photos' and public.foto_de_funcionario_da_empresa(name));
create policy "gestor lê evidências do bucket" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.evidencia_da_empresa(name));

/* ── Funções SECURITY DEFINER: ignoram o RLS, então conferem a empresa ──── */

-- O servidor (sincronizar, chave secreta) não tem auth.uid(); o gestor só mexe na própria empresa.
create or replace function public.recalcular_ordem(ordem uuid) returns void
language sql
security definer
set search_path = public
as $$
  update public.work_order w set status = case
      when exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result = 'blocked') then 'blocked'
      when exists (select 1 from public.work_order_item i where i.work_order_id = w.id and i.result is not null) then 'in_progress'
      else 'open'
    end::public.work_order_status
  where w.id = ordem and w.status in ('open', 'in_progress', 'blocked')
    and (auth.uid() is null or w.company_id = public.current_company_id());
$$;

create or replace function public.liberar_impedimento(ordem uuid, resolucao text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  texto text := btrim(coalesce(resolucao, ''));
  apagados jsonb;
begin
  if texto = '' then raise exception 'Escreva o que foi resolvido.'; end if;

  update public.work_order set released_note = texto
  where id = ordem and status = 'blocked' and company_id = public.current_company_id();
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

create or replace function public.desfazer_inicio_setor(setor text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa uuid := public.current_company_id();
begin
  if empresa is null then raise exception 'Sem empresa.'; end if;
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

-- A parte que recebe a empresa não é exposta: só a migração e a versão abaixo chamam.
create function public.ajustar_ordens_da_empresa(empresa uuid) returns table (itens integer, ordens integer)
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
    using public.work_order wo, public.plan_item pi, public.equipment e
    where wo.id = i.work_order_id
      and pi.id = i.plan_item_id
      and e.id = pi.equipment_id
      and wo.company_id = empresa
      and wo.status in ('open', 'in_progress', 'blocked')
      and i.result is null
      and (pi.status <> 'active'
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

revoke execute on function public.ajustar_ordens_da_empresa(uuid) from public, anon, authenticated, service_role;

create or replace function public.ajustar_ordens_ao_plano() returns table (itens integer, ordens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  empresa uuid := public.current_company_id();
begin
  if empresa is null then raise exception 'Sem empresa.'; end if;
  return query select * from public.ajustar_ordens_da_empresa(empresa);
end;
$$;

revoke execute on function public.ajustar_ordens_ao_plano() from service_role;

/*
 * Com gestor conectado, gera sempre na empresa dele. O servidor (cron) informa a empresa.
 * Sem informar, só vale enquanto existir uma empresa: é o cron antigo durante a implantação.
 * Essa tolerância sai junto com a chave antiga do aparelho.
 */
drop function public.gerar_ordens(jsonb, text);
create function public.gerar_ordens(periodos jsonb, origem text default 'manual', empresa uuid default null)
returns table (ordens integer, itens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid;
  n_ordens integer;
  n_itens integer;
begin
  if auth.uid() is not null then
    alvo := public.current_company_id();
    if alvo is null then raise exception 'Sem empresa.'; end if;
  elsif empresa is not null then
    alvo := empresa;
  elsif (select count(*) from public.company) = 1 then
    select id into alvo from public.company;
  else
    raise exception 'Informe a empresa.';
  end if;

  with p as (
    select * from jsonb_to_recordset(periodos)
      as x(sector_code text, frequency public.frequency, period_start date, period_end date)
  ), grupos as (
    select distinct coalesce(e.parent_id, e.id) as equipment_id, pi.sector_code, pi.frequency
    from public.plan_item pi
    join public.equipment e on e.id = pi.equipment_id
    where pi.status = 'active' and pi.company_id = alvo
  ), novas as (
    insert into public.work_order (company_id, equipment_id, sector_code, frequency, period_start, period_end, due_date)
    select alvo, g.equipment_id, g.sector_code, g.frequency, p.period_start, p.period_end, p.period_end
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
    insert into public.work_order_item (company_id, work_order_id, plan_item_id)
    select alvo, wo.id, pi.id
    from public.work_order wo
    join p on p.frequency = wo.frequency and p.period_start = wo.period_start and p.sector_code = wo.sector_code
    join public.plan_item pi
      on pi.status = 'active' and pi.company_id = alvo and pi.frequency = wo.frequency and pi.sector_code = wo.sector_code
    join public.equipment e on e.id = pi.equipment_id and coalesce(e.parent_id, e.id) = wo.equipment_id
    where wo.company_id = alvo and wo.status in ('open', 'in_progress', 'blocked')
    on conflict (work_order_id, plan_item_id) do nothing
    returning 1
  )
  select count(*) into n_itens from novos;

  insert into public.generation_log (company_id, origin, ran_by, window_start, window_end, orders_created, items_created)
  select alvo, origem, auth.uid(), min(x.period_start), max(x.period_end), n_ordens, n_itens
  from jsonb_to_recordset(periodos) as x(period_start date, period_end date);

  return query select n_ordens, n_itens;
end;
$$;

revoke execute on function public.gerar_ordens(jsonb, text, uuid) from public, anon;
grant execute on function public.gerar_ordens(jsonb, text, uuid) to authenticated, service_role;

-- Igual à anterior; o funcionário só alcança ordens da própria empresa.
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

    if ordem.id is null or ordem.company_id <> empresa then
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
