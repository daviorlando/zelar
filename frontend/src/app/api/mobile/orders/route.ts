import { autenticarAparelho, ehUuid, funcionarioDaEmpresa, indisponivel } from "@/lib/aparelho";
import { FOTO_DE_MAQUINA } from "@/lib/plano";
import { hojeNaUnidade, JANELA_DIAS, somarDias } from "@/lib/schedule";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";

type Linha = {
  id: string;
  equipment_id: string;
  frequency: string;
  period_start: string;
  due_date: string;
  status: string;
  returned_reason: string | null;
  released_note: string | null;
  work_order_item: {
    id: string;
    result: string | null;
    measured_value: number | null;
    block_reason: string | null;
    plan_item: {
      id: string;
      equipment_id: string;
      source_row: number | null;
      item_type: string;
      instruction_kind: string;
      activity: string;
      measurement_unit: string | null;
      measurement_min: number | null;
      measurement_max: number | null;
    };
  }[];
};

/**
 * Ordens que o celular guarda para trabalhar sem internet (escopo, seção 8):
 * as abertas da janela de 60 dias e as atrasadas, dos setores do funcionário
 * ou atribuídas a ele. Cada item já vem com a resposta que o servidor tem,
 * para o aparelho remontar o estado depois de reiniciar.
 *
 * Os textos das atividades vão uma vez só (planItems), não repetidos em cada ordem.
 */
export async function GET(request: Request) {
  const aparelho = await autenticarAparelho(request);
  if (aparelho instanceof Response) return aparelho;
  const worker = new URL(request.url).searchParams.get("worker");
  if (!ehUuid(worker)) return Response.json({ error: "funcionário inválido" }, { status: 400 });

  const supabase = supabaseAdmin();
  const ativo = await funcionarioDaEmpresa(worker, aparelho.companyId);
  if (ativo instanceof Response) return ativo;
  if (!ativo) return Response.json({ error: "funcionário inexistente ou desativado" }, { status: 403 });

  // Sem os setores, a lista viria só com as atribuídas e o celular perderia as outras.
  const { data: setores, error: falhaSetores } = await supabase.from("worker_sector").select("sector_code").eq("worker_id", worker);
  if (falhaSetores) return indisponivel(falhaSetores);
  const codigos = (setores ?? []).map((s) => s.sector_code).filter((c) => /^[A-Z]$/.test(c));
  const hoje = hojeNaUnidade();

  // Em páginas: lista cortada em 1000 ordens faria o celular apagar as que ficaram de fora.
  const pagina = (de: number, ate: number) => {
    const consulta = supabase
      .from("work_order")
      .select(
        `id, equipment_id, frequency, period_start, due_date, status, returned_reason, released_note,
         work_order_item (id, result, measured_value, block_reason,
           plan_item:plan_item_id (id, equipment_id, source_row, item_type, instruction_kind, activity, measurement_unit, measurement_min, measurement_max))`,
      )
      .eq("company_id", aparelho.companyId)
      .in("status", ["open", "in_progress", "blocked"])
      .lte("period_start", somarDias(hoje, JANELA_DIAS))
      .order("due_date")
      .order("id")
      .range(de, ate);
    return codigos.length
      ? consulta.or(`sector_code.in.(${codigos.join(",")}),assigned_worker_id.eq.${worker}`)
      : consulta.eq("assigned_worker_id", worker);
  };
  const { data, error } = await todasAsLinhas(pagina);
  if (error) return indisponivel(error);
  const ordens = (data as unknown as Linha[]).filter((o) => o.work_order_item.length > 0);
  // O banco não garante ordem (muda depois de cada resposta): o funcionário vê sempre a mesma sequência.
  const fila = (i: Linha["work_order_item"][number]) => i.plan_item.source_row ?? Number.MAX_SAFE_INTEGER;
  for (const o of ordens) o.work_order_item.sort((a, b) => fila(a) - fila(b) || a.plan_item.id.localeCompare(b.plan_item.id));

  const planItems = new Map<string, Linha["work_order_item"][number]["plan_item"]>();
  for (const o of ordens) for (const i of o.work_order_item) planItems.set(i.plan_item.id, i.plan_item);

  const raizes = [...new Set(ordens.map((o) => o.equipment_id))];
  const maquinas = raizes.length
    ? await supabase
        .from("equipment")
        .select("id, tag, name, parent_id, brand, model, power_cv, rpm, photo_path")
        .eq("company_id", aparelho.companyId)
        .or(`id.in.(${raizes.join(",")}),parent_id.in.(${raizes.join(",")})`)
        .order("tag")
    : null;
  if (maquinas?.error) return indisponivel(maquinas.error);
  const equipamentos = maquinas?.data ?? [];

  // Foto da máquina: mesmo prazo das fotos de funcionário; o celular baixa e guarda.
  const fotos = equipamentos.flatMap((e) => (!e.parent_id && e.photo_path ? [e.photo_path as string] : []));
  const assinadas = fotos.length ? (await supabase.storage.from(FOTO_DE_MAQUINA).createSignedUrls(fotos, 86400)).data : [];
  const urlDaFoto = new Map(assinadas?.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  return Response.json({
    today: hoje,
    sectors: codigos,
    equipment: equipamentos
      .filter((e) => !e.parent_id)
      .map((e) => ({
        id: e.id,
        tag: e.tag,
        name: e.name,
        brand: e.brand,
        model: e.model,
        powerCv: e.power_cv,
        rpm: e.rpm,
        photoPath: e.photo_path,
        photoUrl: e.photo_path ? (urlDaFoto.get(e.photo_path) ?? null) : null,
        components: equipamentos.filter((c) => c.parent_id === e.id).map((c) => ({ id: c.id, tag: c.tag, name: c.name })),
      })),
    planItems: [...planItems.values()].map((p) => ({
      id: p.id,
      componentId: p.equipment_id,
      type: p.item_type,
      kind: p.instruction_kind,
      activity: p.activity,
      unit: p.measurement_unit,
      min: p.measurement_min,
      max: p.measurement_max,
    })),
    orders: ordens.map((o) => ({
      id: o.id,
      equipmentId: o.equipment_id,
      frequency: o.frequency,
      periodStart: o.period_start,
      dueDate: o.due_date,
      status: o.status,
      returnedReason: o.returned_reason,
      releasedNote: o.released_note,
      items: o.work_order_item.map((i) => ({
        id: i.id,
        planItemId: i.plan_item.id,
        result: i.result,
        value: i.measured_value,
        reason: i.block_reason,
      })),
    })),
  });
}
