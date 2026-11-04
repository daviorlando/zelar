import { describe, expect, it } from "vitest";
import { FREQUENCIAS } from "@/lib/plano";
import { hojeNaUnidade, periodoQueContem, periodosDaJanela, periodosDoSetor, primeiroPeriodo } from "./schedule";

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

describe("primeiroPeriodo", () => {
  it("diária começa no próprio dia", () => {
    expect(primeiroPeriodo("daily", "2026-12-20")).toMatchObject({ period_start: "2026-12-20", period_end: "2026-12-20" });
  });

  it("início perto do fim empurra mensal e trimestral para o período seguinte", () => {
    expect(primeiroPeriodo("monthly", "2026-12-20")).toMatchObject({ period_start: "2027-01-01" });
    expect(primeiroPeriodo("quarterly", "2026-12-20")).toMatchObject({ period_start: "2027-01-01" });
  });

  it("semestral e anual vencem um ciclo inteiro depois do início", () => {
    expect(primeiroPeriodo("annual", "2026-11-04")).toMatchObject({ period_start: "2026-11-04", period_end: "2027-11-04" });
    expect(primeiroPeriodo("semiannual", "2026-11-04")).toMatchObject({ period_start: "2026-11-04", period_end: "2027-05-04" });
  });

  it("mês mais curto no vencimento cai no último dia", () => {
    expect(primeiroPeriodo("semiannual", "2026-08-31")).toMatchObject({ period_end: "2027-02-28" });
    expect(primeiroPeriodo("semiannual", "2027-08-31")).toMatchObject({ period_end: "2028-02-29" });
    expect(primeiroPeriodo("annual", "2028-02-29")).toMatchObject({ period_end: "2029-02-28" });
  });

  it("restando pelo menos metade, o período em andamento conta", () => {
    expect(primeiroPeriodo("monthly", "2026-11-16")).toMatchObject({ period_start: "2026-11-01" }); // 15 de 30 dias
    expect(primeiroPeriodo("monthly", "2026-11-17")).toMatchObject({ period_start: "2026-12-01" }); // 14 de 30 dias
    expect(primeiroPeriodo("weekly", "2026-11-05")).toMatchObject({ period_start: "2026-11-02" }); // quinta: 4 de 7
    expect(primeiroPeriodo("weekly", "2026-11-06")).toMatchObject({ period_start: "2026-11-09" }); // sexta: 3 de 7
    expect(primeiroPeriodo("quarterly", "2026-11-04")).toMatchObject({ period_start: "2026-10-01", period_end: "2026-12-31" });
  });

  it("primeiro dia do período sempre conta; fevereiro bissexto no limite", () => {
    expect(primeiroPeriodo("monthly", "2027-01-01")).toMatchObject({ period_start: "2027-01-01" });
    expect(primeiroPeriodo("monthly", "2028-02-15")).toMatchObject({ period_start: "2028-02-01" }); // 15 de 29
    expect(primeiroPeriodo("monthly", "2028-02-16")).toMatchObject({ period_start: "2028-03-01" }); // 14 de 29
  });
});

describe("periodosDoSetor", () => {
  it("nada antes da primeira ocorrência", () => {
    const p = periodosDoSetor("monthly", "2026-12-20", "2026-12-20");
    expect(p[0].period_start).toBe("2027-01-01");
    expect(p.every((x) => x.period_start >= "2027-01-01")).toBe(true);
  });

  it("início futuro: só o que cabe na janela de 60 dias", () => {
    expect(periodosDoSetor("daily", "2026-11-04", "2027-06-01")).toEqual([]);
    const perto = periodosDoSetor("daily", "2026-11-04", "2026-12-01");
    expect(perto[0].period_start).toBe("2026-12-01");
    expect(perto.at(-1)?.period_start).toBe("2027-01-03");
  });

  it("depois do início segue o calendário sem recriar dias perdidos", () => {
    const p = periodosDoSetor("daily", "2026-11-10", "2026-11-04");
    expect(p[0].period_start).toBe("2026-11-10");
    expect(p).toEqual(periodosDaJanela("daily", "2026-11-10"));
  });

  it("período adiado passa a valer quando chega", () => {
    expect(periodosDoSetor("monthly", "2027-01-05", "2026-12-20")[0].period_start).toBe("2027-01-01");
  });

  it("ciclo semestral e anual: emenda sem buraco e mantém o mesmo dia", () => {
    expect(periodosDoSetor("annual", "2027-11-04", "2026-11-04")[0]).toMatchObject({ period_start: "2026-11-04", period_end: "2027-11-04" });
    expect(periodosDoSetor("annual", "2027-11-05", "2026-11-04")[0]).toMatchObject({ period_start: "2027-11-05", period_end: "2028-11-04" });
    expect(periodosDoSetor("semiannual", "2027-06-01", "2026-11-04")[0]).toMatchObject({ period_start: "2027-05-05", period_end: "2027-11-04" });
  });

  it("ciclo perto de vencer já traz o próximo, dentro da janela", () => {
    const p = periodosDoSetor("annual", "2027-10-01", "2026-11-04");
    expect(p.map((x) => x.period_start)).toEqual(["2026-11-04", "2027-11-05"]);
  });

  it("início futuro: ciclo só aparece quando entra na janela", () => {
    expect(periodosDoSetor("annual", "2026-11-04", "2027-06-01")).toEqual([]);
    expect(periodosDoSetor("annual", "2026-11-04", "2026-12-01")).toHaveLength(1);
  });

  it("gerar duas vezes no mesmo dia dá o mesmo resultado", () => {
    expect(periodosDoSetor("weekly", "2026-11-04", "2026-11-04")).toEqual(periodosDoSetor("weekly", "2026-11-04", "2026-11-04"));
  });
});
