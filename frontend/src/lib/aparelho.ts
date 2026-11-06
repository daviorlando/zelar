import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Aparelho = { companyId: string; deviceId: string | null; legado: boolean };

const naoAutorizado = () => Response.json({ error: "aparelho não autorizado" }, { status: 401 });

export const hashDe = (segredo: string) => createHash("sha256").update(segredo).digest("hex");

/** Token entregue ao aparelho na ativação: só o hash fica no banco. */
export const novoTokenDeAparelho = () => randomBytes(32).toString("base64url");

/**
 * Identifica o aparelho e a empresa dele. Sempre 401 quando não confere: o celular guarda a
 * fila e tenta depois. 403 ele trata como recusa definitiva e descartaria o trabalho.
 *
 * A chave única antiga (x-device-key) vale só para os APKs já instalados e fica presa à empresa
 * de ZELO_LEGACY_COMPANY_ID. Sai quando device.last_seen_at mostrar que todos atualizaram.
 */
export async function autenticarAparelho(request: Request): Promise<Aparelho | Response> {
  const token = request.headers.get("x-device-token");
  if (token) {
    const supabase = supabaseAdmin();
    const { data } = await supabase
      .from("device")
      .select("id, company_id, last_seen_at, company:company_id (active)")
      .eq("token_hash", hashDe(token))
      .is("revoked_at", null)
      .maybeSingle<{ id: string; company_id: string; last_seen_at: string | null; company: { active: boolean } }>();
    if (!data?.company?.active) return naoAutorizado();
    // Uma escrita por hora basta para saber quais aparelhos ainda estão em uso.
    if (!data.last_seen_at || Date.now() - Date.parse(data.last_seen_at) > 3_600_000) {
      await supabase.from("device").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
    }
    return { companyId: data.company_id, deviceId: data.id, legado: false };
  }

  const chave = process.env.ZELO_DEVICE_KEY;
  const empresa = process.env.ZELO_LEGACY_COMPANY_ID;
  const recebida = request.headers.get("x-device-key") ?? "";
  if (!chave || !empresa || !sameSecret(recebida, chave)) return naoAutorizado();
  const { data: ativa } = await supabaseAdmin().from("company").select("active").eq("id", empresa).maybeSingle();
  if (!ativa?.active) return naoAutorizado();
  return { companyId: empresa, deviceId: null, legado: true };
}

/** O funcionário existe, está ativo e é da empresa do aparelho? */
export async function funcionarioDaEmpresa(workerId: string, companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("worker")
    .select("active")
    .eq("id", workerId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !!data?.active;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
