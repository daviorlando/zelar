"use client";

import { Moon, Sun } from "lucide-react";
import { type ReactNode } from "react";

import { alternarTema, useTemaClaro } from "@/lib/tema";
import { cn } from "@/lib/utils";

/** Rótulo de seção: ponto de 6px + caixa alta com tracking largo (herdado da GeoSpace). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      <span className="eyebrow">{children}</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-[1.375rem]">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.015em] text-foreground">
        {title}
      </h1>
      {children && <p className="mt-1 text-md text-muted-foreground">{children}</p>}
    </header>
  );
}

/** Barra de proporção. Trilho em muted, preenchimento na cor da marca. */
export function Bar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={label ?? `${Math.round(pct * 100)}%`}
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

/** Item do histórico de transições. No último, a linha some. */
export function TimelineItem({
  last,
  title,
  meta,
}: {
  last?: boolean;
  title: ReactNode;
  meta: ReactNode;
}) {
  return (
    <li className={cn("flex gap-3.5", !last && "pb-4")}>
      <div className="relative w-2 shrink-0">
        {!last && <span className="absolute left-[0.1875rem] top-0 h-full w-0.5 bg-border-strong" />}
        <span className="absolute left-0 top-[0.3125rem] size-2 rounded-full bg-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-md text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>
      </div>
    </li>
  );
}

export function Timeline({ children }: { children: ReactNode }) {
  return <ol className="m-0 list-none p-0">{children}</ol>;
}

/*
 * O tema segue o sistema até a pessoa escolher (Q-17). O alternador fixa o
 * oposto do que está na tela; "voltar a seguir o sistema" fica em Meu perfil.
 */
export function ThemeToggle() {
  const claro = useTemaClaro();

  return (
    <button
      type="button"
      onClick={() => alternarTema(!claro)}
      aria-pressed={claro}
      title={claro ? "Mudar para o tema escuro" : "Mudar para o tema claro"}
      className="inline-flex size-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      {claro ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      <span className="sr-only">Alternar tema</span>
    </button>
  );
}
