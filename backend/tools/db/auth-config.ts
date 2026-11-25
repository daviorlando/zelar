// Confere e aplica no Supabase de produção a parte de login que não fica no banco:
// assunto e corpo dos e-mails de convite e de nova senha (backend/supabase/templates).
// Uso: npm run auth:config            (só mostra o que está lá)
//      npm run auth:config -- --aplicar
// Precisa de SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens) em frontend/.env.
// Valores secretos (senha do SMTP etc.) nunca são impressos.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// SUPABASE_PROJECT_REF ou, sem ele, o começo de NEXT_PUBLIC_SUPABASE_URL (https://<projeto>.supabase.co).
const PROJETO =
  process.env.SUPABASE_PROJECT_REF?.trim() || /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[1];
if (!PROJETO) {
  console.error("Falta SUPABASE_PROJECT_REF em frontend/.env (Supabase → Project Settings → General → Project ID).");
  process.exit(1);
}
const API = `https://api.supabase.com/v1/projects/${PROJETO}/config/auth`;
const MODELOS = join(import.meta.dirname, "../../supabase/templates");

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN em frontend/.env (supabase.com/dashboard/account/tokens).");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

type Config = Record<string, unknown>;

async function ler(): Promise<Config> {
  const r = await fetch(API, { headers });
  if (!r.ok) throw new Error(`Supabase recusou a leitura (${r.status}): ${await r.text()}`);
  return (await r.json()) as Config;
}

function resumo(c: Config) {
  const link = (html: unknown) => {
    const s = String(html ?? "");
    if (s.includes("{{ .ConfirmationURL }}")) return "modelo PADRÃO do Supabase ({{ .ConfirmationURL }})";
    if (s.includes("token_hash={{ .TokenHash }}")) return "modelo do projeto (token_hash)";
    return s ? "outro modelo" : "vazio (padrão do Supabase)";
  };
  console.log({
    site_url: c.site_url,
    redirect_urls: c.uri_allow_list,
    smtp_proprio: Boolean(c.smtp_host),
    smtp_host: c.smtp_host ?? null,
    smtp_remetente: c.smtp_admin_email ?? null,
    limite_emails_por_hora: c.rate_limit_email_sent,
    assunto_convite: c.mailer_subjects_invite,
    corpo_convite: link(c.mailer_templates_invite_content),
    assunto_nova_senha: c.mailer_subjects_recovery,
    corpo_nova_senha: link(c.mailer_templates_recovery_content),
  });
}

async function main() {
  const antes = await ler();
  console.log("Agora no Supabase:");
  resumo(antes);
  if (!process.argv.includes("--aplicar")) return;

  const mudanca: Config = {
    mailer_subjects_invite: "Seu acesso ao Zelar",
    mailer_templates_invite_content: await readFile(join(MODELOS, "convite.html"), "utf8"),
    mailer_subjects_recovery: "Criar nova senha do Zelar",
    mailer_templates_recovery_content: await readFile(join(MODELOS, "recuperar.html"), "utf8"),
  };
  const r = await fetch(API, { method: "PATCH", headers, body: JSON.stringify(mudanca) });
  if (!r.ok) throw new Error(`Supabase recusou a alteração (${r.status}): ${await r.text()}`);
  console.log("\nDepois de aplicar:");
  resumo(await ler());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
