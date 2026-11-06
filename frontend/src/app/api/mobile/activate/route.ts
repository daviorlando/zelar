import { hashDe, novoTokenDeAparelho } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Primeiro uso do celular: troca o código gerado no painel por um token só deste aparelho.
 * O código vale uma vez: o mesmo update confere e marca, então dois pedidos juntos não passam.
 */
export async function POST(request: Request) {
  let corpo: { code?: unknown } | null;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const codigo = typeof corpo?.code === "string" ? corpo.code.replace(/[\s-]/g, "").toUpperCase() : "";
  if (!/^[A-Z0-9]{8}$/.test(codigo)) return Response.json({ error: "código inválido" }, { status: 400 });

  const supabase = supabaseAdmin();
  const agora = new Date().toISOString();
  // Empresa desativada não gasta o código: ele continua valendo se ela voltar dentro do prazo.
  const { data: previa } = await supabase.from("device_activation").select("company:company_id (active)").eq("code_hash", hashDe(codigo)).maybeSingle<{ company: { active: boolean } }>();
  if (!previa?.company?.active) return Response.json({ error: "código inválido ou vencido" }, { status: 400 });
  const { data: ativacao } = await supabase
    .from("device_activation")
    .update({ used_at: agora })
    .eq("code_hash", hashDe(codigo))
    .is("used_at", null)
    .gt("expires_at", agora)
    .select("company_id, name, created_by")
    .maybeSingle();
  if (!ativacao) return Response.json({ error: "código inválido ou vencido" }, { status: 400 });

  const { data: empresa } = await supabase.from("company").select("name").eq("id", ativacao.company_id).single();

  const token = novoTokenDeAparelho();
  const { error } = await supabase.from("device").insert({
    company_id: ativacao.company_id,
    name: ativacao.name,
    token_hash: hashDe(token),
    created_by: ativacao.created_by,
    last_seen_at: agora,
  });
  if (error) {
    // Sem aparelho criado, o código não foi aproveitado: volta a valer.
    await supabase.from("device_activation").update({ used_at: null }).eq("code_hash", hashDe(codigo));
    return Response.json({ error: "não foi possível ligar o celular" }, { status: 500 });
  }
  return Response.json({ token, company: empresa?.name ?? "" });
}
