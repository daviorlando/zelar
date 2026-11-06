-- PIN de quatro números no lugar das figuras. Os valores antigos (0 a 8) continuam válidos
-- e passam a ser lidos como dígitos: o gestor informa o número a cada funcionário.
alter table public.worker drop constraint worker_pin_check;
alter table public.worker add constraint worker_pin_check
  check (array_length(pin, 1) = 4 and 0 <= all (pin) and 9 >= all (pin));

-- Foto da máquina, para o funcionário reconhecer o que vai revisar (equipment.photo_path já existia).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-photos', 'equipment-photos', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.foto_de_maquina_da_empresa(caminho text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.equipment e
    where e.id::text = (storage.foldername(caminho))[1] and e.company_id = public.current_company_id()
  );
$$;

revoke execute on function public.foto_de_maquina_da_empresa(text) from public, anon;
grant execute on function public.foto_de_maquina_da_empresa(text) to authenticated;

create policy "gestor lê fotos de máquina" on storage.objects for select to authenticated
  using (bucket_id = 'equipment-photos' and public.foto_de_maquina_da_empresa(name));
create policy "gestor envia fotos de máquina" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-photos' and public.foto_de_maquina_da_empresa(name));
create policy "gestor troca fotos de máquina" on storage.objects for update to authenticated
  using (bucket_id = 'equipment-photos' and public.foto_de_maquina_da_empresa(name))
  with check (bucket_id = 'equipment-photos' and public.foto_de_maquina_da_empresa(name));
create policy "gestor apaga fotos de máquina" on storage.objects for delete to authenticated
  using (bucket_id = 'equipment-photos' and public.foto_de_maquina_da_empresa(name));
