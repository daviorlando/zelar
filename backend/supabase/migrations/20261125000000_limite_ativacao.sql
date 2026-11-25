-- Limite para quem chuta códigos ou senhas ao ligar o celular (POST /api/mobile/activate).
-- Cada tentativa que falha fica anotada com o hash do IP; a rota conta as dos últimos
-- 15 minutos antes de conferir a prova. Ligação que dá certo não é anotada.

create table public.activation_attempt (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index activation_attempt_ip on public.activation_attempt (ip_hash, created_at);

-- Só a chave secreta (a rota de ativação) mexe aqui.
alter table public.activation_attempt enable row level security;
revoke all on public.activation_attempt from anon, authenticated;
grant select, insert, delete on public.activation_attempt to service_role;

-- Anota a falha e aproveita para apagar as de mais de um dia, que já não contam.
create function public.anotar_falha_de_ativacao(ip text) returns void
language sql
set search_path = public
as $$
  delete from public.activation_attempt where created_at < now() - interval '1 day';
  insert into public.activation_attempt (ip_hash) values (ip);
$$;
revoke execute on function public.anotar_falha_de_ativacao(text) from public, anon, authenticated;
grant execute on function public.anotar_falha_de_ativacao(text) to service_role;
