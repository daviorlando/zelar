"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashDe } from "@/lib/aparelho";
import { cifrar } from "@/lib/cifra";
import { exigirGestor } from "@/lib/empresa";
import { supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string; codigo?: string };

const VALIDADE_MS = 15 * 60 * 1000;

/** Fácil de ler em voz alta e digitar no celular: sem 0/O nem 1/I. */
function novoCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => letras[randomInt(letras.length)]).join("");
}

/**
 * O código só existe nesta resposta; o banco guarda o hash. Só o servidor grava o código: com
 * insert pela API, o erro de hash repetido contava ao gestor que o código existia em outra empresa.
 * A mensagem de erro do banco também não volta para a tela, pelo mesmo motivo.
 */
export async function gerarCodigo(form: FormData): Promise<Resultado> {
  const gestor = await exigirGestor();
  if (!gestor) return { erro: "Entre no painel de novo." };
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { erro: "Dê um nome ao celular." };
  const codigo = novoCodigo();
  const { error } = await supabaseAdmin().from("device_activation").insert({
    code_hash: hashDe(codigo),
    // Cópia cifrada só para o gestor ver de novo enquanto o código vale (Códigos esperando).
    code_cipher: cifrar(codigo),
    name: nome,
    company_id: gestor.empresaId,
    created_by: gestor.id,
    expires_at: new Date(Date.now() + VALIDADE_MS).toISOString(),
  });
  if (error) return { erro: "Não foi possível gerar o código. Tente de novo." };
  revalidatePath("/gestor/aparelhos");
  return { codigo };
}

export async function revogarAparelho(id: string): Promise<Resultado> {
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.from("device").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "Aparelho não encontrado ou já revogado." };
  revalidatePath("/gestor/aparelhos");
  return {};
}

/**
 * Apaga o celular de vez. Sem a linha, o token deixa de valer na hora e o celular volta para a
 * tela de ligar. Só o servidor apaga (o gestor não tem delete pela API), e só da própria empresa.
 */
export async function excluirAparelho(id: string): Promise<Resultado> {
  const gestor = await exigirGestor();
  if (!gestor) return { erro: "Entre no painel de novo." };
  const { data, error } = await supabaseAdmin().from("device").delete().eq("id", id).eq("company_id", gestor.empresaId).select("id");
  if (error) return { erro: "Não foi possível excluir. Tente de novo." };
  if (!data?.length) return { erro: "Celular não encontrado." };
  revalidatePath("/gestor/aparelhos");
  return {};
}
