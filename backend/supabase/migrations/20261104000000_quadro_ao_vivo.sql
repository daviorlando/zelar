-- Quadro ao vivo: o painel escuta as mudanças das ordens pelo Supabase Realtime.
-- Toda resposta do celular passa por recalcular_ordem() ou pelo finish, que atualizam
-- work_order: publicar só esta tabela basta. O Realtime respeita o RLS: só o gestor
-- autenticado recebe os eventos ("gestor lê ordens").
alter publication supabase_realtime add table public.work_order;
