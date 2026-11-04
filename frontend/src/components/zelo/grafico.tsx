"use client";

import { type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Empty, Loading, Notice } from "@/components/zelo/feedback";
import { cn } from "@/lib/utils";

/*
 * Visualizações da marca.
 *
 * Três regras valem para tudo aqui, e nenhuma é estética:
 *
 * 1. **Toda figura tem gêmea em tabela.** `tabela` é obrigatória no tipo, não
 *    pedida em revisão: tooltip que é o único caminho para o valor deixa de
 *    fora quem navega por teclado, quem usa leitor de tela e quem imprime.
 * 2. **Cor vem de token, sempre.** `--chart-1..5` para identidade,
 *    `--chart-passo-*` para escala com ordem, `--chart-fraco` para o que é
 *    contexto. A cor segue a ENTIDADE, nunca a posição na lista — filtrar não
 *    pode repintar quem sobrou.
 * 3. **Texto não veste a cor do dado.** Rótulo, valor e legenda ficam nos
 *    tokens de tinta; a identidade vem da marca colorida ao lado.
 *
 * Sobre o Recharts: `isAnimationActive={false}` em toda marca. A regra de
 * `prefers-reduced-motion` em `globals.css` zera `animation-duration` de CSS,
 * e o Recharts anima em JS — escaparia inteira.
 *
 * Tamanho de fonte nos eixos vai como TEXTO EM REM, nunca número: número vira
 * px absoluto no atributo do SVG, e `var(--text-xs)` não resolve de forma
 * confiável em atributo de apresentação. `tests/guardas/dimensoes.test.ts`
 * cobra.
 */

/** A altura da figura, já incluindo a faixa do eixo e a legenda. */
const ALTURAS = {
  // Inclui o eixo X: contêiner que só cabe o desenho ganha uma rolagem
  // vertical aninhada dentro do cartão, e ninguém procura o defeito ali.
  baixa: "h-[clamp(8rem,18vh,12rem)]",
  media: "h-[clamp(11rem,26vh,20rem)]",
} as const;

const EIXO = { fill: "var(--muted-foreground)", fontSize: "0.6875rem" } as const;

export interface EstadoDaFigura {
  erro?: string | null;
  carregando?: boolean;
  /** Buscando de novo com o desenho ainda na tela. */
  revalidando?: boolean;
  vazio?: boolean;
}

/**
 * A moldura de uma figura — irmã da `Lista`, e com a mesma ordem de estados:
 * erro → carregando → vazio → conteúdo.
 *
 * **Revalidar não é carregar.** Quem já viu o desenho não o perde quando a
 * tela rebusca: ele segura com opacidade reduzida e `aria-busy`. Esqueleto
 * piscando a cada troca de período é salto de layout com outro nome.
 */
