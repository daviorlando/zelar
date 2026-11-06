"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { ConfirmDialog } from "@/components/zelo/confirmacao";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cancelar, devolver, liberar, validar } from "./actions";
import { PedirMotivo } from "./motivo";

/** Painel lateral do detalhe: fecha voltando ao quadro com os mesmos filtros. */
export function PainelLateral({ titulo, voltar, children }: { titulo: string; voltar: string; children: React.ReactNode }) {
  const router = useRouter();
  const fechar = () => router.push(voltar, { scroll: false });
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && fechar()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto flex h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 sm:max-w-[34rem] data-open:slide-in-from-right data-open:zoom-in-100"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <DialogTitle className="truncate text-md font-semibold">{titulo}</DialogTitle>
          <button
            type="button"
            onClick={fechar}
            className="grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Validar, devolver, liberar e cancelar, conforme a situação da ordem. */
export function AcoesDoDetalhe({ id, nome, situacao, pulados = 0 }: { id: string; nome: string; situacao: string; pulados?: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pedido, setPedido] = useState<"devolver" | "cancelar" | "liberar" | null>(null);
  const [validando, iniciar] = useTransition();
  if (situacao === "cancelled") return null;
  const podeValidar = situacao === "awaiting_validation";
  const podeDevolver = situacao === "awaiting_validation" || situacao === "done";
  const validarAgora = () =>
    iniciar(async () => {
      const r = await validar(id, pulados > 0);
      setConfirmando(false);
      if (r.erro) toast.error(r.erro);
      else toast.success(`${nome}: validada.`);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {situacao === "blocked" && (
        <Button variant="primary" onClick={() => setPedido("liberar")}>
          Liberar para refazer
        </Button>
      )}
      {podeValidar && (
        <Button
          variant="primary"
          disabled={validando}
          onClick={() => (pulados > 0 ? setConfirmando(true) : validarAgora())}
        >
          {validando ? "Validando…" : "Validar"}
        </Button>
      )}
      <ConfirmDialog
        aberto={confirmando}
        aoMudar={setConfirmando}
        titulo={`Validar com ${pulados} sem resposta?`}
        confirmar="Validar assim mesmo"
        ocupado={validando}
        aoConfirmar={validarAgora}
      >
        O funcionário não soube responder {pulados === 1 ? "1 item" : `${pulados} itens`}. Eles não contam como feitos, e a validação fica registrada com essa contagem.
      </ConfirmDialog>
      {podeDevolver && <Button onClick={() => setPedido("devolver")}>Devolver ao funcionário</Button>}
      <Button variant="ghost" className="ml-auto text-destructive" onClick={() => setPedido("cancelar")}>
        Cancelar ordem
      </Button>
      {pedido && (
        <PedirMotivo
          titulo={`${{ devolver: "Devolver", cancelar: "Cancelar", liberar: "Liberar" }[pedido]} ${nome}`}
          explicacao={
            {
              devolver: "A ordem volta para o celular do funcionário. Diga o que falta ou o que precisa ser refeito.",
              cancelar: "A ordem sai do quadro e não é mais cobrada. Fica registrado quem cancelou e por quê.",
              liberar: "Os itens impedidos voltam a ficar pendentes e o funcionário é avisado no celular. Diga o que foi resolvido.",
            }[pedido]
          }
          confirmar={{ devolver: "Devolver", cancelar: "Cancelar ordem", liberar: "Liberar para refazer" }[pedido]}
          rotulo={pedido === "liberar" ? "O que foi resolvido" : "Motivo"}
          perigo={pedido === "cancelar"}
          aoConfirmar={async (motivo) => {
            const r = await { devolver, cancelar, liberar }[pedido](id, motivo);
            if (r.erro) return r.erro;
            toast.success(`${nome}: ${{ devolver: "devolvida", cancelar: "cancelada", liberar: "liberada para refazer" }[pedido]}.`);
          }}
          aoFechar={() => setPedido(null)}
        />
      )}
    </div>
  );
}
