"use server";

import { revalidatePath } from "next/cache";
import { aplicarMudancasNoPlano } from "@/lib/gerar";
import { FOTO_DE_MAQUINA, FREQUENCIAS, TIPOS_DE_ITEM, normalizarTag, type Frequencia, type TipoDeItem } from "@/lib/plano";
import { supabaseForUser } from "@/lib/supabase/server";

/** Resultado das ações de cadastro: o formulário mostra o erro ou fecha. */
export type Resultado = { erro?: string; ok?: string; id?: string };

type Cliente = Awaited<ReturnType<typeof supabaseForUser>>;

async function quemAltera() {
  const supabase = await supabaseForUser();
  const { data } = await supabase.auth.getClaims();
  return { supabase, gestor: (data?.claims?.sub as string | undefined) ?? null };
}

const texto = (form: FormData, campo: string) => String(form.get(campo) ?? "").trim();
const opcional = (form: FormData, campo: string) => texto(form, campo) || null;

function numero(form: FormData, campo: string): number | null | undefined {
  const bruto = texto(form, campo).replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : undefined;
}

/** Códigos do Postgres que viram mensagem para o gestor. */
const MAX_FOTO = 4 * 1024 * 1024;
const JA_EXISTE = "23505";
const EM_USO = "23503";

/** Ordens abertas acompanham o plano; tudo o que mostra o plano é recarregado. */
async function depoisDeMudarOPlano(supabase: Cliente): Promise<string | undefined> {
  try {
    await aplicarMudancasNoPlano(supabase);
  } catch (e) {
    return `Salvo, mas as ordens não foram atualizadas: ${e instanceof Error ? e.message : e}`;
  }
  revalidatePath("/gestor/equipamentos", "layout");
  revalidatePath("/gestor/quadro");
  revalidatePath("/gestor/funcionarios", "layout");
}

/* ── Setores ─────────────────────────────────────────────────────────── */

export async function salvarSetor(form: FormData): Promise<Resultado> {
  const codigo = texto(form, "code").toUpperCase();
  const nome = texto(form, "name");
  const novo = form.get("novo") === "1";
  if (!/^[A-Z]$/.test(codigo)) return { erro: "O código do setor é uma letra, de A a Z." };
  if (!nome) return { erro: "Informe o nome do setor." };

  const { supabase } = await quemAltera();
  const { error } = novo
    ? await supabase.from("sector").insert({ code: codigo, name: nome })
    : await supabase.from("sector").update({ name: nome }).eq("code", codigo);
  if (error?.code === JA_EXISTE) return { erro: `Já existe o setor ${codigo}.` };
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  revalidatePath("/gestor/equipamentos", "layout");
  revalidatePath("/gestor/funcionarios", "layout");
  return { ok: novo ? `Setor ${codigo} criado.` : `Setor ${codigo} salvo.` };
}

export async function excluirSetor(codigo: string): Promise<Resultado> {
  const { supabase } = await quemAltera();
  const { error } = await supabase.from("sector").delete().eq("code", codigo);
  if (error?.code === EM_USO)
    return { erro: `O setor ${codigo} ainda tem equipamentos, atividades ou funcionários. Tire-os do setor antes.` };
  if (error) return { erro: `Não foi possível excluir: ${error.message}` };
  revalidatePath("/gestor/equipamentos", "layout");
  revalidatePath("/gestor/funcionarios", "layout");
  return { ok: `Setor ${codigo} excluído.` };
}

/* ── Equipamentos e componentes ──────────────────────────────────────── */

/**
 * Equipamento principal (setor + código → tag "A - BMAN") ou componente
 * (`parent_id` + sufixo → "A - BMAN - ME"). Mudar a tag ou o setor do principal
 * leva junto os componentes e as atividades.
 */
