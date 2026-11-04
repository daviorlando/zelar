-- Decisões do gestor sobre as ordens (validar, devolver, cancelar): quem, quando e por quê.
-- Escopo v0.5, seção 9: "toda mudança é auditada".

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null check (action in ('validar', 'devolver', 'cancelar')),
  work_order_id uuid not null references public.work_order (id) on delete cascade,
  reason text,
  at timestamptz not null default now()
);
create index audit_log_order on public.audit_log (work_order_id, at desc);

alter table public.audit_log enable row level security;
create policy "gestor lê auditoria" on public.audit_log for select to authenticated using (true);
-- O autor é sempre quem está conectado: ninguém grava em nome de outro.
create policy "gestor registra decisões" on public.audit_log
  for insert to authenticated with check (actor = auth.uid());
grant select, insert on public.audit_log to authenticated;

-- Devolver recalcula a situação pelos itens: o gestor precisa poder chamar.
grant execute on function public.recalcular_ordem(uuid) to authenticated;
