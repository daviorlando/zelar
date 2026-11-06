import { hashDe, novoTokenDeAparelho } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Primeiro uso do celular: troca o código gerado no painel por um token só deste aparelho.
 * O código vale uma vez: o mesmo update confere e marca, então dois pedidos juntos não passam.
 */
export async function POST(request: Request) {
  let corpo: { code?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const codigo = typeof corpo.code === "string" ? corpo.code.replace(/[\s-]/g, "").toUpperCase() : "";
  if (!/^[A-Z0-9]{8}$/.test(codigo)) return Response.json({ error: "código inválido" }, { status: 400 });

  const supabase = supabaseAdmin();
  const agora = new Date().toISOString();
  const { data: ativacao } = await supabase
    .from("device_activation")
    .update({ used_at: agora })
    .eq("code_hash", hashDe(codigo))
    .is("used_at", null)
    .gt("expires_at", agora)
    .select("company_id, name, created_by")
    .maybeSingle();
  if (!ativacao) return Response.json({ error: "código inválido ou vencido" }, { status: 400 });

  const { data: empresa } = await supabase.from("company").select("name, active").eq("id", ativacao.company_id).maybeSingle();
  if (!empresa?.active) return Response.json({ error: "código inválido ou vencido" }, { status: 400 });

  const token = novoTokenDeAparelho();
  const { error } = await supabase.from("device").insert({
    company_id: ativacao.company_id,
    name: ativacao.name,
    token_hash: hashDe(token),
    created_by: ativacao.created_by,
    last_seen_at: agora,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ token, company: empresa.name });
}
