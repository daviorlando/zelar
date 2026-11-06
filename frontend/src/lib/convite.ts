import "server-only";
import { urlDoSite } from "@/lib/empresa";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ResultadoDoConvite = { erro?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailValido = (email: string) => EMAIL.test(email);

/**
 * Cria a conta do gestor na empresa e manda o email com o link para criar a senha.
 * Sem o perfil a conta não enxerga nada, então uma falha nele desfaz a conta.
 */
export async function convidarGestor(empresaId: string, nome: string, email: string): Promise<ResultadoDoConvite> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: urlDoSite("/auth/confirm"),
  });
  if (error) {
    return { erro: error.code === "email_exists" ? "Este e-mail já tem conta no Zelo." : `Não foi possível enviar o convite: ${error.message}` };
  }
  return vincularAEmpresa(data.user.id, empresaId);
}

/** Senha temporária: alternativa quando o email não chega. A pessoa troca no primeiro acesso. */
export async function criarGestorComSenha(empresaId: string, nome: string, email: string, senha: string): Promise<ResultadoDoConvite> {
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) {
    return { erro: error.code === "email_exists" ? "Este e-mail já tem conta no Zelo." : `Não foi possível criar: ${error.message}` };
  }
  return vincularAEmpresa(data.user.id, empresaId);
}

async function vincularAEmpresa(userId: string, empresaId: string): Promise<ResultadoDoConvite> {
  const supabase = supabaseAdmin();
  const marcada = await supabase.auth.admin.updateUserById(userId, { app_metadata: { trocar_senha: true } });
  const perfil = marcada.error
    ? marcada
    : await supabase.from("app_user").insert({ user_id: userId, company_id: empresaId, role: "manager" });
  if (perfil.error) {
    await supabase.auth.admin.deleteUser(userId);
    return { erro: `Não foi possível criar a conta: ${perfil.error.message}` };
  }
  return {};
}
