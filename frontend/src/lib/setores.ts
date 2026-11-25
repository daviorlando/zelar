import "server-only";
import { supabaseForUser } from "@/lib/supabase/server";

export type OpcaoDeSetor = { code: string; atividades: number };

/**
 * Setores do cadastro, com quantas atividades liberadas cada um tem (para o gestor saber onde há trabalho).
 * A contagem sai do banco (resumo_do_setor): baixar as atividades esbarrava no limite de 1000 linhas.
 */
export async function setoresComAtividades(): Promise<OpcaoDeSetor[]> {
  const supabase = await supabaseForUser();
  const { data } = await supabase.from("resumo_do_setor").select("code, atividades").order("code");
  return (data ?? []).map((s) => ({ code: s.code, atividades: s.atividades }));
}
