// Calendário das ordens (escopo v0.5, seção 7): calendário fixo, no fuso da unidade.
// Função pura e determinística: recebe "hoje" e devolve os períodos da janela.
// Quem grava é a função gerar_ordens do banco, com upsert pela chave estável.

import type { Frequencia } from "@/lib/plano";

export const FUSO_DA_UNIDADE = "America/Sao_Paulo";
export const JANELA_DIAS = 60;

/** Data de calendário sem hora, "AAAA-MM-DD". */
export type Dia = string;

export type Periodo = { frequency: Frequencia; period_start: Dia; period_end: Dia };

/** Hoje no fuso da unidade (o servidor roda em UTC: às 22h de Brasília já é amanhã lá). */
export function hojeNaUnidade(agora = new Date()): Dia {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DA_UNIDADE, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

// Aritmética em UTC ao meio-dia: sem horário de verão, sem dia pulado.
const paraData = (d: Dia) => new Date(`${d}T12:00:00Z`);
const paraDia = (d: Date): Dia => d.toISOString().slice(0, 10);
export const somarDias = (d: Dia, n: number): Dia => {
  const x = paraData(d);
  x.setUTCDate(x.getUTCDate() + n);
  return paraDia(x);
};
const dia = (ano: number, mes0: number, d: number): Dia => paraDia(new Date(Date.UTC(ano, mes0, d, 12)));
/** Último dia do mês: o dia 0 do mês seguinte (trata fevereiro e ano bissexto). */
const fimDoMes = (ano: number, mes0: number): Dia => dia(ano, mes0 + 1, 0);

/** Meses por período e o primeiro mês de cada um (jan; jan/abr/jul/out; jan/jul). */
const MESES: Record<Exclude<Frequencia, "daily" | "weekly">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** O período de uma frequência que contém a data. Semana de segunda a domingo. */
export function periodoQueContem(frequency: Frequencia, d: Dia): Periodo {
  if (frequency === "daily") return { frequency, period_start: d, period_end: d };
  if (frequency === "weekly") {
    const semana = (paraData(d).getUTCDay() + 6) % 7; // segunda = 0
    const inicio = somarDias(d, -semana);
    return { frequency, period_start: inicio, period_end: somarDias(inicio, 6) };
  }
  const x = paraData(d);
  const meses = MESES[frequency];
  const mesInicial = Math.floor(x.getUTCMonth() / meses) * meses;
  return {
    frequency,
    period_start: dia(x.getUTCFullYear(), mesInicial, 1),
    period_end: fimDoMes(x.getUTCFullYear(), mesInicial + meses - 1),
  };
}

/**
 * Períodos que tocam a janela [hoje, hoje + dias]: o período em curso (mesmo que
 * tenha começado antes) e os que começam até o fim da janela. Vencimento = fim do período.
 */
export function periodosDaJanela(frequency: Frequencia, hoje: Dia, dias = JANELA_DIAS): Periodo[] {
  const fim = somarDias(hoje, dias);
  const out: Periodo[] = [];
  let p = periodoQueContem(frequency, hoje);
  while (p.period_start <= fim) {
    out.push(p);
    p = periodoQueContem(frequency, somarDias(p.period_end, 1));
  }
  return out;
}
