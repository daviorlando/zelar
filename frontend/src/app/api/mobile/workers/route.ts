import { autenticarAparelho, indisponivel } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";
import { badgeHash, PHOTO_BUCKET, pinHash, type Worker } from "@/lib/workers";

/** Lista de funcionários da empresa do aparelho, para ele guardar e entrar sem internet.
 * Leva hashes do crachá e do PIN: uma cópia do aparelho não refaz crachás nem lê o PIN direto. */
export async function GET(request: Request) {
  const aparelho = await autenticarAparelho(request);
  if (aparelho instanceof Response) return aparelho;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("worker")
    .select("id, name, pin, photo_path, badge_token, active, updated_at")
    .eq("company_id", aparelho.companyId)
    .order("name");
  if (error) return indisponivel(error);
  const workers = data as (Worker & { updated_at: string })[];

  const paths = workers.flatMap((w) => (w.photo_path ? [w.photo_path] : []));
  const signed = paths.length ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 86400)).data : [];
  const photo = new Map(signed?.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  return Response.json({
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      // O PIN em texto só vai para o APK antigo, que não sabe conferir o hash.
      ...(aparelho.legado ? { pin: w.pin } : { pinHash: pinHash(w.id, w.pin) }),
      badgeHash: badgeHash(w.badge_token),
      active: w.active,
      photoPath: w.photo_path,
      photoUrl: w.photo_path ? (photo.get(w.photo_path) ?? null) : null,
    })),
  });
}
