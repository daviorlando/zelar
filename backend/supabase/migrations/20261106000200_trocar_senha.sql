-- "Trocar senha" saiu de user_metadata, que a própria pessoa edita pela API, e foi para
-- app_metadata, que só o servidor altera. Quem estava com a troca pendente continua pendente.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('trocar_senha', true)
where raw_user_meta_data ->> 'trocar_senha' = 'true';
