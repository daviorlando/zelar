"use server";

import { revalidatePath } from "next/cache";
import { gerarOrdens } from "@/lib/gerar";
import { hojeNaUnidade, JANELA_DIAS, somarDias } from "@/lib/schedule";
import { supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string; ordens?: number };

function recarregar() {
  revalidatePath("/gestor/implantacao");
  revalidatePath("/gestor/quadro");
}

/** Começa o cronograma do setor. Confere aqui de novo o que a tela já mostrou como pronto. */
export async function iniciarSetor(codigo: string, inicio: string): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { erro: "Escolha a data de início." };
  if (inicio < hojeNaUnidade()) return { erro: "A data de início não pode estar no passado." };

  const supabase = await supabaseForUser();
  const { data: sessao } = await supabase.auth.getClaims();
  const [atividades, pessoas] = await Promise.all([
    supabase.from("plan_item").select("id", { count: "exact", head: true }).eq("sector_code", codigo).eq("status", "active"),
    supabase.from("worker_sector").select("worker!inner(active)", { count: "exact", head: true }).eq("sector_code", codigo).eq("worker.active", true),
  ]);
  if (!atividades.count) return { erro: `O setor ${codigo} ainda não tem atividades.` };
  if (!pessoas.count) return { erro: `O setor ${codigo} ainda não tem funcionário ativo: as ordens venceriam sem ninguém.` };

  const { data, error } = await supabase
    .from("sector")
    .update({ start_date: inicio, started_by: (sessao?.claims?.sub as string | undefined) ?? null })
    .eq("code", codigo)
    .is("start_date", null)
    .select("code");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: `O setor ${codigo} já foi iniciado.` };

  try {
    const { ordens } = await gerarOrdens(supabase, "manual");
    // Começando dentro da janela, sempre há ordem. Nenhuma é sinal de defeito: não finge que iniciou.
    if (ordens === 0 && inicio <= somarDias(hojeNaUnidade(), JANELA_DIAS)) throw new Error("Nenhuma ordem foi gerada. O setor não foi iniciado.");
    recarregar();
    return { ordens };
  } catch (e) {
    // Sem as ordens o setor não começou de verdade: volta ao estado anterior.
    await supabase.from("sector").update({ start_date: null, started_by: null }).eq("code", codigo);
    return { erro: e instanceof Error ? e.message : "Não foi possível gerar as ordens." };
  }
}

/** Corrige um início errado. O banco recusa se já houver resposta em alguma ordem do setor. */
export async function desfazerInicio(codigo: string): Promise<Resultado> {
  const supabase = await supabaseForUser();
  const { error } = await supabase.rpc("desfazer_inicio_setor", { setor: codigo });
  if (error) return { erro: error.message };
  recarregar();
  return {};
}
