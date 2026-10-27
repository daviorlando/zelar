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

## Protótipo do app de campo (Sprint 1)

```bash
cd mobile
flutter test                 # fluxo completo em celular comum e pequeno (360x640)
flutter build apk --debug    # APK para o teste de uso
```

PIN de teste: sol, casa, carro, estrela. Roteiro do teste com trabalhadores: `docs/sprint1-teste-de-uso.md`.

## Testes

```bash
cd backend && npm test      # regras do importador
cd mobile && flutter test
cd frontend && npm run lint
```
