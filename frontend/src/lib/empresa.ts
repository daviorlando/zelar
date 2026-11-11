import "server-only";
import { cache } from "react";
import { supabaseForUser } from "@/lib/supabase/server";

export type Perfil = {
  id: string;
  email: string;
  papel: "super_admin" | "manager";
  empresaId: string | null;
  /** Null também quando a empresa foi desativada: o RLS esconde a linha. */
  empresa: string | null;
};

/** Quem está conectado, pela própria sessão. Null sem sessão ou sem linha em app_user.
 * cache(): o layout e a página leem uma vez só por pedido (antes, 3 consultas a cada chamada). */
export const perfilAtual = cache(async (): Promise<Perfil | null> => {
  const supabase = await supabaseForUser();
  const { data: sessao } = await supabase.auth.getClaims();
  const id = sessao?.claims?.sub as string | undefined;
  if (!id) return null;
  const { data: linha } = await supabase.from("app_user").select("role, company_id").eq("user_id", id).maybeSingle();
  if (!linha) return null;
  const empresa = linha.company_id
    ? (await supabase.from("company").select("name").eq("id", linha.company_id).maybeSingle()).data?.name ?? null
    : null;
  return {
    id,
    email: (sessao?.claims?.email as string | undefined) ?? "",
    papel: linha.role,
    empresaId: linha.company_id,
    empresa,
  };
});

/** Gestor de empresa ativa: as ações com a chave secreta (que ignora o RLS) passam por aqui. */
export async function exigirGestor(): Promise<(Perfil & { empresaId: string }) | null> {
  const perfil = await perfilAtual();
  if (!perfil || perfil.papel !== "manager" || !perfil.empresaId || !perfil.empresa) return null;
  return perfil as Perfil & { empresaId: string };
}

export async function exigirSuperAdmin(): Promise<Perfil | null> {
  const perfil = await perfilAtual();
  return perfil?.papel === "super_admin" ? perfil : null;
}

/** Links de email usam só esta origem, nunca o cabeçalho Host do pedido. */
export function urlDoSite(caminho: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) throw new Error("Variável NEXT_PUBLIC_SITE_URL ausente (veja frontend/.env.example).");
  return new URL(caminho, base).toString();
}
