"use server";

import { redirect } from "next/navigation";
import { urlDoSite } from "@/lib/empresa";
import { supabaseForUser } from "@/lib/supabase/server";

export type LoginState = { error?: string };
export type EstadoEsqueci = { enviado?: boolean };

/** Só caminhos internos, depois de normalizar: "/gestor/..//site.com" não pode virar redirecionador para fora. */
function destinoInterno(voltar: string): string {
  const base = "http://zelo.invalido";
  try {
    const url = new URL(voltar, base);
    if (url.origin === base && /^\/gestor(\/|$)/.test(url.pathname)) return url.pathname + url.search;
  } catch {
    // Endereço malformado: vai para o quadro.
  }
  return "/gestor/quadro";
}

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "E-mail ou senha incorretos." };
  const { data: perfil } = await supabase.from("app_user").select("role").eq("user_id", data.user.id).maybeSingle();
  if (perfil?.role === "super_admin") redirect("/admin/empresas");
  redirect(destinoInterno(String(formData.get("voltar") ?? "")));
}

/** A resposta é sempre a mesma: a tela não revela quais e-mails têm conta. */
export async function pedirNovaSenha(_: EstadoEsqueci, form: FormData): Promise<EstadoEsqueci> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (email) {
    const supabase = await supabaseForUser();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: urlDoSite("/auth/confirm") });
  }
  return { enviado: true };
}

export async function logout() {
  const supabase = await supabaseForUser();
  await supabase.auth.signOut();
  redirect("/login");
}
