import pg from "pg";

/** Conexão direta ao Postgres do Supabase (SUPABASE_DB_URL em frontend/.env, fora do git). */
export async function connect(): Promise<pg.Client> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Falta SUPABASE_DB_URL em frontend/.env (Supabase → Connect → Direct → Session pooler).");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}
