// Uma empresa não alcança os dados da outra. Só no Supabase local, com logins de verdade.
// Uso: npm run test:db (com as variáveis de frontend/.env.test exportadas).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ehLocal } from "../tools/db/client";

const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRETA = process.env.SUPABASE_SECRET_KEY ?? "";

let db: pg.Client;
type Empresa = { id: string; token: string; worker: string; equipamento: string; ordem: string; item: string; userId: string };
let a: Empresa;
let b: Empresa;

const rest = (caminho: string, token: string | null, init: RequestInit = {}) =>
  fetch(`${API}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: PUBLICA, "content-type": "application/json", Prefer: "return=representation", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
const rpc = (nome: string, args: unknown, token: string) => rest(`rpc/${nome}`, token, { method: "POST", body: JSON.stringify(args) });

async function criarEmpresa(sufixo: string): Promise<Empresa> {
  const email = `gestor-${sufixo}-${randomUUID().slice(0, 8)}@teste.local`;
  const senha = "senha-de-teste-123";
  const criada = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SECRETA, authorization: `Bearer ${SECRETA}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  }).then((r) => r.json());
  const { rows: [empresa] } = await db.query("insert into public.company (name) values ($1) returning id", [`Empresa ${sufixo}`]);
  await db.query("insert into public.app_user (user_id, company_id, role) values ($1, $2, 'manager')", [criada.id, empresa.id]);
  await db.query("insert into public.sector (company_id, code, name) values ($1, 'A', 'Setor A')", [empresa.id]);
  const { rows: [eq] } = await db.query(
    "insert into public.equipment (company_id, tag, name, sector_code) values ($1, 'A - MESMA', 'Mesma tag', 'A') returning id",
    [empresa.id],
  );
  const { rows: [plano] } = await db.query(
    `insert into public.plan_item (company_id, source_sheet, source_row, sector_code, frequency, equipment_id, activity, instruction_kind, item_type)
     values ($1, 'aba', 1, 'A', 'weekly', $2, 'Olhar', 'olhar', 'inspection') returning id`,
    [empresa.id, eq.id],
  );
  const { rows: [w] } = await db.query(
    "insert into public.worker (company_id, name, pin, badge_token) values ($1, $2, '{1,2,3,9}', $3) returning id",
    [empresa.id, `Funcionário ${sufixo}`, randomUUID()],
  );
  await db.query("insert into public.worker_sector (worker_id, sector_code) values ($1, 'A')", [w.id]);
  const { rows: [ordem] } = await db.query(
    `insert into public.work_order (equipment_id, sector_code, frequency, period_start, period_end, due_date)
     values ($1, 'A', 'weekly', current_date, current_date + 6, current_date + 6) returning id`,
    [eq.id],
  );
  const { rows: [item] } = await db.query("insert into public.work_order_item (work_order_id, plan_item_id) values ($1, $2) returning id", [ordem.id, plano.id]);
  const sessao = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLICA, "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  }).then((r) => r.json());
  if (!sessao.access_token) throw new Error(`Login do gestor falhou: ${JSON.stringify(sessao)}`);
  return { id: empresa.id, token: sessao.access_token, worker: w.id, equipamento: eq.id, ordem: ordem.id, item: item.id, userId: criada.id };
}

beforeAll(async () => {
  if (!process.env.SUPABASE_DB_URL || !ehLocal(process.env.SUPABASE_DB_URL) || !ehLocal(API)) {
    throw new Error("Este teste só roda no Supabase local: exporte as variáveis de frontend/.env.test.");
  }
  db = await connect();
  a = await criarEmpresa("A");
  b = await criarEmpresa("B");
});

afterAll(async () => {
  await db?.end();
});

