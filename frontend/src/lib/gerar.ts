import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FREQUENCIAS } from "@/lib/plano";
import { hojeNaUnidade, periodosDoSetor } from "@/lib/schedule";

export type ResultadoDaGeracao = { ordens: number; itens: number };

/**
 * Gera as ordens da janela (hoje + 60 dias) dos setores iniciados, nas seis frequências.
 * Os períodos saem de schedule.ts; o banco grava com upsert pela chave estável.
 * Com o cliente do gestor, o RLS e o banco limitam à empresa dele. Com a chave secreta
 * (cron), `empresa` é obrigatória: ver gerarOrdensDeTodasAsEmpresas.
 */
export async function gerarOrdens(
  supabase: SupabaseClient,
  origem: "cron" | "manual",
  hoje = hojeNaUnidade(),
  empresa?: string,
): Promise<ResultadoDaGeracao> {
  let consulta = supabase.from("sector").select("code, start_date").not("start_date", "is", null);
  if (empresa) consulta = consulta.eq("company_id", empresa);
  const { data: setores, error: erroDosSetores } = await consulta;
  if (erroDosSetores) throw new Error(`Falha ao ler os setores: ${erroDosSetores.message}`);
  const periodos = (setores ?? []).flatMap((s) =>
    FREQUENCIAS.flatMap((f) => periodosDoSetor(f, hoje, s.start_date as string).map((p) => ({ ...p, sector_code: s.code }))),
  );
  if (periodos.length === 0) return { ordens: 0, itens: 0 };
  const { data, error } = await supabase.rpc("gerar_ordens", { periodos, origem, ...(empresa ? { empresa } : {}) });
  if (error) throw new Error(`Falha ao gerar ordens: ${error.message}`);
  const linha = (data as ResultadoDaGeracao[])[0];
  return { ordens: linha?.ordens ?? 0, itens: linha?.itens ?? 0 };
}

/** Cron: uma empresa com problema não impede as outras de gerar as ordens do dia. */
export async function gerarOrdensDeTodasAsEmpresas(supabase: SupabaseClient, hoje = hojeNaUnidade()) {
  const { data: empresas, error } = await supabase.from("company").select("id, name").eq("active", true);
  if (error) throw new Error(`Falha ao ler as empresas: ${error.message}`);
  const total: ResultadoDaGeracao = { ordens: 0, itens: 0 };
  const falhas: string[] = [];
  for (const e of empresas ?? []) {
    try {
      const r = await gerarOrdens(supabase, "cron", hoje, e.id);
      total.ordens += r.ordens;
      total.itens += r.itens;
    } catch (erro) {
      falhas.push(`${e.name}: ${erro instanceof Error ? erro.message : erro}`);
    }
  }
  return { ...total, falhas };
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
