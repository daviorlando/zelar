-- Correções da revisão de segurança dos aparelhos.

/*
 * Como o celular foi ligado: 'senha' (o gestor entrou com email e senha) ou 'codigo' (código
 * gerado em Celulares). Desativar um gestor revoga só os ligados com a senha dele; os ligados
 * por código são celulares da fábrica, usados por todos.
 */
alter table public.device add column via text check (via in ('senha', 'codigo'));
-- Os de antes: a rota dava este nome aos ligados com senha. Renomeado vira 'codigo' e não é
-- revogado sozinho, o lado seguro para o celular da fábrica.
update public.device set via = case when name like 'Celular ligado por %' then 'senha' else 'codigo' end;
grant select (via) on public.device to authenticated;
create index device_created_by on public.device (created_by) where revoked_at is null;
create index device_activation_created_by on public.device_activation (created_by) where used_at is null;

/*
 * O hash do código é a chave primária: com insert liberado, o gestor de uma empresa descobria
 * pelo erro de duplicidade se um hash já existia em outra. Agora só o servidor grava o código.
 */
revoke insert on public.device_activation from authenticated;
drop policy "gestor gera códigos" on public.device_activation;

/*
 * Limite de tentativas sem corrida: a reserva trava o IP até o fim da transação, anota a
 * tentativa e devolve quantas há na janela, contando esta. Pedidos juntos do mesmo IP passam
 * um de cada vez, então nenhum escapa do limite. A rota apaga a reserva quando a ligação dá
 * certo (ou quando recusa por excesso), para só as falhas contarem.
 */
alter table public.activation_attempt add column id bigint generated always as identity primary key;
drop function public.anotar_falha_de_ativacao(text);

create function public.reservar_tentativa_de_ativacao(ip text)
returns table (id bigint, tentativas integer)
language plpgsql
set search_path = public
as $$
declare
  nova bigint;
begin
  perform pg_advisory_xact_lock(hashtext('activation_attempt:' || ip));
  -- As de mais de um dia já não contam.
  delete from public.activation_attempt a where a.created_at < now() - interval '1 day';
  insert into public.activation_attempt (ip_hash) values (ip) returning activation_attempt.id into nova;
  return query
    select nova, count(*)::integer from public.activation_attempt a
    where a.ip_hash = ip and a.created_at > now() - interval '15 minutes';
end;
$$;
revoke execute on function public.reservar_tentativa_de_ativacao(text) from public, anon, authenticated;
grant execute on function public.reservar_tentativa_de_ativacao(text) to service_role;

/*
 * A foto fica na pasta da própria linha, com um nome simples: sem '..' nem outra barra, o
 * caminho não sai da pasta. id é uuid (só hexadecimal e hífen), seguro dentro da regex.
 */
alter table public.equipment drop constraint equipment_foto_propria;
alter table public.equipment add constraint equipment_foto_propria
  check (photo_path is null or (photo_path ~ ('^' || id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$') and photo_path !~ '\.\.'));
alter table public.worker drop constraint worker_foto_propria;
alter table public.worker add constraint worker_foto_propria
  check (photo_path is null or (photo_path ~ ('^' || id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$') and photo_path !~ '\.\.'));
