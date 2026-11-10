import { createClient } from "@supabase/supabase-js";
import { hashDe, novoTokenDeAparelho } from "@/lib/aparelho";
import { AGUARDE } from "@/lib/envio";
import { supabaseAdmin } from "@/lib/supabase/server";

type Ligacao = { companyId: string; nome: string; criadoPor: string | null };
type Recusa = { error: string; status: number };

const recusa = (error: string, status = 400): Recusa => ({ error, status });

/**
 * Primeiro uso do celular: troca uma prova de acesso por um token só deste aparelho.
 * Duas provas valem: o gestor entra com o email e a senha do painel, ou alguém digita o código
 * gerado em Celulares. O banco guarda só o hash do token.
 */
export async function POST(request: Request) {
  let corpo: { code?: unknown; email?: unknown; password?: unknown } | null;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const ligacao = typeof corpo?.email === "string" ? await peloGestor(corpo.email, corpo.password) : await peloCodigo(corpo?.code);
  if ("error" in ligacao) return Response.json({ error: ligacao.error }, { status: ligacao.status });

  const supabase = supabaseAdmin();
  const { data: empresa } = await supabase.from("company").select("name").eq("id", ligacao.companyId).single();
  const token = novoTokenDeAparelho();
  const { error } = await supabase.from("device").insert({
    company_id: ligacao.companyId,
    name: ligacao.nome,
    token_hash: hashDe(token),
    created_by: ligacao.criadoPor,
    last_seen_at: new Date().toISOString(),
  });
  if (error) {
    if (typeof corpo?.code === "string") await devolverCodigo(corpo.code);
    return Response.json({ error: "não foi possível ligar o celular" }, { status: 500 });
  }
  return Response.json({ token, company: empresa?.name ?? "" });
}

const normalizarCodigo = (code: unknown) => (typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : "");

/** O código vale uma vez: o mesmo update confere e marca, então dois pedidos juntos não passam. */
async function peloCodigo(code: unknown): Promise<Ligacao | Recusa> {
  const codigo = normalizarCodigo(code);
  if (!/^[A-Z0-9]{8}$/.test(codigo)) return recusa("código inválido");
  const supabase = supabaseAdmin();
  const agora = new Date().toISOString();
  // Empresa desativada não gasta o código: ele continua valendo se ela voltar dentro do prazo.
  const { data: previa } = await supabase.from("device_activation").select("company:company_id (active)").eq("code_hash", hashDe(codigo)).maybeSingle<{ company: { active: boolean } }>();
  if (!previa?.company?.active) return recusa("código inválido ou vencido");
  const { data } = await supabase
    .from("device_activation")
    .update({ used_at: agora })
    .eq("code_hash", hashDe(codigo))
    .is("used_at", null)
    .gt("expires_at", agora)
    .select("company_id, name, created_by")
    .maybeSingle();
  if (!data) return recusa("código inválido ou vencido");
  return { companyId: data.company_id, nome: data.name, criadoPor: data.created_by };
}

/** Sem aparelho criado, o código não foi aproveitado: volta a valer. */
async function devolverCodigo(code: string) {
  await supabaseAdmin().from("device_activation").update({ used_at: null }).eq("code_hash", hashDe(normalizarCodigo(code)));
}

/**
 * O gestor prova quem é com a senha do painel. O cliente é descartável: a sessão aberta aqui
 * não fica guardada e é encerrada no fim. Só gestor de empresa ativa liga celular.
 */
async function peloGestor(email: string, password: unknown): Promise<Ligacao | Recusa> {
  const endereco = email.trim().toLowerCase();
  if (!endereco || typeof password !== "string" || !password) return recusa("email ou senha incorretos");
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: endereco, password });
  if (error || !data.user) return error?.status === 429 ? recusa(AGUARDE, 429) : recusa("email ou senha incorretos");
  try {
    const { data: perfil } = await supabaseAdmin()
      .from("app_user")
      .select("role, company_id, company:company_id (active)")
      .eq("user_id", data.user.id)
      .maybeSingle<{ role: string; company_id: string | null; company: { active: boolean } | null }>();
    if (perfil?.role !== "manager" || !perfil.company_id) return recusa("use uma conta de gestor");
    if (!perfil.company?.active) return recusa("empresa desativada");
    const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());
    return { companyId: perfil.company_id, nome: `Celular ligado por ${endereco} em ${dia}`, criadoPor: data.user.id };
  } finally {
    await auth.auth.signOut();
  }
}
