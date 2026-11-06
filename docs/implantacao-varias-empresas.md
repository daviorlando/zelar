# Implantação: várias empresas, email e aparelhos

Roteiro para levar esta versão à produção. Siga na ordem: as migrações precisam chegar antes do painel, e o painel antes do APK.

## 1. Antes de tudo

- **Supabase → Authentication → Sign In / Providers:** desligue "Allow new users to sign up".
- **Não desative o provedor Email.** Ele é o login do painel; desativá-lo impede todo mundo de entrar.
- Faça o backup: `pg_dump "$SUPABASE_DB_URL" > zelo-antes.sql`.
- Liste as ordens diárias que têm resposta. A migração as cancela, guardando as respostas:

  ```sql
  select w.id, w.sector_code, w.period_start, w.status, count(i.result) as respostas
  from work_order w join work_order_item i on i.work_order_id = w.id
  where w.frequency = 'daily' and w.status in ('open', 'in_progress', 'blocked')
  group by w.id having count(i.result) > 0;
  ```

## 2. Migrações

`frontend/.env` aponta para a produção, e o comando recusa banco remoto sem confirmação:

```sh
cd backend
ZELO_CONFIRMA_REMOTO=<host do banco> npm run db:migrate
```

O painel e os APKs antigos continuam funcionando depois desta etapa, mas **não crie uma segunda empresa ainda**: o painel antigo lê tudo com a chave secreta.

## 3. Painel

Na Vercel, acrescente as variáveis e faça o deploy:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Endereço público do painel, usado nos links dos emails |
| `ZELO_LEGACY_COMPANY_ID` | `e0000000-0000-4000-8000-000000000001` (Eco Gesso) |

## 4. Email (Resend)

1. Crie a conta no Resend e adicione o domínio. Publique no DNS os registros DKIM e SPF indicados, e um DMARC.
2. Crie uma chave de API.
3. **Supabase → Authentication → Emails → SMTP Settings:** host `smtp.resend.com`, porta `465`, usuário `resend`, senha igual à chave. Remetente em um endereço do domínio verificado.
4. **Authentication → Rate Limits:** aumente o limite de envio de emails. O padrão é baixo, e o "esqueci a senha" falha sem aviso ao passar dele.
5. **Authentication → URL Configuration:** Site URL igual a `NEXT_PUBLIC_SITE_URL`, e o mesmo endereço com `/auth/confirm` na lista de redirecionamento.
6. **Authentication → Emails → Templates:** cole `backend/supabase/templates/convite.html` em "Invite user" e `recuperar.html` em "Reset password". Sem isso, o link não passa pela tela de confirmação e o convite não funciona.
7. Teste: um convite e um "esqueci a senha" para uma caixa de email real, conferindo também a pasta de spam.

## 5. Super-admin

Crie a conta em Authentication → Users, sem usar um email de gestor. Depois:

```sh
cd backend
ZELO_CONFIRMA_REMOTO=<host do banco> npm run db:super-admin -- --email=<email>
```

Ele entra pelo mesmo `/login` e cai em `/admin/empresas`.

## 6. APK

```sh
cd mobile
flutter build apk --release --dart-define=ZELO_API=https://<painel>
```

- **Assine com a chave usada na versão instalada.** Hoje `build.gradle.kts` assina a release com a chave de debug. Com outra chave, o Android exige desinstalar, e isso apaga a fila: antes, confirme que tudo foi enviado.
- Não mude `applicationId`: viraria outro aplicativo, sem os dados do aparelho.
- Em cada celular: o gestor gera o código em **Celulares** e alguém digita no app.
- **Avise cada funcionário do seu número.** Os PINs de figuras viraram dígitos: quem tinha a primeira figura agora tem o 0, a segunda o 1, e assim por diante. O gestor vê o número no cadastro.

## 7. Primeira empresa nova

Só depois de tudo acima. Em `/admin/empresas`, crie a empresa e o gestor. Para carregar uma planilha nela:

```sh
cd backend
ZELO_CONFIRMA_REMOTO=<host do banco> npm run import:load -- <planilha.xlsx> --company=<id da empresa>
```

## 8. Encerrar a chave antiga

Quando `device.last_seen_at` mostrar que todos os celulares estão na versão nova, sem nenhum uso da chave antiga, remova `ZELO_DEVICE_KEY` e `ZELO_LEGACY_COMPANY_ID` da Vercel. Isso desliga os APKs antigos. No mesmo passo, tire de `gerar_ordens` a tolerância para quando existe uma só empresa e o campo `pin` de `/api/mobile/workers`.

## Testes locais

Sempre com as variáveis locais exportadas, porque elas têm prioridade sobre `frontend/.env`:

```sh
cd backend && npx supabase start
set -a; . ../frontend/.env.test; set +a
npm run test:db                      # isolamento entre empresas
cd ../frontend && npm run build && npx next start &
npx playwright test                  # cadastros, email e painel, lendo o Mailpit
```
