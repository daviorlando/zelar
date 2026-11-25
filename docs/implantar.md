# Implantar o Zelar

Este guia leva uma empresa (ou o técnico que atende a empresa) de zero a equipes usando o app no celular. Há dois caminhos:

- **Instância hospedada:** alguém já mantém um painel. Você só precisa de uma empresa criada nele (passo 6) e dos celulares (passo 7). Peça ao super-admin dessa instância.
- **Instância própria:** você sobe o seu Supabase e o seu painel (passos 1 a 5). Os dados ficam na sua conta.

Siga na ordem: as migrações precisam chegar antes do painel, e o painel antes dos celulares. Onde aparece `<...>`, troque pelo seu valor.

## 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com). Anote a senha do banco.
2. Em **Authentication → Sign In / Providers**, desligue "Allow new users to sign up". Os usuários são criados só por convite.
3. **Não desative o provedor Email.** Ele é o login do painel; desativá-lo impede todo mundo de entrar.
4. Baixe o certificado do banco em **Project Settings → Database → SSL Configuration → Download certificate**.
5. Copie `frontend/.env.example` para `frontend/.env` e preencha `SUPABASE_DB_URL` (**Connect → Direct → Session pooler**), `SUPABASE_DB_CA` (caminho do certificado) e as chaves de **Project Settings → API Keys**. Sem `SUPABASE_DB_CA`, a conexão ao banco remoto é recusada.
6. Aplique as migrações. O comando recusa banco remoto sem confirmação, que é o host do banco:

   ```sh
   cd backend
   npm install
   ZELAR_CONFIRMA_REMOTO=<host do banco> npm run db:migrate
   ```

Um banco novo começa vazio: nenhuma empresa, nenhum usuário.

## 2. Super-admin

O super-admin cria e remove empresas e não pertence a nenhuma.

1. Em **Authentication → Users → Add user → Create new user**, crie a conta com uma senha provisória e marque "Auto Confirm User". Não use o e-mail de um gestor.
2. Dê o papel:

   ```sh
   cd backend
   ZELAR_CONFIRMA_REMOTO=<host do banco> npm run db:super-admin -- --email=<e-mail do super-admin>
   ```

Ele entra pelo `/login` do painel e cai em `/admin/empresas`.

## 3. Painel na Vercel

1. Em **Add New → Project**, importe o repositório e escolha `frontend` em **Root Directory**.
2. Preencha as variáveis em **Environment Variables**. Marque como sensíveis as indicadas como secretas.
3. Faça o deploy. Se o endereço mudar depois (domínio próprio), corrija `NEXT_PUBLIC_SITE_URL` e publique de novo: uma variável `NEXT_PUBLIC_` só vale a partir do próximo deploy.

| Variável | Secreta | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | não | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | não | Supabase → Project Settings → API Keys |
| `SUPABASE_SECRET_KEY` | **sim** | o mesmo lugar, chave secreta. Só no servidor |
| `CRON_SECRET` | **sim** | gere com `openssl rand -base64 32`; a Vercel o manda no cron diário que gera as ordens |
| `NEXT_PUBLIC_SITE_URL` | não | endereço público do painel, sem `/` no final; entra nos links dos e-mails |
| `NEXT_PUBLIC_ZELAR_RELEASES_REPO` | não | repositório do GitHub de onde a página `/baixar` pega o APK. Padrão `daviorlando/zelar`; troque se o seu APK sai de outro repositório |
| `ZELAR_DEVICE_KEY` | **sim** | opcional. Chave dos aparelhos antigos, que não usam pareamento. Instância nova não precisa |
| `ZELAR_LEGACY_COMPANY_ID` | não | opcional, par da anterior: empresa que esses aparelhos antigos atendem |

Só na máquina local, em `frontend/.env`, nunca na Vercel: `SUPABASE_DB_URL`, `SUPABASE_DB_CA`, `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` (identificador do projeto, o trecho antes de `.supabase.co`) são das ferramentas de `backend/`; `ZELAR_DEV_ORIGINS` (endereços extras, separados por vírgula, que podem abrir o painel do `npm run dev`, como o IP do computador na rede) é só do desenvolvimento. O código ainda aceita os nomes antigos `ZELO_*` como reserva.

Para conferir: abra o endereço do painel e entre como super-admin.

## 4. E-mail

O Supabase manda os convites e as recuperações de senha. O envio padrão dele é limitado a poucos e-mails por hora; para uso real, configure SMTP próprio (Resend, por exemplo).

1. No provedor, verifique o domínio de envio (um subdomínio como `mail.<seu domínio>` evita mexer no e-mail que você já usa). Publique no DNS os registros DKIM e SPF indicados e um DMARC (TXT em `_dmarc` com `v=DMARC1; p=none;`).
2. Crie uma chave de API só com permissão de envio.
3. **Authentication → Emails → SMTP Settings:** ative o SMTP próprio. No Resend: host `smtp.resend.com`, porta `465`, usuário `resend`, senha igual à chave. Remetente de um endereço do domínio verificado, como `nao-responder@mail.<seu domínio>`, com o nome "Zelar".
4. **Authentication → Rate Limits:** aumente o limite de e-mails por hora (30 basta para começar). Ao passar do limite, o "esqueci a senha" falha.
5. **Authentication → URL Configuration:** Site URL igual a `NEXT_PUBLIC_SITE_URL`; em Redirect URLs, acrescente `<endereço do painel>/auth/confirm`.
6. **Authentication → Emails → Templates:** sem isto o link não passa pela tela de confirmação e o convite não funciona.

   | Modelo | Assunto | Corpo |
   | --- | --- | --- |
   | Invite user | `Seu acesso ao Zelar` | conteúdo de `backend/supabase/templates/convite.html` |
   | Reset password | `Criar nova senha do Zelar` | conteúdo de `backend/supabase/templates/recuperar.html` |

