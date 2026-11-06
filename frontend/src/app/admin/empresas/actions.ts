"use server";

import { revalidatePath } from "next/cache";
import { convidarGestor, emailValido } from "@/lib/convite";
import { exigirSuperAdmin, urlDoSite } from "@/lib/empresa";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Resultado = { erro?: string; ok?: string };

function dadosDoGestor(form: FormData) {
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!nome) return { erro: "Informe o nome do gestor." };
  if (!emailValido(email)) return { erro: "Informe um e-mail válido." };
  return { nome, email };
}

/** Empresa nova com o primeiro gestor. Se o convite falhar, a empresa não fica para trás. */
export async function criarEmpresa(form: FormData): Promise<Resultado> {
  if (!(await exigirSuperAdmin())) return { erro: "Sem permissão." };
  const nomeDaEmpresa = String(form.get("empresa") ?? "").trim();
  if (!nomeDaEmpresa) return { erro: "Informe o nome da empresa." };
  const gestor = dadosDoGestor(form);
  if ("erro" in gestor) return gestor;

  const supabase = supabaseAdmin();
  const { data: empresa, error } = await supabase.from("company").insert({ name: nomeDaEmpresa }).select("id").single();
  if (error) return { erro: `Não foi possível criar: ${error.message}` };
  const convite = await convidarGestor(empresa.id, gestor.nome, gestor.email);
  if (convite.erro) {
    await supabase.from("company").delete().eq("id", empresa.id);
    return convite;
  }
  revalidatePath("/admin/empresas");
  return { ok: `Empresa criada. Convite enviado para ${gestor.email}.` };
}

export async function convidarOutroGestor(empresaId: string, form: FormData): Promise<Resultado> {
  if (!(await exigirSuperAdmin())) return { erro: "Sem permissão." };
  const gestor = dadosDoGestor(form);
  if ("erro" in gestor) return gestor;
  const convite = await convidarGestor(empresaId, gestor.nome, gestor.email);
  if (convite.erro) return convite;
  revalidatePath("/admin/empresas");
  return { ok: `Convite enviado para ${gestor.email}.` };
}

/** Convite vencido ou email perdido: manda um link novo para criar a senha. */
export async function reenviarAcesso(email: string): Promise<Resultado> {
  if (!(await exigirSuperAdmin())) return { erro: "Sem permissão." };
  const { error } = await supabaseAdmin().auth.resetPasswordForEmail(email, { redirectTo: urlDoSite("/auth/confirm") });
  if (error) return { erro: `Não foi possível enviar: ${error.message}` };
  return { ok: `Link enviado para ${email}.` };
}

/** Desativar corta o painel e os celulares da empresa na hora; os dados ficam. */
export async function definirEmpresaAtiva(id: string, ativa: boolean): Promise<Resultado> {
  if (!(await exigirSuperAdmin())) return { erro: "Sem permissão." };
  const { error } = await supabaseAdmin().from("company").update({ active: ativa }).eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/admin/empresas");
  return { ok: ativa ? "Empresa reativada." : "Empresa desativada." };
}
