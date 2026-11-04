import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FREQUENCIAS } from "@/lib/plano";
import { hojeNaUnidade, periodosDoSetor } from "@/lib/schedule";

export type ResultadoDaGeracao = { ordens: number; itens: number };

/**
 * Gera as ordens da janela (hoje + 60 dias) dos setores iniciados, nas seis frequências.
 * Os períodos saem de schedule.ts; o banco grava com upsert pela chave estável.
 */
export async function gerarOrdens(
  supabase: SupabaseClient,
  origem: "cron" | "manual",
  hoje = hojeNaUnidade(),
): Promise<ResultadoDaGeracao> {
  const { data: setores, error: erroDosSetores } = await supabase.from("sector").select("code, start_date").not("start_date", "is", null);
  if (erroDosSetores) throw new Error(`Falha ao ler os setores: ${erroDosSetores.message}`);
  const periodos = (setores ?? []).flatMap((s) =>
    FREQUENCIAS.flatMap((f) => periodosDoSetor(f, hoje, s.start_date as string).map((p) => ({ ...p, sector_code: s.code }))),
  );
  if (periodos.length === 0) return { ordens: 0, itens: 0 };
  const { data, error } = await supabase.rpc("gerar_ordens", { periodos, origem });
  if (error) throw new Error(`Falha ao gerar ordens: ${error.message}`);
  const linha = (data as ResultadoDaGeracao[])[0];
  return { ordens: linha?.ordens ?? 0, itens: linha?.itens ?? 0 };
}

/**
 * Depois de o gestor mexer no plano: tira das ordens abertas o que deixou de valer
 * e acrescenta o que entrou, sem esperar o cron da madrugada.
 */
export async function aplicarMudancasNoPlano(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("ajustar_ordens_ao_plano");
  if (error) throw new Error(`Falha ao ajustar as ordens: ${error.message}`);
  return gerarOrdens(supabase, "manual");
}
