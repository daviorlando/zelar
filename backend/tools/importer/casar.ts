// Casa as linhas da planilha com as atividades já importadas, pelo conteúdo: setor, frequência,
// tag (sem tag, os nomes do equipamento e do componente), texto e ocorrência. Aba e linha servem
// só para ordenar: inserir uma linha no meio ou renomear a aba não muda a identidade de nada.
import { type Frequency, normalizeTag } from "./normalize";
import type { PlanRow } from "./parse";

/** Atividade que veio da planilha (source_sheet preenchido), como está no banco. */
export interface AtividadeImportada {
  id: string;
  /** Null: importada quando a identidade ainda era aba + linha. */
  key: string | null;
  sheet: string;
  row: number;
  sector: string;
  frequency: Frequency;
  tagRaw: string | null;
  equipmentName: string | null;
  componentName: string | null;
  activity: string;
  reviewed: boolean;
  retired: boolean;
}

export interface Casamento {
  /** Chave de cada linha da planilha, na mesma ordem. */
  keys: string[];
  /** Atividade do banco que corresponde a cada linha da planilha (null: atividade nova). */
  ids: (string | null)[];
  /** Setores com atividades em uso no banco que não estão na planilha. */
  setoresSumidos: string[];
}

type Conteudo = Pick<PlanRow, "sector" | "frequency" | "tag" | "equipmentName" | "componentName" | "activity">;

/** A mesma atividade repetida no mesmo lugar vira ocorrência 1, 2, 3… na ordem da planilha. */
function chaves(itens: Conteudo[]): string[] {
  const vistas = new Map<string, number>();
  return itens.map((a) => {
    const onde = a.tag ?? `${a.equipmentName ?? ""} / ${a.componentName ?? ""}`;
    const partes = [a.sector, a.frequency, onde, a.activity.trim().replace(/\s+/g, " ")];
    const base = JSON.stringify(partes);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return JSON.stringify([...partes, n]);
  });
}

const tagDe = (a: AtividadeImportada) => (a.tagRaw ? normalizeTag(a.tagRaw) : null);

export function casarAtividades(rows: PlanRow[], banco: AtividadeImportada[]): Casamento {
  const keys = chaves(rows);
  const porChave = new Map(banco.flatMap((a) => (a.key ? [[a.key, a.id] as const] : [])));
  const ids = keys.map((k) => porChave.get(k) ?? null);

  // Importadas antes: a chave sai do que está gravado, que é o que a planilha dizia.
  const antigas = banco.filter((a) => !a.key).sort((x, y) => x.sheet.localeCompare(y.sheet) || x.row - y.row);
  const chavesAntigas = chaves(antigas.map((a) => ({ ...a, tag: tagDe(a) })));
  const livres = new Map(keys.flatMap((k, i) => (ids[i] ? [] : [[k, i] as const])));
  const semPar: AtividadeImportada[] = [];
  antigas.forEach((a, j) => {
    const i = livres.get(chavesAntigas[j]);
    if (i === undefined) {
      semPar.push(a);
      return;
    }
    ids[i] = a.id;
    livres.delete(chavesAntigas[j]);
  });
  // Revisada no painel antes da chave existir: texto, frequência ou setor podem ter mudado.
  // Se a mesma aba e linha ainda trazem a mesma tag e ninguém mais ficou com ela, é a mesma.
  for (const a of semPar.filter((a) => a.reviewed)) {
    const i = rows.findIndex((r) => r.source.sheet === a.sheet && r.source.row === a.row);
    if (i >= 0 && ids[i] === null && rows[i].tag === tagDe(a)) ids[i] = a.id;
  }

  // Aba que sumiu (ou foi trocada por outro setor): as atividades dela ficariam em uso ao lado
  // das novas. A importação não decide isso sozinha.
  const setores = new Set(rows.map((r) => r.sector));
  const setoresSumidos = [...new Set(banco.filter((a) => !a.reviewed && !a.retired && !setores.has(a.sector)).map((a) => a.sector))].sort();
  return { keys, ids, setoresSumidos };
}
