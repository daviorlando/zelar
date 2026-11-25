import { describe, expect, it } from "vitest";
import { todasAsLinhas } from "./todas-as-linhas";

describe("todasAsLinhas", () => {
  it("não para na página curta quando o servidor corta abaixo de 1000 (max_rows menor)", async () => {
    const tabela = Array.from({ length: 2500 }, (_, i) => i);
    const pedidos: [number, number][] = [];
    const { data, error } = await todasAsLinhas<number>(async (de, ate) => {
      pedidos.push([de, ate]);
      return { data: tabela.slice(de, Math.min(ate + 1, de + 300)), error: null };
    });
    expect(error).toBeNull();
    expect(data).toEqual(tabela);
    expect(pedidos[1]).toEqual([300, 1299]);
  });
});
