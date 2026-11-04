-- Ordens de manutenção geradas pelas frequências da planilha (escopo v0.5, seções 7 e 9).
-- Uma ordem = equipamento principal × setor × frequência × período, com um item por
-- atividade da planilha. Quem calcula os períodos é frontend/src/lib/schedule.ts (função
-- pura, testada); quem grava é gerar_ordens(), com upsert pela chave estável.

create type public.work_order_status as enum
  ('open', 'in_progress', 'blocked', 'awaiting_validation', 'done', 'cancelled');
create type public.item_result as enum ('ok', 'problem', 'done', 'blocked', 'measured', 'na');

create table public.work_order (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  sector_code text not null references public.sector (code),
  frequency public.frequency not null,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  status public.work_order_status not null default 'open',
  assigned_worker_id uuid references public.worker (id),
  finished_at timestamptz,
  validated_at timestamptz,
  validated_by uuid,
  returned_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Chave estável: gerar de novo nunca duplica.
  unique (equipment_id, sector_code, frequency, period_start),
  check (period_end >= period_start),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index work_order_due on public.work_order (due_date);
create index work_order_sector_status on public.work_order (sector_code, status);

create table public.work_order_item (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_order (id) on delete cascade,
  plan_item_id uuid not null references public.plan_item (id) on delete restrict,
  result public.item_result,
  measured_value numeric,
  block_reason text,
  note text,
  executed_by uuid references public.worker (id),
  device_time timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, plan_item_id)
);
create index work_order_item_plan on public.work_order_item (plan_item_id);

-- Cada geração fica registrada: o painel mostra quando rodou por último e quanto criou.
create table public.generation_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  origin text not null check (origin in ('cron', 'manual', 'liberacao')),
  ran_by uuid,
  window_start date not null,
  window_end date not null,
  orders_created integer not null,
  items_created integer not null
);

create trigger work_order_touch before update on public.work_order
for each row execute function public.touch_updated_at();
create trigger work_order_item_touch before update on public.work_order_item
for each row execute function public.touch_updated_at();

/*
 * Grava as ordens dos períodos recebidos (calculados por schedule.ts).
 * - Cria uma ordem por (equipamento principal, setor, frequência, período) que tenha
 *   ao menos uma atividade ativa. Ordem existente fica como está.
 * - Acrescenta itens de atividades liberadas depois às ordens ainda não finalizadas.
 * Idempotente: rodar duas vezes não cria nada na segunda.
 */
create function public.gerar_ordens(periodos jsonb, origem text default 'manual')
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
      as x(frequency public.frequency, period_start date, period_end date)
  ), grupos as (
    select distinct coalesce(e.parent_id, e.id) as equipment_id, pi.sector_code, pi.frequency
    from public.plan_item pi
    join public.equipment e on e.id = pi.equipment_id
    where pi.status = 'active'
  ), novas as (
    insert into public.work_order (equipment_id, sector_code, frequency, period_start, period_end, due_date)
    select g.equipment_id, g.sector_code, g.frequency, p.period_start, p.period_end, p.period_end
    from grupos g
    join p on p.frequency = g.frequency
    on conflict (equipment_id, sector_code, frequency, period_start) do nothing
    returning 1
  )
  select count(*) into n_ordens from novas;

  with p as (
    select * from jsonb_to_recordset(periodos)
      as x(frequency public.frequency, period_start date, period_end date)
  ), novos as (
    insert into public.work_order_item (work_order_id, plan_item_id)
    select wo.id, pi.id
    from public.work_order wo
    join p on p.frequency = wo.frequency and p.period_start = wo.period_start
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

-- Funções nascem executáveis por PUBLIC: só o gestor e o servidor (cron) podem gerar.
revoke execute on function public.gerar_ordens(jsonb, text) from public, anon;
grant execute on function public.gerar_ordens(jsonb, text) to authenticated, service_role;

alter table public.work_order enable row level security;
alter table public.work_order_item enable row level security;
alter table public.generation_log enable row level security;

create policy "gestor lê ordens" on public.work_order for select to authenticated using (true);
create policy "gestor altera ordens" on public.work_order
  for update to authenticated using (true) with check (true);
create policy "gestor lê itens das ordens" on public.work_order_item for select to authenticated using (true);
create policy "gestor lê gerações" on public.generation_log for select to authenticated using (true);

grant select, update on public.work_order to authenticated;
grant select on public.work_order_item to authenticated;
grant select on public.generation_log to authenticated;
-- API do celular (fase 3): lê as ordens e grava as respostas.
grant select, update on public.work_order to service_role;
grant select, update on public.work_order_item to service_role;
