# Implantação: várias empresas, email e aparelhos

Roteiro para levar esta versão à produção. Siga na ordem: as migrações precisam chegar antes do painel, e o painel antes do APK.

## O que falta e é com você

Situação em 10/11/2026: o código está em `main` e o CI passou. As migrações estão aplicadas, e o painel está no ar em https://zelo-vert.vercel.app (projeto `zelo` na Vercel, ligado ao `main`: cada envio publica sozinho). Os passos marcados **(Claude)** são feitos pelo Claude, depois do seu OK.

### Já feito

- [x] **1. Fechar o cadastro público.** Feito em 10/11. Não desative o provedor Email: ele é o login do painel.
- [x] **2. Vercel.** Conferido em 10/11: o painel ainda não está lá, então nada foi publicado fora de ordem.
- [x] **3. Backup.** Feito em 10/11 em `~/Documentos/Projetos/zelo-backups/`: `zelo-antes-20261110.dump`, `zelo-antes-20261110.sql` e os 2 arquivos do Storage. As contagens conferem com a produção. **Copie essa pasta para fora do computador**, por exemplo para um drive.

### Banco

- [x] **4. Migrações.** Aplicadas em 10/11; o resultado foi igual ao do ensaio.
  - Conferido em 10/11: nenhuma ordem diária aberta tem resposta. As 182 abertas saem, e a diária concluída e os 9 itens respondidos ficam.
  - Ensaiado em 10/11 sobre uma cópia da produção, sem erro.
  - O Claude Code bloqueia sozinho a escrita na produção. Para liberar, você tem duas opções:
    - autorizar o Claude quando ele pedir;
    - rodar você mesmo, no prompt do Claude Code:
      ```sh
      ! cd backend && ZELAR_CONFIRMA_REMOTO=aws-0-us-east-2.pooler.supabase.com npm run db:migrate
      ```
  - **(Claude)** Confere o resultado no banco.

### Painel

- [x] **5. Vercel.** Feito em 10/11: as variáveis estão só em Production, e as secretas estão marcadas como sensíveis. O endereço é `NEXT_PUBLIC_SITE_URL=https://zelo-vert.vercel.app`.
  - Em Add New → Project, importe o repositório `daviorlando/zelo` e escolha `frontend` em **Root Directory**.
  - Em Environment Variables, preencha:

    | Variável | De onde vem |
    |---|---|
    | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys |
    | `SUPABASE_SECRET_KEY` | o mesmo lugar, chave secreta |
    | `CRON_SECRET` | gere com `openssl rand -base64 32` |
    | `ZELAR_DEVICE_KEY` | a mesma do APK instalado hoje; se nenhum celular usa o painel ainda, gere uma nova |
    | `ZELAR_LEGACY_COMPANY_ID` | `e0000000-0000-4000-8000-000000000001` |
    | `NEXT_PUBLIC_SITE_URL` | o endereço do painel, sem `/` no final |

    A Vercel de produção foi preenchida antes da troca de nome, com `ZELO_DEVICE_KEY` e `ZELO_LEGACY_COMPANY_ID`. O painel ainda lê esses nomes quando os `ZELAR_*` faltam. Para tirar os antigos, crie os `ZELAR_*` com os mesmos valores, faça um novo deploy e só então apague os `ZELO_*`.

  - Os valores do Supabase são os mesmos de `frontend/.env`. Não use `SUPABASE_DB_URL` na Vercel.
  - Depois do primeiro deploy, se o endereço mudar (domínio próprio), corrija `NEXT_PUBLIC_SITE_URL` e publique de novo. Uma variável `NEXT_PUBLIC_` só vale a partir do próximo deploy.
  - Entre no painel com o seu login e confira o quadro, os funcionários e os equipamentos.

### Email

Situação em 10/11: Site URL, Redirect URLs e os dois modelos já estão no Supabase. O envio está saindo pelo SMTP do Gmail (`smtp.gmail.com`, porta 465, senha de app), uma solução provisória até o Resend com domínio próprio. Os passos 6 e 7 valem para a troca, que não mexe no código.

- [ ] **6. Preparar o Resend.**
  - Crie a conta e adicione o domínio. Um subdomínio, como `mail.suaempresa.com.br`, evita mexer no email que vocês já usam.
  - No provedor de DNS, publique os registros DKIM e SPF que o Resend mostrar.
  - Publique também um DMARC: registro TXT em `_dmarc` com `v=DMARC1; p=none;`.
  - Espere o Resend marcar o domínio como verificado.
  - Crie uma chave de API só com permissão de envio, para aquele domínio.
- [ ] **7. Ligar o Supabase ao Resend.**
  - **Authentication → Emails → SMTP Settings:** ative o SMTP próprio com host `smtp.resend.com`, porta `465`, usuário `resend` e a chave como senha. O remetente deve ser do domínio verificado, como `nao-responder@mail.suaempresa.com.br`, com o nome "Zelar".
  - **Authentication → Rate Limits:** aumente o limite de emails por hora; 30 basta para começar.
  - **Authentication → URL Configuration:** em Site URL, coloque o mesmo valor de `NEXT_PUBLIC_SITE_URL`. Em Redirect URLs, acrescente `<endereço do painel>/auth/confirm`.
  - **Authentication → Emails → Templates:**

    | Modelo | Assunto | Corpo |
    |---|---|---|
    | Invite user | `Seu acesso ao Zelar` | conteúdo de `backend/supabase/templates/convite.html` |
    | Reset password | `Criar nova senha do Zelar` | conteúdo de `backend/supabase/templates/recuperar.html` |

- [ ] **8. Testar com uma caixa de email real.**
  - Em Gestores, convide um email seu: o email deve chegar, e o link deve levar a "Criar minha senha".
  - Depois, use "Esqueci a senha" no login com esse email.
  - Confira também a pasta de spam. Se cair lá, o DNS ainda não terminou de propagar ou falta o DMARC.

