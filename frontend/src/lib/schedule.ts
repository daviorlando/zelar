// Calendário das ordens (escopo v0.5, seção 7), no fuso da unidade: calendário fixo até o
// trimestre; semestral e anual contam a partir do início do setor (ver MESES_DO_CICLO).
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

const diasEntre = (de: Dia, ate: Dia) => Math.round((paraData(ate).getTime() - paraData(de).getTime()) / 86_400_000) + 1;

/** Mesmo dia, n meses depois. Se o mês for mais curto, cai no último dia dele (31/08 + 6 = 28/02). */
function somarMeses(d: Dia, n: number): Dia {
  const x = paraData(d);
  const total = x.getUTCMonth() + n;
  const ultimo = Number(fimDoMes(x.getUTCFullYear(), total).slice(8));
  return dia(x.getUTCFullYear(), total, Math.min(x.getUTCDate(), ultimo));
}

/**
 * Semestral e anual contam a partir do início do setor, não do calendário: começando em
 * 04/11/2026, a anual vence em 04/11/2027 e a semestral em 04/05/2027. No calendário,
 * elas venceriam junto logo depois do início ou só 14 meses depois.
 */
const MESES_DO_CICLO: Partial<Record<Frequencia, number>> = { semiannual: 6, annual: 12 };

function cicloDoSetor(frequency: Frequencia, inicio: Dia, meses: number, n: number): Periodo {
  return {
    frequency,
    period_start: n === 0 ? inicio : somarDias(somarMeses(inicio, meses * n), 1),
    period_end: somarMeses(inicio, meses * (n + 1)),
  };
}

/**
 * A primeira ocorrência de um setor que começa em `inicio`. Nas frequências de calendário,
 * começar no meio de um período só conta se restar pelo menos metade dele: sem isso,
 * um início em 20/12 faria mensal e trimestral vencerem em 31/12, com poucos dias de prazo.
 */
export function primeiroPeriodo(frequency: Frequencia, inicio: Dia): Periodo {
  const meses = MESES_DO_CICLO[frequency];
  if (meses) return cicloDoSetor(frequency, inicio, meses, 0);
  const p = periodoQueContem(frequency, inicio);
  if (frequency === "daily") return p;
  const metadeOuMais = diasEntre(inicio, p.period_end) * 2 >= diasEntre(p.period_start, p.period_end);
  return metadeOuMais ? p : periodoQueContem(frequency, somarDias(p.period_end, 1));
}

/**
 * Períodos de um setor iniciado em `inicio`, do que está em curso até o fim da janela,
 * sem nada antes da primeira ocorrência. Dias perdidos entre o início e hoje não são recriados.
 */
export function periodosDoSetor(frequency: Frequencia, hoje: Dia, inicio: Dia, dias = JANELA_DIAS): Periodo[] {
  const fim = somarDias(hoje, dias);
  const out: Periodo[] = [];
  const meses = MESES_DO_CICLO[frequency];
  if (meses) {
    let n = 0;
    while (cicloDoSetor(frequency, inicio, meses, n).period_end < hoje) n++;
    for (let p = cicloDoSetor(frequency, inicio, meses, n); p.period_start <= fim; p = cicloDoSetor(frequency, inicio, meses, ++n)) out.push(p);
    return out;
  }
  const primeiro = primeiroPeriodo(frequency, inicio);
  const atual = periodoQueContem(frequency, hoje);
  let p = primeiro.period_start > atual.period_start ? primeiro : atual;
  while (p.period_start <= fim) {
    out.push(p);
    p = periodoQueContem(frequency, somarDias(p.period_end, 1));
  }
  return out;
}
