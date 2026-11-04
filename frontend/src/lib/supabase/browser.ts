import { createBrowserClient } from "@supabase/ssr";

/** Cliente do gestor no navegador (usa a sessão dos cookies e respeita o RLS). */
export function supabaseDoNavegador() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
