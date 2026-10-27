// Regras de normalização do importador (escopo v0.5, seção 3).
// Nada aqui "adivinha" dados: só padroniza forma e sugere classificações
// que o responsável técnico confirma no relatório de conferência.

export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export type ItemType = "inspection" | "action" | "measurement";

const FREQUENCY_HEADERS: Record<string, Frequency> = {
  "DIÁRIAS": "daily",
  "SEMANAIS": "weekly",
  "MENSAIS": "monthly",
  "TRIMESTRAL": "quarterly",
  "SEMESTRAL": "semiannual",
  "ANUAL": "annual",
};

export function frequencyFromHeader(text: string | null): Frequency | null {
  if (!text) return null;
  return FREQUENCY_HEADERS[text.trim().toUpperCase()] ?? null;
}

/** Remove espaços/quebras nas pontas, caixa alta e separador " - ". Nunca altera o conteúdo das partes. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

export function tagSector(tag: string): string | null {
  const m = /^([A-Z])\s-\s/.exec(tag);
  return m ? m[1] : null;
}

/** "A - BMAN - ME" -> "A - BMAN"; equipamentos principais têm duas partes. */
export function parentTag(tag: string): string | null {
  const parts = tag.split(" - ");
  return parts.length > 2 ? parts.slice(0, 2).join(" - ") : null;
}

/** Tipo de instrução = prefixo antes de ":" padronizado ("Limpezas" -> "limpeza"). */
export function instructionKind(activity: string): string {
  const idx = activity.indexOf(":");
  const head = (idx > 0 ? activity.slice(0, idx) : activity.split(/\s+/).slice(0, 3).join(" "))
    .toLowerCase()
    .replace(/\(se aplicável\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    limpezas: "limpeza",
    "verificar temperaturas": "medição de temperatura",
    "verificação de tensão": "verificação de tensão e corrente",
    "verificação do alinhamento": "verificação de alinhamento",
  };
  return aliases[head] ?? head;
}

const MEASUREMENT = [/^medição/, /^análise de/, /^monitoramento de vibração/, /tensão e corrente/, /temperatura/, /isolamento/];
const ACTION = [/^limpeza/, /^lubrificação/, /^troca/, /^trocar/, /^substituição/, /^alinhamento$/, /^reaperto/, /^ajuste/, /^balanceamento/, /^vedação/];
const ELECTRICAL = /tensão|corrente|isolamento|enrolamento|escovas|fiação|sistema de controle/;

/** Sugestão do tipo de resposta pela palavra inicial; sempre confirmada manualmente. */
export function suggestItemType(kind: string): ItemType {
  if (MEASUREMENT.some((r) => r.test(kind))) return "measurement";
  if (ACTION.some((r) => r.test(kind))) return "action";
  return "inspection";
}

export function suggestQualification(kind: string): "electrical" | null {
  return ELECTRICAL.test(kind) ? "electrical" : null;
}

/** Textos com marcadores, ";" ou várias linhas podem esconder mais de uma ação. */
export function hasMultipleActions(activity: string): boolean {
  return /[•;]|\n/.test(activity.trim());
}
