"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelar/button";
import { ConfirmDialog } from "@/components/zelar/confirmacao";
import { Field, Input } from "@/components/zelar/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { gerarCodigo, revogarAparelho } from "./actions";

export function NovoAparelho() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [codigo, setCodigo] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  const fechar = () => {
    setAberto(false);
    setCodigo(undefined);
    setErro(undefined);
  };
  return (
    <>
      <Button size="small" variant="primary" onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden /> Ligar celular
      </Button>
      {aberto && (
        <Dialog open onOpenChange={(a) => !a && fechar()}>
          <DialogContent className="sm:max-w-md">
            {codigo ? (
              <>
                <DialogHeader>
                  <DialogTitle>Código do celular</DialogTitle>
                  <DialogDescription>Digite no celular ao abrir o Zelar. Vale por 15 minutos e uma só vez.</DialogDescription>
                </DialogHeader>
                <p className="num select-all text-center text-3xl font-medium tracking-widest text-foreground">
                  {codigo.slice(0, 4)} {codigo.slice(4)}
                </p>
                <DialogFooter>
                  <Button variant="primary" onClick={fechar}>
                    Pronto
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const dados = new FormData(e.currentTarget);
                  iniciar(async () => {
                    const r = await gerarCodigo(dados);
                    if (r.erro) return setErro(r.erro);
                    setCodigo(r.codigo);
                  });
                }}
              >
                <DialogHeader>
                  <DialogTitle>Ligar celular</DialogTitle>
                  <DialogDescription>O painel gera um código para o celular entrar nesta empresa.</DialogDescription>
                </DialogHeader>
                <Field label="Nome do celular" htmlFor="aparelho-nome">
                  <Input id="aparelho-nome" name="nome" required maxLength={60} placeholder="Celular da manutenção" autoFocus />
                </Field>
                {erro && (
                  <p role="alert" className="text-sm text-destructive">
                    {erro}
                  </p>
                )}
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={fechar}>
                    Voltar
                  </Button>
                  <Button variant="primary" disabled={ocupado}>
                    {ocupado ? "Gerando…" : "Gerar código"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function RevogarAparelho({ id, nome }: { id: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [ocupado, iniciar] = useTransition();
  return (
    <>
      <Button size="small" variant="ghost" className="text-destructive" onClick={() => setAberto(true)}>
        Revogar
      </Button>
      <ConfirmDialog
        aberto={aberto}
        aoMudar={setAberto}
        titulo={`Revogar ${nome}?`}
        confirmar="Revogar"
        variante="destructive"
        ocupado={ocupado}
        aoConfirmar={() =>
          iniciar(async () => {
            const r = await revogarAparelho(id);
            setAberto(false);
            if (r.erro) toast.error(r.erro);
            else toast.success("Celular revogado.");
          })
        }
      >
        O celular para de baixar e enviar dados na hora. Use em caso de perda ou roubo. O que ainda não foi enviado fica preso nele.
      </ConfirmDialog>
    </>
  );
}
