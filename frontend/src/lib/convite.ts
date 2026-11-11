import "server-only";
import { urlDoSite } from "@/lib/empresa";
import { erroDeEnvio } from "@/lib/envio";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ResultadoDoConvite = { erro?: string };

const JA_TEM_CONTA = "Este e-mail já tem conta no Zelar.";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailValido = (email: string) => EMAIL.test(email);

/**
 * Cria a conta do gestor na empresa e manda o email com o link para criar a senha.
 * Sem o perfil a conta não enxerga nada, então uma falha nele desfaz a conta.
 */
export async function convidarGestor(empresaId: string, nome: string, email: string): Promise<ResultadoDoConvite> {
  const supabase = supabaseAdmin();
  // Convidar conta pendente não dá erro: devolve a mesma conta e invalida o link anterior.
  // Por isso a conta existente é tratada antes, sem nunca ser alterada por outra empresa.
  const { data: existente } = await supabase.rpc("conta_por_email", { endereco: email });
  if (existente) return reenviarConvite(existente as string, empresaId, email);
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo: urlDoSite("/auth/confirm"),
  });
  if (error) {
    return { erro: error.code === "email_exists" ? JA_TEM_CONTA : erroDeEnvio(error) };
  }
  return vincularAEmpresa(data.user.id, empresaId);
}

/** Senha temporária: alternativa quando o email não chega. A pessoa troca no primeiro acesso. */
export async function criarGestorComSenha(empresaId: string, nome: string, email: string, senha: string): Promise<ResultadoDoConvite> {
  const { data: existente } = await supabaseAdmin().rpc("conta_por_email", { endereco: email });
  if (existente) return { erro: JA_TEM_CONTA };
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) {
    return { erro: error.code === "email_exists" ? JA_TEM_CONTA : `Não foi possível criar: ${error.message}` };
  }
  return vincularAEmpresa(data.user.id, empresaId);
}

/** O email não chegou: quem convidou pode mandar de novo. Conta de outra empresa, ou já em uso, fica como está. */
async function reenviarConvite(userId: string, empresaId: string, email: string): Promise<ResultadoDoConvite> {
  const supabase = supabaseAdmin();
  const { data: perfil } = await supabase.from("app_user").select("company_id").eq("user_id", userId).maybeSingle();
  const { data: conta } = await supabase.auth.admin.getUserById(userId);
  if (perfil?.company_id !== empresaId || !conta.user?.app_metadata?.trocar_senha) return { erro: JA_TEM_CONTA };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlDoSite("/auth/confirm") });
  if (error) return { erro: erroDeEnvio(error) };
  return {};
}

async function vincularAEmpresa(userId: string, empresaId: string): Promise<ResultadoDoConvite> {
  const supabase = supabaseAdmin();
  const marcada = await supabase.auth.admin.updateUserById(userId, { app_metadata: { trocar_senha: true } });
  const perfil = marcada.error
    ? marcada
    : await supabase.from("app_user").insert({ user_id: userId, company_id: empresaId, role: "manager" });
  if (perfil.error) {
    // Só chega aqui com conta criada nesta chamada; se outro pedido a vinculou no mesmo instante, ela fica.
    if ("code" in perfil.error && perfil.error.code === "23505") return { erro: JA_TEM_CONTA };
    await supabase.auth.admin.deleteUser(userId);
    return { erro: `Não foi possível criar a conta: ${perfil.error.message}` };
  }
  return {};
}