export async function salvarEquipamento(form: FormData): Promise<Resultado> {
  const id = opcional(form, "id");
  const paiId = opcional(form, "parent_id");
  const codigo = normalizarTag(texto(form, "codigo"));
  if (!codigo) return { erro: paiId ? "Informe o final da tag do componente." : "Informe o código do equipamento." };
  const [potencia, rpm] = [numero(form, "power_cv"), numero(form, "rpm")];
  if (potencia === undefined || rpm === undefined) return { erro: "Potência e rotação são números." };

  const { supabase } = await quemAltera();
  let tag: string;
  let setor: string;
  if (paiId) {
    const { data: pai } = await supabase.from("equipment").select("tag, sector_code").eq("id", paiId).single();
    if (!pai) return { erro: "Equipamento principal não encontrado." };
    tag = `${pai.tag} - ${codigo}`;
    setor = pai.sector_code;
  } else {
    setor = texto(form, "sector_code");
    if (!/^[A-Z]$/.test(setor)) return { erro: "Escolha o setor." };
    tag = `${setor} - ${codigo}`;
  }

  const agora = new Date().toISOString();
  const dados = {
    tag,
    name: opcional(form, "name")?.toUpperCase() ?? null,
    sector_code: setor,
    parent_id: paiId,
    brand: opcional(form, "brand"),
    model: opcional(form, "model"),
    power_cv: potencia,
    rpm,
    working_temp: opcional(form, "working_temp"),
    lubricant: opcional(form, "lubricant"),
    edited_at: agora,
  };

  const antes = id
    ? (await supabase.from("equipment").select("tag, sector_code").eq("id", id).single()).data
    : null;
  const salvo = id
    ? await supabase.from("equipment").update(dados).eq("id", id).select("id").single()
    : await supabase.from("equipment").insert(dados).select("id").single();
  if (salvo.error?.code === JA_EXISTE) return { erro: `Já existe um equipamento com a tag ${tag}.` };
  if (salvo.error) return { erro: `Não foi possível salvar: ${salvo.error.message}` };

  // Principal mudou de tag ou de setor: componentes e atividades acompanham.
  if (antes && !paiId && (antes.tag !== tag || antes.sector_code !== setor)) {
    const { data: comps } = await supabase.from("equipment").select("id, tag").eq("parent_id", id!);
    for (const c of comps ?? []) {
      const novaTag = c.tag.startsWith(antes.tag) ? tag + c.tag.slice(antes.tag.length) : c.tag;
      const { error } = await supabase
        .from("equipment")
        .update({ tag: novaTag, sector_code: setor, edited_at: agora })
        .eq("id", c.id);
      if (error) return { erro: `Equipamento salvo, mas o componente ${c.tag} não: ${error.message}` };
    }
    const ids = [id!, ...(comps ?? []).map((c) => c.id)];
    const { error } = await supabase
      .from("plan_item")
      .update({ sector_code: setor, reviewed_at: agora })
      .in("equipment_id", ids);
    if (error) return { erro: `Equipamento salvo, mas as atividades não mudaram de setor: ${error.message}` };
  }

  const aviso = await depoisDeMudarOPlano(supabase);
  if (aviso) return { erro: aviso };
  return { ok: id ? "Salvo." : paiId ? "Componente criado." : "Equipamento criado.", id: salvo.data.id };
}

/**
 * Exclui o equipamento (com os componentes) ou o componente. As atividades saem do
 * plano e das ordens abertas. O que já tem histórico de ordens não pode sumir: fica
 * arquivado, fora das listas e do plano.
 */
export async function excluirEquipamento(id: string): Promise<Resultado> {
  const { supabase, gestor } = await quemAltera();
  const { data: comps } = await supabase.from("equipment").select("id").eq("parent_id", id);
  const ids = [...(comps ?? []).map((c) => c.id), id];
  const agora = new Date().toISOString();

  const retirar = await supabase
    .from("plan_item")
    .update({ status: "retired", reviewed_at: agora, reviewed_by: gestor })
    .in("equipment_id", ids);
  if (retirar.error) return { erro: `Não foi possível excluir: ${retirar.error.message}` };
  const aviso = await depoisDeMudarOPlano(supabase);
  if (aviso) return { erro: aviso };

  await apagarAtividadesSemHistorico(supabase, ids);
  // Componentes primeiro: o principal só some se nenhum componente ficou.
  let arquivado = false;
  for (const alvo of ids) {
    const { error } = await supabase.from("equipment").delete().eq("id", alvo);
    if (!error) continue;
    if (error.code !== EM_USO) return { erro: `Não foi possível excluir: ${error.message}` };
    await supabase.from("equipment").update({ archived_at: agora, edited_at: agora }).eq("id", alvo);
    arquivado = true;
  }
  revalidatePath("/gestor/equipamentos", "layout");
  return { ok: arquivado ? "Excluído. Como tinha histórico de ordens, ficou arquivado." : "Excluído." };
}

/** Atividades retiradas que nenhuma ordem usou podem ser apagadas de vez. */
async function apagarAtividadesSemHistorico(supabase: Cliente, equipamentos: string[]) {
  const { data: itens } = await supabase.from("plan_item").select("id").in("equipment_id", equipamentos).eq("status", "retired");
  const todos = (itens ?? []).map((i) => i.id);
  if (todos.length === 0) return;
  const { data: usados } = await supabase.from("work_order_item").select("plan_item_id").in("plan_item_id", todos);
  const comHistorico = new Set((usados ?? []).map((u) => u.plan_item_id));
  const livres = todos.filter((i) => !comHistorico.has(i));
  if (livres.length) await supabase.from("plan_item").delete().in("id", livres);
}

