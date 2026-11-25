import { createHash } from "node:crypto";
import { autenticarAparelho, ehUuid, funcionarioDaEmpresa, indisponivel } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Abaixo dos 4,5 MB que a Vercel aceita no corpo do pedido. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = {
  photo: { mimes: ["image/jpeg", "image/png", "image/webp"], ext: "jpg" },
  audio: { mimes: ["audio/mp4", "audio/m4a", "audio/aac", "audio/x-m4a", "audio/mpeg"], ext: "m4a" },
} as const;

/**
 * Foto ou áudio de uma resposta, enviado depois da resposta ter sido aceita.
 * Multipart: workerId, itemId, kind (photo|audio), file. O caminho no bucket leva
 * o SHA-256 do arquivo: reenviar o mesmo arquivo não cria cópia.
 */
export async function POST(request: Request) {
  const aparelho = await autenticarAparelho(request);
  if (aparelho instanceof Response) return aparelho;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "corpo inválido" }, { status: 400 });
  }
  const workerId = form.get("workerId");
  const itemId = form.get("itemId");
  const kind = form.get("kind");
  const file = form.get("file");
  if (!ehUuid(workerId) || !ehUuid(itemId)) return Response.json({ error: "funcionário ou item inválido" }, { status: 400 });
  if (kind !== "photo" && kind !== "audio") return Response.json({ error: "tipo inválido" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "arquivo ausente" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "arquivo maior que 4 MB" }, { status: 413 });

  const ativo = await funcionarioDaEmpresa(workerId, aparelho.companyId);
  if (ativo instanceof Response) return ativo;
  if (!ativo) return Response.json({ error: "funcionário inválido" }, { status: 403 });
  const supabase = supabaseAdmin();
  // O item precisa ser de uma ordem do setor do funcionário (ou atribuída a ele).
  const { data: item, error: falhaItem } = await supabase
    .from("work_order_item")
    .select("id, executed_by, work_order:work_order_id (sector_code, assigned_worker_id)")
    .eq("id", itemId)
    .eq("company_id", aparelho.companyId)
    .maybeSingle<{ id: string; executed_by: string | null; work_order: { sector_code: string; assigned_worker_id: string | null } }>();
  if (falhaItem) return indisponivel(falhaItem);
  if (!item) return Response.json({ error: "item não encontrado" }, { status: 404 });
  // A resposta em vigor precisa ser de quem manda a foto. Se a deste celular foi ignorada (outro
  // funcionário respondeu depois) ou desfeita, a mídia não vale mais e não vai para a resposta do
  // colega. Responde 200 sem guardar: o celular tira da fila sem chamar o gestor.
  if (item.executed_by !== workerId) return Response.json({ status: "ignored", reason: "item respondido por outro funcionário" });
  const { data: setores, error: falhaSetores } = await supabase.from("worker_sector").select("sector_code").eq("worker_id", workerId);
  if (falhaSetores) return indisponivel(falhaSetores);
  const permitido =
    item.work_order.assigned_worker_id === workerId || (setores ?? []).some((s) => s.sector_code === item.work_order.sector_code);
  if (!permitido) return Response.json({ error: "item de outro setor" }, { status: 403 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const tipo = TIPOS[kind];
  const contentType = (tipo.mimes as readonly string[]).includes(file.type) ? file.type : tipo.mimes[0];
  const path = `${itemId}/${kind}-${sha256.slice(0, 32)}.${tipo.ext}`;

  const envio = await supabase.storage.from("evidence").upload(path, bytes, { contentType, upsert: false });
  const jaExistia = envio.error && /exist|duplicate/i.test(envio.error.message);
  if (envio.error && !jaExistia) return indisponivel(envio.error);

  const { error } = await supabase
    .from("evidence")
    .upsert(
      { work_order_item_id: itemId, kind, storage_path: path, sha256, size_bytes: bytes.length, uploaded_by: workerId },
      { onConflict: "storage_path", ignoreDuplicates: true },
    );
  if (error) return indisponivel(error);
  return Response.json({ status: jaExistia ? "duplicate" : "accepted", path });
}
