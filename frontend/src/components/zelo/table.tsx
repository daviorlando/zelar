import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Tabela do painel, dentro da sangria do `Card`.
 *
 * O `rotulo` é obrigatório porque a região que rola precisa de nome. Com a
 * fonte grande, rolar de lado deixa de ser exceção e vira o caso comum — e uma
 * região que só rola com o mouse deixa de fora quem navega por teclado (WCAG
 * 2.1.1). `tabIndex` a põe na ordem de foco; `role="region"` sem nome não é
 * exposto como marco nenhum, e é o nome que diz a quem ouve QUAL tabela ganhou
 * o foco, num painel que mostra várias na mesma tela.
 */
export function Table({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <div
      role="region"
      aria-label={rotulo}
      tabIndex={0}
      /*
       * `min-w-0` pela mesma razão do `Card`: numa grade, a trilha tem piso
       * `min-content`, e o min-content de uma tabela é a soma das colunas.
       * Sem ele, a região rola de lado como deve — mas só depois de já ter
       * empurrado o documento inteiro para fora da tela, que é o oposto do
       * que o `overflow-x-auto` existe para fazer.
       *
       * Mora aqui, e não em cada grade, porque é a tabela que fica dentro
       * delas: uma linha resolve todas, inclusive as que ainda não existem.
       */
      className="min-w-0 -mx-[1.125rem] overflow-x-auto px-[1.125rem]"
    >
      <table className="w-full border-collapse text-md">{children}</table>
    </div>
  );
}

/** Cabeçalho de coluna: caixa alta pequena, rotula sem disputar com o dado. */
export function TH({
  num,
  width,
  children,
}: {
  num?: boolean;
  width?: number | string;
  children?: ReactNode;
}) {
  return (
    <th
      /*
       * O número é a medida do DESENHO, em px, e vira rem aqui — num lugar só,
       * para as 47 colunas do painel. Em px, uma coluna de 180 continuaria com
       * 180 para quem configurou o navegador em 24, e o texto agora maior não
       * caberia nela; em rem ela cresce junto com o que precisa caber.
       *
       * `ch` seria a unidade intuitiva para coluna de texto, e é armadilha:
       * resolve contra a fonte do elemento onde está escrita — este `<th>`, em
       * 11px maiúsculo — enquanto o dado mora no `<td>`, em 14px. A conta
       * sairia ~21% menor que o esperado. Quem quiser `ch` mesmo assim passa a
       * string pronta.
       */
      style={width ? { width: typeof width === "number" ? `${width / 16}rem` : width } : undefined}
      className={cn(
        "whitespace-nowrap border-b border-border px-2.5 py-2 text-2xs font-semibold uppercase tracking-[0.05em] text-muted-foreground",
        num ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  num,
  className,
  children,
}: {
  num?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <td className={cn("border-b border-border px-2.5 py-2.5", num && "num text-right", className)}>
      {children}
    </td>
  );
}

export function TR({ children }: { children: ReactNode }) {
  return (
    <tr className="transition-colors hover:bg-muted [&:last-child>td]:border-b-0">{children}</tr>
  );
}
