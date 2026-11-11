import { describe, expect, it } from "vitest";
import { type AtividadeImportada, casarAtividades } from "./casar";
import type { PlanRow } from "./parse";

const linha = (sheet: string, row: number, tag: string | null, activity: string, extra: Partial<PlanRow> = {}): PlanRow => ({
  source: { file: "plano.xlsx", sheet, row },
  sector: "A",
  frequency: "weekly",
  equipmentName: "Moinho",
  componentName: null,
  tagOriginal: tag,
  tag,
  activity,
  instructionKind: "inspeção visual",
  suggestedType: "inspection",
  suggestedQualification: null,
  multipleActions: false,
  issues: [],
  ...extra,
});

/** Como a carga grava: chave, aba, linha e o texto que veio da planilha. */
const noBanco = (r: PlanRow, id: string, key: string | null, extra: Partial<AtividadeImportada> = {}): AtividadeImportada => ({
  id,
  key,
  sheet: r.source.sheet,
  row: r.source.row,
  sector: r.sector,
  frequency: r.frequency,
  tagRaw: r.tagOriginal,
  equipmentName: r.equipmentName,
  componentName: r.componentName,
  activity: r.activity,
  reviewed: false,
  retired: false,
  ...extra,
});

const antes = [
  linha("Setor A", 5, "A - MOI", "Inspeção Visual: vazamentos"),
  linha("Setor A", 6, "A - MOI", "Limpeza: remover pó"),
  linha("Setor A", 7, "A - MOI - ME", "Inspeção Visual: vazamentos"),
];
// Linha nova no meio e aba renomeada: as de baixo descem uma linha.
const depois = [
  linha("Setor A - Moagem", 5, "A - MOI", "Inspeção Visual: vazamentos"),
  linha("Setor A - Moagem", 6, "A - MOI", "Reaperto: parafusos da base"),
  linha("Setor A - Moagem", 7, "A - MOI", "Limpeza: remover pó"),
  linha("Setor A - Moagem", 8, "A - MOI - ME", "Inspeção Visual: vazamentos"),
];

describe("casarAtividades", () => {
  it("planilha deslocada e aba renomeada: cada atividade continua a mesma, só a nova entra", () => {
    const { keys } = casarAtividades(antes, []);
    const banco = antes.map((r, i) => noBanco(r, `id${i}`, keys[i]));
    const r = casarAtividades(depois, banco);
    expect(r.ids).toEqual(["id0", null, "id1", "id2"]);
    expect(r.keys[2]).toBe(keys[1]);
    expect(r.setoresSumidos).toEqual([]);
  });

  it("importadas por aba + linha (sem chave) casam pelo conteúdo, não pela linha", () => {
    const banco = antes.map((r, i) => noBanco(r, `id${i}`, null));
    expect(casarAtividades(depois, banco).ids).toEqual(["id0", null, "id1", "id2"]);
  });

  it("atividade revisada no painel continua casada, mesmo com o texto mudado", () => {
    const { keys } = casarAtividades(antes, []);
    const banco = antes.map((r, i) => noBanco(r, `id${i}`, keys[i]));
    banco[1] = { ...banco[1], activity: "Limpeza geral", frequency: "monthly", reviewed: true };
    expect(casarAtividades(depois, banco).ids).toEqual(["id0", null, "id1", "id2"]);
  });

  it("sem chave e revisada com outro texto: vale a mesma aba e linha se a tag bate", () => {
    const banco = antes.map((r, i) => noBanco(r, `id${i}`, null));
    banco[1] = { ...banco[1], activity: "Limpeza geral", reviewed: true };
    expect(casarAtividades(antes, banco).ids).toEqual(["id0", "id1", "id2"]);
  });

  it("a mesma atividade repetida no mesmo lugar não vira uma só", () => {
    const repetidas = [linha("Setor A", 5, "A - MOI", "Limpeza"), linha("Setor A", 6, "A - MOI", "Limpeza")];
    const { keys } = casarAtividades(repetidas, []);
    expect(new Set(keys).size).toBe(2);
    const banco = repetidas.map((r, i) => noBanco(r, `id${i}`, keys[i]));
    expect(casarAtividades(repetidas, banco).ids).toEqual(["id0", "id1"]);
  });

  it("acusa o setor que tem atividades em uso e sumiu da planilha", () => {
    const { keys } = casarAtividades(antes, []);
    const banco = [
      ...antes.map((r, i) => noBanco(r, `id${i}`, keys[i])),
      noBanco(linha("Setor B", 5, "B - EST", "Limpeza", { sector: "B" }), "b1", "x"),
      noBanco(linha("Setor C", 5, "C - RT", "Limpeza", { sector: "C" }), "c1", "y", { reviewed: true }),
    ];
    expect(casarAtividades(depois, banco).setoresSumidos).toEqual(["B"]);
  });
});