export function Grafico({
  titulo,
  nota,
  acoes,
  altura = "media",
  estado = {},
  vazio = "Nada no período.",
  tabela,
  children,
}: {
  titulo: string;
  nota?: ReactNode;
  acoes?: ReactNode;
  altura?: keyof typeof ALTURAS;
  estado?: EstadoDaFigura;
  vazio?: ReactNode;
  /** Sem `?`: a gêmea em tabela é parte da figura, não um extra. */
  tabela: ReactNode;
  children: ReactNode;
}) {
  const { erro, carregando, revalidando, vazio: semDado } = estado;

  const corpo = erro ? (
    <Notice tone="error">{erro}</Notice>
  ) : carregando ? (
    <div className={ALTURAS[altura]}>
      <Loading what={titulo.toLowerCase()} rows={3} />
    </div>
  ) : semDado ? (
    // Dentro do contêiner de altura, com a moldura final já no lugar: quando o
    // dado chega, nada se move.
    <div className={cn(ALTURAS[altura], "grid place-items-center")}>
      <Empty>{vazio}</Empty>
    </div>
  ) : (
    <>
      {/* `min-w-0` além do que o `Card` já dá: o `ResponsiveContainer` mede o
          pai, e pai sem ele faz o gráfico crescer a cada render. */}
      <div className={cn(ALTURAS[altura], "min-w-0 w-full")}>{children}</div>
      <details className="mt-3 group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground">
          Ver os números
        </summary>
        <div className="mt-2">{tabela}</div>
      </details>
    </>
  );

  return (
    <section className="min-w-0 rounded-md border border-border bg-card px-[1.125rem] py-4 shadow-[var(--shadow-card)]">
      {/* `flex-wrap`: a ação do cabeçalho é uma pílula com `whitespace-nowrap`,
          e a 320px com a fonte grande ela não cabe ao lado do título. Sem
          quebrar, empurra o documento inteiro por alguns pixels — pouco o
          bastante para passar despercebido, e o suficiente para a página
          rolar de lado. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-md font-semibold text-foreground">{titulo}</h2>
        {acoes}
      </div>
      {nota && <p className="mb-3 text-xs text-muted-foreground">{nota}</p>}
      {revalidando && !erro && !carregando ? (
        <div aria-busy="true" className="opacity-60 transition-opacity">
          {corpo}
        </div>
      ) : (
        corpo
      )}
    </section>
  );
}

/** O balão do hover, em markup da casa. O valor primeiro; o nome, depois. */
export function DicaDoGrafico({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { rotulo: string; valor: string; cor?: string }[];
}) {
  return (
    <div className="rounded-sm border border-border bg-popover px-2.5 py-1.5 text-sm shadow-[var(--shadow-dialog)]">
      <div className="text-popover-foreground">{titulo}</div>
      {linhas.map((linha) => (
        <div key={linha.rotulo} className="mt-0.5 flex items-baseline gap-2">
          {linha.cor && (
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 shrink-0 rounded-full"
              style={{ background: linha.cor }}
            />
          )}
          <span className="num text-popover-foreground">{linha.valor}</span>
          <span className="text-xs text-muted-foreground">{linha.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export interface PontoDaLinha {
  /** O que vai no eixo X, já formatado para leitura. */
  x: string;
  y: number;
}

/**
 * Tendência no tempo, série única.
 *
 * Sem legenda de propósito: com uma série só, o título já diz o que está
 * plotado, e uma caixa com um quadradinho repete o título ocupando espaço.
 */
export function Linha({
  dados,
  formatarY,
  formatarDica,
  rotulo,
}: {
  dados: PontoDaLinha[];
  /** Para o eixo — curto, que ali o espaço é pouco. */
  formatarY?: (valor: number) => string;
  /** Para o balão — por extenso, que ali cabe. */
  formatarDica?: (valor: number) => string;
  rotulo: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        {/* Só horizontal, hairline sólida. Grade tracejada lê como projeção
            ou limiar, quando é só grade. */}
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="x" tickLine={false} axisLine={false} tick={EIXO} />
        <YAxis
          width={62}
          tickLine={false}
          axisLine={false}
          tick={EIXO}
          tickFormatter={formatarY}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-grid)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const ponto = payload[0]?.payload as PontoDaLinha;
            return (
              <DicaDoGrafico
                titulo={ponto.x}
                linhas={[
                  {
                    rotulo,
                    valor: formatarDica?.(ponto.y) ?? String(ponto.y),
                    cor: "var(--chart-1)",
                  },
                ]}
              />
            );
          }}
        />
        <Area
          dataKey="y"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="var(--chart-1)"
          fillOpacity={0.1}
          // O ponto ativo ganha anel na cor da superfície para continuar
          // legível onde cruza a própria linha.
          activeDot={{ r: 4, stroke: "var(--chart-vao)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface FatiaDaBarra {
  rotulo: string;
  valor: number;
  cor: string;
  /** A fatia que é o assunto. As outras recuam para `--chart-fraco`. */
  enfase?: boolean;
}

/**
 * Barras horizontais, uma por categoria.
 *
 * Horizontal porque os rótulos daqui são longos — "Aguardando revisão",
 * "Levantamento planialtimétrico" — e na vertical eles inclinam ou somem.
 *
 * Espessura limitada: barra que preenche a faixa inteira lê como bloco, e o
 * que sobra da faixa é o ar que separa uma da outra.
 */
export function Barras({
  fatias,
  formatar,
  eixo,
}: {
  fatias: FatiaDaBarra[];
  formatar?: (valor: number) => string;
  eixo: string;
}) {
  const temEnfase = fatias.some((f) => f.enfase);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={fatias}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
        barCategoryGap="28%"
      >
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" tickLine={false} axisLine={false} tick={EIXO} tickFormatter={formatar} />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={EIXO}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const fatia = payload[0]?.payload as FatiaDaBarra;
            return (
              <DicaDoGrafico
                titulo={fatia.rotulo}
                linhas={[
                  { rotulo: eixo, valor: formatar?.(fatia.valor) ?? String(fatia.valor), cor: fatia.cor },
                ]}
              />
            );
          }}
        />
        <RBar dataKey="valor" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {fatias.map((fatia) => (
            <Cell
              key={fatia.rotulo}
              fill={temEnfase && !fatia.enfase ? "var(--chart-fraco)" : fatia.cor}
            />
          ))}
        </RBar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Razão contra um limite.
 *
 * Sem Recharts: é uma barra, e uma barra é uma `div`. O trilho fica num passo
 * mais claro da MESMA rampa, para que o estado se leia ao longo da barra
 * inteira e não só no pedaço preenchido.
 */
export function Medidor({
  valor,
  total,
  rotulo,
  meta,
  formatar,
}: {
  valor: number;
  total: number;
  rotulo: string;
  /** Marca de referência, entre 0 e 1. */
  meta?: number;
  formatar?: (valor: number, total: number) => string;
}) {
  const fatia = total > 0 ? Math.max(0, Math.min(1, valor / total)) : 0;
  const texto = formatar?.(valor, total) ?? `${Math.round(fatia * 100)}%`;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{rotulo}</span>
        <span className="num text-foreground">{texto}</span>
      </div>
      {/*
        Trilho em `--muted`, e não num passo da própria rampa.
        A régua de dataviz pede "um passo mais claro da mesma rampa" — e isso
        se inverte no tema escuro, onde o passo mais claro é o MAIS BRILHANTE:
        visto na tela, um trilho verde-vivo com 5% de preenchimento escuro lê
        como barra cheia. O `Bar` da casa já resolvia assim desde sempre.
      */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${rotulo}: ${texto}`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${fatia * 100}%`, background: "var(--chart-1)" }}
        />
        {meta !== undefined && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px"
            style={{ left: `${Math.max(0, Math.min(1, meta)) * 100}%`, background: "var(--foreground)" }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Doze pontos, sem eixo e sem balão — o desenho que cabe ao lado de um número.
 *
 * SVG à mão, e não Recharts: quatro a oito faíscas numa tela seriam outros
 * tantos `ResizeObserver` medindo no primeiro quadro, e a página pipoca.
 */
export function Faisca({ pontos, rotulo }: { pontos: number[]; rotulo: string }) {
  if (pontos.length < 2) return null;

  const maior = Math.max(...pontos);
  const menor = Math.min(...pontos);
  const amplitude = maior - menor || 1;
  const passo = 100 / (pontos.length - 1);
  const y = (valor: number) => 22 - ((valor - menor) / amplitude) * 20;
  const caminho = pontos.map((valor, i) => `${i * passo},${y(valor)}`).join(" ");
  const ultimo = pontos[pontos.length - 1] ?? 0;

  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-6 w-full"
      role="img"
      aria-label={rotulo}
    >
      <polyline
        points={caminho}
        fill="none"
        stroke="var(--chart-fraco)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* O período corrente é o que a pessoa procura: ele leva a cor. */}
      <circle cx={100} cy={y(ultimo)} r={2.5} fill="var(--chart-1)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Indicador com variação e tendência — o `Stat` quando há com o que comparar.
 *
 * `direcao` e `tom` são campos separados de propósito: **gastar mais não é
 * verde**. Juntos, "Despesas +18%" sairia pintado de sucesso.
 *
 * O valor grande NÃO usa `tabular-nums`: largura igual para todo dígito faz
 * `121` parecer frouxo a 26px. A classe `.num` fica onde números alinham em
 * coluna — tabela e eixo.
 */
export function StatTile({
  rotulo,
  valor,
  delta,
  faisca,
  nota,
}: {
  rotulo: string;
  valor: ReactNode;
  delta?: { direcao: "sobe" | "desce" | "igual"; valor: string; tom: "bom" | "ruim" | "neutro"; periodo: string };
  faisca?: number[];
  nota?: ReactNode;
}) {
  const seta = { sobe: "↑", desce: "↓", igual: "→" };
  const tomDoDelta = {
    bom: "text-success",
    ruim: "text-destructive",
    neutro: "text-muted-foreground",
  };

  return (
    <div className="min-w-0 rounded-md border border-border bg-card px-[1.125rem] py-4 shadow-[var(--shadow-card)]">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</div>
      <div className="mt-0.5 text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {valor}
      </div>
      {delta && (
        <div className={cn("mt-0.5 text-xs", tomDoDelta[delta.tom])}>
          <span aria-hidden>{seta[delta.direcao]}</span>{" "}
          <span className="num">{delta.valor}</span>{" "}
          <span className="text-muted-foreground">{delta.periodo}</span>
        </div>
      )}
      {faisca && faisca.length > 1 && (
        <div className="mt-2">
          <Faisca pontos={faisca} rotulo={`${rotulo}: tendência dos últimos ${faisca.length} períodos`} />
        </div>
      )}
      {nota && <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
}
