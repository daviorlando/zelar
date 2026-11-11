"use client";

import { Moon, Sun } from "lucide-react";
import { type ReactNode } from "react";

import { alternarTema, useTemaClaro } from "@/lib/tema";

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
