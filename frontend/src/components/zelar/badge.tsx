import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * O tom carrega significado de negócio. Warn é trabalho parado esperando uma
 * pessoa decidir, e precisa saltar da tela. Os rótulos vêm de lib/format.ts —
 * a máquina de estados do backend é quem define, não esta camada.
 *
 * OK usa o verde da marca de propósito: é o que o site faz no chip "Concluído".
 * Por isso Info foi para o ciano — se fosse verde, "processando" e "aprovada"
 * seriam a mesma coisa aos olhos de quem varre a tela.
 *
 * Este arquivo é a fonte única do vocabulário de cor do painel. Os cinco tons
 * são os mesmos que o banco aceita em `project_states.color_token` e em
 * `labels.color_token` (CHECK `color_token_known`, migração 0013), e quem quiser
 * pintar outra coisa com eles — a régua de uma coluna, a borda de um cartão —
 * usa `classesDoTom`, não reescreve o mapa.
 */
const badge = cva(
  "inline-block whitespace-nowrap rounded-full px-2 py-[0.125rem] text-2xs font-semibold tracking-[0.06em]",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info-soft text-info",
        ok: "bg-success-soft text-success",
        warn: "bg-warning-soft text-warning",
        danger: "bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badge>["tone"]>;

const TONS = ["neutral", "info", "ok", "warn", "danger"] as const;

/**
 * Normaliza um tom vindo do banco.
 *
 * O `color_token` chega como `string` da API, e o CHECK que o protege vive no
 * banco, não aqui. Um valor fora do vocabulário — coluna criada por SQL à mão,
 * versão nova do backend, erro de digitação — precisa virar cinza. Sem esta
 * função ele virava **nada**: `defaultVariants` só cobre `undefined`, então um
 * tom desconhecido produzia pílula sem classe de cor alguma, transparente e
 * silenciosa, que é o pior jeito de falhar.
 */
export function tomConhecido(tone: string | null | undefined): BadgeTone {
  return TONS.includes(tone as BadgeTone) ? (tone as BadgeTone) : "neutral";
}

/**
 * A demão de cor de cada tom, para quem não é `Badge`.
 *
 * É o fundo translúcido de uma superfície que precisa ser reconhecida pela cor
 * sem virar um bloco colorido — hoje, a coluna do quadro. Vem como **camada de
 * `background-image`**, e não como `background-color`, por uma razão prática: o
 * `cn` é `twMerge`, e um `bg-*` passado ao `Card` apagaria o `bg-card` dele.
 * Pintando por cima, o vidro da superfície sobrevive embaixo.
 *
 * Os tokens `*-soft` não servem aqui: no tema escuro três dos cinco são hexes
 * opacos e escuríssimos, então tapariam o fundo em vez de deixá-lo passar. A
 * cor base com alfa se comporta igual nos cinco, e igual nos dois temas.
 *
 * Strings inteiras, nunca montadas por concatenação: o Tailwind varre o código
 * procurando classes literais, e `` `from-${tom}/10` `` não existe para ele.
 */
const FUNDO_SUAVE: Record<BadgeTone, string> = {
  // Sem tinta, de propósito: o neutro é a ausência de sinal, e uma demão de
  // cinza sobre o vidro só tiraria contraste do que está por cima.
  neutral: "",
  info: "bg-linear-to-b from-info/10 to-info/10",
  ok: "bg-linear-to-b from-success/10 to-success/10",
  warn: "bg-linear-to-b from-warning/10 to-warning/10",
  danger: "bg-linear-to-b from-destructive/10 to-destructive/10",
};

export function fundoSuaveDoTom(tone: string | null | undefined): string {
  return FUNDO_SUAVE[tomConhecido(tone)];
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(badge({ tone: tomConhecido(tone) }), className)}>{children}</span>
  );
}
