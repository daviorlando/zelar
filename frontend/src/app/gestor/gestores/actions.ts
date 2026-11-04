"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string; senha?: string; ok?: string };

/** Criar e alterar contas usa a chave secreta: só vale para quem já entrou no painel. */
async function gestorAtual(): Promise<string | null> {
  const supabase = await supabaseForUser();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

/** Fácil de ditar ou digitar: sem letras e números que se confundem. */
function senhaTemporaria(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ2345679";
  return [...randomBytes(12)].map((b) => letras[b % letras.length]).join("");
}

const NUNCA = "876000h"; // 100 anos: o Supabase não tem "desativado", só bloqueio com prazo.

export async function criarGestor(form: FormData): Promise<Resultado> {
  if (!(await gestorAtual())) return { erro: "Entre no painel de novo." };
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!nome) return { erro: "Informe o nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Informe um e-mail válido." };

  const senha = senhaTemporaria();
  const { error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, trocar_senha: true },
  });
  if (error) {
    return { erro: error.code === "email_exists" ? "Já existe um gestor com este e-mail." : `Não foi possível criar: ${error.message}` };
  }
  revalidatePath("/gestor/gestores");
  return { senha };
}

export async function redefinirSenha(id: string): Promise<Resultado> {
  const quem = await gestorAtual();
  if (!quem) return { erro: "Entre no painel de novo." };
  if (id === quem) return { erro: "Para a sua própria senha, use Trocar minha senha." };
  const admin = supabaseAdmin().auth.admin;
  const { data, error: erroAoLer } = await admin.getUserById(id);
  if (erroAoLer) return { erro: erroAoLer.message };
  const senha = senhaTemporaria();
  const { error } = await admin.updateUserById(id, {
    password: senha,
    user_metadata: { ...data.user.user_metadata, trocar_senha: true },
  });
  if (error) return { erro: error.message };
  return { senha };
}

export async function definirAtivo(id: string, ativo: boolean): Promise<Resultado> {
  const quem = await gestorAtual();
  if (!quem) return { erro: "Entre no painel de novo." };
  if (id === quem) return { erro: "Você não pode desativar a própria conta." };
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
  const { error } = await supabase.auth.updateUser({ password: senha, data: { trocar_senha: false } });
  if (error) {
    return { erro: error.code === "same_password" ? "Escolha uma senha diferente da atual." : `Não foi possível trocar: ${error.message}` };
  }
  // O token guarda os dados da conta: sem renovar, o painel continuaria pedindo a troca.
  await supabase.auth.refreshSession();
  return { ok: "Senha trocada." };
}
