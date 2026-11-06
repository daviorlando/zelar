"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashDe } from "@/lib/aparelho";
import { supabaseForUser } from "@/lib/supabase/server";

export type Resultado = { erro?: string; codigo?: string };

const VALIDADE_MS = 15 * 60 * 1000;

/** Fácil de ler em voz alta e digitar no celular: sem 0/O nem 1/I. */
function novoCodigo() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => letras[randomInt(letras.length)]).join("");
}

/** O código só existe nesta resposta; o banco guarda o hash. O RLS grava na empresa do gestor. */
export async function gerarCodigo(form: FormData): Promise<Resultado> {
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { erro: "Dê um nome ao celular." };
  const codigo = novoCodigo();
  const supabase = await supabaseForUser();
  const { error } = await supabase
    .from("device_activation")
    .insert({ code_hash: hashDe(codigo), name: nome, expires_at: new Date(Date.now() + VALIDADE_MS).toISOString() });
  if (error) return { erro: `Não foi possível gerar: ${error.message}` };
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
