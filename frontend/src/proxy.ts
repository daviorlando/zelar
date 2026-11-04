import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Renova a sessão do Supabase e manda quem não entrou para /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const login = new URL("/login", request.url);
    login.searchParams.set("voltar", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  // Senha temporária: antes de usar o painel, a pessoa escolhe a própria.
  const metadados = data.claims.user_metadata as { trocar_senha?: boolean } | undefined;
  if (metadados?.trocar_senha && request.nextUrl.pathname !== "/gestor/minha-senha") {
    return NextResponse.redirect(new URL("/gestor/minha-senha", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/gestor/:path*"],
};
