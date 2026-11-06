import { defineConfig } from "@playwright/test";

// Só contra o painel local ligado ao Supabase local: veja frontend/.env.test.
const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(baseURL)) throw new Error(`Testes só rodam no painel local, não em ${baseURL}.`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure", locale: "pt-BR" },
});
