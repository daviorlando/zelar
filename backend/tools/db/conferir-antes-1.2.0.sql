-- Conferência só de leitura antes de aplicar as migrações da 1.2.0 na produção.
-- Uso (no prompt do Claude Code):
--   ! cd backend && set -a && . ../frontend/.env && set +a && PGSSLMODE=verify-full PGSSLROOTCERT="$SUPABASE_DB_CA" PGOPTIONS='-c default_transaction_read_only=on' psql "$SUPABASE_DB_URL" -At -f tools/db/conferir-antes-1.2.0.sql
-- Todas as contagens "fora do padrão" precisam dar 0.

select 'fotos de funcionário fora do padrão', count(*) from public.worker
where photo_path is not null and (photo_path !~ ('^' || id || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$') or photo_path ~ '\.\.');

select 'fotos de máquina fora do padrão', count(*) from public.equipment
where photo_path is not null and (photo_path !~ ('^' || id || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$') or photo_path ~ '\.\.');

select 'situações em sync_op', string_agg(distinct status, ', ') from public.sync_op;

select 'celulares (total, ativos, ligados por senha)', count(*), count(*) filter (where revoked_at is null),
       count(*) filter (where name like 'Celular ligado por%') from public.device;

select 'atividades no plano', count(*) from public.plan_item;
