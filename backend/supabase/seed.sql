-- Dados de demonstração do Supabase LOCAL (`npx supabase db reset`). Nunca rode na produção.
-- Cria um super-admin, uma empresa com um gestor, um setor, um equipamento, uma atividade
-- semanal e um funcionário. As senhas são de teste e só valem nesta máquina.
--
--   super-admin  superadmin@teste.local  senha-de-teste-123   → /admin/empresas
--   gestor       gestor@teste.local      senha-de-teste-123   → /gestor/quadro
--   funcionário  Ana (setor A)           PIN 1 2 3 4

create or replace function pg_temp.conta(id uuid, email text) returns void language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
          extensions.crypt('senha-de-teste-123', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now());
$$;

select pg_temp.conta('d0000000-0000-4000-8000-000000000001', 'superadmin@teste.local');
select pg_temp.conta('d0000000-0000-4000-8000-000000000002', 'gestor@teste.local');

insert into public.company (id, name) values ('d0000000-0000-4000-8000-0000000000c1', 'Empresa Demonstração');

insert into public.app_user (user_id, company_id, role) values
  ('d0000000-0000-4000-8000-000000000001', null, 'super_admin'),
  ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-0000000000c1', 'manager');

insert into public.sector (company_id, code, name)
values ('d0000000-0000-4000-8000-0000000000c1', 'A', 'Produção');

insert into public.equipment (id, company_id, sector_code, tag, name)
values ('d0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000c1', 'A', 'A - MT1', 'MOTOR DA ESTEIRA');

insert into public.plan_item (company_id, sector_code, frequency, equipment_id, activity, instruction_kind, item_type, status)
values ('d0000000-0000-4000-8000-0000000000c1', 'A', 'weekly', 'd0000000-0000-4000-8000-0000000000e1',
        'Inspeção Visual: verificar vazamentos, ruídos e sujeira.', 'inspeção visual', 'inspection', 'active');

insert into public.worker (id, company_id, name, pin, badge_token)
values ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000c1', 'Ana', '{1,2,3,4}', 'demo-cracha-teste');

insert into public.worker_sector (worker_id, sector_code, company_id)
values ('d0000000-0000-4000-8000-0000000000f1', 'A', 'd0000000-0000-4000-8000-0000000000c1');
