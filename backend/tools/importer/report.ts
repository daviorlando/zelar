import ExcelJS from "exceljs";
import type { Frequency } from "./normalize";
import type { CatalogEntry, ParseResult, PlanRow } from "./parse";

const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "semiannual", "annual"];
const FREQ_LABEL: Record<Frequency, string> = {
  daily: "Diária",
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export interface Divergence {
  kind: string;
  where: string;
  detail: string;
}

/** Potência e RPM escritas no nome do componente na aba × valores do cadastro. */
export function specDivergences({ rows, catalog }: ParseResult): Divergence[] {
  const byTag = new Map(catalog.map((e) => [e.tag, e]));
  const seen = new Set<string>();
  const out: Divergence[] = [];
  for (const row of rows) {
    if (!row.tag || !row.componentName || seen.has(row.tag)) continue;
    const entry = byTag.get(row.tag);
    if (!entry) continue;
    const cv = /(\d+(?:[.,]\d+)?)\s*C(?:V)?\b/i.exec(row.componentName)?.[1];
    const rpm = /(\d{3,4})\s*RPM/i.exec(row.componentName)?.[1];
    const tabCv = cv ? Number(cv.replace(",", ".")) : null;
    const tabRpm = rpm ? Number(rpm) : null;
    if ((tabCv != null && entry.powerCv != null && tabCv !== entry.powerCv) || (tabRpm != null && entry.rpm != null && tabRpm !== entry.rpm)) {
      seen.add(row.tag);
      out.push({
        kind: "potência/RPM diferente do cadastro",
        where: `${row.source.sheet}, linha ${row.source.row}; cadastro linha ${entry.source.row}`,
        detail: `${row.tag}: aba "${row.componentName}" × cadastro ${entry.powerCv ?? "?"} CV / ${entry.rpm ?? "?"} RPM`,
      });
    }
  }
  return out;
}

export function summary(rows: PlanRow[]) {
  const sectors = [...new Set(rows.map((r) => r.sector))].sort();
  const table = sectors.map((s) => {
    const counts = Object.fromEntries(FREQUENCIES.map((f) => [f, rows.filter((r) => r.sector === s && r.frequency === f).length])) as Record<Frequency, number>;
    return { sector: s, ...counts, total: rows.filter((r) => r.sector === s).length };
  });
  const totals = Object.fromEntries(FREQUENCIES.map((f) => [f, rows.filter((r) => r.frequency === f).length])) as Record<Frequency, number>;
  return { table, totals: { ...totals, total: rows.length } };
}

function addSheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[], data: object[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns;
  ws.addRows(data);
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function writeReport(path: string, result: ParseResult, divergences: Divergence[]) {
  const { rows, catalog } = result;
  const wb = new ExcelJS.Workbook();
  const s = summary(rows);

  addSheet(
    wb,
    "Resumo",
    [{ header: "Setor", key: "sector", width: 10 }, ...FREQUENCIES.map((f) => ({ header: FREQ_LABEL[f], key: f, width: 12 })), { header: "Total", key: "total", width: 10 }],
    [...s.table, { sector: "Total", ...s.totals }],
  );

  addSheet(
    wb,
    "Linhas",
    [
      { header: "Aba", key: "sheet", width: 16 },
      { header: "Linha", key: "row", width: 7 },
      { header: "Setor", key: "sector", width: 7 },
      { header: "Frequência", key: "freq", width: 12 },
      { header: "Equipamento", key: "equipmentName", width: 30 },
      { header: "Componente", key: "componentName", width: 26 },
      { header: "Tag original", key: "tagOriginal", width: 18 },
      { header: "Tag normalizada", key: "tag", width: 18 },
      { header: "Atividade (texto original)", key: "activity", width: 70 },
      { header: "Tipo de instrução", key: "instructionKind", width: 28 },
      { header: "Tipo de resposta sugerido", key: "suggestedType", width: 16 },
      { header: "Qualificação sugerida", key: "suggestedQualification", width: 14 },
      { header: "Várias ações?", key: "multipleActions", width: 10 },
      { header: "Pendências", key: "issues", width: 50 },
    ],
    rows.map((r) => ({
      ...r,
      sheet: r.source.sheet,
      row: r.source.row,
      freq: FREQ_LABEL[r.frequency],
      multipleActions: r.multipleActions ? "sim" : "",
      issues: r.issues.join("; "),
    })),
  );

  const pending = [
    ...rows.flatMap((r) => r.issues.map((i) => ({ kind: i, where: `${r.source.sheet}, linha ${r.source.row}`, detail: `${r.tagOriginal ?? "(sem tag)"} — ${r.activity.slice(0, 80)}` }))),
    ...rows.filter((r) => r.tagOriginal && r.tag !== r.tagOriginal).map((r) => ({ kind: "tag normalizada (informativo)", where: `${r.source.sheet}, linha ${r.source.row}`, detail: `${JSON.stringify(r.tagOriginal)} → ${r.tag}` })),
    ...divergences,
  ];
  addSheet(wb, "Pendências", [{ header: "Tipo", key: "kind", width: 45 }, { header: "Onde", key: "where", width: 40 }, { header: "Detalhe", key: "detail", width: 90 }], pending);

  const kinds = new Map<string, PlanRow[]>();
  for (const r of rows) kinds.set(r.instructionKind, [...(kinds.get(r.instructionKind) ?? []), r]);
  addSheet(
    wb,
    "Tipos de instrução",
    [
      { header: "Tipo de instrução", key: "kind", width: 40 },
      { header: "Linhas", key: "count", width: 8 },
      { header: "Tipo de resposta sugerido", key: "type", width: 16 },
      { header: "Textos distintos", key: "variants", width: 10 },
    ],
    [...kinds.entries()]
      .map(([kind, rs]) => ({ kind, count: rs.length, type: rs[0].suggestedType, variants: new Set(rs.map((r) => r.activity)).size }))
      .sort((a, b) => b.count - a.count),
  );

  const used = new Set(rows.map((r) => r.tag));
  addSheet(
    wb,
    "Cadastro",
    [
      { header: "Linha", key: "row", width: 7 },
      { header: "Setor", key: "sector", width: 7 },
      { header: "Tag", key: "tag", width: 18 },
      { header: "Equipamento principal", key: "parentTag", width: 14 },
      { header: "Nome", key: "name", width: 30 },
      { header: "Marca", key: "brand", width: 12 },
      { header: "Modelo", key: "model", width: 14 },
      { header: "CV", key: "powerCv", width: 6 },
      { header: "RPM", key: "rpm", width: 7 },
      { header: "Lubrificante", key: "lubricant", width: 16 },
      { header: "Usado em plano?", key: "used", width: 10 },
    ],
    catalog.map((e: CatalogEntry) => ({ ...e, row: e.source.row, used: used.has(e.tag) || catalog.some((c) => c.parentTag === e.tag && used.has(c.tag)) ? "sim" : "" })),
  );

  await wb.xlsx.writeFile(path);
  return { pending: pending.length };
}
