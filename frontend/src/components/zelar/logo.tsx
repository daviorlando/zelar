import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Marca do Zelar: escudo em degradê de azul-marinho com um Z claro dentro, e o
 * nome em traço fino ao lado. A mesma nos dois temas.
 *
 * Ids dos degradês vêm do `useId`: a marca aparece duas vezes na mesma página
 * (barra lateral e faixa do celular), e um `url(#id)` que aponte para a cópia
 * escondida com `display: none` some no Chrome.
 */
export function Logo({ variante = "completo", className }: { variante?: "completo" | "simbolo"; className?: string }) {
  const id = useId();
  const fundo = `${id}-fundo`;
  const contorno = `${id}-contorno`;
  const letra = `${id}-letra`;

  const simbolo = (
    <svg viewBox="0 0 32 32" aria-hidden className={variante === "simbolo" ? className : "size-8 shrink-0"}>
      <defs>
        <linearGradient id={fundo} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="1" stopColor="#0b1736" />
        </linearGradient>
        <linearGradient id={contorno} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#93b4ff" />
        </linearGradient>
        <linearGradient id={letra} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c7d7ff" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.2 27.2 6.3v8.6c0 7.1-4.7 12.3-11.2 14.9C9.5 27.2 4.8 22 4.8 14.9V6.3Z"
        fill={`url(#${fundo})`}
        stroke={`url(#${contorno})`}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M10.6 9.4h10.8v2.3l-7.3 7.9h7.3v2.5H10.6v-2.3l7.3-7.9h-7.3Z" fill={`url(#${letra})`} />
    </svg>
  );
  if (variante === "simbolo") return simbolo;
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {simbolo}
      <NomeDaMarca />
    </span>
  );
}

/** O nome em traço fino. Separado para a barra lateral esmaecê-lo ao recolher. */
export function NomeDaMarca({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-[family-name:var(--font-codec-light)] text-xl font-light tracking-[0.06em] text-foreground",
        className,
      )}
    >
      Zelar
    </span>
  );
}
