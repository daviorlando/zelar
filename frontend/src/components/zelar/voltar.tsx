"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Para onde cada tela de detalhe volta. Fica no topo do painel, na mesma linha
 * da busca, em vez de cada página desenhar o seu: assim o título da página não
 * desce para dar lugar ao botão.
 */
const DESTINOS: { prefixo: string; href: string; para: string }[] = [
  { prefixo: "/gestor/funcionarios/", href: "/gestor/funcionarios", para: "Funcionários" },
  { prefixo: "/gestor/equipamentos/", href: "/gestor/equipamentos", para: "Equipamentos" },
];

/** Botão de voltar do topo: só aparece nas telas abaixo de uma lista. */
export function VoltarDoTopo() {
  const caminho = usePathname();
  const destino = DESTINOS.find((d) => caminho.startsWith(d.prefixo));
  if (!destino) return null;
  return <Voltar href={destino.href} para={destino.para} />;
}

/**
 * Cartão de vidro com a seta num quadrado na cor da marca e o nome do destino.
 * A seta recua um pouco ao passar o mouse.
 */
export function Voltar({ href, para }: { href: string; para: string }) {
  return (
    <Link
      href={href}
      aria-label={`Voltar para ${para}`}
      className="vidro-cartao group inline-flex items-center gap-2.5 rounded-md border py-2 pr-4 pl-2 transition-colors hover:border-brand-border"
    >
      <span
        className="grid size-9 place-items-center rounded-sm bg-primary-soft text-brand-text transition-transform duration-200 group-hover:-translate-x-0.5"
        aria-hidden
      >
        <ArrowLeft className="size-4" />
      </span>
      <span className="leading-tight" aria-hidden>
        <span className="block text-2xs uppercase tracking-[0.12em] text-subtle-foreground">Voltar</span>
        <span className="block text-sm font-medium text-foreground">{para}</span>
      </span>
    </Link>
  );
}
