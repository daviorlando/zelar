import { NextResponse, type NextRequest } from "next/server";
import { sameSecret } from "@/lib/aparelho";
import { gerarOrdensDeTodasAsEmpresas } from "@/lib/gerar";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Geração diária das ordens (Vercel Cron, ver vercel.json). Protegida por CRON_SECRET. */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  const recebido = request.headers.get("authorization") ?? "";
  if (!segredo || !sameSecret(recebido, `Bearer ${segredo}`)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  try {
    const resultado = await gerarOrdensDeTodasAsEmpresas(supabaseAdmin());
    return NextResponse.json(resultado, { status: resultado.falhas.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "falha" }, { status: 500 });
  }
}
