"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Ban, CircleHelp, Ellipsis, Undo2 } from "lucide-react";
import Link from "next/link";
import { PilulaDeFrequencia } from "@/components/zelo/frequencia";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { prazoRelativo, type CartaoDaOrdem } from "@/lib/quadro";
import { cn } from "@/lib/utils";

export type AcaoDoCartao = "validar" | "devolver" | "cancelar" | "liberar";

/**
 * Cartão de uma ordem: equipamento e setor; frequência e prazo; progresso.
 * Borda esquerda vermelha = atrasada. O cartão inteiro arrasta (os sensores
 * ignoram botões e links); o menu "⋯" faz o mesmo que o arrasto, no teclado e no dedo.
 */
export function Cartao({
  ordem,
  hoje,
  href,
  aoAgir,
  fantasma,
}: {
  ordem: CartaoDaOrdem;
  hoje: string;
  href: string;
  aoAgir?: (acao: AcaoDoCartao, ordem: CartaoDaOrdem) => void;
  fantasma?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ordem.id, data: ordem });
  const prazo = prazoRelativo(ordem.vencimento, hoje);
  const atrasada = prazo.atrasada && !["awaiting_validation", "done"].includes(ordem.situacao);
  const pct = ordem.total ? Math.round((ordem.respondidos / ordem.total) * 100) : 0;

  return (
    <article
      ref={fantasma ? undefined : setNodeRef}
      style={fantasma ? undefined : { transform: CSS.Translate.toString(transform) }}
      {...(fantasma ? {} : attributes)}
      {...(fantasma ? {} : listeners)}
      aria-label={`${ordem.equipamento}, ${prazo.texto}`}
      className={cn(
        "vidro-cartao relative cursor-grab touch-manipulation rounded-md border border-l-4 p-3 active:cursor-grabbing",
        atrasada ? "border-l-destructive" : "border-l-transparent",
        isDragging && "opacity-40",
        fantasma && "rotate-1 shadow-[var(--shadow-dialog)]",
      )}
    >
      <div className="flex items-start gap-2">
        <Link href={href} scroll={false} className="min-w-0 flex-1 leading-tight hover:[&>span:first-child]:underline">
          <span className="block truncate font-medium text-foreground" title={ordem.equipamento}>
            {ordem.equipamento}
          </span>
          <span className="block text-xs text-muted-foreground">
            Setor {ordem.setor} · {ordem.tag}
          </span>
        </Link>
        {aoAgir && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Ações de ${ordem.equipamento}`}
            >
              <Ellipsis className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ordem.situacao === "blocked" && (
                <DropdownMenuItem onClick={() => aoAgir("liberar", ordem)}>Liberar para refazer</DropdownMenuItem>
              )}
              {ordem.situacao === "awaiting_validation" && (
                <DropdownMenuItem onClick={() => aoAgir("validar", ordem)}>Validar</DropdownMenuItem>
              )}
              {(ordem.situacao === "awaiting_validation" || ordem.situacao === "done") && (
                <DropdownMenuItem onClick={() => aoAgir("devolver", ordem)}>Devolver ao funcionário</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => aoAgir("cancelar", ordem)}>
                Cancelar ordem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <PilulaDeFrequencia f={ordem.frequencia} />
        <span className={atrasada ? "font-medium text-destructive" : "text-muted-foreground"}>{prazo.texto}</span>
      </div>

      {ordem.impedimentos.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning" title={ordem.impedimentos.join(", ")}>
          <Ban className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {ordem.impedimentos[0]}
            {ordem.impedimentos.length > 1 && ` +${ordem.impedimentos.length - 1}`}
          </span>
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="num text-xs text-muted-foreground" title="Atividades respondidas">
          {ordem.respondidos}/{ordem.total}
        </span>
        {ordem.problemas > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title="Problemas encontrados">
            <AlertTriangle className="size-3.5" aria-hidden />
            {ordem.problemas}
          </span>
        )}
        {ordem.pulados > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning" title="Itens que o funcionário não soube responder">
            <CircleHelp className="size-3.5" aria-hidden />
            {ordem.pulados}
          </span>
        )}
        {ordem.devolvida && (
          <span title="Devolvida ao funcionário" className="text-warning">
            <Undo2 className="size-3.5" aria-hidden />
            <span className="sr-only">Devolvida</span>
          </span>
        )}
      </div>
    </article>
  );
}
