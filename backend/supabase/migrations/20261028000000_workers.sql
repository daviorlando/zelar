-- Funcionários de campo e crachá QR (entrada principal no celular).
-- O crachá leva só badge_token, um código aleatório; o celular recebe apenas o hash dele.
-- Gerar um crachá novo troca o token e invalida o impresso anterior.

create table public.worker (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  photo_path text,
  -- Quatro figuras (índices 0–8 da grade do celular): entrada alternativa sem crachá.
  pin smallint[] not null check (
    array_length(pin, 1) = 4 and 0 <= all (pin) and 8 >= all (pin)
  ),
  badge_token text not null unique,
  badge_version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger worker_touch before update on public.worker
for each row execute function public.touch_updated_at();

-- Sem política para anon: o celular nunca lê o banco direto, só pela API do painel.
-- No MVP todo usuário do Supabase Auth é gestor (perfis ficam para o Sprint 3).
alter table public.worker enable row level security;

create policy "gestor lê funcionários" on public.worker
  for select to authenticated using (true);
create policy "gestor cadastra funcionários" on public.worker
  for insert to authenticated with check (true);
create policy "gestor altera funcionários" on public.worker
  for update to authenticated using (true) with check (true);

-- Fotos dos funcionários: bucket privado, lido por URL assinada.
insert into storage.buckets (id, name, public)
values ('worker-photos', 'worker-photos', false)
on conflict (id) do nothing;

create policy "gestor lê fotos" on storage.objects
  for select to authenticated using (bucket_id = 'worker-photos');
create policy "gestor envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'worker-photos');
create policy "gestor troca fotos" on storage.objects
  for update to authenticated using (bucket_id = 'worker-photos');
create policy "gestor apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'worker-photos');
