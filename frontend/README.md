# Painel e API do Zelar

Next.js (App Router) e TypeScript. O painel do gestor e do super-admin fica em `src/app`; a API do app de campo, em `src/app/api/mobile`; o cron diário que gera as ordens, em `src/app/api/cron`. A página pública `/baixar` oferece o APK.

```bash
cp .env.example .env         # chaves do Supabase; .env.local, se existir, vale por cima
npm install
npm run dev                  # http://localhost:3000
```

Variáveis de ambiente: [docs/implantar.md](../docs/implantar.md#3-painel-na-vercel). Testes: `npm run lint`, `npm run build` e `npx playwright test` (e2e, precisa do Supabase local).
