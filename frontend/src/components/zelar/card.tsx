import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Cartão é vidro (Glass/Surface do Figma, ADR-012): translúcido, com desfoque
 * e borda clara, sobre o fundo com os brilhos do SIG. Trocar por cor sólida
 * transforma o cartão numa caixa cinza e apaga a pegada do produto.
 */
export function Card({
  title,
  actions,
  note,
  className,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      /*
       * `min-w-0` é o que faz o cartão caber.
       *
       * Numa grade, a trilha `auto`/`1fr` tem piso `min-content`, e o
       * min-content de um cartão com tabela dentro é a soma das colunas — que
       * com `whitespace-nowrap` no cabeçalho não encolhe. O resultado é uma
       * trilha de 396px dentro de um contêiner de 290, empurrando o documento
       * inteiro para fora da tela em vez de deixar a tabela rolar, que é o que
       * o `overflow-x-auto` dela existe para fazer.
       *
       * Mora aqui, e não em cada grade, porque é o cartão que fica dentro
       * delas — uma linha resolve todas, inclusive as que ainda não existem.
       */
      className={cn(
        "vidro-cartao min-w-0 rounded-md border px-4 py-4",
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title && <h2 className="text-md font-semibold whitespace-nowrap text-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}
