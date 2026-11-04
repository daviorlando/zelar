import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => required("NEXT_PUBLIC_SUPABASE_URL");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} ausente (veja frontend/.env.example).`);
  return value;
}

/** Cliente do gestor conectado: respeita o RLS (só usuários autenticados). */
export async function supabaseForUser() {
  const cookieStore = await cookies();
  return createServerClient(url(), required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Chamado de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

/** Chave secreta: só para a API do celular, que não tem usuário do Supabase. */
export function supabaseAdmin() {
  return createClient(url(), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
