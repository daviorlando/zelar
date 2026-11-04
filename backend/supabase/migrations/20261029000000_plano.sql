-- Plano de manutenção vindo da planilha "Calendário de Manutenção" (escopo v0.5, seção 3).
-- A carga é feita por `npm run import:load` (backend/tools/importer/load.ts), com upsert:
-- equipamentos pela tag, atividades pela origem (aba + linha). Rodar de novo não duplica.

create type public.frequency as enum ('daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual');
create type public.item_type as enum ('inspection', 'action', 'measurement');
create type public.plan_status as enum ('active', 'pending_review', 'retired');

create table public.sector (
  code text primary key check (code ~ '^[A-Z]$'),
  name text not null
);

-- Equipamento principal (tag "A - BMAN") ou componente (tag "A - BMAN - ME", parent_id aponta o principal).
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  name text,
  parent_id uuid references public.equipment (id) on delete restrict,
  sector_code text not null references public.sector (code),
  brand text,
  model text,
  power_cv numeric,
  rpm numeric,
  working_temp text,
  lubricant text,
  photo_path text,
  source_row integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index equipment_parent on public.equipment (parent_id);
create index equipment_sector on public.equipment (sector_code);

-- Uma linha de atividade da planilha. Os campos *_raw guardam o texto original;
-- o que o gestor revisa (equipamento, tipo, situação) não é sobrescrito por uma nova
-- importação depois de reviewed_at preenchido.
create table public.plan_item (
  id uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row integer not null,
  sector_code text not null references public.sector (code),
  frequency public.frequency not null,
  equipment_id uuid references public.equipment (id) on delete restrict,
  equipment_name_raw text,
  component_name_raw text,
  tag_raw text,
  activity text not null,
  instruction_kind text not null,
  item_type public.item_type not null,
  qualification text,
  multiple_actions boolean not null default false,
  -- A planilha não traz limites: ficam nulos até o responsável técnico informar.
  measurement_unit text,
  measurement_min numeric,
  measurement_max numeric,
  status public.plan_status not null default 'active',
  issues text[] not null default '{}',
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_sheet, source_row),
  -- Atividade ativa precisa de equipamento; sem ele não há a quem gerar ordem.
  check (status <> 'active' or equipment_id is not null)
);
create index plan_item_equipment on public.plan_item (equipment_id);
create index plan_item_sector_freq on public.plan_item (sector_code, frequency);

-- Setores em que cada funcionário trabalha: define quais ordens aparecem no celular dele.
create table public.worker_sector (
  worker_id uuid not null references public.worker (id) on delete cascade,
  sector_code text not null references public.sector (code),
  primary key (worker_id, sector_code)
);

create trigger equipment_touch before update on public.equipment
for each row execute function public.touch_updated_at();
create trigger plan_item_touch before update on public.plan_item
for each row execute function public.touch_updated_at();

alter table public.sector enable row level security;
alter table public.equipment enable row level security;
alter table public.plan_item enable row level security;
alter table public.worker_sector enable row level security;

create policy "gestor lê setores" on public.sector for select to authenticated using (true);
create policy "gestor lê equipamentos" on public.equipment for select to authenticated using (true);
create policy "gestor altera equipamentos" on public.equipment
  for update to authenticated using (true) with check (true);
create policy "gestor lê plano" on public.plan_item for select to authenticated using (true);
create policy "gestor revisa plano" on public.plan_item
  for update to authenticated using (true) with check (true);
create policy "gestor lê setores dos funcionários" on public.worker_sector
  for select to authenticated using (true);
create policy "gestor marca setores" on public.worker_sector
  for insert to authenticated with check (true);
create policy "gestor desmarca setores" on public.worker_sector
  for delete to authenticated using (true);

grant select on public.sector to authenticated, service_role;
grant select, update on public.equipment to authenticated;
grant select on public.equipment to service_role;
grant select, update on public.plan_item to authenticated;
grant select on public.plan_item to service_role;
grant select, insert, delete on public.worker_sector to authenticated;
grant select on public.worker_sector to service_role;