7. Teste com uma caixa real: convide um e-mail seu (passo 6) e use "Esqueci a senha" no login. Olhe também o spam; se cair lá, falta DNS ou DMARC.

## 5. Backups

Não dependa só dos backups automáticos do Supabase (eles variam conforme o plano). Faça os seus e guarde fora do computador:

```sh
pg_dump "$SUPABASE_DB_URL" > zelar-<data>.sql
```

Copie também os arquivos do Storage (fotos e áudios). Faça um backup antes de cada migração em produção.

## 6. Primeira empresa

1. Como super-admin, abra `/admin/empresas`, crie a empresa e convide o gestor pelo e-mail. Ele recebe o link, cria a senha e entra no painel da empresa.
2. O gestor cadastra os **Funcionários** (nome, foto, número do PIN) e imprime os crachás.
3. O gestor cadastra **Equipamentos** (setores, equipamentos, componentes e atividades), uma a uma, **ou** você importa uma planilha:

   - Preencha uma cópia de [`exemplos/ecogesso/modelo-planilha.xlsx`](../exemplos/ecogesso/modelo-planilha.xlsx). O layout está explicado em [`exemplos/ecogesso/README.md`](../exemplos/ecogesso/README.md).
   - Simule primeiro; nada é gravado e o relatório mostra as pendências:

     ```sh
     cd backend
     npm run import:dry -- <planilha.xlsx>
     ```
   - Confira `backend/tools/importer/out/relatorio-conferencia.xlsx` e carregue:

     ```sh
     ZELAR_CONFIRMA_REMOTO=<host do banco> npm run import:load -- <planilha.xlsx> --company=<id da empresa>
     ```
     Para achar o id da empresa: `select id, name from company;` no SQL Editor do Supabase. Rodar a carga de novo não duplica nada.

4. Vincule ao menos um responsável ativo a cada setor.
5. Em **Implantação → Iniciar setor**, escolha a data e confira a prévia. Nada gera ordem até o setor ser iniciado. Comece um setor por vez, de preferência um que a equipe já conheça.

## 7. Celulares

O app é Android 10 ou mais novo.

**Com o APK público.** Abra `<endereço do painel>/baixar` no celular (ou https://zelar-vert.vercel.app/baixar) e instale. O Android pede para permitir instalação de fontes desconhecidas, uma vez. Esse APK fala com a instância hospedada pelo projeto; para usar a sua, faça o build próprio abaixo.

**Com build próprio**, para falar com o seu painel e assinar com a sua chave:

1. Faça um fork do repositório.
2. Crie uma chave de assinatura e **guarde-a com backup**; perdê-la impede atualizar o app por cima:

   ```sh
   keytool -genkeypair -v -keystore zelar.jks -alias zelar -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 zelar.jks   # valor de ZELAR_KEYSTORE_B64
   ```
3. No fork, em **Settings → Secrets and variables → Actions**:
   - variável `ZELAR_API`: endereço do seu painel, como `https://<seu painel>`;
   - segredos `ZELAR_KEYSTORE_B64`, `ZELAR_KEYSTORE_PASSWORD`, `ZELAR_KEY_ALIAS`, `ZELAR_KEY_PASSWORD`.
4. Envie uma tag `v*`, como `v1.2.0`. O fluxo `.github/workflows/release.yml` publica em **Releases** os arquivos `zelar-<versão>-arm64.apk`, `zelar-<versão>-arm32.apk` e `SHA256SUMS.txt`.
5. Defina `NEXT_PUBLIC_ZELAR_RELEASES_REPO=<seu usuário>/<seu repositório>` na Vercel para a página `/baixar` oferecer o seu APK.

Sem GitHub, é possível compilar à mão. Crie `mobile/android/key.properties` (fica fora do git) apontando para a chave:

```properties
storeFile=/caminho/para/zelar.jks
storePassword=<senha>
keyAlias=zelar
keyPassword=<senha>
```

```sh
cd mobile
flutter build apk --release --split-per-abi --target-platform android-arm,android-arm64 \
  --dart-define=ZELAR_API=https://<seu painel>
```

Sem `key.properties` (nem as variáveis do CI), o build de release para com erro em vez de assinar com a chave de debug. Não passe `ZELAR_DEVICE_KEY`: com ela o app pula o pareamento.

**Parear cada celular.** No painel, em **Celulares**, o gestor gera um código (vale 15 minutos, uso único) e a pessoa o digita no app. Depois, cada funcionário entra com o seu PIN numérico. Teste com um funcionário: entrar, responder um item e ver a ordem mudar no quadro.

**Trocar de app.** O `applicationId` da versão 1.2.0 é `app.zelar.campo`, assinado com outra chave. Celulares com uma versão anterior precisam desinstalar o app antigo uma vez. Antes, confira que não há nada pendente de envio: desinstalar apaga o que não foi enviado.

## Testes locais

Antes de mexer em migrações ou no isolamento entre empresas, com as variáveis locais exportadas (elas têm prioridade sobre `frontend/.env`):

```sh
cd backend && npx supabase start
set -a; . ../frontend/.env.test; set +a
npm run test:db                      # isolamento entre empresas
cd ../frontend && npm run build && npx next start &
npx playwright test                  # cadastros, e-mail e painel, lendo o Mailpit
```
