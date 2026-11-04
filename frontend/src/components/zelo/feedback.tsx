import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const notice = cva("rounded-sm border px-3.5 py-2.5 text-md", {
  variants: {
    tone: {
      info: "border-info bg-info-soft text-info",
      ok: "border-success bg-success-soft text-success",
      warn: "border-warning bg-warning-soft text-warning",
      error: "border-destructive bg-destructive-soft text-destructive",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "warn" | "ok";
  children: ReactNode;
}) {
  return (
    <div className={notice({ tone })} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-md text-muted-foreground">{children}</p>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-muted", className)} />;
}

/**
 * Linhas genéricas, para quando não há um esqueleto com a forma certa.
 *
 * Quem tem a forma do conteúdo mora em `esqueletos.tsx` e é sempre preferível:
 * um placeholder que não tem a forma do que vem causa salto de layout, que é
 * pior que texto.
 *
 * O que o leitor de tela ouve é UMA frase. Antes, a região inteira era
 * `aria-live="polite"` com uma dúzia de caixas vazias dentro — e `what`, que
 * dizia o que estava sendo carregado, existia declarada e nunca usada desde
 * que o componente nasceu. Numa tela com quatro cartões carregando, "Carregando…"
 * não diz qual.
 */
export function Loading({ what, rows = 4 }: { what?: string; rows?: number }) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {what ? `Carregando ${what}…` : "Carregando…"}
      </p>
      <div aria-hidden className="space-y-2.5 py-1">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
