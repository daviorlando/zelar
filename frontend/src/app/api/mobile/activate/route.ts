import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hashDe, novoTokenDeAparelho } from "@/lib/aparelho";
import { AGUARDE } from "@/lib/envio";
import { chaveDoIp } from "@/lib/ip";
import { supabaseAdmin } from "@/lib/supabase/server";

/** via: desativar o gestor revoga os ligados com a senha dele, não os ligados por código. */
type Ligacao = { companyId: string; nome: string; criadoPor: string | null; via: "senha" | "codigo" };
type Recusa = { error: string; status: number };

const recusa = (error: string, status = 400): Recusa => ({ error, status });

/**
 * Até 10 tentativas erradas por IP (IPv6 pelo /64) a cada 15 minutos; ligação que dá certo não
 * conta. A janela fica no banco, em reservar_tentativa_de_ativacao.
 */
const LIMITE = 10;
const MUITAS_TENTATIVAS = "Muitas tentativas erradas. Espere 15 minutos e tente de novo.";

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
  const supabase = supabaseAdmin();
  // Reserva antes de conferir a prova: o banco anota e conta com o IP travado, sem corrida.
  const { data: reserva, error: erroDaReserva } = await supabase
    .rpc("reservar_tentativa_de_ativacao", { ip: chaveDoLimite(request) })
    .single<{ id: number; tentativas: number }>();
  if (erroDaReserva || !reserva) return Response.json({ error: "painel indisponível, tente de novo" }, { status: 503 });
  const liberar = () => supabase.from("activation_attempt").delete().eq("id", reserva.id);
  if (reserva.tentativas > LIMITE) {
    await liberar();
    return Response.json({ error: MUITAS_TENTATIVAS }, { status: 429 });
  }

  // Falha deixa a reserva anotada: é ela que conta para o limite.
  const ligacao = typeof corpo?.email === "string" ? await peloGestor(corpo.email, corpo.password) : await peloCodigo(corpo?.code);
  if ("error" in ligacao) return Response.json({ error: ligacao.error }, { status: ligacao.status });
  await liberar();

  const { data: empresa } = await supabase.from("company").select("name").eq("id", ligacao.companyId).single();
  const token = novoTokenDeAparelho();
  const { error } = await supabase.from("device").insert({
    company_id: ligacao.companyId,
    name: ligacao.nome,
    token_hash: hashDe(token),
    created_by: ligacao.criadoPor,
    via: ligacao.via,
    last_seen_at: new Date().toISOString(),
  });
  if (error) {
    if (typeof corpo?.code === "string") await devolverCodigo(corpo.code);
    return Response.json({ error: "não foi possível ligar o celular" }, { status: 500 });
  }
  return Response.json({ token, company: empresa?.name ?? "" });
}

/** Na Vercel, o primeiro x-forwarded-for é o IP de quem chamou. */
function ipDe(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip || "desconhecido";
}

/**
 * O IP vai ao banco como HMAC com a chave secreta do servidor: sha256 puro de um IPv4 se
 * desfaz testando os 4 bilhões de endereços. Trocar a chave só zera a contagem em curso.
 */
const chaveDoLimite = (request: Request) =>
  createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(chaveDoIp(ipDe(request))).digest("hex");

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
  return { companyId: data.company_id, nome: data.name, criadoPor: data.created_by, via: "codigo" };
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
    return { companyId: perfil.company_id, nome: `Celular ligado por ${endereco} em ${dia}`, criadoPor: data.user.id, via: "senha" };
  } finally {
    await auth.auth.signOut();
  }
}
