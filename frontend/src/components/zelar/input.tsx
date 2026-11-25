"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-sm border border-input bg-card px-2.5 py-2 text-md text-foreground max-md:min-h-11",
        "placeholder:text-muted-foreground",
        "transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
    );
  },
);

/** Mesma casca do `Input`, para que campo escrito e campo escolhido tenham o
 * mesmo peso na linha. A seta nativa fica: para lista curta e fechada — status,
 * papel — ela traz o teclado do sistema de graça. Lista que cresce e pede busca
 * (fornecedor, categoria) é caso do Combobox, não deste. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-sm border border-input bg-card px-2.5 py-2 text-md text-foreground max-md:min-h-11",
          "transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40",
          "disabled:opacity-50",
          // A lista aberta é desenhada pelo sistema, fora da página, e por isso
          // não tem o fundo escuro atrás. `--card` é branco a 2%: sobre a
          // página escura lê como vidro, mas sozinho compõe sobre o branco do
          // sistema e vira branco — com o texto claro sumindo dentro dele.
          // `--popover` é o token das superfícies flutuantes e é opaco nos dois
          // temas, que é exatamente o que a lista precisa.
          "[&>option]:bg-popover [&>option]:text-popover-foreground",
          "[&>optgroup]:bg-popover [&>optgroup]:text-popover-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

/** Rótulo mais campo. O rótulo orienta; ele não compete com o valor digitado. */
export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
