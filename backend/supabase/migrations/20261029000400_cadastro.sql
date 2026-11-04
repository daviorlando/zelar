-- Cadastro no painel: o gestor cria, altera e exclui setores, equipamentos, componentes
-- e atividades. A planilha passa a ser só a carga inicial; o que o gestor mexeu não é
-- sobrescrito por uma nova importação (equipment.edited_at, plan_item.reviewed_at).

-- Atividade criada no painel não tem aba nem linha de origem.
alter table public.plan_item alter column source_sheet drop not null;
alter table public.plan_item alter column source_row drop not null;

-- Equipamento com histórico de ordens não pode ser apagado: fica arquivado (some das
-- listas e do plano, mas as ordens antigas continuam apontando para ele).
alter table public.equipment add column archived_at timestamptz;
alter table public.equipment add column edited_at timestamptz;

create policy "gestor cria setores" on public.sector for insert to authenticated with check (true);
create policy "gestor altera setores" on public.sector for update to authenticated using (true) with check (true);
create policy "gestor exclui setores" on public.sector for delete to authenticated using (true);
create policy "gestor cria equipamentos" on public.equipment for insert to authenticated with check (true);
create policy "gestor exclui equipamentos" on public.equipment for delete to authenticated using (true);
create policy "gestor cria atividades" on public.plan_item for insert to authenticated with check (true);
create policy "gestor exclui atividades" on public.plan_item for delete to authenticated using (true);

grant insert, update, delete on public.sector to authenticated;
grant insert, delete on public.equipment to authenticated;
grant insert, delete on public.plan_item to authenticated;

/*
 * Depois de o gestor mudar o plano, tira das ordens ainda não finalizadas os itens
 * sem resposta que não pertencem mais a elas: atividade retirada, ou que mudou de
 * frequência, setor ou equipamento. Ordem aberta que ficou sem item nenhum é apagada.
 * As que perderam itens têm a situação recalculada. Itens já respondidos ficam.
 * Quem acrescenta as atividades novas é gerar_ordens(), chamada logo depois.
 */
create function public.ajustar_ordens_ao_plano() returns table (itens integer, ordens integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  n_itens integer;
  n_ordens integer;
  afetadas uuid[];
begin
  with fora as (
    delete from public.work_order_item i
    using public.work_order wo, public.plan_item pi, public.equipment e
    where wo.id = i.work_order_id
      and pi.id = i.plan_item_id
      and e.id = pi.equipment_id
      and wo.status in ('open', 'in_progress', 'blocked')
      and i.result is null
      and (pi.status <> 'active'
           or pi.frequency <> wo.frequency
           or pi.sector_code <> wo.sector_code
           or coalesce(e.parent_id, e.id) <> wo.equipment_id)
    returning i.work_order_id
  )
  select count(*), array_agg(distinct work_order_id) into n_itens, afetadas from fora;

  with vazias as (
    delete from public.work_order wo
    where wo.id = any (coalesce(afetadas, '{}'))
      and wo.status = 'open'
      and not exists (select 1 from public.work_order_item i where i.work_order_id = wo.id)
    returning 1
  )
  select count(*) into n_ordens from vazias;

  perform public.recalcular_ordem(x) from unnest(coalesce(afetadas, '{}')) as x;
  return query select n_itens, n_ordens;
end;
$$;

revoke execute on function public.ajustar_ordens_ao_plano() from public, anon;
grant execute on function public.ajustar_ordens_ao_plano() to authenticated, service_role;
