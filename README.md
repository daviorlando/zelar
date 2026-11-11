# Zelar — manutenção da Eco Gesso

Aplicativo de campo acessível (inclusive para quem não lê), offline-first, com painel web para gestores. Escopo: `Escopo_App_Manutencao_Eco_Gesso_v0_5.md`.

| Pasta | Conteúdo | Stack |
| --- | --- | --- |
| `frontend/` | Painel do gestor e API (`/api/*`); Root Directory do projeto na Vercel | Next.js + TypeScript |
| `backend/` | Migrações e configuração do Supabase, importador da planilha, contrato da API | Supabase, TypeScript |
| `mobile/` | Aplicativo de campo (Android 10+) | Flutter |

## Importador da planilha (modo simulação)

```bash
cd backend
npm install
npm run import:dry -- "../Calendário de Manutenção - Eco Gesso (1).xlsx"
```

Gera `backend/tools/importer/out/relatorio-conferencia.xlsx` (resumo, linhas rastreadas, pendências, tipos de instrução, cadastro). Nada é gravado no banco. Planilhas e saídas ficam fora do git (`.gitignore`).

A carga no banco (`npm run import:load -- <planilha.xlsx> --company=<id>`) reconhece cada atividade pelo conteúdo (setor, frequência, tag e texto): inserir linhas ou renomear a aba não duplica nem reescreve o histórico. Se faltar na planilha a aba de um setor que já tem atividades em uso, a carga para sem gravar nada.

### Conexão direta ao banco (migrações, carga, super-admin)

Os scripts de `backend/` conferem o certificado do banco remoto. Baixe o certificado em Supabase → Project Settings → Database → SSL Configuration → **Download certificate** e indique o arquivo em `frontend/.env`:

```bash
SUPABASE_DB_CA=/caminho/para/prod-ca-2021.crt
```

Sem essa variável, a conexão ao banco remoto é recusada.

## Painel do gestor: funcionários e crachás

1. Crie um projeto no [Supabase](https://supabase.com) e aplique as migrações: `cd backend && npm run db:migrate`.
2. Em Authentication → Users, crie o **primeiro** gestor (e-mail e senha). Os próximos são criados no próprio painel, em **Gestores**.
3. Copie `frontend/.env.example` para `frontend/.env.local` e preencha as chaves.

```bash
cd frontend
npm install
npm run dev -- --hostname 0.0.0.0   # painel em http://localhost:3000, visível na rede local
```

Em **Funcionários**: cadastrar (nome, foto, quatro figuras), imprimir crachás (A4, tamanho de cartão), "Crachá perdido" (gera outro e invalida o impresso) e desativar.

O celular baixa a lista pelo painel (`GET /api/mobile/workers`, com a chave do aparelho) e guarda para entrar sem internet:

```bash
cd mobile
flutter run --dart-define=ZELAR_API=http://IP-DO-COMPUTADOR:3000 --dart-define=ZELAR_DEVICE_KEY=<ZELAR_DEVICE_KEY do .env.local>
```

Sem `ZELAR_API`, o app usa o trabalhador de teste (crachá: QR com o texto `zelar:cracha:demo-cracha-teste`).

## Protótipo do app de campo (Sprint 1)

```bash
cd mobile
flutter test                 # fluxo completo em celular comum e pequeno (360x640)
flutter build apk --debug    # APK para o teste de uso
```

PIN de teste (trabalhador de teste, sem crachá): sol, casa, carro, estrela. Roteiro do teste com trabalhadores: `docs/sprint1-teste-de-uso.md`.

## Começar a operação

Nada gera ordem até o setor ser iniciado. No painel:

1. **Equipamentos**: cadastre o que falta (setores, equipamentos, componentes e atividades).
2. **Funcionários**: vincule ao menos um responsável ativo ao setor.
3. **Implantação**: em **Iniciar setor**, escolha a data e confira a prévia.

Primeiro vencimento: diária no próprio dia; semanal, mensal e trimestral seguem o calendário, e o período em andamento só conta se restar pelo menos metade dele; semestral e anual vencem um ciclo inteiro depois do início (e seguem contando a partir dessa data).

## Gestores

Em **Gestores**, **Novo gestor** pede nome e e-mail e gera uma senha temporária, mostrada uma única vez. No primeiro acesso, o painel exige uma senha nova. Dali também se gera nova senha e se desativa uma conta. Depende de `SUPABASE_SECRET_KEY` no servidor.

## Testes

```bash
cd backend && npm test      # regras do importador
cd mobile && flutter test
cd frontend && npm run lint && npm run build
```
