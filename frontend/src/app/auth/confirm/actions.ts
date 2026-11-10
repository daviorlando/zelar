"use server";

import { redirect } from "next/navigation";
import { supabaseForUser } from "@/lib/supabase/server";

export type EstadoDaConfirmacao = { erro?: string };

const VENCIDO = "Este link venceu ou já foi usado. Peça um novo.";

export async function confirmarAcesso(_: EstadoDaConfirmacao, form: FormData): Promise<EstadoDaConfirmacao> {
  const supabase = await supabaseForUser();
  const codigo = form.get("codigo");
  let usuario: { id: string } | null;
  if (typeof codigo === "string" && codigo) {
    // Link do modelo padrão do Supabase: a troca só funciona no navegador que pediu a nova senha,
    // porque a outra metade do código ficou num cookie dele.
    const { data, error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (error || !data.user) return { erro: `${VENCIDO} Abra o link no mesmo navegador em que pediu a nova senha.` };
    usuario = data.user;
  } else {
    const tipo = form.get("tipo");
    if (tipo !== "invite" && tipo !== "recovery") return { erro: "Link inválido." };
    const { data, error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: String(form.get("token") ?? "") });
    if (error || !data.user) return { erro: VENCIDO };
    usuario = data.user;
  }
  const { data: perfil } = await supabase.from("app_user").select("role").eq("user_id", usuario.id).maybeSingle();
  redirect(perfil?.role === "super_admin" ? "/admin/minha-senha" : "/gestor/minha-senha");
}
