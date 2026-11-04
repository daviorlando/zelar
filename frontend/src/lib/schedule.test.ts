import { describe, expect, it } from "vitest";
import { FREQUENCIAS } from "@/lib/plano";
import { hojeNaUnidade, periodoQueContem, periodosDaJanela } from "./schedule";

describe("periodoQueContem", () => {
  it("semana vai de segunda a domingo", () => {
    // 29/10/2026 é quinta-feira.
    expect(periodoQueContem("weekly", "2026-10-29")).toMatchObject({ period_start: "2026-10-26", period_end: "2026-11-01" });
    expect(periodoQueContem("weekly", "2026-11-01")).toMatchObject({ period_start: "2026-10-26" }); // domingo
    expect(periodoQueContem("weekly", "2026-11-02")).toMatchObject({ period_start: "2026-11-02" }); // segunda
  });

  it("semana que atravessa a virada de ano", () => {
    expect(periodoQueContem("weekly", "2027-01-01")).toMatchObject({ period_start: "2026-12-28", period_end: "2027-01-03" });
  });

  it("mês curto e fevereiro bissexto", () => {
    expect(periodoQueContem("monthly", "2027-02-10")).toMatchObject({ period_start: "2027-02-01", period_end: "2027-02-28" });
    expect(periodoQueContem("monthly", "2028-02-10")).toMatchObject({ period_start: "2028-02-01", period_end: "2028-02-29" });
    expect(periodoQueContem("monthly", "2026-04-30")).toMatchObject({ period_end: "2026-04-30" });
  });

  it("trimestres começam em jan, abr, jul e out", () => {
    expect(periodoQueContem("quarterly", "2026-10-29")).toMatchObject({ period_start: "2026-10-01", period_end: "2026-12-31" });
    expect(periodoQueContem("quarterly", "2026-05-15")).toMatchObject({ period_start: "2026-04-01", period_end: "2026-06-30" });
  });

  it("semestres em jan e jul; ano inteiro", () => {
    expect(periodoQueContem("semiannual", "2026-10-29")).toMatchObject({ period_start: "2026-07-01", period_end: "2026-12-31" });
    expect(periodoQueContem("semiannual", "2026-03-01")).toMatchObject({ period_start: "2026-01-01", period_end: "2026-06-30" });
    expect(periodoQueContem("annual", "2026-10-29")).toMatchObject({ period_start: "2026-01-01", period_end: "2026-12-31" });
  });
});

describe("periodosDaJanela", () => {
  it("diária: um período por dia, de hoje até 60 dias depois", () => {
    const p = periodosDaJanela("daily", "2026-10-29");
    expect(p).toHaveLength(61);
    expect(p[0].period_start).toBe("2026-10-29");
    expect(p.at(-1)!.period_start).toBe("2026-12-28");
  });

  it("inclui o período em curso e os que começam dentro da janela", () => {
    expect(periodosDaJanela("monthly", "2026-10-29").map((p) => p.period_start)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]);
    expect(periodosDaJanela("quarterly", "2026-10-29").map((p) => p.period_start)).toEqual(["2026-10-01"]);
    expect(periodosDaJanela("annual", "2026-11-15").map((p) => p.period_start)).toEqual(["2026-01-01", "2027-01-01"]);
  });

  it("vira o ano sem pular nem repetir dias", () => {
    const p = periodosDaJanela("daily", "2026-12-20", 20).map((x) => x.period_start);
    expect(p).toContain("2026-12-31");
    expect(p).toContain("2027-01-01");
    expect(new Set(p).size).toBe(p.length);
  });

  it("é determinística: rodar duas vezes dá o mesmo resultado", () => {
    for (const f of FREQUENCIAS) expect(periodosDaJanela(f, "2026-10-29")).toEqual(periodosDaJanela(f, "2026-10-29"));
  });

  it("períodos seguidos não se sobrepõem nem deixam buraco", () => {
    for (const f of FREQUENCIAS) {
      const p = periodosDaJanela(f, "2026-10-29", 400);
      for (let i = 1; i < p.length; i++) {
        const fimAnterior = new Date(`${p[i - 1].period_end}T12:00:00Z`);
        fimAnterior.setUTCDate(fimAnterior.getUTCDate() + 1);
        expect(p[i].period_start).toBe(fimAnterior.toISOString().slice(0, 10));
      }
    }
  });
});

describe("hojeNaUnidade", () => {
  it("usa o fuso de Brasília, não o UTC do servidor", () => {
    // 02h UTC de 30/10 ainda é 29/10 em São Paulo (UTC-3).
    expect(hojeNaUnidade(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29");
    expect(hojeNaUnidade(new Date("2026-10-30T03:00:00Z"))).toBe("2026-10-30");
  });
});
