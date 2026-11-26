"use server";

import { refresh, revalidatePath } from "next/cache";
import { supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string };

/**
 * Validar, devolver e cancelar são funções do banco (migração correcoes_auditoria): travam a
 * ordem, conferem a situação e mudam numa só transação, então uma resposta que chegou do
 * celular nesse meio-tempo não é atropelada. A auditoria é gravada pelo gatilho da situação.
 */
async function decidir(rpc: string, args: Record<string, unknown>): Promise<Resultado> {
  const supabase = await supabaseForUser();
  const { error } = await supabase.rpc(rpc, args);
  if (error) return { erro: error.message };
  revalidatePath("/gestor/quadro");
  return {};
}

/**
 * O gestor conferiu as respostas: a ordem está concluída. Item que o funcionário não soube
 * responder não impede, mas precisa do aceite do gestor e fica contado na auditoria.
 */
export async function validar(id: string, aceitaPulados = false): Promise<Resultado> {
  return decidir("validar_ordem", { ordem: id, aceita_pulados: aceitaPulados });
}

/** Volta para o funcionário completar. As respostas ficam; ele vê a ordem de novo no celular. */
export async function devolver(id: string, motivo: string): Promise<Resultado> {
  const texto = motivo.trim();
  if (!texto) return { erro: "Escreva o motivo da devolução." };
  return decidir("devolver_ordem", { ordem: id, motivo: texto });
}

/** O gestor resolveu o que impedia: os itens voltam a pendentes e o funcionário é avisado no celular. */
export async function liberar(id: string, resolucao: string): Promise<Resultado> {
  const texto = resolucao.trim();
  if (!texto) return { erro: "Escreva o que foi resolvido." };
  return decidir("liberar_impedimento", { ordem: id, resolucao: texto });
}

/** Tira a ordem do quadro (equipamento parado, por exemplo). Exige motivo. */
export async function cancelar(id: string, motivo: string): Promise<Resultado> {
  const texto = motivo.trim();
  if (!texto) return { erro: "Escreva o motivo do cancelamento." };
  return decidir("cancelar_ordem", { ordem: id, motivo: texto });
}

/**
 * Recarrega o quadro com dados de agora. O router.refresh() do navegador fazia um GET que a
 * Vercel respondia do cache (a casca estática da página, sem cartões): o quadro só mudava no F5.
 * Uma Server Action é POST, nunca sai do cache, e o refresh() devolve a página renderizada na hora.
 */
export async function atualizarQuadro(): Promise<void> {
  refresh();
}
