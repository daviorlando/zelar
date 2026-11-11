"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/zelar/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/*
 * Diálogo de confirmação (ConfirmDialog do Figma, M5-06 e M5-27). O
 * geo-control não tinha AlertDialog; este é o `Dialog` do shadcn (Base UI)
 * com o desenho do SIG: Cancelar à esquerda, a ação à direita, e a ação
 * destrutiva nunca é o foco inicial — quem confirma no Enter sem ler não
 * deve apagar nada.
 */
export function ConfirmDialog({
  aberto,
  aoMudar,
  titulo,
  children,
  confirmar,
  variante = "primary",
  ocupado = false,
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  children: ReactNode;
  confirmar: string;
  variante?: "primary" | "destructive";
  ocupado?: boolean;
  aoConfirmar: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent showCloseButton={false} className="vidro-cartao max-w-md border">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button autoFocus onClick={() => aoMudar(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant={variante} onClick={aoConfirmar} disabled={ocupado}>
            {ocupado ? "Aguarde…" : confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
