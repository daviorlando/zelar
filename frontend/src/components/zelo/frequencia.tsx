import { ROTULO_FREQUENCIA, type Frequencia } from "@/lib/plano";
import { cn } from "@/lib/utils";

/*
 * Cada frequência tem a sua cor (como os setores do Figma): ponto, fundo a 12%
 * e borda a 50%. Strings inteiras para o Tailwind achar as classes.
 */
const CLASSES: Record<Frequencia, string> = {
  daily: "border-freq-daily/50 bg-freq-daily/12 text-freq-daily",
  weekly: "border-freq-weekly/50 bg-freq-weekly/12 text-freq-weekly",
  monthly: "border-freq-monthly/50 bg-freq-monthly/12 text-freq-monthly",
  quarterly: "border-freq-quarterly/50 bg-freq-quarterly/12 text-freq-quarterly",
  semiannual: "border-freq-semiannual/50 bg-freq-semiannual/12 text-freq-semiannual",
  annual: "border-freq-annual/50 bg-freq-annual/12 text-freq-annual",
};

const PONTO: Record<Frequencia, string> = {
  daily: "bg-freq-daily",
  weekly: "bg-freq-weekly",
  monthly: "bg-freq-monthly",
  quarterly: "bg-freq-quarterly",
  semiannual: "bg-freq-semiannual",
  annual: "bg-freq-annual",
};

export function PontoDaFrequencia({ f, className }: { f: Frequencia; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", PONTO[f], className)} aria-hidden />;
}

export function PilulaDeFrequencia({ f, children, className }: { f: Frequencia; children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        CLASSES[f],
        className,
      )}
    >
      <PontoDaFrequencia f={f} />
      {children ?? ROTULO_FREQUENCIA[f]}
    </span>
  );
}
