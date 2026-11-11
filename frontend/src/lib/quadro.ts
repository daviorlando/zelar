// Vocabulário do quadro de ordens (escopo v0.5, seção 9). Usado no servidor e no navegador.

import type { BadgeTone } from "@/components/zelar/badge";
import type { Frequencia } from "@/lib/plano";

export type SituacaoDaOrdem = "open" | "in_progress" | "blocked" | "awaiting_validation" | "done" | "cancelled";

/** As cinco colunas, na ordem do trabalho. Canceladas ficam fora do quadro. */
export const COLUNAS: { id: Exclude<SituacaoDaOrdem, "cancelled">; titulo: string; tom: BadgeTone; ajuda: string }[] = [
  { id: "open", titulo: "A fazer", tom: "neutral", ajuda: "Ninguém respondeu ainda." },
  { id: "in_progress", titulo: "Em execução", tom: "info", ajuda: "Já tem resposta no celular." },
  { id: "blocked", titulo: "Impedida", tom: "warn", ajuda: "Alguém marcou “não consegui”." },
  { id: "awaiting_validation", titulo: "Aguardando validação", tom: "warn", ajuda: "O funcionário concluiu. Confira e valide." },
  { id: "done", titulo: "Concluída", tom: "ok", ajuda: "Validadas nos últimos 7 dias." },
];

/** O cartão: só o necessário para varrer o quadro. */
export type CartaoDaOrdem = {
  id: string;
  equipamento: string;
  tag: string;
  setor: string;
  frequencia: Frequencia;
  vencimento: string;
  situacao: SituacaoDaOrdem;
  total: number;
  respondidos: number;
  /** "Não soube responder": não conta como feito. */
  pulados: number;
  problemas: number;
  /** Motivos dos itens "não consegui", já em texto. */
  impedimentos: string[];
  devolvida: boolean;
};

/** "vence hoje", "atrasada há 3 dias", "vence em 5 dias". Datas "AAAA-MM-DD". */
export function prazoRelativo(vencimento: string, hoje: string): { texto: string; atrasada: boolean } {
  const dias = Math.round((Date.parse(`${vencimento}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
  if (dias === 0) return { texto: "vence hoje", atrasada: false };
  if (dias === 1) return { texto: "vence amanhã", atrasada: false };
  if (dias > 1) return { texto: `vence em ${dias} dias`, atrasada: false };
  return { texto: dias === -1 ? "atrasada há 1 dia" : `atrasada há ${-dias} dias`, atrasada: true };
}

/** Nome do cadastro em maiúsculas → "Britador Mandíbula" (igual ao celular). */
export function nomeLegivel(nome: string | null, tag: string): string {
  const n = nome?.trim();
  if (!n) return tag;
  const pequenas = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "para", "com"]);
  return n
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && pequenas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Respostas do celular, com as mesmas palavras dos botões. */
export const RESULTADO: Record<string, { texto: string; tom: BadgeTone }> = {
  ok: { texto: "Tudo certo", tom: "ok" },
  done: { texto: "Fiz", tom: "ok" },
  measured: { texto: "Medido", tom: "info" },
  problem: { texto: "Encontrou problema", tom: "danger" },
  blocked: { texto: "Não conseguiu", tom: "warn" },
  skipped: { texto: "Não soube responder", tom: "warn" },
  na: { texto: "Não se aplica", tom: "neutral" },
};

/** Códigos de motivo do celular (mobile/lib/data/fixtures.dart) em texto. */
export const MOTIVO: Record<string, string> = {
  // Impedimentos
  no_tool: "Falta ferramenta",
  running: "Equipamento funcionando",
  stopped_other: "Parado para outro serviço",
  no_material: "Falta material",
  need_tech: "Precisa de apoio técnico",
  unsafe: "Lugar inseguro",
  need_help: "Pediu ajuda para medir",
  // Problemas
  hot: "Muito quente",
  noise: "Barulho estranho",
  vibration: "Vibração forte",
  loose: "Parafuso ou base solta",
  play: "Folga",
  cable: "Cabo danificado",
  burnt: "Cheiro de queimado",
  dust: "Coberto de poeira",
  oil_leak: "Vazando óleo",
  low_oil: "Pouco óleo",
  grease_leak: "Graxa vazando",
  weak: "Não vibra ou vibra fraco",
  worn: "Gasto, rachado ou quebrado",
  loose_belt: "Correia frouxa",
  misaligned: "Fora do lugar",
  bucket: "Caneca solta",
  splice: "Emenda danificada",
  dirty: "Muita sujeira",
  out_of_range: "Medição fora do normal",
  other: "Outro (ouça o áudio)",
};
