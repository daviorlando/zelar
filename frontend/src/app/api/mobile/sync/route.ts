import { autenticarAparelho, ehUuid } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_OPS = 50;

/**
 * Recebe as operações guardadas no celular (respostas, desfazer, finalizar) em lote.
 * Idempotente pelo opId: reenviar devolve "duplicate" e não aplica de novo.
 * Resposta: { results: [{ opId, status: accepted | duplicate | rejected, reason }] }.
 */
export async function POST(request: Request) {
  const aparelho = await autenticarAparelho(request);
  if (aparelho instanceof Response) return aparelho;

  let corpo: { workerId?: unknown; ops?: unknown } | null;
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  if (!corpo || !ehUuid(corpo.workerId)) return Response.json({ error: "funcionário inválido" }, { status: 400 });
  if (!Array.isArray(corpo.ops) || corpo.ops.length === 0 || corpo.ops.length > MAX_OPS) {
    return Response.json({ error: `envie de 1 a ${MAX_OPS} operações` }, { status: 400 });
  }
  const validas = corpo.ops.every(
    (o) => o && typeof o === "object" && typeof o.opId === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(o.opId),
  );
  if (!validas) return Response.json({ error: "operação sem opId válido" }, { status: 400 });

  // Funcionário de outra empresa é recusa definitiva, igual a funcionário desativado.
  const supabase = supabaseAdmin();
  const { data: pessoa } = await supabase.from("worker").select("id").eq("id", corpo.workerId).eq("company_id", aparelho.companyId).maybeSingle();
  if (!pessoa) return Response.json({ error: "funcionário inexistente ou desativado" }, { status: 403 });

  const { data, error } = await supabase.rpc("sincronizar", { funcionario: corpo.workerId, operacoes: corpo.ops });
  if (error) {
    const desativado = error.message.includes("funcionário");
    if (!desativado) console.error("sincronizar falhou:", error.message);
    return Response.json({ error: desativado ? error.message : "falha ao gravar" }, { status: desativado ? 403 : 500 });
  }
  return Response.json({
    results: (data as { op_id: string; status: string; motivo: string | null }[]).map((r) => ({
      opId: r.op_id,
      status: r.status,
      reason: r.motivo,
    })),
  });
}
