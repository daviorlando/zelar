"use server";

import { redirect } from "next/navigation";
import { supabaseForUser } from "@/lib/supabase/server";

export type EstadoDaConfirmacao = { erro?: string };

export async function confirmarAcesso(_: EstadoDaConfirmacao, form: FormData): Promise<EstadoDaConfirmacao> {
  const tipo = form.get("tipo");
  if (tipo !== "invite" && tipo !== "recovery") return { erro: "Link inválido." };
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: String(form.get("token") ?? "") });
  if (error || !data.user) return { erro: "Este link venceu ou já foi usado. Peça um novo." };
  const { data: perfil } = await supabase.from("app_user").select("role").eq("user_id", data.user.id).maybeSingle();
  redirect(perfil?.role === "super_admin" ? "/admin/minha-senha" : "/gestor/minha-senha");
}