/** Caminho novo a cada troca: o celular percebe a mudança e baixa a foto de novo. */
export async function salvarFotoDaMaquina(id: string, form: FormData): Promise<Resultado> {
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { erro: "Escolha uma foto." };
  if (!foto.type.startsWith("image/")) return { erro: "O arquivo precisa ser uma imagem." };
  if (foto.size > MAX_FOTO) return { erro: "Foto grande demais (máximo 4 MB)." };

  const { supabase } = await quemAltera();
  const { data: antes } = await supabase.from("equipment").select("photo_path").eq("id", id).single();
  if (!antes) return { erro: "Equipamento não encontrado." };
  const caminho = `${id}/${Date.now()}.jpg`;
  const envio = await supabase.storage.from(FOTO_DE_MAQUINA).upload(caminho, foto, { contentType: "image/jpeg" });
  if (envio.error) return { erro: `Não foi possível enviar: ${envio.error.message}` };
  const { error } = await supabase.from("equipment").update({ photo_path: caminho, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  if (antes.photo_path) await supabase.storage.from(FOTO_DE_MAQUINA).remove([antes.photo_path]);
  revalidatePath(`/gestor/equipamentos/${id}`);
  return { ok: "Foto salva." };
}

export async function removerFotoDaMaquina(id: string): Promise<Resultado> {
  const { supabase } = await quemAltera();
  const { data: antes } = await supabase.from("equipment").select("photo_path").eq("id", id).single();
  if (!antes) return { erro: "Equipamento não encontrado." };
  const { error } = await supabase.from("equipment").update({ photo_path: null, edited_at: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: `Não foi possível remover: ${error.message}` };
  if (antes.photo_path) await supabase.storage.from(FOTO_DE_MAQUINA).remove([antes.photo_path]);
  revalidatePath(`/gestor/equipamentos/${id}`);
  return { ok: "Foto removida." };
}

/* ── Atividades ──────────────────────────────────────────────────────── */

export async function salvarAtividade(form: FormData): Promise<Resultado> {
  const id = opcional(form, "id");
  const alvo = texto(form, "equipment_id");
  const frequencia = texto(form, "frequency") as Frequencia;
  const tipo = texto(form, "item_type") as TipoDeItem;
  const atividade = texto(form, "activity");
  const resumo = texto(form, "instruction_kind");
  const [minimo, maximo] = [numero(form, "measurement_min"), numero(form, "measurement_max")];

  if (!alvo) return { erro: "Escolha onde a atividade é feita." };
  if (!FREQUENCIAS.includes(frequencia)) return { erro: "Escolha a frequência." };
  if (!TIPOS_DE_ITEM.includes(tipo)) return { erro: "Escolha como o funcionário responde." };
  if (!resumo) return { erro: "Dê um nome curto à atividade." };
  if (!atividade) return { erro: "Descreva a atividade." };
  if (minimo === undefined || maximo === undefined) return { erro: "Mínimo e máximo são números." };
  if (minimo != null && maximo != null && minimo > maximo) return { erro: "O mínimo é maior que o máximo." };

  const { supabase, gestor } = await quemAltera();
  const { data: equipamento } = await supabase.from("equipment").select("sector_code").eq("id", alvo).single();
  if (!equipamento) return { erro: "Equipamento não encontrado." };

  const medicao = tipo === "measurement";
  const dados = {
    equipment_id: alvo,
    sector_code: equipamento.sector_code,
    frequency: frequencia,
    item_type: tipo,
    instruction_kind: resumo.toLowerCase(),
    activity: atividade,
    measurement_unit: medicao ? opcional(form, "measurement_unit") : null,
    measurement_min: medicao ? minimo : null,
    measurement_max: medicao ? maximo : null,
    status: "active" as const,
    issues: [],
    reviewed_at: new Date().toISOString(),
    reviewed_by: gestor,
  };
  const { error } = id
    ? await supabase.from("plan_item").update(dados).eq("id", id)
    : await supabase.from("plan_item").insert(dados);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  const aviso = await depoisDeMudarOPlano(supabase);
  if (aviso) return { erro: aviso };
  return { ok: id ? "Atividade salva." : "Atividade criada." };
}

export async function excluirAtividade(id: string): Promise<Resultado> {
  const { supabase, gestor } = await quemAltera();
  const { data: item, error } = await supabase
    .from("plan_item")
    .update({ status: "retired", reviewed_at: new Date().toISOString(), reviewed_by: gestor })
    .eq("id", id)
    .select("equipment_id")
    .single();
  if (error) return { erro: `Não foi possível excluir: ${error.message}` };
  const aviso = await depoisDeMudarOPlano(supabase);
  if (aviso) return { erro: aviso };
  if (item.equipment_id) await apagarAtividadesSemHistorico(supabase, [item.equipment_id]);
  return { ok: "Atividade excluída." };
}
