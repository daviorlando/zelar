-- Cada celular passa a ser de uma empresa: o gestor gera um código, o funcionário digita
-- no primeiro uso e o aparelho recebe um token próprio, que pode ser revogado sem afetar
-- os outros. O banco guarda só os hashes.

create table public.device (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index device_company on public.device (company_id);

-- Código de uso único e curta duração, marcado como usado na mesma operação que o confere.
create table public.device_activation (
  code_hash text primary key,
  company_id uuid not null default public.current_company_id() references public.company (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index device_activation_company on public.device_activation (company_id);

alter table public.device enable row level security;
alter table public.device_activation enable row level security;

create policy "gestor lê aparelhos" on public.device
  for select to authenticated using (company_id = (select public.current_company_id()));
create policy "gestor revoga aparelhos" on public.device
  for update to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "gestor lê códigos" on public.device_activation
  for select to authenticated using (company_id = (select public.current_company_id()));
create policy "gestor gera códigos" on public.device_activation
  for insert to authenticated with check (company_id = (select public.current_company_id()));

-- O gestor nunca escreve o token nem muda a empresa do aparelho.
grant select on public.device, public.device_activation to authenticated;
grant update (revoked_at, name) on public.device to authenticated;
grant insert (code_hash, name, expires_at) on public.device_activation to authenticated;
grant select, insert, update on public.device, public.device_activation to service_role;
