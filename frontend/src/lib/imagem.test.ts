import { describe, expect, it } from "vitest";
import { aproximar, centralizar, prender, recorteDe } from "./imagem";

describe("enquadramento da foto da máquina", () => {
  it("começa com o quadrado do meio da foto deitada", () => {
    const e = centralizar(2400, 1800, 300);
    expect(recorteDe(e)).toEqual({ x: 300, y: 0, lado: 1800 });
  });

  it("foto em pé: o quadrado do meio, na vertical", () => {
    expect(recorteDe(centralizar(1000, 2000, 400))).toEqual({ x: 0, y: 500, lado: 1000 });
  });

  it("arrastar além da borda para na borda: nunca sobra espaço vazio", () => {
    const e = prender({ ...centralizar(2400, 1800, 300), x: 999, y: -999 });
    expect(recorteDe(e)).toEqual({ x: 0, y: 0, lado: 1800 });
    const fim = prender({ ...centralizar(2400, 1800, 300), x: -9999 });
    expect(recorteDe(fim).x).toBeCloseTo(600);
  });

  it("aproximar mantém o centro e diminui o pedaço recortado", () => {
    const e = aproximar(centralizar(2400, 1800, 300), 2);
    const r = recorteDe(e);
    expect(r.lado).toBeCloseTo(900);
    expect(r.x + r.lado / 2).toBeCloseTo(1200);
    expect(r.y + r.lado / 2).toBeCloseTo(900);
  });

  it("zoom fica entre 1 e 4", () => {
    expect(aproximar(centralizar(800, 600, 300), 0.2).zoom).toBe(1);
    expect(aproximar(centralizar(800, 600, 300), 10).zoom).toBe(4);
  });
});
