# Zelo — manutenção da Eco Gesso

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

Gera `backend/tools/importer/out/relatorio-conferencia.xlsx` (resumo, linhas rastreadas, pendências, tipos de instrução, cadastro) e `importacao.json`. Nada é gravado no banco. Planilhas e saídas ficam fora do git (`.gitignore`).

## Painel do gestor: funcionários e crachás

1. Crie um projeto no [Supabase](https://supabase.com) e aplique `backend/supabase/migrations/` (SQL Editor, ou `npx supabase link` + `npx supabase db push` dentro de `backend/`).
2. Em Authentication → Users, crie o usuário do gestor (e-mail e senha).
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
flutter run --dart-define=ZELO_API=http://IP-DO-COMPUTADOR:3000 --dart-define=ZELO_DEVICE_KEY=<ZELO_DEVICE_KEY do .env.local>
```

Sem `ZELO_API`, o app usa o trabalhador de teste (crachá: QR com o texto `zelo:cracha:demo-cracha-teste`).

## Protótipo do app de campo (Sprint 1)

```bash
cd mobile
flutter test                 # fluxo completo em celular comum e pequeno (360x640)
flutter build apk --debug    # APK para o teste de uso
```

PIN de teste (trabalhador de teste, sem crachá): sol, casa, carro, estrela. Roteiro do teste com trabalhadores: `docs/sprint1-teste-de-uso.md`.

## Testes

```bash
cd backend && npm test      # regras do importador
cd mobile && flutter test
cd frontend && npm run lint && npm run build
```
