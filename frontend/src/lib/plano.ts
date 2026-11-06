// Vocabulário do plano de manutenção (tabelas sector, equipment, plan_item).
// Os valores em inglês são os do banco; os rótulos são o que o gestor lê.

export type Frequencia = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";

/** O que dá para escolher e o que gera ordens. "daily" saiu: só resta em ordens antigas, por isso continua nos rótulos. */
export const FREQUENCIAS: readonly Frequencia[] = ["weekly", "monthly", "quarterly", "semiannual", "annual"];

export const ROTULO_FREQUENCIA: Record<Frequencia, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

/** Bucket das fotos de máquina, no caminho "<id do equipamento>/<data>.jpg". */
export const FOTO_DE_MAQUINA = "equipment-photos";

export const TIPOS_DE_ITEM = ["inspection", "action", "measurement"] as const;
export type TipoDeItem = (typeof TIPOS_DE_ITEM)[number];

/** Como o funcionário responde no celular. */
export const ROTULO_TIPO: Record<TipoDeItem, string> = {
  inspection: "Inspeção (está bom / problema)",
  action: "Ação (feito / não consegui)",
  measurement: "Medição (anota um número)",
};

export type SituacaoDoPlano = "active" | "pending_review" | "retired";

export type Setor = { code: string; name: string };

export type Equipamento = {
  id: string;
  tag: string;
  name: string | null;
  parent_id: string | null;
  sector_code: string;
  brand: string | null;
  model: string | null;
  power_cv: number | null;
  rpm: number | null;
  working_temp: string | null;
  lubricant: string | null;
  photo_path?: string | null;
};

export type ItemDoPlano = {
  id: string;
  source_sheet: string;
  source_row: number;
  sector_code: string;
  frequency: Frequencia;
  equipment_id: string | null;
  equipment_name_raw: string | null;
  component_name_raw: string | null;
  tag_raw: string | null;
  activity: string;
  instruction_kind: string;
  item_type: TipoDeItem;
  status: SituacaoDoPlano;
  issues: string[];
};

export type Atividade = {
  id: string;
  equipment_id: string | null;
  frequency: Frequencia;
  activity: string;
  instruction_kind: string;
  item_type: TipoDeItem;
  measurement_unit: string | null;
  measurement_min: number | null;
  measurement_max: number | null;
  status: SituacaoDoPlano;
};

/** "a-bman  -me" → "A - BMAN - ME": o formato das tags da planilha. */
export function normalizarTag(bruta: string) {
  return bruta.trim().toUpperCase().replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ");
}

/** Final da tag que o celular reconhece para escolher o desenho do componente. */
export const SUFIXOS_DE_COMPONENTE = "ME motor · RD redutor · MAN mancal · ROL rolamento · MT motovibrador · CT correia";
