import "server-only";
import { supabaseForUser } from "@/lib/supabase/server";

export type OpcaoDeSetor = { code: string; atividades: number };

/** Setores do cadastro, com quantas atividades liberadas cada um tem (para o gestor saber onde há trabalho). */
export async function setoresComAtividades(): Promise<OpcaoDeSetor[]> {
  const supabase = await supabaseForUser();
  const [setores, itens] = await Promise.all([
    supabase.from("sector").select("code").order("code"),
    supabase.from("plan_item").select("sector_code").eq("status", "active").range(0, 9999),
  ]);
  const conta = new Map<string, number>();
  for (const i of itens.data ?? []) conta.set(i.sector_code, (conta.get(i.sector_code) ?? 0) + 1);
  return (setores.data ?? []).map((s) => ({ code: s.code, atividades: conta.get(s.code) ?? 0 }));
}
