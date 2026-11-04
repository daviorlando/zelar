"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Controles que recortam o que está abaixo deles.
 *
 * Uma linha só, acima de tudo que ela escopa — nunca dentro de um cartão e
 * nunca um por figura. Filtro por gráfico faz cada número da tela responder a
 * uma pergunta diferente, e ninguém percebe olhando.
 */

/**
 * A faixa de filtros, grudada no topo enquanto a página rola.
 *
 * `vidro`, e não `bg-card`: é superfície por onde o conteúdo passa por baixo,
 * e 2% de tinta sem desfoque deixaria ler o texto através dela.
 */
export function LinhaDeFiltros({ children }: { children: ReactNode }) {
  return (
    <div className="vidro sticky top-0 z-20 -mx-4 mb-3.5 flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 md:-mx-[1.875rem] md:px-[1.875rem]">
      {children}
    </div>
  );
}

export interface Opcao<T extends string | number> {
  valor: T;
  rotulo: string;
}

/**
 * Escolha entre poucas opções fixas.
 *
 * `radiogroup` e não um `<select>`: são três opções, e escondê-las atrás de
 * um clique para mostrar uma de cada vez custa mais do que mostrá-las. O
 * teclado anda entre elas com as setas, que é o que o papel promete.
 */
export function Escolha<T extends string | number>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string;
  valor: T;
  opcoes: Opcao<T>[];
  aoMudar: (valor: T) => void;
}) {
  return (
    // `flex-wrap` nos dois níveis: a 320px com a fonte em 24, três pílulas em
    // linha medem 404px e empurram o documento inteiro para fora da tela. Quem
    // aumenta a fonte do navegador costuma precisar dela, e é justamente essa
    // pessoa que ficaria rolando de lado para achar o filtro.
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap items-center gap-1">
        {opcoes.map((opcao) => {
          const ativa = opcao.valor === valor;
          return (
            <button
              key={String(opcao.valor)}
              type="button"
              role="radio"
              aria-checked={ativa}
              onClick={() => aoMudar(opcao.valor)}
              className={cn(
                // Alvo de 2.75rem em altura: o mínimo de 44px do WCAG, que
                // num controle desta densidade é o que separa "clicável" de
                // "acertável".
                "inline-flex min-h-11 items-center rounded-full px-3 text-sm transition-colors",
                ativa
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
