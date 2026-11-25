"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Caixa de marcar da marca, com o rótulo junto.
 *
 * Substitui o `<input type="checkbox" className="accent-primary">` que as telas
 * usavam. `accent-color` pinta o quadradinho do sistema operacional e para por
 * aí: a forma, a borda e o tamanho continuam sendo os do Windows, os do GNOME
 * ou os do macOS, e no escuro o resultado é uma caixa clara cravada no meio de
 * uma superfície de vidro.
 *
 * Construída sobre o primitivo do Base UI, e não sobre `ui/checkbox.tsx`:
 * aquele é território do `npx shadcn add` e traz uma sequência longa de
 * classes, entre elas `dark:bg-input/30`, que venceria qualquer fundo passado
 * por `className` — sobrescrever uma variante `dark:` com uma classe base não
 * funciona, e o resultado seria um vidro que só aparece no tema claro.
 */
export function Caixa({
  marcada,
  aoMudar,
  desabilitada,
  className,
  children,
}: {
  marcada: boolean;
  aoMudar: (marcada: boolean) => void;
  desabilitada?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "group inline-flex items-center gap-2 text-sm text-foreground max-md:min-h-11",
        desabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <Checkbox.Root
        checked={marcada}
        onCheckedChange={aoMudar}
        disabled={desabilitada}
        className={cn(
          /*
           * `border-control-border`, e não `border-border`: 8% e 12% de branco
           * dão 1,2:1 e 1,4:1 sobre o cartão, e o SC 1.4.11 pede 3:1 para o
           * contorno de um componente de interface. Caixa vazia que não se
           * enxerga é um controle que não se sabe que existe.
           */
          "grid size-4 shrink-0 place-content-center rounded-xs border border-control-border",
          /*
           * O vidro fica no estado de REPOUSO, que é onde ele se lê: superfície
           * translúcida sobre o cartão, com um desfoque curto que pega a cor do
           * que está atrás. Não usa a utilitária `vidro` porque ela escreve
           * `background` fora do sistema de classes do Tailwind, e aí
           * `data-checked:bg-primary` não teria como vencê-la.
           */
          "bg-surface-glass-strong backdrop-blur-[2px] transition-colors",
          !desabilitada && "group-hover:border-brand-border",
          /*
           * Marcada é TINTA, não vidro — e é uma escolha, não esquecimento.
           * Numa lista de sete papéis, o que precisa saltar é quais estão
           * marcados; um verde translúcido a 15% lido de relance vira "mais ou
           * menos marcado". O vidro cuida do repouso, a tinta cuida do estado.
           */
          "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        )}
      >
        <Checkbox.Indicator className="grid place-content-center">
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {children}
    </label>
  );
}
