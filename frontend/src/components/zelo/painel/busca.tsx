"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Busca do topo, com atalho "/" como no Figma. Procura funcionário pelo nome. */
export function Busca() {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (e.key !== "/" || alvo?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      campo.current?.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <form
      role="search"
      className="relative hidden w-72 sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = campo.current?.value.trim() ?? "";
        router.push(q ? `/gestor/funcionarios?q=${encodeURIComponent(q)}` : "/gestor/funcionarios");
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={campo}
        type="search"
        aria-label="Buscar funcionário"
        placeholder="Buscar funcionário"
        className="h-9 w-full rounded-sm border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-xs border border-border px-1.5 text-2xs text-muted-foreground">
        /
      </kbd>
    </form>
  );
}