### Super-admin

- [x] **9. Super-admin.** `mateusbs.020@gmail.com`, criado em 10/11 com senha temporária, que o painel obriga a trocar no primeiro acesso.
  - Em Authentication → Users → Add user → Create new user, use um email que não seja de gestor e marque "Auto Confirm User".
  - Passe o email ao Claude. **(Claude)** Dá o papel de super-admin.
  - Entre em `/login`: você deve cair em `/admin/empresas`.

### Celulares

- [ ] **10. Combinar a troca de PIN com a Eco Gesso.**
  - Os PINs de figuras viraram números: a primeira figura virou 0, a segunda virou 1, e assim por diante. O gestor vê o número de cada um no cadastro.
  - Cada funcionário precisa saber o seu número antes de o celular ser atualizado.
  - Aproveite para avisar que as revisões diárias saíram e que existe o botão "Não sei".
- [ ] **11. Resolver a chave de assinatura do APK.**
  - Hoje a versão de produção é assinada com a chave de debug da máquina que gera o APK. O Android só atualiza o app por cima se a chave for a mesma da versão instalada.
  - Descubra em qual computador foram gerados os APKs que estão nos celulares.
  - Se foi neste, o Claude gera a nova versão aqui. Se não souber, conte com desinstalar e instalar de novo.
  - Se for preciso, crie agora uma chave própria de release e guarde-a com backup. Perdê-la impede atualizar o app depois.
- [ ] **12. Atualizar cada celular.**
  - **(Claude)** Gera o APK apontando para o endereço do painel.
  - Antes de instalar, confira no celular que não há nada pendente de envio. Desinstalar apaga o que não foi enviado.
  - Instale o novo APK.
  - No painel, em **Celulares**, o gestor gera um código e alguém o digita no app. O código vale 15 minutos e uma única vez.
  - Faça um teste com um funcionário: entrar com o PIN numérico, responder um item e ver a ordem mudar no quadro.

### Depois que tudo estiver rodando

- [ ] **13. Primeira empresa nova.** Só depois dos passos 1 a 12. Em `/admin/empresas`, crie a empresa e convide o gestor. Se ela tiver planilha, envie-a ao Claude. **(Claude)** Carrega a planilha.
- [ ] **14. Desligar a chave antiga.** Quando todos os celulares estiverem na versão nova, avise o Claude.
  - **(Claude)** Confere em `device.last_seen_at`.
  - **Você** remove `ZELAR_DEVICE_KEY` e `ZELAR_LEGACY_COMPANY_ID` na Vercel.
  - **(Claude)** Remove a compatibilidade no código.

Os detalhes técnicos de cada etapa estão nas seções abaixo.

## 1. Antes de tudo

- **Supabase → Authentication → Sign In / Providers:** desligue "Allow new users to sign up".
- **Não desative o provedor Email.** Ele é o login do painel; desativá-lo impede todo mundo de entrar.
- Faça o backup: `pg_dump "$SUPABASE_DB_URL" > zelar-antes.sql`.
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
ZELAR_CONFIRMA_REMOTO=<host do banco> npm run db:migrate
```

O painel e os APKs antigos continuam funcionando depois desta etapa, mas **não crie uma segunda empresa ainda**: o painel antigo lê tudo com a chave secreta.

## 3. Painel

Na Vercel, acrescente as variáveis e faça o deploy:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Endereço público do painel, usado nos links dos emails |
| `ZELAR_LEGACY_COMPANY_ID` | `e0000000-0000-4000-8000-000000000001` (Eco Gesso) |

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
ZELAR_CONFIRMA_REMOTO=<host do banco> npm run db:super-admin -- --email=<email>
```

Ele entra pelo mesmo `/login` e cai em `/admin/empresas`.

## 6. APK

```sh
cd mobile
flutter build apk --release --dart-define=ZELAR_API=https://<painel>
```

- **Assine com a chave usada na versão instalada.** Hoje `build.gradle.kts` assina a release com a chave de debug. Com outra chave, o Android exige desinstalar, e isso apaga a fila: antes, confirme que tudo foi enviado.
- Não mude `applicationId`: viraria outro aplicativo, sem os dados do aparelho.
- Em cada celular: o gestor gera o código em **Celulares** e alguém digita no app.
- **Avise cada funcionário do seu número.** Os PINs de figuras viraram dígitos: quem tinha a primeira figura agora tem o 0, a segunda o 1, e assim por diante. O gestor vê o número no cadastro.

## 7. Primeira empresa nova

Só depois de tudo acima. Em `/admin/empresas`, crie a empresa e o gestor. Para carregar uma planilha nela:

```sh
cd backend
ZELAR_CONFIRMA_REMOTO=<host do banco> npm run import:load -- <planilha.xlsx> --company=<id da empresa>
```

## 8. Encerrar a chave antiga

Quando `device.last_seen_at` mostrar que todos os celulares estão na versão nova, sem nenhum uso da chave antiga, remova `ZELAR_DEVICE_KEY` e `ZELAR_LEGACY_COMPANY_ID` da Vercel. Isso desliga os APKs antigos. No mesmo passo, tire de `gerar_ordens` a tolerância para quando existe uma só empresa e o campo `pin` de `/api/mobile/workers`.

## Testes locais

Sempre com as variáveis locais exportadas, porque elas têm prioridade sobre `frontend/.env`:

```sh
cd backend && npx supabase start
set -a; . ../frontend/.env.test; set +a
npm run test:db                      # isolamento entre empresas
cd ../frontend && npm run build && npx next start &
npx playwright test                  # cadastros, email e painel, lendo o Mailpit
```
