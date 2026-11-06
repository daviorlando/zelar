"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PIN_LENGTH } from "@/lib/pin";
import { supabaseForUser } from "@/lib/supabase/server";
import { newBadgeToken, PHOTO_BUCKET } from "@/lib/workers";

export type SaveState = { error?: string };

const MAX_PHOTO = 4 * 1024 * 1024;

function parsePin(raw: FormDataEntryValue | null): number[] | null {
  const texto = String(raw ?? "");
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(texto) ? [...texto].map(Number) : null;
}

export async function saveWorker(_: SaveState, formData: FormData): Promise<SaveState> {
  const id = String(formData.get("id") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  const pin = parsePin(formData.get("pin"));
  const photo = formData.get("photo");
  const setores = [...new Set(formData.getAll("setores").map(String))].filter((c) => /^[A-Z]$/.test(c));

  if (!name) return { error: "Informe o nome." };
  if (!pin) return { error: `O PIN tem ${PIN_LENGTH} números.` };
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (hasPhoto && !photo.type.startsWith("image/")) return { error: "A foto precisa ser uma imagem." };
  if (hasPhoto && photo.size > MAX_PHOTO) return { error: "Foto grande demais (máximo 4 MB)." };

  const supabase = await supabaseForUser();
  const saved = id
    ? await supabase.from("worker").update({ name, pin }).eq("id", id).select("id").single()
    : await supabase.from("worker").insert({ name, pin, badge_token: newBadgeToken() }).select("id").single();
  if (saved.error) return { error: `Não foi possível salvar: ${saved.error.message}` };

  // Setores: substitui a lista inteira pela marcada no formulário.
  const removidos = await supabase.from("worker_sector").delete().eq("worker_id", saved.data.id);
  const inseridos = setores.length
    ? await supabase.from("worker_sector").insert(setores.map((sector_code) => ({ worker_id: saved.data.id, sector_code })))
    : { error: null };
  const erroSetor = removidos.error ?? inseridos.error;
  if (erroSetor) return { error: `Cadastro salvo, mas os setores falharam: ${erroSetor.message}` };

  if (hasPhoto) {
    // Caminho novo a cada troca: o celular percebe a mudança e baixa a foto de novo.
    const path = `${saved.data.id}/${Date.now()}`;
    const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: photo.type });
    if (upload.error) return { error: `Cadastro salvo, mas a foto falhou: ${upload.error.message}` };
    const { data: antes } = await supabase.from("worker").select("photo_path").eq("id", saved.data.id).single();
    const linked = await supabase.from("worker").update({ photo_path: path }).eq("id", saved.data.id);
    if (linked.error) return { error: `Cadastro salvo, mas a foto falhou: ${linked.error.message}` };
    // Foto de rosto é dado pessoal: a antiga não fica guardada.
    if (antes?.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([antes.photo_path]);
  }

  revalidatePath("/gestor/funcionarios");
  redirect(`/gestor/funcionarios/${saved.data.id}?salvo=1`);
}

export async function setActive(id: string) {
  const supabase = await supabaseForUser();
  const { data } = await supabase.from("worker").select("active").eq("id", id).single();
  if (data) await supabase.from("worker").update({ active: !data.active }).eq("id", id);
  revalidatePath("/gestor/funcionarios");
}

/** Crachá perdido: novo código; o crachá impresso antes deixa de entrar. */
export async function rotateBadge(id: string) {
  const supabase = await supabaseForUser();
  const { data } = await supabase.from("worker").select("badge_version").eq("id", id).single();
  if (!data) return;
  await supabase
    .from("worker")
    .update({ badge_token: newBadgeToken(), badge_version: data.badge_version + 1 })
    .eq("id", id);
  revalidatePath("/gestor/funcionarios");
}
