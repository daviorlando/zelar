-- Projetos novos do Supabase não dão acesso automático às tabelas pela API.
-- Gestor (authenticated) usa o painel, sob as políticas do RLS; service_role é a API do celular.
-- anon continua sem acesso.
grant select, insert, update on public.worker to authenticated;
grant select on public.worker to service_role;