describe("o banco não tem porta aberta", () => {
  it("nenhuma política ficou com using (true)", async () => {
    const { rows } = await db.query(
      `select schemaname, tablename, policyname from pg_policies
       where (schemaname = 'public' or (schemaname = 'storage' and policyname like 'gestor%'))
         and (qual = 'true' or with_check = 'true')`,
    );
    expect(rows).toEqual([]);
  });

  it("toda tabela com company_id tem RLS ligado", async () => {
    const { rows } = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id'
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("anônimo não executa nenhuma função que ignora o RLS", async () => {
    const { rows } = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')`,
    );
    expect(rows).toEqual([]);
  });

  it("gestor não chama as funções internas", async () => {
    const r = await rpc("ajustar_ordens_da_empresa", { empresa: b.id }, a.token);
    expect(r.ok).toBe(false);
    const s = await rpc("sincronizar", { funcionario: b.worker, operacoes: [] }, a.token);
    expect(s.ok).toBe(false);
  });
});

describe("ler", () => {
  for (const tabela of ["worker", "equipment", "plan_item", "work_order", "work_order_item", "sector", "worker_sector", "company", "app_user"]) {
    it(`${tabela}: só enxerga a própria empresa`, async () => {
      const r = await rest(`${tabela}?select=*`, a.token);
      expect(r.status).toBe(200);
      const linhas = (await r.json()) as Record<string, string>[];
      expect(linhas.length).toBeGreaterThan(0);
      const dono = (l: Record<string, string>) => (tabela === "company" ? l.id : l.company_id);
      expect(linhas.every((l) => dono(l) === a.id)).toBe(true);
    });
  }

  it("sem login não lê nada", async () => {
    const r = await rest("worker?select=id", null);
    const linhas = r.ok ? ((await r.json()) as unknown[]) : [];
    expect(linhas).toEqual([]);
  });
});

describe("escrever na outra empresa", () => {
  it("não altera funcionário", async () => {
    const r = await rest(`worker?id=eq.${b.worker}`, a.token, { method: "PATCH", body: JSON.stringify({ name: "invadido" }) });
    expect(await r.json()).toEqual([]);
    const { rows } = await db.query("select name from public.worker where id = $1", [b.worker]);
    expect(rows[0].name).toBe("Funcionário B");
  });

  it("não cria linha em nome dela", async () => {
    const r = await rest("worker", a.token, { method: "POST", body: JSON.stringify({ company_id: b.id, name: "x", pin: [1, 2, 3, 4], badge_token: randomUUID() }) });
    expect(r.ok).toBe(false);
  });

  it("não aponta para o funcionário nem para a máquina dela", async () => {
    const setor = await rest("worker_sector", a.token, { method: "POST", body: JSON.stringify({ worker_id: b.worker, sector_code: "A" }) });
    expect(setor.ok).toBe(false);
    const comp = await rest("equipment", a.token, { method: "POST", body: JSON.stringify({ tag: "A - INVASOR", sector_code: "A", parent_id: b.equipamento }) });
    expect(comp.ok).toBe(false);
    const atribuir = await rest(`work_order?id=eq.${a.ordem}`, a.token, { method: "PATCH", body: JSON.stringify({ assigned_worker_id: b.worker }) });
    expect(atribuir.ok).toBe(false);
  });

  it("não cancela ordem nem mexe em auditoria dela", async () => {
    await rest(`work_order?id=eq.${b.ordem}`, a.token, { method: "PATCH", body: JSON.stringify({ status: "cancelled", cancel_reason: "x" }) });
    const { rows } = await db.query("select status from public.work_order where id = $1", [b.ordem]);
    expect(rows[0].status).toBe("open");
    const audit = await rest("audit_log", a.token, { method: "POST", body: JSON.stringify({ actor: a.userId, action: "cancelar", work_order_id: b.ordem }) });
    expect(audit.ok).toBe(false);
  });
});

describe("funções", () => {
  it("liberar_impedimento não alcança a outra empresa", async () => {
    await db.query("update public.work_order set status = 'blocked' where id = $1", [b.ordem]);
    const r = await rpc("liberar_impedimento", { ordem: b.ordem, resolucao: "x" }, a.token);
    expect(r.ok).toBe(false);
    await db.query("update public.work_order set status = 'open' where id = $1", [b.ordem]);
  });

  it("recalcular_ordem não muda a outra empresa", async () => {
    await db.query("update public.work_order set status = 'blocked' where id = $1", [b.ordem]);
    await rpc("recalcular_ordem", { ordem: b.ordem }, a.token);
    const { rows } = await db.query("select status from public.work_order where id = $1", [b.ordem]);
    expect(rows[0].status).toBe("blocked");
    await db.query("update public.work_order set status = 'open' where id = $1", [b.ordem]);
  });

  it("desfazer_inicio_setor com o mesmo código só afeta a própria empresa", async () => {
    await db.query("update public.sector set start_date = current_date where company_id = $1", [b.id]);
    await rpc("desfazer_inicio_setor", { setor: "A" }, a.token);
    const { rows } = await db.query("select start_date from public.sector where company_id = $1", [b.id]);
    expect(rows[0].start_date).not.toBeNull();
    const ordem = await db.query("select 1 from public.work_order where id = $1", [b.ordem]);
    expect(ordem.rowCount).toBe(1);
  });

  it("gerar_ordens ignora a empresa pedida e usa a do gestor", async () => {
    const periodos = [{ sector_code: "A", frequency: "weekly", period_start: "2030-01-07", period_end: "2030-01-13" }];
    const r = await rpc("gerar_ordens", { periodos, origem: "manual", empresa: b.id }, a.token);
    expect(r.ok).toBe(true);
    const { rows } = await db.query("select company_id from public.work_order where period_start = '2030-01-07' and company_id = any($1)", [[a.id, b.id]]);
    expect(rows.map((l) => l.company_id)).toEqual([a.id]);
  });

  it("funcionário não responde ordem de outra empresa, mesmo no mesmo setor", async () => {
    const { rows } = await db.query("select * from public.sincronizar($1, $2)", [
      a.worker,
      JSON.stringify([{ opId: randomUUID(), type: "answer", itemId: b.item, result: "ok", deviceTime: new Date().toISOString() }]),
    ]);
    expect(rows[0].status).toBe("rejected");
    const item = await db.query("select result from public.work_order_item where id = $1", [b.item]);
    expect(item.rows[0].result).toBeNull();
  });

  it("empresa desativada perde o acesso na hora", async () => {
    await db.query("update public.company set active = false where id = $1", [b.id]);
    const r = await rest("worker?select=id", b.token);
    expect(await r.json()).toEqual([]);
    await db.query("update public.company set active = true where id = $1", [b.id]);
  });
});

describe("storage", () => {
  const enviar = (bucket: string, caminho: string, token: string) =>
    fetch(`${API}/storage/v1/object/${bucket}/${caminho}`, {
      method: "POST",
      headers: { apikey: PUBLICA, authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

  it("envia para a pasta da própria empresa e não para a da outra", async () => {
    expect((await enviar("equipment-photos", `${a.equipamento}/1.jpg`, a.token)).ok).toBe(true);
    expect((await enviar("equipment-photos", `${b.equipamento}/1.jpg`, a.token)).ok).toBe(false);
    expect((await enviar("worker-photos", `${a.worker}/1.jpg`, a.token)).ok).toBe(true);
    expect((await enviar("worker-photos", `${b.worker}/1.jpg`, a.token)).ok).toBe(false);
  });

  it("não baixa a foto da outra empresa", async () => {
    await enviar("equipment-photos", `${b.equipamento}/2.jpg`, b.token);
    const r = await fetch(`${API}/storage/v1/object/equipment-photos/${b.equipamento}/2.jpg`, {
      headers: { apikey: PUBLICA, authorization: `Bearer ${a.token}` },
    });
    expect(r.ok).toBe(false);
  });
});

describe("cadastro", () => {
  it("cadastro público está desligado", async () => {
    const r = await fetch(`${API}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: PUBLICA, "content-type": "application/json" },
      body: JSON.stringify({ email: `invasor-${randomUUID().slice(0, 8)}@teste.local`, password: "senha-de-teste-123" }),
    });
    expect(r.ok).toBe(false);
  });
});

describe("regras novas", () => {
  it("atividade diária ativa é recusada", async () => {
    const r = await rest("plan_item", a.token, {
      method: "POST",
      body: JSON.stringify({ sector_code: "A", frequency: "daily", equipment_id: a.equipamento, activity: "x", instruction_kind: "x", item_type: "inspection" }),
    });
    expect(r.ok).toBe(false);
  });

  it("PIN aceita o 9 e recusa valor fora de 0 a 9", async () => {
    const r = await rest(`worker?id=eq.${a.worker}`, a.token, { method: "PATCH", body: JSON.stringify({ pin: [9, 9, 9, 10] }) });
    expect(r.ok).toBe(false);
    const ok = await rest(`worker?id=eq.${a.worker}`, a.token, { method: "PATCH", body: JSON.stringify({ pin: [9, 9, 9, 9] }) });
    expect(ok.ok).toBe(true);
  });

  it("item pulado não impede concluir", async () => {
    const op = (x: object) => ({ opId: randomUUID(), deviceTime: new Date().toISOString(), ...x });
    const { rows } = await db.query("select * from public.sincronizar($1, $2)", [
      // Empresa B: o teste de desfazer o início apagou as ordens da A, como devia.
      b.worker,
      JSON.stringify([op({ type: "answer", itemId: b.item, result: "skipped" }), op({ type: "finish", orderId: b.ordem })]),
    ]);
    expect(rows.map((l) => l.status)).toEqual(["accepted", "accepted"]);
    const ordem = await db.query("select status from public.work_order where id = $1", [b.ordem]);
    expect(ordem.rows[0].status).toBe("awaiting_validation");
  });
});
