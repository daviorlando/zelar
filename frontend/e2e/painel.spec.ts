import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

/*
 * Funções do painel no navegador, do zero, numa empresa só deste teste.
 * Rode com as variáveis locais exportadas:
 *   set -a; . ./.env.test; set +a; npx playwright test e2e/painel.spec.ts
 * Cada execução cria uma empresa nova e não mexe nas outras.
 *
 * Um só teste com etapas: elas dependem umas das outras (quem responde precisa da ordem gerada),
 * e uma etapa com defeito não deve esconder o resultado das seguintes. Todas as falhas saem no final.
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SEGREDO = process.env.SUPABASE_SECRET_KEY ?? "";
const BANCO = process.env.SUPABASE_DB_URL ?? "";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
for (const [nome, url] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, SUPABASE_DB_URL: BANCO, NEXT_PUBLIC_SITE_URL: SITE })) {
  if (!/(@|\/\/)(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`${nome} não aponta para a máquina local: exporte frontend/.env.test.`);
}

const marca = `a5-${Date.now()}`;
const EMAIL = `gestor.${marca}@teste.local`;
const SENHA = "senha-de-teste-123";
const EMPRESA = `Empresa ${marca}`;

const EQ1 = { codigo: "EQ1", tag: "A - EQ1", nome: "BRITADOR UM", legivel: "Britador Um" };
const EQ2 = { codigo: "EQ2", tag: "A - EQ2", nome: "MOINHO DOIS", legivel: "Moinho Dois" };
const EQ3 = { codigo: "EQ3", tag: "A - EQ3", nome: "PENEIRA TRES", legivel: "Peneira Tres" };

const COLUNA = {
  fazer: "A fazer",
  execucao: "Em execução",
  impedida: "Impedida",
  aguardando: "Aguardando validação",
  concluida: "Concluída",
};

/** Consulta por psql; devolve as linhas como objetos. */
function sql<T = Record<string, unknown>>(consulta: string): T[] {
  const saida = execFileSync("psql", [BANCO, "-v", "ON_ERROR_STOP=1", "-At", "-c", `select coalesce(json_agg(t), '[]') from (${consulta}) t`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(saida);
}
const umValor = <T = unknown>(consulta: string) => Object.values(sql(consulta)[0] ?? {})[0] as T;
const executar = (comando: string) =>
  execFileSync("psql", [BANCO, "-v", "ON_ERROR_STOP=1", "-At", "-c", comando], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const adm = createClient(SUPABASE, SEGREDO, { auth: { persistSession: false, autoRefreshToken: false } });

/* ── Estado compartilhado entre as etapas ───────────────────────────────── */

let empresaId = "";
let gestorId = "";
let funcionarioId = "";
let equipamentoId = "";
let tokenA = "";
let tokenB = "";
const errosDoConsole: string[] = [];
const falhas: string[] = [];

async function etapa(nome: string, corpo: () => Promise<void>) {
  try {
    await test.step(nome, corpo);
  } catch (e) {
    falhas.push(`[${nome}] ${e instanceof Error ? e.message : e}`);
  }
}

function vigiar(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error") errosDoConsole.push(`${page.url()} :: ${m.text()} @ ${m.location().url}`);
  });
  page.on("pageerror", (e) => errosDoConsole.push(`${page.url()} :: pageerror ${e.message}`));
}

/* ── Ajudantes de tela ──────────────────────────────────────────────────── */

/** Clica até o alvo aparecer: antes da hidratação o clique no botão não faz nada. */
async function abrir(botao: Locator, alvo: Locator) {
  await expect(async () => {
    await botao.click({ timeout: 2000 });
    await expect(alvo).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

const aviso = (page: Page, texto: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texto }).first();
const dialogo = (page: Page, texto: string | RegExp) => page.getByRole("dialog").filter({ hasText: texto }).last();
const coluna = (page: Page, titulo: string) => page.locator(`section[aria-label^="${titulo}:"]`);
const cartao = (lugar: Page | Locator, nome: string) => lugar.locator(`article[aria-label^="${nome},"]`);

async function criarEquipamento(page: Page, eq: typeof EQ1) {
  await page.goto("/gestor/equipamentos");
  const d = dialogo(page, "Novo equipamento");
  await abrir(page.getByRole("button", { name: "Novo equipamento" }), d);
  await d.locator("#eq-setor").selectOption("A");
  await d.locator("#eq-codigo").fill(eq.codigo);
  await d.locator("#eq-nome").fill(eq.nome);
  await d.getByRole("button", { name: "Salvar" }).click();
  await page.waitForURL(/\/gestor\/equipamentos\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

async function criarAtividade(page: Page, texto: string, frequencia = "semiannual") {
  const d = dialogo(page, "Nova atividade");
  await abrir(page.getByRole("button", { name: "Nova atividade" }), d);
  await d.locator("#at-freq").selectOption(frequencia);
  await d.locator("#at-resumo").fill("inspeção visual");
  await d.locator("#at-texto").fill(texto);
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText(texto, { exact: true }).first()).toBeVisible();
}

/**
 * Primeira ordem semestral do equipamento. O ciclo semestral começa no dia do início, então a ordem
 * está em curso em qualquer data; semanal, mensal e trimestral podem cair no período seguinte e ficar fora do quadro.
 */
function ordemDe(eq: typeof EQ1) {
  return umValor<string>(
    `select w.id from work_order w join equipment e on e.id = w.equipment_id
     where w.company_id = '${empresaId}' and e.tag = '${eq.tag}' and w.frequency = 'semiannual' order by w.period_start limit 1`,
  );
}
function itensDe(ordem: string) {
  const linhas = sql<{ id: string; activity: string }>(
    `select i.id, p.activity from work_order_item i join plan_item p on p.id = i.plan_item_id where i.work_order_id = '${ordem}' order by p.activity`,
  );
  return linhas.map((l) => l.id);
}
const situacao = (ordem: string) => umValor<string>(`select status from work_order where id = '${ordem}'`);

const opId = () => randomBytes(12).toString("hex");
const responder = (itemId: string, result: string, reason?: string) => ({
  opId: opId(),
  type: "answer",
  itemId,
  result,
  reason: reason ?? null,
  deviceTime: new Date().toISOString(),
});
const concluir = (orderId: string) => ({ opId: opId(), type: "finish", orderId, deviceTime: new Date().toISOString() });

async function sincronizar(ops: unknown[], token = tokenA) {
  const r = await fetch(`${SITE}/api/mobile/sync`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-token": token },
    body: JSON.stringify({ workerId: funcionarioId, ops }),
  });
  const corpo = (await r.json()) as { results?: { opId: string; status: string; reason: string | null }[] };
  return { status: r.status, resultados: corpo.results ?? [] };
}
async function sincronizarOk(ops: unknown[]) {
  const r = await sincronizar(ops);
  expect(r.status).toBe(200);
  expect(r.resultados.map((x) => x.status)).toEqual(ops.map(() => "accepted"));
}

async function gerarCodigo(page: Page, nome: string) {
  await page.goto("/gestor/aparelhos");
  const d = dialogo(page, "Ligar celular");
  await abrir(page.getByRole("button", { name: "Ligar celular" }), d);
  await d.locator("#aparelho-nome").fill(nome);
  await d.getByRole("button", { name: "Gerar código" }).click();
  const texto = dialogo(page, "Código do celular").locator("p.select-all");
  await expect(texto).toBeVisible();
  return (await texto.innerText()).replace(/\s/g, "");
}
const ativar = (code: string) =>
  fetch(`${SITE}/api/mobile/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
const ativarComLogin = (email: string, password: string) =>
  fetch(`${SITE}/api/mobile/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });

/* ── Imagens de teste ───────────────────────────────────────────────────── */

/** Ruído no canvas: o pior caso para a compressão, então o arquivo fica grande de verdade. */
async function imagemGrande(page: Page, tipo: "image/jpeg" | "image/png", largura = 2400, altura = 1800) {
  const base64 = await page.evaluate(
    async ({ tipo, largura, altura }) => {
      const tela = document.createElement("canvas");
      tela.width = largura;
      tela.height = altura;
      const c = tela.getContext("2d")!;
      const img = c.createImageData(largura, altura);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = Math.random() * 255;
        img.data[i + 2] = Math.random() * 255;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      const blob: Blob = await new Promise((r) => tela.toBlob((b) => r(b!), tipo, 1));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(bin);
    },
    { tipo, largura, altura },
  );
  return Buffer.from(base64, "base64");
}

const PNG_PEQUENO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64",
);

/** Largura e altura de um JPEG, pelo marcador SOF. */
function dimensoesJpeg(b: Buffer) {
  let i = 2;
  while (i < b.length) {
    const marcador = b[i + 1];
    if (marcador >= 0xc0 && marcador <= 0xc2) return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("JPEG sem SOF");
}

const objetos = (balde: string, pasta: string) =>
  sql<{ name: string; size: string; mimetype: string }>(
    `select name, metadata->>'size' as size, metadata->>'mimetype' as mimetype from storage.objects where bucket_id = '${balde}' and name like '${pasta}/%' order by created_at`,
  );

async function esperarFotoDaMaquina(anterior: string | null) {
  await expect
    .poll(() => umValor<string | null>(`select photo_path from equipment where id = '${equipamentoId}'`), { timeout: 30_000 })
    .not.toBe(anterior);
  return umValor<string | null>(`select photo_path from equipment where id = '${equipamentoId}'`);
}

async function conferirImagemCarregada(img: Locator) {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBeGreaterThan(0);
  expect(await img.getAttribute("src")).toMatch(/^(http:\/\/(127\.0\.0\.1|localhost):54321\/|blob:)/);
}

/* ── O percurso ─────────────────────────────────────────────────────────── */

test("painel do gestor, de empresa vazia até a validação", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(15 * 60 * 1000);

  empresaId = executar(`insert into company (name) values ('${EMPRESA}') returning id`).split("\n")[0].trim();
  const criado = await adm.auth.admin.createUser({ email: EMAIL, password: SENHA, email_confirm: true });
  expect(criado.error).toBeNull();
  gestorId = criado.data.user!.id;
  executar(`insert into app_user (user_id, company_id, role) values ('${gestorId}', '${empresaId}', 'manager')`);

  const contexto = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: SITE, locale: "pt-BR" });
  const page = await contexto.newPage();
  vigiar(page);

  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/gestor\/quadro/);

  await etapa("empresa vazia: telas orientam o começo", async () => {
    await expect(page.getByText("Nenhum setor iniciado")).toBeVisible();
    await page.goto("/gestor/equipamentos");
    await expect(page.getByText("Crie um setor primeiro")).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo equipamento" })).toHaveCount(0);
    await page.goto("/gestor/implantacao");
    await expect(page.getByText("Nenhum setor ainda.")).toBeVisible();
    await page.goto("/gestor/aparelhos");
    await expect(page.getByText("Nenhum celular ligado ainda.")).toBeVisible();
    await page.goto("/gestor/funcionarios");
    await expect(page.getByText("Nenhum funcionário ainda.")).toBeVisible();
  });

  await etapa("setor: cria, recusa repetido", async () => {
    await page.goto("/gestor/equipamentos/setores");
    const d = dialogo(page, "Novo setor");
    await abrir(page.getByRole("button", { name: "Novo setor" }), d);
    await d.locator("#setor-codigo").fill("a");
    await d.locator("#setor-nome").fill("Britagem");
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(aviso(page, "Setor A criado.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Setores" }).getByText("Britagem")).toBeVisible();
    expect(sql(`select code, name, start_date from sector where company_id = '${empresaId}'`)).toEqual([{ code: "A", name: "Britagem", start_date: null }]);

    await abrir(page.getByRole("button", { name: "Novo setor" }), d);
    await d.locator("#setor-codigo").fill("A");
    await d.locator("#setor-nome").fill("Outro");
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(d.getByRole("alert")).toHaveText("Já existe o setor A.");
    await d.getByRole("button", { name: "Voltar" }).click();
    expect(umValor(`select count(*) from sector where company_id = '${empresaId}'`)).toBe(1);
  });

  await etapa("equipamento e atividades", async () => {
    equipamentoId = await criarEquipamento(page, EQ1);
    const eq = sql(`select tag, name, sector_code, company_id from equipment where id = '${equipamentoId}'`)[0];
    expect(eq).toEqual({ tag: EQ1.tag, name: EQ1.nome, sector_code: "A", company_id: empresaId });

    // Diária saiu do plano: não pode ser oferecida.
    const d = dialogo(page, "Nova atividade");
    await abrir(page.getByRole("button", { name: "Nova atividade" }), d);
    const opcoes = await d.locator("#at-freq option").allTextContents();
    expect(opcoes).toEqual(["Semanal", "Mensal", "Trimestral", "Semestral", "Anual"]);
    // Medição com faixa invertida dá mensagem no próprio diálogo.
    await d.locator("#at-tipo").selectOption("measurement");
    await d.locator("#at-resumo").fill("corrente");
    await d.locator("#at-texto").fill("Medir corrente.");
    await d.locator("#at-min").fill("10");
    await d.locator("#at-max").fill("5");
    await d.getByRole("button", { name: "Salvar" }).click();
    await expect(d.getByRole("alert")).toHaveText("O mínimo é maior que o máximo.");
    await d.getByRole("button", { name: "Voltar" }).click();
    await expect(d).toBeHidden();

    await criarAtividade(page, "Item 1 do britador");
    await criarAtividade(page, "Item 2 do britador");
    await criarAtividade(page, "Item 3 do britador");
    await criarAtividade(page, "Item semanal do britador", "weekly");

    await criarEquipamento(page, EQ2);
    await criarAtividade(page, "Item 1 do moinho");
    await criarAtividade(page, "Item 2 do moinho");
    await criarEquipamento(page, EQ3);
    await criarAtividade(page, "Item 1 da peneira");
    await criarAtividade(page, "Item 2 da peneira");

    expect(umValor(`select count(*) from equipment where company_id = '${empresaId}'`)).toBe(3);
    expect(umValor(`select count(*) from plan_item where company_id = '${empresaId}' and status = 'active' and frequency = 'semiannual'`)).toBe(7);
    expect(umValor(`select count(*) from plan_item where company_id = '${empresaId}' and frequency = 'weekly'`)).toBe(1);
    expect(umValor(`select count(*) from plan_item where company_id = '${empresaId}' and frequency = 'daily'`)).toBe(0);
    // Setor não iniciado: cadastrar não gera ordem.
    expect(umValor(`select count(*) from work_order where company_id = '${empresaId}'`)).toBe(0);

    await page.goto("/gestor/implantacao");
    await expect(page.getByText("Falta vincular um responsável")).toBeVisible();
    await expect(page.getByRole("button", { name: "Iniciar setor" })).toBeDisabled();
  });

  await etapa("funcionário e PIN: só 4 números, salva, reabre com os números, aceita 9", async () => {
    await page.goto("/gestor/funcionarios/novo");
    const pin = page.locator("#pin");
    const salvar = page.getByRole("button", { name: "Salvar" });
    await page.locator("#nome").fill(`Pessoa ${marca}`);
    await expect(salvar).toBeDisabled();
    await pin.pressSequentially("ab1c");
    await expect(pin).toHaveValue("1");
    await expect(page.getByText("Faltam 3 números.")).toBeVisible();
    await pin.fill("12");
    await expect(pin).toHaveValue("12");
    await expect(salvar).toBeDisabled();
    await pin.fill("1x2-3 4 5 6");
    await expect(pin).toHaveValue("1234");
    await pin.fill("");
    await pin.pressSequentially("909956");
    await expect(pin).toHaveValue("9099");
    await expect(salvar).toBeEnabled();

    await page.getByRole("checkbox", { name: /Setor A/ }).click();
    await page.locator('input[name="photo"]').setInputFiles({ name: "rosto.png", mimeType: "image/png", buffer: PNG_PEQUENO });
    await expect(page.getByRole("img", { name: "Foto do funcionário" })).toBeVisible();
    await salvar.click();
    await page.waitForURL(/\/gestor\/funcionarios\/[0-9a-f-]{36}\?salvo=1/);
    funcionarioId = new URL(page.url()).pathname.split("/").pop()!;

    const linha = sql<{ pin: number[]; company_id: string; photo_path: string }>(`select pin, company_id, photo_path from worker where id = '${funcionarioId}'`)[0];
    expect(linha.pin).toEqual([9, 0, 9, 9]);
    expect(linha.company_id).toBe(empresaId);
    expect(umValor(`select count(*) from worker_sector where worker_id = '${funcionarioId}' and sector_code = 'A'`)).toBe(1);

    // Reabre mostrando os números e a foto.
    await page.goto(`/gestor/funcionarios/${funcionarioId}`);
    await expect(page.locator("#pin")).toHaveValue("9099");
    await conferirImagemCarregada(page.getByRole("img", { name: "Foto do funcionário" }));
    expect(objetos("worker-photos", funcionarioId).map((o) => o.name)).toEqual([linha.photo_path]);

    // Editar só o PIN mantém a foto e grava o novo valor.
    await page.locator("#pin").fill("0009");
    await expect(page.locator("#pin")).toHaveValue("0009");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Salvo. O celular recebe")).toBeVisible();
    expect(sql<{ pin: number[] }>(`select pin from worker where id = '${funcionarioId}'`)[0].pin).toEqual([0, 0, 0, 9]);
    expect(umValor(`select photo_path from worker where id = '${funcionarioId}'`)).toBe(linha.photo_path);

    // O servidor também confere: valor burlado no campo volta com mensagem.
    await page.goto(`/gestor/funcionarios/${funcionarioId}`);
    await expect(page.locator("#pin")).toHaveValue("0009");
    await expect(page.getByRole("button", { name: "Salvar" })).toBeEnabled();
    await page.waitForTimeout(500);
    await page.locator("#pin").evaluate((e: HTMLInputElement) => {
      e.value = "12a";
      e.form!.requestSubmit();
    });
    await expect(page.getByText("O PIN tem 4 números.")).toBeVisible();
    expect(sql<{ pin: number[] }>(`select pin from worker where id = '${funcionarioId}'`)[0].pin).toEqual([0, 0, 0, 9]);

    // O banco recusa dígito acima de 9 e aceita 9.
    expect(() => executar(`begin; update worker set pin = '{10,0,0,0}' where id = '${funcionarioId}'; rollback;`)).toThrow(/worker_pin_check/);
  });

  await etapa("foto do funcionário: arquivo errado e grande dão mensagem, troca funciona", async () => {
    const pathAntes = umValor<string>(`select photo_path from worker where id = '${funcionarioId}'`);
    await page.goto(`/gestor/funcionarios/${funcionarioId}`);
    await expect(page.locator("#pin")).toHaveValue("0009");
    await page.waitForTimeout(500);
    const entrada = page.locator('input[name="photo"]');

    await entrada.setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não sou imagem") });
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("A foto precisa ser uma imagem.")).toBeVisible();
    expect(umValor(`select photo_path from worker where id = '${funcionarioId}'`)).toBe(pathAntes);

    await entrada.setInputFiles({ name: "grande.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(4.5 * 1024 * 1024, 1) });
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Foto grande demais (máximo 4 MB).")).toBeVisible();

    await entrada.setInputFiles({ name: "nova.png", mimeType: "image/png", buffer: PNG_PEQUENO });
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(() => umValor(`select photo_path from worker where id = '${funcionarioId}'`), { timeout: 15_000 }).not.toBe(pathAntes);
    await page.goto(`/gestor/funcionarios/${funcionarioId}`);
    await conferirImagemCarregada(page.getByRole("img", { name: "Foto do funcionário" }));
  });

  await etapa("foto do funcionário acima de 5 MB é reduzida no navegador e salva", async () => {
    await page.goto(`/gestor/funcionarios/${funcionarioId}`);
    await expect(page.locator("#pin")).toHaveValue("0009");
    await page.waitForTimeout(500);
    const grande = await imagemGrande(page, "image/jpeg");
    expect(grande.length).toBeGreaterThan(5 * 1024 * 1024);
    await page.locator('input[name="photo"]').setInputFiles({ name: "celular.jpg", mimeType: "image/jpeg", buffer: grande });
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(/salvo=1/, { timeout: 20_000 });
  });

  await etapa("foto da máquina: imagem grande é reduzida, aparece, troca apaga a antiga, remove", async () => {
    const urlEq = `/gestor/equipamentos/${equipamentoId}`;
    const entrada = () => page.locator('input[type="file"]');
    const foto = page.getByRole("img", { name: `Foto de ${EQ1.nome}` });

    await page.goto(urlEq);
    await expect(page.getByText("Sem foto: o celular mostra um desenho")).toBeVisible();
    await page.waitForTimeout(500);

    // Não é imagem: mensagem e nada muda.
    await entrada().setInputFiles({ name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("texto") });
    await expect(aviso(page, "Não consegui abrir esta imagem")).toBeVisible();
    // Disfarçado de .jpg também.
    await entrada().setInputFiles({ name: "falsa.jpg", mimeType: "image/jpeg", buffer: Buffer.from("texto") });
    await expect(aviso(page, "Não consegui abrir esta imagem")).toBeVisible();
    expect(umValor(`select photo_path from equipment where id = '${equipamentoId}'`)).toBeNull();
    expect(objetos("equipment-photos", equipamentoId)).toEqual([]);

    // JPEG grande.
    const jpeg = await imagemGrande(page, "image/jpeg");
    expect(jpeg.length).toBeGreaterThan(5 * 1024 * 1024);
    await entrada().setInputFiles({ name: "grande.jpg", mimeType: "image/jpeg", buffer: jpeg });
    const primeira = await esperarFotoDaMaquina(null);
    await expect(aviso(page, "Foto salva")).toBeVisible();
    await conferirImagemCarregada(foto);
    const salvos = objetos("equipment-photos", equipamentoId);
    expect(salvos.map((o) => o.name)).toEqual([primeira]);
    expect(salvos[0].mimetype).toBe("image/jpeg");
    expect(Number(salvos[0].size)).toBeLessThan(4 * 1024 * 1024);
    const baixado = await adm.storage.from("equipment-photos").download(primeira!);
    const dim = dimensoesJpeg(Buffer.from(await baixado.data!.arrayBuffer()));
    expect(Math.max(dim.largura, dim.altura)).toBe(1280);
    expect(dim.largura / dim.altura).toBeCloseTo(2400 / 1800, 1);

    // Continua lá depois de recarregar.
    await page.reload();
    await conferirImagemCarregada(foto);

    // PNG grande: a troca apaga a antiga do bucket.
    const png = await imagemGrande(page, "image/png");
    expect(png.length).toBeGreaterThan(5 * 1024 * 1024);
    await page.waitForTimeout(500);
    await entrada().setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: png });
    const segunda = await esperarFotoDaMaquina(primeira);
    expect(segunda).not.toBe(primeira);
    await expect.poll(() => objetos("equipment-photos", equipamentoId).map((o) => o.name)).toEqual([segunda]);
    await expect(page.getByText("Trocar foto")).toBeVisible();
    await conferirImagemCarregada(foto);

    // Remover.
    await page.getByRole("button", { name: "Remover foto" }).click();
    await expect(aviso(page, "Foto removida.")).toBeVisible();
    await expect(page.getByText("Sem foto: o celular mostra um desenho")).toBeVisible();
    expect(umValor(`select photo_path from equipment where id = '${equipamentoId}'`)).toBeNull();
    await expect.poll(() => objetos("equipment-photos", equipamentoId)).toEqual([]);

    // Sobe de novo: o celular precisa receber a foto no fim.
    await page.waitForTimeout(500);
    await entrada().setInputFiles({ name: "grande.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await esperarFotoDaMaquina(null);
    await conferirImagemCarregada(foto);
  });

  await etapa("implantação: iniciar setor gera ordens sem diária", async () => {
    await page.goto("/gestor/implantacao");
    await expect(page.getByText("Não iniciado")).toBeVisible();
    const d = dialogo(page, "Iniciar o setor A");
    await abrir(page.getByRole("button", { name: "Iniciar setor" }), d);
    await expect(d.locator("table")).toContainText("Semestral");
    await expect(d.locator("table")).not.toContainText("Diária");
    const legenda = await d.locator("caption").innerText();
    const previstas = Number(/Serão criadas (\d+) ordens/.exec(legenda)![1]);
    await d.getByRole("button", { name: "Iniciar setor" }).click();
    await expect(aviso(page, /Setor A iniciado: \d+ ordens criadas/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Não iniciado")).toHaveCount(0);

    expect(umValor(`select start_date is not null from sector where company_id = '${empresaId}' and code = 'A'`)).toBe(true);
    const contagem = sql<{ frequency: string; n: number }>(`select frequency, count(*)::int as n from work_order where company_id = '${empresaId}' group by 1`);
    expect(contagem.map((c) => c.frequency)).not.toContain("daily");
    expect(contagem.map((c) => c.frequency)).toContain("semiannual");
    expect(contagem.reduce((s, c) => s + c.n, 0)).toBe(previstas);
    for (const eq of [EQ1, EQ2, EQ3]) expect(itensDe(ordemDe(eq)).length).toBeGreaterThan(0);
    expect(itensDe(ordemDe(EQ1)).length).toBe(3);
  });

  await etapa("celulares: gera código, mostra uma vez, lista e guarda só o hash", async () => {
    const codigo = await gerarCodigo(page, "Celular A");
    expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const hash = createHash("sha256").update(codigo).digest("hex");
    const ativacao = sql<{ code_hash: string; name: string; used_at: string | null; company_id: string }>(
      `select code_hash, name, used_at, company_id from device_activation where company_id = '${empresaId}'`,
    );
    expect(ativacao).toEqual([{ code_hash: hash, name: "Celular A", used_at: null, company_id: empresaId }]);

    // Fechou, sumiu: nem no diálogo novo nem na página.
    await page.getByRole("button", { name: "Pronto" }).click();
    await expect(page.locator("p.select-all")).toHaveCount(0);
    const novo = dialogo(page, "Ligar celular");
    await abrir(page.getByRole("button", { name: "Ligar celular" }), novo);
    await expect(novo.locator("#aparelho-nome")).toHaveValue("");
    await expect(novo).not.toContainText(codigo.slice(0, 4));
    await novo.getByRole("button", { name: "Voltar" }).click();
    expect(await page.content()).not.toContain(codigo);

    const r = await ativar(codigo.slice(0, 4).toLowerCase() + "-" + codigo.slice(4).toLowerCase());
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { token: string; company: string };
    expect(corpo.company).toBe(EMPRESA);
    tokenA = corpo.token;
    expect((await ativar(codigo)).status).toBe(400);
    const aparelhos = sql<{ name: string; token_hash: string; company_id: string; revoked_at: string | null }>(
      `select name, token_hash, company_id, revoked_at from device where company_id = '${empresaId}'`,
    );
    expect(aparelhos).toEqual([{ name: "Celular A", token_hash: createHash("sha256").update(tokenA).digest("hex"), company_id: empresaId, revoked_at: null }]);

    await page.goto("/gestor/aparelhos");
    const tabela = page.getByRole("region", { name: "Celulares" });
    await expect(tabela.getByText("Celular A")).toBeVisible();
    await expect(tabela.getByText("Ativo")).toBeVisible();
    await expect(page.getByText("1 celular", { exact: true })).toBeVisible();

    // O celular ativado baixa as ordens, com a foto da máquina.
    const baixa = await fetch(`${SITE}/api/mobile/orders?worker=${funcionarioId}`, { headers: { "x-device-token": tokenA } });
    expect(baixa.status).toBe(200);
    const dados = (await baixa.json()) as { orders: { id: string; frequency: string }[]; equipment: { tag: string; photoUrl: string | null }[] };
    expect(dados.orders.map((o) => o.frequency)).not.toContain("daily");
    expect(dados.orders.map((o) => o.id)).toContain(ordemDe(EQ1));
    expect(dados.equipment.find((e) => e.tag === EQ1.tag)?.photoUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54321\//);
  });

  await etapa("revogar: só aquele celular para", async () => {
    const codigo = await gerarCodigo(page, "Celular B");
    await page.getByRole("button", { name: "Pronto" }).click();
    tokenB = ((await (await ativar(codigo)).json()) as { token: string }).token;
    await page.goto("/gestor/aparelhos");
    const linhaB = page.getByRole("row").filter({ hasText: "Celular B" });
    const d = dialogo(page, "Revogar Celular B?");
    await abrir(linhaB.getByRole("button", { name: "Revogar" }), d);
    await d.getByRole("button", { name: "Revogar" }).click();
    await expect(aviso(page, "Celular revogado.")).toBeVisible();
    await expect(linhaB.getByText("Revogado")).toBeVisible();
    await expect(linhaB.getByRole("button", { name: "Revogar" })).toHaveCount(0);
    expect(umValor(`select revoked_at is not null from device where company_id = '${empresaId}' and name = 'Celular B'`)).toBe(true);
    expect(umValor(`select revoked_at is null from device where company_id = '${empresaId}' and name = 'Celular A'`)).toBe(true);
    expect((await fetch(`${SITE}/api/mobile/orders?worker=${funcionarioId}`, { headers: { "x-device-token": tokenB } })).status).toBe(401);
    expect((await sincronizar([concluir(ordemDe(EQ1))], tokenB)).status).toBe(401);
    expect((await fetch(`${SITE}/api/mobile/orders?worker=${funcionarioId}`, { headers: { "x-device-token": tokenA } })).status).toBe(200);
  });

  await etapa("celular ligado pelo login do gestor, sem código", async () => {
    const errada = await ativarComLogin(EMAIL, "senha-errada");
    expect(errada.status).toBe(400);
    expect(((await errada.json()) as { error: string }).error).toBe("email ou senha incorretos");
    expect(umValor(`select count(*)::int from device where company_id = '${empresaId}' and name like 'Celular ligado por%'`)).toBe(0);

    // Super-admin não pertence a empresa nenhuma: não liga celular.
    const superAdmin = await ativarComLogin("superadmin@teste.local", "senha-de-teste-123");
    expect(superAdmin.status).toBe(400);
    expect(((await superAdmin.json()) as { error: string }).error).toBe("use uma conta de gestor");

    const r = await ativarComLogin(` ${EMAIL.toUpperCase()} `, SENHA);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { token: string; company: string };
    expect(corpo.company).toBe(EMPRESA);
    const ligado = sql<{ name: string; created_by: string; token_hash: string }>(
      `select name, created_by, token_hash from device where company_id = '${empresaId}' and name like 'Celular ligado por%'`,
    );
    expect(ligado).toHaveLength(1);
    expect(ligado[0].name).toMatch(new RegExp(`^Celular ligado por ${EMAIL.replace(/\./g, "\\.")} em \\d{2}/\\d{2}$`));
    expect(ligado[0].created_by).toBe(gestorId);
    expect(ligado[0].token_hash).toBe(createHash("sha256").update(corpo.token).digest("hex"));
    const lista = await fetch(`${SITE}/api/mobile/workers`, { headers: { "x-device-token": corpo.token } });
    expect(lista.status).toBe(200);
    expect(((await lista.json()) as { workers: { id: string }[] }).workers.map((w) => w.id)).toContain(funcionarioId);
  });

  await etapa("skipped: cartão conta à parte, ordem chega ao quadro ao vivo", async () => {
    const ordem = ordemDe(EQ1);
    const [i1, i2] = itensDe(ordem);
    await sincronizarOk([responder(i1, "ok"), responder(i2, "skipped")]);
    expect(situacao(ordem)).toBe("in_progress");
    expect(sql(`select result::text from work_order_item where id = '${i2}'`)).toEqual([{ result: "skipped" }]);

    await page.goto("/gestor/quadro");
    await expect(page.getByText("Ao vivo")).toBeVisible({ timeout: 15_000 });
    const emExecucao = cartao(coluna(page, COLUNA.execucao), EQ1.legivel);
    await expect(emExecucao).toBeVisible();
    await expect(emExecucao.getByTitle("Atividades respondidas")).toHaveText("1/3");
    await expect(emExecucao.getByTitle("Itens que o funcionário não soube responder")).toHaveText("1");

    // Concluir com o item sem resposta é permitido. O cartão muda de coluna sem recarregar.
    const i3 = itensDe(ordem)[2];
    await sincronizarOk([responder(i3, "ok"), concluir(ordem)]);
    expect(situacao(ordem)).toBe("awaiting_validation");
    const aguardando = cartao(coluna(page, COLUNA.aguardando), EQ1.legivel);
    await expect(aguardando).toBeVisible({ timeout: 10_000 });
    await expect(aguardando.getByTitle("Atividades respondidas")).toHaveText("2/3");
    await expect(aguardando.getByTitle("Itens que o funcionário não soube responder")).toHaveText("1");
  });

  await etapa("validar pelo cartão pede para abrir, no menu e no arrasto", async () => {
    const ordem = ordemDe(EQ1);
    await page.goto("/gestor/quadro");
    const c = cartao(coluna(page, COLUNA.aguardando), EQ1.legivel);
    await expect(c).toBeVisible();
    const menu = page.getByRole("menuitem", { name: "Validar" });
    await abrir(c.getByRole("button", { name: `Ações de ${EQ1.legivel}` }), menu);
    await menu.click();
    await expect(aviso(page, `${EQ1.legivel} tem 1 sem resposta: abra a ordem para validar.`)).toBeVisible();
    expect(situacao(ordem)).toBe("awaiting_validation");
    await expect(cartao(coluna(page, COLUNA.aguardando), EQ1.legivel)).toBeVisible();

    // Página nova: o aviso do menu já não está na tela, então o que aparecer veio do arrasto.
    await page.goto("/gestor/quadro");
    await expect(c).toBeVisible();
    await page.waitForTimeout(800);
    const de = (await c.boundingBox())!;
    const para = (await coluna(page, COLUNA.concluida).boundingBox())!;
    await page.mouse.move(de.x + de.width / 2, de.y + de.height - 8);
    await page.mouse.down();
    await page.mouse.move(de.x + de.width / 2 + 20, de.y + de.height - 8, { steps: 5 });
    await page.mouse.move(para.x + para.width / 2, para.y + 60, { steps: 10 });
    await page.mouse.up();
    await expect(aviso(page, `${EQ1.legivel} tem 1 sem resposta: abra a ordem para validar.`)).toBeVisible();
    expect(situacao(ordem)).toBe("awaiting_validation");
    await expect(cartao(coluna(page, COLUNA.aguardando), EQ1.legivel)).toBeVisible();
    expect(umValor(`select count(*) from audit_log where work_order_id = '${ordem}'`)).toBe(0);
  });

  await etapa("detalhe: selo, aviso, confirmação e auditoria com pulados", async () => {
    const ordem = ordemDe(EQ1);
    await page.goto(`/gestor/quadro?ordem=${ordem}`);
    const painel = dialogo(page, EQ1.legivel);
    await expect(painel).toBeVisible();
    await expect(painel.getByText("Não soube responder", { exact: true })).toHaveCount(1);
    await expect(painel.getByText("1 item ficou sem resposta")).toBeVisible();
    await expect(painel.locator("dd").filter({ hasText: /de 3/ })).toHaveText("2 de 3");
    // O pulado vem primeiro na lista.
    await expect(painel.locator("ol > li").first()).toContainText("Não soube responder");

    // Desistir não muda nada.
    const confirmar = dialogo(page, "Validar com 1 sem resposta?");
    await abrir(painel.getByRole("button", { name: "Validar", exact: true }), confirmar);
    await expect(confirmar.getByText("não soube responder 1 item")).toBeVisible();
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmar).toBeHidden();
    expect(situacao(ordem)).toBe("awaiting_validation");
    expect(umValor(`select count(*) from audit_log where work_order_id = '${ordem}'`)).toBe(0);

    await abrir(painel.getByRole("button", { name: "Validar", exact: true }), confirmar);
    await confirmar.getByRole("button", { name: "Validar assim mesmo" }).click();
    await expect(aviso(page, `${EQ1.legivel}: validada.`)).toBeVisible();
    await expect.poll(() => situacao(ordem)).toBe("done");
    expect(sql(`select validated_by, validated_at is not null as validada from work_order where id = '${ordem}'`)).toEqual([{ validated_by: gestorId, validada: true }]);
    expect(sql(`select actor, action, company_id, details from audit_log where work_order_id = '${ordem}'`)).toEqual([
      { actor: gestorId, action: "validar", company_id: empresaId, details: { pulados: 1 } },
    ]);
    await expect(painel.getByRole("button", { name: "Validar", exact: true })).toHaveCount(0);
    await page.goto("/gestor/quadro");
    const feita = cartao(coluna(page, COLUNA.concluida), EQ1.legivel);
    await expect(feita.getByTitle("Atividades respondidas")).toHaveText("2/3");
    await expect(feita.getByTitle("Itens que o funcionário não soube responder")).toHaveText("1");
  });

  await etapa("devolver: pelo detalhe e de uma concluída pelo menu; refazer tira o pulado", async () => {
    const ordem = ordemDe(EQ2);
    const [a, b] = itensDe(ordem);
    await sincronizarOk([responder(a, "skipped"), responder(b, "ok"), concluir(ordem)]);
    await page.goto(`/gestor/quadro?ordem=${ordem}`);
    const painel = dialogo(page, EQ2.legivel);
    const pedir = dialogo(page, `Devolver ${EQ2.legivel}`);
    await abrir(painel.getByRole("button", { name: "Devolver ao funcionário" }), pedir);
    await expect(pedir.getByRole("button", { name: "Devolver", exact: true })).toBeDisabled();
    await pedir.getByRole("textbox").fill("Refaça o item que faltou");
    await pedir.getByRole("button", { name: "Devolver", exact: true }).click();
    await expect(aviso(page, `${EQ2.legivel}: devolvida.`)).toBeVisible();
    await expect.poll(() => situacao(ordem)).toBe("in_progress");
    expect(sql(`select returned_reason, finished_at from work_order where id = '${ordem}'`)).toEqual([{ returned_reason: "Refaça o item que faltou", finished_at: null }]);
    expect(sql(`select action, reason, actor from audit_log where work_order_id = '${ordem}'`)).toEqual([{ action: "devolver", reason: "Refaça o item que faltou", actor: gestorId }]);
    // As respostas ficam, o pulado continua visível e não pode validar enquanto está com o funcionário.
    expect(umValor(`select count(*) from work_order_item where work_order_id = '${ordem}' and result = 'skipped'`)).toBe(1);
    await expect(painel.getByText("Devolvida: Refaça o item que faltou")).toBeVisible();
    await expect(painel.getByRole("button", { name: "Validar", exact: true })).toHaveCount(0);

    // Volta ao celular e pode ser refeita.
    const baixa = (await (await fetch(`${SITE}/api/mobile/orders?worker=${funcionarioId}`, { headers: { "x-device-token": tokenA } })).json()) as {
      orders: { id: string; returnedReason: string | null; items: { result: string | null }[] }[];
    };
    const noCelular = baixa.orders.find((o) => o.id === ordem);
    expect(noCelular?.returnedReason).toBe("Refaça o item que faltou");
    expect(noCelular?.items.map((i) => i.result).sort()).toEqual(["ok", "skipped"]);

    // Concluída também volta, pelo menu do cartão.
    const feita = ordemDe(EQ1);
    await page.goto("/gestor/quadro");
    const c = cartao(coluna(page, COLUNA.concluida), EQ1.legivel);
    const item = page.getByRole("menuitem", { name: "Devolver ao funcionário" });
    await abrir(c.getByRole("button", { name: `Ações de ${EQ1.legivel}` }), item);
    await item.click();
    const pedir2 = dialogo(page, `Devolver ${EQ1.legivel}`);
    await pedir2.getByRole("textbox").fill("Conferir de novo");
    await pedir2.getByRole("button", { name: "Devolver", exact: true }).click();
    await expect(aviso(page, `${EQ1.legivel}: devolvida ao funcionário.`)).toBeVisible();
    await expect.poll(() => situacao(feita)).toBe("in_progress");
    expect(sql(`select validated_at, validated_by, returned_reason from work_order where id = '${feita}'`)).toEqual([
      { validated_at: null, validated_by: null, returned_reason: "Conferir de novo" },
    ]);
    await expect(cartao(coluna(page, COLUNA.execucao), EQ1.legivel).getByText("Devolvida")).toBeAttached();

    // Respondendo o que faltava, valida direto pelo cartão, sem pulados na auditoria.
    const pulado = umValor<string>(`select id from work_order_item where work_order_id = '${feita}' and result = 'skipped'`);
    await sincronizarOk([responder(pulado, "ok"), concluir(feita)]);
    await page.goto("/gestor/quadro");
    const c2 = cartao(coluna(page, COLUNA.aguardando), EQ1.legivel);
    await expect(c2.getByTitle("Atividades respondidas")).toHaveText("3/3");
    await expect(c2.getByTitle("Itens que o funcionário não soube responder")).toHaveCount(0);
    const validar = page.getByRole("menuitem", { name: "Validar" });
    await abrir(c2.getByRole("button", { name: `Ações de ${EQ1.legivel}` }), validar);
    await validar.click();
    await expect(aviso(page, `${EQ1.legivel}: validada.`)).toBeVisible();
    await expect.poll(() => situacao(feita)).toBe("done");
    const validacoes = sql<{ details: unknown }>(`select details from audit_log where work_order_id = '${feita}' and action = 'validar' order by at`);
    expect(validacoes.map((v) => v.details)).toEqual([{ pulados: 1 }, null]);
  });

  await etapa("item impedido continua impedindo", async () => {
    const ordem = ordemDe(EQ3);
    const [a, b] = itensDe(ordem);
    await sincronizarOk([responder(a, "blocked", "no_tool"), responder(b, "skipped")]);
    expect(situacao(ordem)).toBe("blocked");

    // Concluir com impedimento é recusado, mesmo com outro item pulado.
    const fim = await sincronizar([concluir(ordem)]);
    expect(fim.resultados[0]).toMatchObject({ status: "rejected", reason: "item impedido: espera o gestor" });
    expect(situacao(ordem)).toBe("blocked");

    await page.goto("/gestor/quadro");
    const c = cartao(coluna(page, COLUNA.impedida), EQ3.legivel);
    await expect(c).toBeVisible();
    await expect(c.getByText("Falta ferramenta")).toBeVisible();
    await expect(c.getByTitle("Atividades respondidas")).toHaveText("0/2");
    await expect(c.getByTitle("Itens que o funcionário não soube responder")).toHaveText("1");
    const liberarMenu = page.getByRole("menuitem", { name: "Liberar para refazer" });
    await abrir(c.getByRole("button", { name: `Ações de ${EQ3.legivel}` }), liberarMenu);
    await expect(page.getByRole("menuitem", { name: "Validar" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto(`/gestor/quadro?ordem=${ordem}`);
    const painel = dialogo(page, EQ3.legivel);
    await expect(painel.getByText("Não conseguiu", { exact: true })).toBeVisible();
    await expect(painel.getByRole("button", { name: "Validar", exact: true })).toHaveCount(0);
    await expect(painel.locator("ol > li").first()).toContainText("Não conseguiu");

    // Mesmo que a ordem chegue a "aguardando" com item impedido, a validação recusa.
    executar(`update work_order set status = 'awaiting_validation' where id = '${ordem}'`);
    await page.goto(`/gestor/quadro?ordem=${ordem}`);
    const confirmar = dialogo(page, "Validar com 1 sem resposta?");
    await abrir(painel.getByRole("button", { name: "Validar", exact: true }), confirmar);
    await confirmar.getByRole("button", { name: "Validar assim mesmo" }).click();
    await expect(aviso(page, "Esta ordem tem item impedido")).toBeVisible();
    expect(situacao(ordem)).toBe("awaiting_validation");
    expect(umValor(`select count(*) from audit_log where work_order_id = '${ordem}'`)).toBe(0);
    executar(`update work_order set status = 'blocked' where id = '${ordem}'`);

    // Liberar devolve só o impedido a pendente; o pulado continua lá.
    await page.goto(`/gestor/quadro?ordem=${ordem}`);
    const pedir = dialogo(page, `Liberar ${EQ3.legivel}`);
    await abrir(painel.getByRole("button", { name: "Liberar para refazer" }), pedir);
    await pedir.getByRole("textbox").fill("Ferramenta chegou");
    await pedir.getByRole("button", { name: "Liberar para refazer" }).click();
    await expect(aviso(page, `${EQ3.legivel}: liberada para refazer.`)).toBeVisible();
    await expect.poll(() => situacao(ordem)).toBe("in_progress");
    expect(sql(`select result::text as result from work_order_item where work_order_id = '${ordem}' order by id = '${a}' desc`)).toEqual([{ result: null }, { result: "skipped" }]);
    expect(sql(`select action, reason, details is not null as tem_detalhes from audit_log where work_order_id = '${ordem}'`)).toEqual([
      { action: "liberar", reason: "Ferramenta chegou", tem_detalhes: true },
    ]);
  });

  await etapa("largura de celular: sem rolagem horizontal, navegação e diálogos cabem", async () => {
    const estado = await contexto.storageState();
    const celular = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      baseURL: SITE,
      locale: "pt-BR",
      storageState: estado,
    });
    const tela = await celular.newPage();
    vigiar(tela);
    const fotoDir = test.info().outputPath("celular");
    const rotas = [
      "/gestor/quadro",
      "/gestor/quadro?periodo=tudo",
      `/gestor/quadro?ordem=${ordemDe(EQ1)}`,
      "/gestor/implantacao",
      "/gestor/funcionarios",
      "/gestor/funcionarios/novo",
      `/gestor/funcionarios/${funcionarioId}`,
      "/gestor/equipamentos",
      "/gestor/equipamentos/setores",
      `/gestor/equipamentos/${equipamentoId}`,
      "/gestor/aparelhos",
      "/gestor/gestores",
      "/gestor/minha-senha",
    ];
    const largas: string[] = [];
    for (const rota of rotas) {
      await tela.goto(rota);
      await tela.waitForLoadState("load");
      await tela.waitForTimeout(800);
      const m = await tela.evaluate(() => {
        window.scrollTo(200, 0);
        const rolou = window.scrollX;
        window.scrollTo(0, 0);
        return { doc: document.documentElement.scrollWidth, vis: document.documentElement.clientWidth, rolou };
      });
      await tela.screenshot({ path: `${fotoDir}/${rota.replace(/[^a-z]+/g, "_").slice(0, 40)}.png` });
      if (m.doc > m.vis || m.rolou > 0) largas.push(`${rota}: documento ${m.doc}px em ${m.vis}px, rolou ${m.rolou}px`);
    }
    expect(largas).toEqual([]);

    // Navegação: menu abre, leva à tela de celulares.
    await tela.goto("/gestor/quadro");
    const menu = tela.getByRole("button", { name: "Abrir a navegação" });
    const link = tela.getByRole("link", { name: "Celulares" });
    await abrir(menu, link);
    await link.click();
    await tela.waitForURL(/\/gestor\/aparelhos/);

    // Diálogo com o código cabe na tela.
    const d = dialogo(tela, "Ligar celular");
    await abrir(tela.getByRole("button", { name: "Ligar celular" }), d);
    await d.locator("#aparelho-nome").fill("Celular C");
    await d.getByRole("button", { name: "Gerar código" }).click();
    const codigo = dialogo(tela, "Código do celular").locator("p.select-all");
    await expect(codigo).toBeVisible();
    const caixa = (await codigo.boundingBox())!;
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(390);
    await tela.screenshot({ path: `${fotoDir}/codigo.png` });
    await tela.getByRole("button", { name: "Pronto" }).click();

    // Formulários em diálogo cabem na largura, sem cortar campos nem botões.
    const dialogos: [string, string, string][] = [
      ["/gestor/equipamentos/setores", "Novo setor", "Novo setor"],
      ["/gestor/equipamentos", "Novo equipamento", "Novo equipamento"],
      [`/gestor/equipamentos/${equipamentoId}`, "Nova atividade", "Nova atividade"],
    ];
    for (const [rota, botao, titulo] of dialogos) {
      await tela.goto(rota);
      const caixaDoDialogo = dialogo(tela, titulo);
      await abrir(tela.getByRole("button", { name: botao }), caixaDoDialogo);
      const b = (await caixaDoDialogo.boundingBox())!;
      expect(b.x, `${titulo} começa fora da tela`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `${titulo} passa da largura`).toBeLessThanOrEqual(390);
      const salvar = (await caixaDoDialogo.getByRole("button", { name: "Salvar" }).boundingBox())!;
      expect(salvar.x + salvar.width).toBeLessThanOrEqual(390);
      await tela.screenshot({ path: `${fotoDir}/dialogo-${titulo.replace(/ /g, "-")}.png` });
      await caixaDoDialogo.getByRole("button", { name: "Voltar" }).click();
    }
    await celular.close();
  });

  await etapa("console do navegador sem erros", async () => {
    expect(errosDoConsole).toEqual([]);
  });

  await contexto.close();
  expect(falhas).toEqual([]);
});
