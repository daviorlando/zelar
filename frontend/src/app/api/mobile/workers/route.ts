import { recusarAparelho } from "@/lib/aparelho";
import { supabaseAdmin } from "@/lib/supabase/server";
import { badgeHash, PHOTO_BUCKET, type Worker } from "@/lib/workers";

/** Lista de funcionários para o celular guardar e entrar sem internet.
 * Leva o hash do crachá, nunca o código: uma cópia do aparelho não refaz crachás. */
export async function GET(request: Request) {
  const recusa = recusarAparelho(request);
  if (recusa) return recusa;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("worker")
    .select("id, name, pin, photo_path, badge_token, active, updated_at")
    .order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const workers = data as (Worker & { updated_at: string })[];

  const paths = workers.flatMap((w) => (w.photo_path ? [w.photo_path] : []));
  const signed = paths.length ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 86400)).data : [];
  const photo = new Map(signed?.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  return Response.json({
    workers: workers.map((w) => ({
      id: w.id,
      name: w.name,
      pin: w.pin,
      badgeHash: badgeHash(w.badge_token),
      active: w.active,
      photoPath: w.photo_path,
      photoUrl: w.photo_path ? (photo.get(w.photo_path) ?? null) : null,
    })),
  });
}

