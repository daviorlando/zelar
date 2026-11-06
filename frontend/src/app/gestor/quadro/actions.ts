"use server";

import { revalidatePath } from "next/cache";
import { supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string };

async function gestor() {
  const supabase = await supabaseForUser();
  const { data } = await supabase.auth.getClaims();
  const id = (data?.claims?.sub as string | undefined) ?? null;
  return { supabase, id };
}

/**
 * Cada ação só vale a partir das situações esperadas: a condição vai no próprio
 * update, então uma mudança que chegou do celular nesse meio-tempo não é atropelada.
 */
async function registrar(
  supabase: Awaited<ReturnType<typeof supabaseForUser>>,
  actor: string | null,
  action: "validar" | "devolver" | "cancelar",
  id: string,
  reason?: string,
  details?: Record<string, unknown>,
) {
  await supabase.from("audit_log").insert({ actor, action, work_order_id: id, reason: reason ?? null, details: details ?? null });
}

/**
 * O gestor conferiu as respostas: a ordem está concluída. Item que o funcionário não soube
 * responder não impede, mas precisa do aceite do gestor e fica contado na auditoria.
 */
export async function validar(id: string, aceitaPulados = false): Promise<Resultado> {
  const { supabase, id: quem } = await gestor();
  // "Não consegui" é verificação pendente: não pode virar Concluída.
  const { count } = await supabase
    .from("work_order_item")
    .select("id", { count: "exact", head: true })
    .eq("work_order_id", id)
    .eq("result", "blocked");
  if (count) return { erro: "Esta ordem tem item impedido. Devolva ao funcionário e libere o item." };
  const { count: pulados } = await supabase
    .from("work_order_item")
    .select("id", { count: "exact", head: true })
    .eq("work_order_id", id)
    .eq("result", "skipped");
  if (pulados && !aceitaPulados) return { erro: `Esta ordem tem ${pulados} sem resposta. Abra a ordem e confirme.` };
  const { data, error } = await supabase
    .from("work_order")
    .update({ status: "done", validated_at: new Date().toISOString(), validated_by: quem })
    .eq("id", id)
    .eq("status", "awaiting_validation")
    .select("id");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "Só dá para validar o que está aguardando validação." };
  await registrar(supabase, quem, "validar", id, undefined, pulados ? { pulados } : undefined);
  revalidatePath("/gestor/quadro");
  return {};
}

/** Volta para o funcionário completar. As respostas ficam; ele vê a ordem de novo no celular. */
export async function devolver(id: string, motivo: string): Promise<Resultado> {
  const texto = motivo.trim();
  if (!texto) return { erro: "Escreva o motivo da devolução." };
  const { supabase, id: quem } = await gestor();
  const { data, error } = await supabase
    .from("work_order")
    .update({ status: "open", returned_reason: texto, validated_at: null, validated_by: null, finished_at: null })
    .eq("id", id)
    .in("status", ["awaiting_validation", "done"])
    // Revisão diária saiu do plano: ordem antiga não volta para o celular.
    .neq("frequency", "daily")
    .select("id");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "Só dá para devolver o que foi concluído pelo funcionário, e revisão diária não volta mais." };
  // Situação de novo pelas respostas: em execução, impedida ou a fazer.
  await supabase.rpc("recalcular_ordem", { ordem: id });
  await registrar(supabase, quem, "devolver", id, texto);
  revalidatePath("/gestor/quadro");
  return {};
}

/** O gestor resolveu o que impedia: os itens voltam a pendentes e o funcionário é avisado no celular. */
export async function liberar(id: string, resolucao: string): Promise<Resultado> {
  const texto = resolucao.trim();
  if (!texto) return { erro: "Escreva o que foi resolvido." };
  const { supabase } = await gestor();
  const { error } = await supabase.rpc("liberar_impedimento", { ordem: id, resolucao: texto });
  if (error) return { erro: error.message };
  revalidatePath("/gestor/quadro");
  return {};
}

/** Tira a ordem do quadro (equipamento parado, por exemplo). Exige motivo. */
export async function cancelar(id: string, motivo: string): Promise<Resultado> {
  const texto = motivo.trim();
  if (!texto) return { erro: "Escreva o motivo do cancelamento." };
  const { supabase, id: quem } = await gestor();
  const { data, error } = await supabase
    .from("work_order")
    .update({ status: "cancelled", cancel_reason: texto, cancelled_at: new Date().toISOString(), cancelled_by: quem })
    .eq("id", id)
    .neq("status", "cancelled")
    .select("id");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "A ordem já estava cancelada." };
  await registrar(supabase, quem, "cancelar", id, texto);
  revalidatePath("/gestor/quadro");
  return {};
}
