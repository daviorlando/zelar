-- "Não soube responder": o funcionário pula o item, a ordem pode ser concluída e o gestor
-- decide ao validar. Não conta como executado. O valor fica em migração própria e precisa
-- chegar ao banco antes do app novo: sincronizar() recusa o lote inteiro com valor desconhecido.
alter type public.item_result add value 'skipped';
