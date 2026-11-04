import { ehUuid, recusarAparelho } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAX_OPS = 50;

/**
 * Recebe as operações guardadas no celular (respostas, desfazer, finalizar) em lote.
 * Idempotente pelo opId: reenviar devolve "duplicate" e não aplica de novo.
 * Resposta: { results: [{ opId, status: accepted | duplicate | rejected, reason }] }.
 */
export async function POST(request: Request) {
  const recusa = recusarAparelho(request);
  if (recusa) return recusa;

  let corpo: { workerId?: unknown; ops?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  if (!ehUuid(corpo.workerId)) return Response.json({ error: "funcionário inválido" }, { status: 400 });
  if (!Array.isArray(corpo.ops) || corpo.ops.length === 0 || corpo.ops.length > MAX_OPS) {
    return Response.json({ error: `envie de 1 a ${MAX_OPS} operações` }, { status: 400 });
  }
  const validas = corpo.ops.every(
    (o) => o && typeof o === "object" && typeof o.opId === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(o.opId),
  );
  if (!validas) return Response.json({ error: "operação sem opId válido" }, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("sincronizar", { funcionario: corpo.workerId, operacoes: corpo.ops });
  if (error) {
    const desativado = error.message.includes("funcionário");
    return Response.json({ error: error.message }, { status: desativado ? 403 : 500 });
  }
  return Response.json({
    results: (data as { op_id: string; status: string; motivo: string | null }[]).map((r) => ({
      opId: r.op_id,
      status: r.status,
      reason: r.motivo,
    })),
  });
}
