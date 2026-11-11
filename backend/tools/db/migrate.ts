// Aplica, em ordem, as migrações de supabase/migrations que ainda não rodaram.
// Uso: npm run db:migrate [-- --until=<prefixo>]
// Banco remoto exige ZELAR_CONFIRMA_REMOTO=<host> (ver client.ts).
// Cada arquivo roda numa transação; o registro fica em zelar_meta.migration (fora da API).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { connect } from "./client";

const DIR = join(import.meta.dirname, "../../supabase/migrations");

// Aplicadas à mão no SQL Editor antes deste script existir.
const APPLIED_BY_HAND = ["20261028000000_workers.sql", "20261028000100_worker_grants.sql"];

async function main() {
  const db = await connect();
  try {
    // Bancos de antes da troca de nome guardam o registro em zelo_meta: muda de nome, sem perder nada.
    await db.query(`
      do $$ begin
        if exists (select from pg_namespace where nspname = 'zelo_meta')
           and not exists (select from pg_namespace where nspname = 'zelar_meta') then
          alter schema zelo_meta rename to zelar_meta;
        end if;
      end $$;
      create schema if not exists zelar_meta;
      create table if not exists zelar_meta.migration (name text primary key, applied_at timestamptz not null default now());
    `);
    const { rows: workerTable } = await db.query("select to_regclass('public.worker') is not null as exists");
    if (workerTable[0].exists) {
      await db.query("insert into zelar_meta.migration (name) select unnest($1::text[]) on conflict do nothing", [APPLIED_BY_HAND]);
    }

    const done = new Set((await db.query("select name from zelar_meta.migration")).rows.map((r) => r.name as string));
    const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
    // --until=<prefixo>: para no arquivo indicado (inclusive). Serve para testar a atualização a partir de um banco antigo.
    const until = process.argv.find((a) => a.startsWith("--until="))?.slice("--until=".length);
    const last = until ? files.findIndex((f) => f.startsWith(until)) : files.length - 1;
    if (last < 0) throw new Error(`--until não corresponde a nenhuma migração: ${until}`);
    const pending = files.slice(0, last + 1).filter((f) => !done.has(f));
    if (pending.length === 0) console.log("Banco em dia: nenhuma migração pendente.");

    for (const file of pending) {
      const sql = await readFile(join(DIR, file), "utf8");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("insert into zelar_meta.migration (name) values ($1)", [file]);
        await db.query("commit");
        console.log(`Aplicada: ${file}`);
      } catch (err) {
        await db.query("rollback");
        console.error(`Falhou: ${file}`);
        throw err;
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
