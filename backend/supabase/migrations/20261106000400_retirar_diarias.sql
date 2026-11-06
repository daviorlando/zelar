-- O cliente não faz mais revisões diárias; as outras frequências continuam.
-- O valor 'daily' fica no tipo porque as ordens antigas continuam apontando para ele.
do $$
declare
  empresa uuid;
  n_itens integer;
  n_ordens integer;
begin
  -- reviewed_at impede a próxima importação da planilha de reativar a atividade.
  update public.plan_item set status = 'retired', reviewed_at = coalesce(reviewed_at, now())
  where frequency = 'daily' and status <> 'retired';
  get diagnostics n_itens = row_count;
  raise notice 'Atividades diárias retiradas: %', n_itens;

  -- Itens sem resposta saem das ordens e a ordem que ficou vazia é apagada.
  for empresa in select id from public.company loop
    perform public.ajustar_ordens_da_empresa(empresa);
  end loop;

  -- Sobram as ordens com alguma resposta: canceladas, com as respostas guardadas. Sem isso
  -- continuariam aparecendo no celular para sempre. As já concluídas ficam para o gestor validar.
  with canceladas as (
    update public.work_order
    set status = 'cancelled', cancelled_at = now(), cancel_reason = 'Revisões diárias retiradas do plano.'
    where frequency = 'daily' and status in ('open', 'in_progress', 'blocked')
    returning id
  )
  insert into public.audit_log (action, work_order_id, reason)
  select 'cancelar', id, 'Revisões diárias retiradas do plano.' from canceladas;
  get diagnostics n_ordens = row_count;
  raise notice 'Ordens diárias canceladas: %', n_ordens;
end;
$$;

alter table public.plan_item add constraint plan_item_sem_diaria
  check (frequency <> 'daily' or status = 'retired');
