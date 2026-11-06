"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { convidarGestor, criarGestorComSenha, emailValido } from "@/lib/convite";
import { exigirGestor } from "@/lib/empresa";
import { supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string; senha?: string; ok?: string };

/** Fácil de ditar ou digitar: sem letras e números que se confundem. */
function senhaTemporaria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ2345679";
  return [...randomBytes(12)].map((b) => letras[b % letras.length]).join("");
}

const NUNCA = "876000h"; // 100 anos: o Supabase não tem "desativado", só bloqueio com prazo.

/** Alterar contas usa a chave secreta, que ignora o RLS: o alvo precisa ser da mesma empresa. */
async function colegaDaEmpresa(id: string): Promise<{ eu: string } | { erro: string }> {
  const gestor = await exigirGestor();
  if (!gestor) return { erro: "Entre no painel de novo." };
  const { data } = await supabaseAdmin().from("app_user").select("user_id").eq("user_id", id).eq("company_id", gestor.empresaId).maybeSingle();
  if (!data) return { erro: "Gestor não encontrado." };
  return { eu: gestor.id };
}

export async function criarGestor(form: FormData): Promise<Resultado> {
  const gestor = await exigirGestor();
  if (!gestor) return { erro: "Entre no painel de novo." };
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!nome) return { erro: "Informe o nome." };
  if (!emailValido(email)) return { erro: "Informe um e-mail válido." };

  const senha = form.get("modo") === "senha" ? senhaTemporaria() : undefined;
  const { erro } = senha
    ? await criarGestorComSenha(gestor.empresaId, nome, email, senha)
    : await convidarGestor(gestor.empresaId, nome, email);
  if (erro) return { erro };
  revalidatePath("/gestor/gestores");
  return senha ? { senha } : { ok: `Convite enviado para ${email}.` };
}

export async function redefinirSenha(id: string): Promise<Resultado> {
  const colega = await colegaDaEmpresa(id);
  if ("erro" in colega) return colega;
  if (id === colega.eu) return { erro: "Para a sua própria senha, use Trocar minha senha." };
  const senha = senhaTemporaria();
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: senha, app_metadata: { trocar_senha: true } });
  if (error) return { erro: error.message };
  return { senha };
}

export async function definirAtivo(id: string, ativo: boolean): Promise<Resultado> {
  const colega = await colegaDaEmpresa(id);
  if ("erro" in colega) return colega;
  if (id === colega.eu) return { erro: "Você não pode desativar a própria conta." };
  const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : NUNCA });
  if (error) return { erro: error.message };
  revalidatePath("/gestor/gestores");
  return { ok: ativo ? "Gestor reativado." : "Gestor desativado." };
}

/** A pessoa escolhe a própria senha e o aviso de senha temporária sai da sessão. */
export async function trocarMinhaSenha(_: Resultado, form: FormData): Promise<Resultado> {
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== String(form.get("confirmacao") ?? "")) return { erro: "As duas senhas não são iguais." };

  const supabase = await supabaseForUser();
  const { data: sessao } = await supabase.auth.getClaims();
  const id = sessao?.claims?.sub as string | undefined;
  if (!id) return { erro: "Entre no painel de novo." };
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) {
    return { erro: error.code === "same_password" ? "Escolha uma senha diferente da atual." : `Não foi possível trocar: ${error.message}` };
  }
  // O aviso fica onde só o servidor escreve (app_metadata): a pessoa não consegue apagá-lo sem trocar a senha.
  const { error: erroDoAviso } = await supabaseAdmin().auth.admin.updateUserById(id, { app_metadata: { trocar_senha: false } });
  if (erroDoAviso) return { erro: `Senha trocada, mas o aviso continua: ${erroDoAviso.message}` };
  // O token guarda os dados da conta: sem renovar, o painel continuaria pedindo a troca.
  await supabase.auth.refreshSession();
  return { ok: "Senha trocada." };
}
