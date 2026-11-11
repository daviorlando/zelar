import { readFileSync } from "node:fs";
import pg from "pg";

/** Banco nesta máquina (Supabase local)? Só então dá para rodar sem confirmação nem SSL. */
export function ehLocal(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/**
 * Conexão direta ao Postgres do Supabase (SUPABASE_DB_URL em frontend/.env, fora do git).
 * Esse .env costuma apontar para a produção: banco remoto só com ZELO_CONFIRMA_REMOTO=<host>
 * e com o certificado conferido pelo CA do Supabase (SUPABASE_DB_CA, caminho do arquivo).
 */
export async function connect(): Promise<pg.Client> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Falta SUPABASE_DB_URL em frontend/.env (Supabase → Connect → Direct → Session pooler).");
    process.exit(1);
  }
  const local = ehLocal(url);
  if (!local) {
    const host = new URL(url).hostname;
    if (process.env.ZELO_CONFIRMA_REMOTO !== host) {
      console.error(`Recusado: o banco é remoto (${host}). Para continuar de propósito: ZELO_CONFIRMA_REMOTO=${host}`);
      process.exit(1);
    }
    // Sem conferir o certificado, quem estiver no caminho recebe a senha do banco de produção.
    if (!process.env.SUPABASE_DB_CA) {
      console.error("Falta SUPABASE_DB_CA em frontend/.env: caminho do certificado (Supabase → Project Settings → Database → SSL Configuration).");
      process.exit(1);
    }
    console.warn(`Atenção: conectando ao banco remoto ${host}.`);
  }
  // O pooler (*.pooler.supabase.com) é assinado pelo "Supabase Root 2021 CA", o certificado que se baixa.
  const ssl = local ? false : { ca: readFileSync(process.env.SUPABASE_DB_CA!, "utf8") };
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  return client;
}
