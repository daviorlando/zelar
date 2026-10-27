import { describe, expect, it } from "vitest";
import { frequencyFromHeader, hasMultipleActions, instructionKind, normalizeTag, parentTag, suggestItemType, tagSector } from "./normalize";

describe("normalizeTag", () => {
  it.each([
    ["B- EST - ME", "B - EST - ME"],
    ["\nB- EST - ME", "B - EST - ME"],
    ["B - BMAT- CT1", "B - BMAT - CT1"],
    ["a - bman - rol1 ", "A - BMAN - ROL1"],
    ["A - BMAN - ME", "A - BMAN - ME"],
  ])("%j -> %s", (raw, expected) => expect(normalizeTag(raw)).toBe(expected));

  it("não troca o prefixo de setor", () => {
    expect(tagSector(normalizeTag("C - RT - ME"))).toBe("C");
  });
});

describe("parentTag", () => {
  it("componente aponta para o equipamento principal", () => expect(parentTag("A - BMAN - ME")).toBe("A - BMAN"));
  it("equipamento principal não tem pai", () => expect(parentTag("A - BMAN")).toBeNull());
});

describe("frequencyFromHeader", () => {
  it("aceita espaços no fim", () => {
    expect(frequencyFromHeader("TRIMESTRAL ")).toBe("quarterly");
    expect(frequencyFromHeader("ANUAL ")).toBe("annual");
  });
  it("ignora outros textos", () => expect(frequencyFromHeader("Sistemas e Equipamentos")).toBeNull());
});

describe("instructionKind e sugestões", () => {
  it("padroniza plural e (se aplicável)", () => {
    expect(instructionKind("Limpezas: remover poeira")).toBe("limpeza");
    expect(instructionKind("Lubrificação (se aplicável): aplicar graxa")).toBe("lubrificação");
    expect(instructionKind("Verificação de Tensão: medir")).toBe("verificação de tensão e corrente");
  });
  it("sugere o tipo de resposta", () => {
    expect(suggestItemType("inspeção visual")).toBe("inspection");
    expect(suggestItemType("limpeza")).toBe("action");
    expect(suggestItemType("medição de temperatura")).toBe("measurement");
    expect(suggestItemType("verificação de tensão e corrente")).toBe("measurement");
  });
  it("marca textos com várias ações", () => {
    expect(hasMultipleActions("Limpeza: remover poeira; verificar fixação")).toBe(true);
    expect(hasMultipleActions("Inspeção Visual: Verificar vazamentos.")).toBe(false);
  });
});
