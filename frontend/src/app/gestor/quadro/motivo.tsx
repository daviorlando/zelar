"use client";

import { useState } from "react";
import { Button } from "@/components/zelo/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Pede o motivo antes de devolver ou cancelar. O motivo vai para o celular e para a auditoria. */
export function PedirMotivo({
  titulo,
  explicacao,
  confirmar,
  perigo,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  explicacao: string;
  confirmar: string;
  perigo?: boolean;
  aoConfirmar: (motivo: string) => Promise<string | undefined>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const falha = await aoConfirmar(motivo);
    setEnviando(false);
    if (falha) setErro(falha);
    else aoFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{explicacao}</DialogDescription>
          </DialogHeader>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Motivo"
            className="w-full rounded-sm border border-input bg-card px-2.5 py-2 text-md text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Voltar
            </Button>
            <Button variant={perigo ? "destructive" : "primary"} disabled={enviando || !motivo.trim()}>
              {enviando ? "Enviando…" : confirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
