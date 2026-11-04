import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Confere a chave do aparelho (cabeçalho x-device-key). Devolve a resposta de
 * erro quando não confere, ou null quando o pedido pode seguir.
 */
export function recusarAparelho(request: Request): Response | null {
  const expected = process.env.ZELO_DEVICE_KEY;
  const given = request.headers.get("x-device-key") ?? "";
  if (!expected || !sameSecret(given, expected)) {
    return Response.json({ error: "chave do aparelho inválida" }, { status: 401 });
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
