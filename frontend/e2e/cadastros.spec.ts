/*
 * Cadastros e email, ponta a ponta no navegador, contra o painel e o Supabase locais.
 *
 *   cd frontend && set -a && . ./.env.test && set +a && npx playwright test e2e/cadastros.spec.ts
 *
 * Cada describe cria a própria empresa e contas (nome e emails com "a4-") e apaga no fim.
 * ZELAR_E2E_MANTER=1 deixa os dados no banco para investigar.
 */
import { execFileSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const API = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const BANCO = process.env.SUPABASE_DB_URL ?? "";
const MAILPIT = process.env.ZELAR_MAILPIT_URL ?? "http://127.0.0.1:54324";
const SUPER = { email: "superadmin@teste.local", senha: "senha-de-teste-123" };

for (const url of [SITE, API, BANCO, MAILPIT]) {
  if (!/(^|@|\/\/)(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Este teste só roda no ambiente local (carregue frontend/.env.test), não em "${url}".`);
  }
}

const sql = (consulta: string) => execFileSync("psql", [BANCO, "-Atc", consulta], { encoding: "utf8" }).trim();

const usuario = (email: string) =>
  sql(`select coalesce(json_agg(t), '[]') from (
         select u.id, u.email, u.email_confirmed_at, u.last_sign_in_at, u.banned_until, u.raw_app_meta_data as app,
                a.role, a.company_id
         from auth.users u left join public.app_user a on a.user_id = u.id
         where u.email = '${email}') t`);
type Usuario = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  app: { trocar_senha?: boolean };
  role: string | null;
  company_id: string | null;
};
const lerUsuario = (email: string): Usuario | undefined => (JSON.parse(usuario(email)) as Usuario[])[0];
const idDaEmpresa = (nome: string) => sql(`select id from public.company where name = '${nome}'`);

/* ── Mailpit ─────────────────────────────────────────────────────────────── */

type Email = { ID: string; Subject: string; HTML: string; Text: string; link: string };

async function resumos(para: string): Promise<{ ID: string }[]> {
  const url = `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${para}"`)}&limit=50`;
  const corpo = (await (await fetch(url)).json()) as { messages: { ID: string }[] };
  return corpo.messages;
}

/** Espera a mensagem de número `quantas` para este destinatário e devolve a mais nova. */
async function esperarEmail(para: string, quantas = 1): Promise<Email> {
  await expect.poll(async () => (await resumos(para)).length, { timeout: 15_000, message: `email para ${para}` }).toBeGreaterThanOrEqual(quantas);
  const [nova] = await resumos(para);
  const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${nova.ID}`)).json()) as Omit<Email, "link">;
  const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(msg.HTML)?.[1];
  if (!href) throw new Error(`Email sem link de /auth/confirm: ${msg.HTML}`);
  return { ...msg, link: href.replaceAll("&amp;", "&") };
}

/* ── Telas ───────────────────────────────────────────────────────────────── */

async function entrar(page: Page, email: string, senha: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function escolherSenha(page: Page, senha: string, confirmacao = senha) {
  await page.getByLabel("Nova senha (pelo menos 8 caracteres)").fill(senha);
  await page.getByLabel("Repita a nova senha").fill(confirmacao);
  await page.getByRole("button", { name: "Trocar senha" }).click();
}

const cartaoDaEmpresa = (page: Page, nome: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: nome, exact: true }) });

async function criarEmpresa(page: Page, empresa: string, nome: string, email: string) {
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome da empresa").fill(empresa);
  await dialogo.getByLabel("Nome do gestor").fill(nome);
  // Pelo name, não pelo rótulo: ver o teste "o rótulo do e-mail" no fim do arquivo.
  await dialogo.locator('input[name="email"]').fill(email);
  await dialogo.getByRole("button", { name: "Criar e convidar" }).click();
}

async function novoGestor(page: Page, nome: string, email: string, modo: "Enviar convite" | "Usar senha temporária") {
  await page.goto("/gestor/gestores");
  await page.getByRole("button", { name: "Novo gestor" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(nome);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: modo }).click();
}

async function novaPagina(browser: Browser) {
  const contexto = await browser.newContext({ baseURL: SITE, locale: "pt-BR" });
  return contexto.newPage();
}

async function adminLogado(browser: Browser) {
  const page = await novaPagina(browser);
  await entrar(page, SUPER.email, SUPER.senha);
  await page.waitForURL("**/admin/empresas");
  return page;
}

/** Empresa nova com gestor que já criou a senha, pelo caminho do email. Devolve a página dele. */
async function empresaComGestor(browser: Browser, admin: Page, empresa: string, email: string, senha: string) {
  await criarEmpresa(admin, empresa, "Gestor Inicial", email);
  await expect(admin.getByText(`Empresa criada. Convite enviado para ${email}.`)).toBeVisible();
  const { link } = await esperarEmail(email);
  const page = await novaPagina(browser);
  await page.goto(link);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL("**/gestor/minha-senha");
  await escolherSenha(page, senha);
  await page.waitForURL("**/gestor/quadro");
  return page;
}

function limpar(prefixo: string) {
  if (process.env.ZELAR_E2E_MANTER) return;
  sql(`begin;
       delete from public.worker where company_id in (select id from public.company where name like '${prefixo}%');
       delete from auth.users where email like '${prefixo}%@teste.local';
       delete from public.company where name like '${prefixo}%';
       commit;`);
}

const prefixoDoTeste = () => `a4-${Date.now().toString(36)}`;

/* ── Caminho principal: um único percurso, em ordem ─────────────────────── */

test.describe("cadastros e email", () => {
  test.describe.configure({ mode: "serial" });

  const prefixo = prefixoDoTeste();
  const empresa = `${prefixo} Empresa`;
  const outraEmpresa = `${prefixo} Outra`;
  const gestor = `${prefixo}-gestor@teste.local`;
  const senhaDoGestor = "senha-do-gestor-1";
  const convidado = `${prefixo}-convidado@teste.local`;
  const temporario = `${prefixo}-temporario@teste.local`;
  const senhaDoTemporario = "senha-do-temporario-1";
  const outroGestor = `${prefixo}-outro@teste.local`;
  const inexistente = `${prefixo}-nao-existe@teste.local`;

  let admin: Page;
  let doGestor: Page;
  let linkDoConvite: string;

  test.beforeAll(async ({ browser }) => {
    admin = await novaPagina(browser);
  });
  test.afterAll(() => limpar(prefixo));

  test("super-admin entra e cai em /admin/empresas", async () => {
    await entrar(admin, SUPER.email, SUPER.senha);
    await admin.waitForURL("**/admin/empresas");
    await expect(admin.getByRole("heading", { name: "Empresas", exact: true })).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Eco Gesso", exact: true })).toBeVisible();
  });

  test("cria empresa com gestor e grava empresa, perfil e aviso de senha", async () => {
    await criarEmpresa(admin, empresa, "Gestor A4", gestor);
    await expect(admin.getByText(`Empresa criada. Convite enviado para ${gestor}.`)).toBeVisible();
    await expect(cartaoDaEmpresa(admin, empresa).getByText(gestor)).toBeVisible();
    await expect(cartaoDaEmpresa(admin, empresa).getByText("ainda não criou a senha")).toBeVisible();

    const conta = lerUsuario(gestor);
    expect(conta?.role).toBe("manager");
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    expect(conta?.app.trocar_senha).toBe(true);
    expect(sql(`select active from public.company where name = '${empresa}'`)).toBe("t");
  });

  test("o convite chega em português, com link para /auth/confirm e token_hash", async () => {
    const email = await esperarEmail(gestor);
    expect(email.Subject).toBe("Seu acesso ao Zelar");
    expect(email.HTML).toContain("Você foi convidado");
    expect(email.HTML).toContain("Criar minha senha");
    const url = new URL(email.link);
    expect(url.origin).toBe(SITE);
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBeTruthy();
    expect(url.searchParams.get("type")).toBe("invite");
    linkDoConvite = email.link;
  });

  test("abrir o link duas vezes sem tocar no botão não consome o código", async ({ browser }) => {
    const hash = new URL(linkDoConvite).searchParams.get("token_hash");
    const page = await novaPagina(browser);
    for (let vez = 0; vez < 2; vez++) {
      await page.goto(linkDoConvite);
      await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/confirm/);
    }
    expect(sql(`select count(*) from auth.one_time_tokens where token_hash = '${hash}'`)).toBe("1");
    const conta = lerUsuario(gestor);
    expect(conta?.email_confirmed_at).toBeNull();
    expect(conta?.last_sign_in_at).toBeNull();
    await page.context().close();
  });

  test("o botão continua para /gestor/minha-senha e, sem criar a senha, o painel não abre", async ({ browser }) => {
    doGestor = await novaPagina(browser);
    await doGestor.goto(linkDoConvite);
    await doGestor.getByRole("button", { name: "Continuar" }).click();
    await doGestor.waitForURL("**/gestor/minha-senha");

    for (const caminho of ["/gestor/quadro", "/gestor/gestores", "/gestor/funcionarios", "/admin/empresas"]) {
      await doGestor.goto(caminho);
      await expect(doGestor, caminho).toHaveURL(/\/gestor\/minha-senha$/);
    }
    expect(lerUsuario(gestor)?.app.trocar_senha).toBe(true);
  });

  test("senhas diferentes são recusadas; cria a senha e entra", async ({ browser }) => {
    await doGestor.goto("/gestor/minha-senha");
    await escolherSenha(doGestor, senhaDoGestor, "outra-coisa-123");
    await expect(doGestor.getByRole("alert").filter({ hasText: "As duas senhas não são iguais." })).toBeVisible();
    expect(lerUsuario(gestor)?.app.trocar_senha).toBe(true);

    await escolherSenha(doGestor, senhaDoGestor);
    await doGestor.waitForURL("**/gestor/quadro");

    const page = await novaPagina(browser);
    await entrar(page, gestor, senhaDoGestor);
    await page.waitForURL("**/gestor/quadro");
    await page.context().close();
  });

  test("linha correta em app_user e app_metadata.trocar_senha false", () => {
    const conta = lerUsuario(gestor);
    expect(conta?.role).toBe("manager");
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    expect(conta?.app.trocar_senha).toBe(false);
    expect(conta?.email_confirmed_at).not.toBeNull();
    expect(conta?.last_sign_in_at).not.toBeNull();
  });

  test("link reutilizado mostra erro", async ({ browser }) => {
    const page = await novaPagina(browser);
    await page.goto(linkDoConvite);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Este link venceu ou já foi usado" })).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/confirm/);
    await page.context().close();
  });

  test("a empresa aparece no cabeçalho", async () => {
    await doGestor.goto("/gestor/quadro");
    await expect(doGestor.locator("header").getByText(empresa, { exact: true }).locator("visible=true")).toBeVisible();
    await expect(doGestor.locator("header").getByText(gestor)).toBeVisible();
  });

  test("a empresa aparece no crachá impresso", async () => {
    const empresaId = idDaEmpresa(empresa);
    const id = sql(`insert into public.worker (company_id, name, pin, badge_token)
                    values ('${empresaId}', 'Funcionario A4', '{1,2,3,4}', '${prefixo}-cracha') returning id`).split("\n")[0];
    await doGestor.goto(`/gestor/funcionarios/imprimir?ids=${id}`);
    await doGestor.emulateMedia({ media: "print" });
    await expect(doGestor.locator(".badge-brand")).toBeVisible();
    await expect(doGestor.locator(".badge-brand")).toHaveText(`Zelar · ${empresa}`);
    await expect(doGestor.locator(".badge-name")).toHaveText("Funcionario A4");
    await doGestor.emulateMedia({ media: "screen" });
  });

  test("gestor convida outro gestor por email", async () => {
    await novoGestor(doGestor, "Convidado A4", convidado, "Enviar convite");
    await expect(doGestor.getByText(`Convite enviado para ${convidado}.`)).toBeVisible();
    const email = await esperarEmail(convidado);
    expect(email.Subject).toBe("Seu acesso ao Zelar");

    const conta = lerUsuario(convidado);
    expect(conta?.role).toBe("manager");
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    expect(conta?.app.trocar_senha).toBe(true);

    const linha = doGestor.getByRole("row").filter({ hasText: convidado });
    await expect(linha).toContainText("Convidado A4");
    await expect(linha).toContainText("Falta criar a senha");
  });

  test("gestor cria outro gestor com senha temporária e o primeiro acesso exige senha nova", async ({ browser }) => {
    await novoGestor(doGestor, "Temporario A4", temporario, "Usar senha temporária");
    const dialogo = doGestor.getByRole("dialog").filter({ hasText: "Senha temporária" });
    await expect(dialogo).toContainText(temporario);
    const senha = (await dialogo.locator("dd.num").innerText()).trim();
    expect(senha).toHaveLength(12);
    await dialogo.getByRole("button", { name: "Já passei a senha" }).click();
    expect((await resumos(temporario)).length).toBe(0);

    const conta = lerUsuario(temporario);
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    expect(conta?.app.trocar_senha).toBe(true);

    const page = await novaPagina(browser);
    await entrar(page, temporario, senha);
    // Logo depois do login a barra de endereço ainda diz /gestor/quadro, mas a tela já é a da senha.
    await expect(page.getByRole("heading", { name: "Minha senha", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quadro", exact: true })).toHaveCount(0);
    await page.goto("/gestor/quadro");
    await expect(page).toHaveURL(/\/gestor\/minha-senha$/);
    await escolherSenha(page, senha);
    await expect(page.getByRole("alert").filter({ hasText: "Escolha uma senha diferente da atual." })).toBeVisible();
    await escolherSenha(page, senhaDoTemporario);
    await page.waitForURL("**/gestor/quadro");
    expect(lerUsuario(temporario)?.app.trocar_senha).toBe(false);
    await page.context().close();
  });

  test("email já existente dá mensagem nas três entradas e não muda nada", async () => {
    const antes = usuario(gestor);
    for (const modo of ["Enviar convite", "Usar senha temporária"] as const) {
      await novoGestor(doGestor, "Repetido", gestor, modo);
      await expect(doGestor.getByRole("alert").filter({ hasText: "Este e-mail já tem conta no Zelar." })).toBeVisible();
    }

    const nomeRepetido = `${prefixo} Repetida`;
    await admin.goto("/admin/empresas");
    await criarEmpresa(admin, nomeRepetido, "Repetido", gestor);
    await expect(admin.getByRole("alert").filter({ hasText: "Este e-mail já tem conta no Zelar." })).toBeVisible();
    expect(idDaEmpresa(nomeRepetido)).toBe("");
    await admin.getByRole("button", { name: "Voltar" }).click();
    expect(usuario(gestor)).toBe(antes);
  });

  test("esqueci minha senha: conta existente recebe o email e consegue trocar", async ({ browser }) => {
    const quantas = (await resumos(temporario)).length;
    const page = await novaPagina(browser);
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await page.waitForURL("**/login/esqueci");
    await page.getByRole("button", { name: "Enviar link" }).waitFor();
    await page.getByLabel("E-mail").fill(temporario);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Se este e-mail tiver conta no Zelar" })).toBeVisible();

    const email = await esperarEmail(temporario, quantas + 1);
    expect(email.Subject).toBe("Criar nova senha do Zelar");
    expect(email.HTML).toContain("Recebemos um pedido");
    const url = new URL(email.link);
    expect(url.origin).toBe(SITE);
    expect(url.searchParams.get("type")).toBe("recovery");

    await page.goto(email.link);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL("**/gestor/minha-senha");
    const nova = "senha-recuperada-1";
    await escolherSenha(page, nova);
    await page.waitForURL("**/gestor/quadro");
    await page.context().close();

    const antiga = await novaPagina(browser);
    await entrar(antiga, temporario, senhaDoTemporario);
    await expect(antiga.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
    await entrar(antiga, temporario, nova);
    await antiga.waitForURL("**/gestor/quadro");
    await antiga.context().close();

    const reuso = await novaPagina(browser);
    await reuso.goto(email.link);
    await reuso.getByRole("button", { name: "Continuar" }).click();
    await expect(reuso.getByRole("alert").filter({ hasText: "Este link venceu ou já foi usado" })).toBeVisible();
    await reuso.context().close();
  });

  test("esqueci minha senha: email inexistente vê a mesma resposta e não recebe nada", async ({ browser }) => {
    const page = await novaPagina(browser);
    await page.goto("/login/esqueci");
    await page.getByLabel("E-mail").fill(inexistente);
    await page.getByRole("button", { name: "Enviar link" }).click();
    await expect(page.getByRole("status")).toHaveText("Se este e-mail tiver conta no Zelar, o link chega em alguns minutos. Confira também a caixa de spam.");
    await page.waitForTimeout(3_000);
    expect((await resumos(inexistente)).length).toBe(0);
    expect(lerUsuario(inexistente)).toBeUndefined();
    await page.context().close();
  });

  test("cadastro público é recusado em /auth/v1/signup e pelo código por email", async () => {
    const alvo = `${prefixo}-publico@teste.local`;
    const cabecalhos = { apikey: CHAVE, "content-type": "application/json" };
    const signup = await fetch(`${API}/auth/v1/signup`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ email: alvo, password: "senha-publica-123" }),
    });
    expect(signup.status).toBe(422);
    expect(((await signup.json()) as { error_code: string }).error_code).toBe("signup_disabled");

    const otp = await fetch(`${API}/auth/v1/otp`, {
      method: "POST",
      headers: cabecalhos,
      body: JSON.stringify({ email: alvo, create_user: true }),
    });
    expect(otp.ok).toBe(false);
    expect(lerUsuario(alvo)).toBeUndefined();
  });

  test("desativar gestor impede o login; reativar devolve", async ({ browser }) => {
    await doGestor.goto("/gestor/gestores");
    const linha = doGestor.getByRole("row").filter({ hasText: temporario });
    await linha.getByRole("button", { name: "Desativar" }).click();
    await doGestor.getByRole("dialog").getByRole("button", { name: "Desativar" }).click();
    await expect(linha).toContainText("Desativado");
    expect(new Date(lerUsuario(temporario)?.banned_until ?? 0).getTime()).toBeGreaterThan(Date.now());

    const page = await novaPagina(browser);
    await entrar(page, temporario, "senha-recuperada-1");
    await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await linha.getByRole("button", { name: "Reativar" }).click();
    await doGestor.getByRole("dialog").getByRole("button", { name: "Reativar" }).click();
    await expect(linha).toContainText("Ativo");
    expect(lerUsuario(temporario)?.banned_until).toBeNull();
    await entrar(page, temporario, "senha-recuperada-1");
    await page.waitForURL("**/gestor/quadro");
    await page.context().close();
  });

  test("desativar a empresa manda para /login com aviso; reativar volta", async ({ browser }) => {
    await admin.goto("/admin/empresas");
    const cartao = cartaoDaEmpresa(admin, empresa);
    await cartao.getByRole("button", { name: "Desativar" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Desativar" }).click();
    await expect(cartao.getByText("Desativada")).toBeVisible();
    expect(sql(`select active from public.company where name = '${empresa}'`)).toBe("f");

    // Sessão já aberta e login novo: os dois vão para o aviso.
    await doGestor.goto("/gestor/quadro");
    await doGestor.waitForURL("**/login?sem_acesso=1");
    await expect(doGestor.getByRole("alert").filter({ hasText: "não tem acesso a nenhuma empresa ativa" })).toBeVisible();

    const page = await novaPagina(browser);
    await entrar(page, gestor, senhaDoGestor);
    await page.waitForURL("**/login?sem_acesso=1");
    await expect(page.getByRole("alert").filter({ hasText: "não tem acesso a nenhuma empresa ativa" })).toBeVisible();

    await cartao.getByRole("button", { name: "Reativar" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Reativar" }).click();
    await expect(cartao.getByText("Ativa", { exact: true })).toBeVisible();
    expect(sql(`select active from public.company where name = '${empresa}'`)).toBe("t");

    await doGestor.goto("/gestor/quadro");
    await expect(doGestor).toHaveURL(/\/gestor\/quadro$/);
    await expect(doGestor.locator("header").getByText(empresa, { exact: true }).locator("visible=true")).toBeVisible();
    await entrar(page, gestor, senhaDoGestor);
    await page.waitForURL("**/gestor/quadro");
    await page.context().close();
  });

  test("Reenviar acesso manda um link novo e o convidado cria a senha", async ({ browser }) => {
    const quantas = (await resumos(convidado)).length;
    await admin.goto("/admin/empresas");
    const linha = cartaoDaEmpresa(admin, empresa).getByRole("listitem").filter({ hasText: convidado });
    await expect(linha).toContainText("ainda não criou a senha");
    await linha.getByRole("button", { name: "Reenviar acesso" }).click();
    await expect(admin.getByText(`Link enviado para ${convidado}.`)).toBeVisible();

    const email = await esperarEmail(convidado, quantas + 1);
    expect(email.Subject).toBe("Criar nova senha do Zelar");
    const page = await novaPagina(browser);
    await page.goto(email.link);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL("**/gestor/minha-senha");
    // Conta que veio de convite continua presa à troca até criar a senha.
    await page.goto("/gestor/quadro");
    await expect(page).toHaveURL(/\/gestor\/minha-senha$/);
    await escolherSenha(page, "senha-do-convidado-1");
    await page.waitForURL("**/gestor/quadro");

    const conta = lerUsuario(convidado);
    expect(conta?.app.trocar_senha).toBe(false);
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    await page.context().close();
  });

  test("gestor comum em /admin é barrado", async () => {
    await doGestor.goto("/admin/empresas");
    await expect(doGestor).toHaveURL(/\/gestor\/quadro$/);
    await expect(doGestor.getByRole("button", { name: "Nova empresa" })).toHaveCount(0);
    await expect(doGestor.getByText("Eco Gesso")).toHaveCount(0);
    // /admin não tem página: 404 para todos, sem dado nenhum.
    await doGestor.goto("/admin");
    await expect(doGestor.getByRole("button", { name: "Nova empresa" })).toHaveCount(0);
    await expect(doGestor.getByText("Eco Gesso")).toHaveCount(0);
  });

  test("a lista de gestores mostra só os da empresa", async () => {
    await admin.goto("/admin/empresas");
    await criarEmpresa(admin, outraEmpresa, "Outro A4", outroGestor);
    await expect(admin.getByText(`Empresa criada. Convite enviado para ${outroGestor}.`)).toBeVisible();

    await doGestor.goto("/gestor/gestores");
    await expect(doGestor.getByRole("row").filter({ hasText: gestor })).toBeVisible();
    await expect(doGestor.getByText(outroGestor)).toHaveCount(0);
    await expect(doGestor.getByText(SUPER.email)).toHaveCount(0);

    const daEmpresa = sql(`select u.email from public.app_user a join auth.users u on u.id = a.user_id
                           where a.company_id = '${idDaEmpresa(empresa)}' order by 1`).split("\n");
    expect(daEmpresa).toEqual([convidado, gestor, temporario].sort());
    const linhas = await doGestor.locator("tbody tr td:nth-child(2)").allInnerTexts();
    expect(linhas.sort()).toEqual(daEmpresa);
  });
});

/* ── Convite repetido para quem ainda não criou a senha ─────────────────── */

// Sem modo serial: cada teste é um defeito independente, e uma falha não esconde os outros.
test.describe("convite repetido para conta pendente", () => {
  const prefixo = prefixoDoTeste() + "r";
  const empresa = `${prefixo} Empresa`;
  const gestor = `${prefixo}-gestor@teste.local`;
  const senha = "senha-do-gestor-1";

  let admin: Page;
  let doGestor: Page;

  test.beforeAll(async ({ browser }) => {
    admin = await adminLogado(browser);
    doGestor = await empresaComGestor(browser, admin, empresa, gestor, senha);
  });
  test.afterAll(() => limpar(prefixo));

  test("a mesma empresa convida de novo: a conta pendente continua existindo", async () => {
    const pendente = `${prefixo}-pendente1@teste.local`;
    await novoGestor(doGestor, "Pendente", pendente, "Enviar convite");
    await expect(doGestor.getByText(`Convite enviado para ${pendente}.`)).toBeVisible();
    const id = lerUsuario(pendente)?.id;
    const { link } = await esperarEmail(pendente);

    await novoGestor(doGestor, "Pendente", pendente, "Enviar convite");
    await doGestor.waitForTimeout(2_000);

    const conta = lerUsuario(pendente);
    expect(conta?.id, "a conta pendente foi apagada").toBe(id);
    expect(conta?.company_id).toBe(idDaEmpresa(empresa));
    expect(link).toBeTruthy();
  });

  test("outra empresa convida o mesmo email: a conta pendente da primeira continua existindo", async ({ browser }) => {
    const pendente = `${prefixo}-pendente2@teste.local`;
    await novoGestor(doGestor, "Pendente", pendente, "Enviar convite");
    await expect(doGestor.getByText(`Convite enviado para ${pendente}.`)).toBeVisible();
    const antes = lerUsuario(pendente);

    const outra = await empresaComGestor(browser, admin, `${prefixo} Rival`, `${prefixo}-rival@teste.local`, senha);
    await novoGestor(outra, "Pendente", pendente, "Enviar convite");
    await outra.waitForTimeout(2_000);

    const conta = lerUsuario(pendente);
    expect(conta?.id, "a outra empresa apagou a conta pendente").toBe(antes?.id);
    expect(conta?.company_id).toBe(antes?.company_id);
    await outra.context().close();
  });

  test("super-admin cria empresa com email pendente: a conta pendente continua existindo", async () => {
    const pendente = `${prefixo}-pendente3@teste.local`;
    await novoGestor(doGestor, "Pendente", pendente, "Enviar convite");
    await expect(doGestor.getByText(`Convite enviado para ${pendente}.`)).toBeVisible();
    const antes = lerUsuario(pendente);

    await admin.goto("/admin/empresas");
    await criarEmpresa(admin, `${prefixo} Terceira`, "Pendente", pendente);
    await expect(admin.getByRole("alert")).toBeVisible();

    const conta = lerUsuario(pendente);
    expect(conta?.id, "o super-admin apagou a conta pendente").toBe(antes?.id);
    expect(conta?.company_id).toBe(antes?.company_id);
  });
});

/* ── Formulário logo depois do login ────────────────────────────────────── */

test("o rótulo do e-mail em Nova empresa aponta para o campo do diálogo logo depois do login", async ({ browser }) => {
  const admin = await adminLogado(browser);
  await admin.getByRole("button", { name: "Nova empresa" }).click();
  await admin.getByRole("dialog").getByText("E-mail do gestor").click();
  const foco = await admin.evaluate(() => (document.activeElement as HTMLInputElement).name);
  await admin.context().close();
  expect(foco).toBe("email");
});

/* ── Sessão aberta de quem foi desativado ───────────────────────────────── */

test.describe("gestor desativado com sessão aberta", () => {
  const prefixo = prefixoDoTeste() + "d";
  const empresa = `${prefixo} Empresa`;
  const gestor = `${prefixo}-gestor@teste.local`;
  const colega = `${prefixo}-colega@teste.local`;
  const brecha = `${prefixo}-brecha@teste.local`;
  const senhaNova = "senha-do-colega-1";

  test.afterAll(() => limpar(prefixo));

  test("não consegue criar conta nova na empresa", async ({ browser }) => {
    const admin = await adminLogado(browser);
    const doGestor = await empresaComGestor(browser, admin, empresa, gestor, "senha-do-gestor-1");

    await novoGestor(doGestor, "Colega", colega, "Usar senha temporária");
    const dialogo = doGestor.getByRole("dialog").filter({ hasText: "Senha temporária" });
    const temporaria = (await dialogo.locator("dd.num").innerText()).trim();
    await dialogo.getByRole("button", { name: "Já passei a senha" }).click();

    const doColega = await novaPagina(browser);
    await entrar(doColega, colega, temporaria);
    await expect(doColega.getByRole("heading", { name: "Minha senha", exact: true })).toBeVisible();
    await escolherSenha(doColega, senhaNova);
    await expect(doColega.getByRole("heading", { name: "Quadro", exact: true })).toBeVisible();

    await doGestor.goto("/gestor/gestores");
    const linha = doGestor.getByRole("row").filter({ hasText: colega });
    await linha.getByRole("button", { name: "Desativar" }).click();
    await doGestor.getByRole("dialog").getByRole("button", { name: "Desativar" }).click();
    await expect(linha).toContainText("Desativado");

    // Com a sessão ainda aberta, o painel já o manda embora e o botão de criar gestor não aparece.
    await doColega.goto("/gestor/gestores");
    await expect(doColega).toHaveURL(/sem_acesso=1/);
    expect(lerUsuario(brecha), "gestor desativado criou uma conta nova").toBeUndefined();
  });
});
