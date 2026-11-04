"use server";

import { redirect } from "next/navigation";
import { supabaseForUser } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await supabaseForUser();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "E-mail ou senha incorretos." };
  const back = String(formData.get("voltar") ?? "");
  // Só caminhos internos, para o login não virar redirecionador para fora.
  redirect(back.startsWith("/gestor") ? back : "/gestor/quadro");
}

export async function logout() {
  const supabase = await supabaseForUser();
  await supabase.auth.signOut();
  redirect("/login");
}
