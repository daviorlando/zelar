// Dá o papel de super-admin a uma conta que já existe no Supabase Auth (crie antes no painel do Supabase).
// Uso: npm run db:super-admin -- --email=<email>
// Super-admin cuida das empresas e não pertence a nenhuma; por isso não vira gestor de uma empresa.
import { connect } from "./client";

async function main() {
  const email = process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length).trim().toLowerCase();
  if (!email) {
    console.error("Uso: npm run db:super-admin -- --email=<email>");
    process.exit(1);
  }
  const db = await connect();
  try {
    const { rows } = await db.query("select id from auth.users where lower(email) = $1", [email]);
    if (!rows[0]) throw new Error(`Conta não encontrada: ${email}. Crie em Authentication → Users no Supabase.`);
    await db.query(
      `insert into public.app_user (user_id, company_id, role) values ($1, null, 'super_admin')
       on conflict (user_id) do update set company_id = null, role = 'super_admin'`,
      [rows[0].id],
    );
    console.log(`Super-admin: ${email}`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
