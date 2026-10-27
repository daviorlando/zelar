import ExcelJS from "exceljs";
import {
  type Frequency,
  type ItemType,
  frequencyFromHeader,
  hasMultipleActions,
  instructionKind,
  normalizeTag,
  parentTag,
  suggestItemType,
  suggestQualification,
  tagSector,
} from "./normalize";

export interface PlanRow {
  source: { file: string; sheet: string; row: number };
  sector: string;
  frequency: Frequency;
  equipmentName: string | null;
  componentName: string | null;
  tagOriginal: string | null;
  tag: string | null;
  activity: string;
  instructionKind: string;
  suggestedType: ItemType;
  suggestedQualification: string | null;
  multipleActions: boolean;
  issues: string[];
}

export interface CatalogEntry {
  source: { sheet: string; row: number };
  sector: string;
  tagOriginal: string;
  tag: string;
  parentTag: string | null;
  name: string | null;
  brand: string | null;
  model: string | null;
  powerCv: number | null;
  rpm: number | null;
  workingTemp: string | null;
  lubricant: string | null;
}

export interface ParseResult {
  rows: PlanRow[];
  catalog: CatalogEntry[];
}

const CATALOG_SHEET = "Lista de Equipamentos por setor";

function text(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return text(value.richText.map((t) => t.text).join(""));
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("text" in value) return text(value.text as string);
  }
  return null;
}

function num(value: ExcelJS.CellValue): number | null {
  const t = text(value);
  if (t == null) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor da célula propagando mesclas verticais (equipamento, componente e tag
 * ocupam várias linhas). Em mesclas horizontais, como os títulos de bloco que
 * vão de A até AN, só a primeira coluna tem valor.
 */
function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string | null {
  const cell = ws.getCell(row, col);
  if (!cell.isMerged) return text(cell.value);
  return Number(cell.master.col) === col ? text(cell.master.value) : null;
}

/** Célula escrava de uma mescla vertical: não é uma nova atividade. */
function isMergedSlave(ws: ExcelJS.Worksheet, row: number, col: number): boolean {
  const cell = ws.getCell(row, col);
  return cell.isMerged && cell.master.address !== cell.address;
}

function parseSectorSheet(ws: ExcelJS.Worksheet, file: string): PlanRow[] {
  const sector = /^Setor\s+([A-Z])/i.exec(ws.name)![1].toUpperCase();
  const out: PlanRow[] = [];
  let frequency: Frequency | null = null;
  let equipment: string | null = null;
  let component: string | null = null;
  let tagRaw: string | null = null;

  for (let r = 1; r <= ws.rowCount; r++) {
    const a = cellText(ws, r, 1);
    const b = cellText(ws, r, 2);
    const c = cellText(ws, r, 3);
    const d = cellText(ws, r, 4);

    const freq = frequencyFromHeader(a);
    if (freq && !b && !c && !d) {
      frequency = freq;
      equipment = component = tagRaw = null;
      continue;
    }
    if (c?.trim().toLowerCase() === "tag") continue; // linha de cabeçalho do bloco
    if (!a && !b && !c && !d) {
      equipment = component = tagRaw = null; // linha em branco separa grupos
      continue;
    }
    if (!frequency) continue; // endereço e título antes do primeiro bloco

    if (a) equipment = a.trim();
    if (b || c) {
      component = b?.trim() ?? null;
      tagRaw = c;
    }
    if (!d || isMergedSlave(ws, r, 4)) continue;

    const tag = tagRaw ? normalizeTag(tagRaw) : null;
    const kind = instructionKind(d);
    const issues: string[] = [];
    if (!equipment) issues.push("linha sem equipamento");
    if (!tag) issues.push("linha sem tag");
    else if (tagSector(tag) !== sector) issues.push(`tag com prefixo do setor ${tagSector(tag) ?? "?"} na aba do setor ${sector}`);

    out.push({
      source: { file, sheet: ws.name, row: r },
      sector,
      frequency,
      equipmentName: equipment,
      componentName: component,
      tagOriginal: tagRaw,
      tag,
      activity: d.trim(),
      instructionKind: kind,
      suggestedType: suggestItemType(kind),
      suggestedQualification: suggestQualification(kind),
      multipleActions: hasMultipleActions(d),
      issues,
    });
  }
  return out;
}

function parseCatalog(ws: ExcelJS.Worksheet): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  let sector: string | null = null;
  for (let r = 2; r <= ws.rowCount; r++) {
    const sigla = cellText(ws, r, 1);
    if (!sigla) continue;
    const header = /^SETOR\s+([A-Z])$/i.exec(sigla.trim());
    if (header) {
      sector = header[1].toUpperCase();
      continue;
    }
    if (!sigla.includes("-")) continue;
    const tag = normalizeTag(sigla);
    out.push({
      source: { sheet: ws.name, row: r },
      sector: sector ?? tagSector(tag) ?? "?",
      tagOriginal: sigla,
      tag,
      parentTag: parentTag(tag),
      name: cellText(ws, r, 2)?.trim() ?? null,
      brand: cellText(ws, r, 3),
      model: cellText(ws, r, 4),
      powerCv: num(ws.getCell(r, 5).value),
      rpm: num(ws.getCell(r, 6).value),
      workingTemp: cellText(ws, r, 7),
      lubricant: cellText(ws, r, 8),
    });
  }
  return out;
}

export async function parseWorkbook(path: string): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const file = path.split("/").pop()!;
  const rows = wb.worksheets.filter((ws) => /^Setor\s+[A-Z]/i.test(ws.name)).flatMap((ws) => parseSectorSheet(ws, file));
  const catalogSheet = wb.getWorksheet(CATALOG_SHEET);
  const catalog = catalogSheet ? parseCatalog(catalogSheet) : [];

  const known = new Set(catalog.map((e) => e.tag));
  for (const row of rows) {
    if (row.tag && !known.has(row.tag)) row.issues.push("tag não existe no cadastro de equipamentos");
  }
  return { rows, catalog };
}
