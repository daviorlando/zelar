-- O gestor volta a ver o código de um celular enquanto ele vale, e apaga de vez um celular
-- que não usa mais.
--
-- O código continua sendo conferido pelo hash. A cópia cifrada (AES-GCM, chave só no servidor)
-- serve apenas para mostrar de novo na tela; o gestor não lê a coluna pela API, só o servidor.

alter table public.device_activation add column code_cipher text;
-- Sem grant para authenticated: a leitura pela API continua restrita às colunas de antes.

-- Apagar um celular: nada aponta para device, e sem a linha o token deixa de valer na hora
-- (o celular volta para a tela de ligar). Só o servidor apaga, depois de conferir o gestor.
grant delete on public.device to service_role;
