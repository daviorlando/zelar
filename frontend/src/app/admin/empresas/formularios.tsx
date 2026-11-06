"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { ConfirmDialog } from "@/components/zelo/confirmacao";
import { Field, Input } from "@/components/zelo/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { convidarOutroGestor, criarEmpresa, definirEmpresaAtiva, reenviarAcesso, type Resultado } from "./actions";

function DialogoDeConvite({
  titulo,
  descricao,
  enviarRotulo,
  comEmpresa,
  acao,
  aoFechar,
}: {
  titulo: string;
  descricao: string;
  enviarRotulo: string;
  comEmpresa?: boolean;
  acao: (form: FormData) => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            iniciar(async () => {
              const r = await acao(dados);
              if (r.erro) return setErro(r.erro);
              toast.success(r.ok);
              aoFechar();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          {comEmpresa && (
            <Field label="Nome da empresa" htmlFor="empresa">
              <Input id="empresa" name="empresa" required maxLength={120} autoFocus />
            </Field>
          )}
          <Field label="Nome do gestor" htmlFor="nome">
            <Input id="nome" name="nome" required maxLength={120} autoFocus={!comEmpresa} />
          </Field>
          <Field label="E-mail do gestor" htmlFor="email">
            <Input id="email" name="email" type="email" required maxLength={200} />
          </Field>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Voltar
            </Button>
            <Button variant="primary" disabled={ocupado}>
              {ocupado ? "Enviando…" : enviarRotulo}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NovaEmpresa() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setAberto(true)}>
        <Plus className="size-4" aria-hidden /> Nova empresa
      </Button>
      {aberto && (
        <DialogoDeConvite
          comEmpresa
          titulo="Nova empresa"
          descricao="O gestor recebe um e-mail para criar a senha e cadastrar setores, equipamentos e funcionários."
          enviarRotulo="Criar e convidar"
          acao={criarEmpresa}
          aoFechar={() => setAberto(false)}
        />
      )}
    </>
  );
}

export function AcoesDaEmpresa({ id, nome, ativa }: { id: string; nome: string; ativa: boolean }) {
  const [pedido, setPedido] = useState<"convite" | "ativa" | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <>
      <Button size="small" variant="ghost" onClick={() => setPedido("convite")}>
        Convidar gestor
      </Button>
      <Button size="small" variant="ghost" className={ativa ? "text-destructive" : undefined} onClick={() => setPedido("ativa")}>
        {ativa ? "Desativar" : "Reativar"}
      </Button>
      {pedido === "convite" && (
        <DialogoDeConvite
          titulo={`Convidar gestor: ${nome}`}
          descricao="A pessoa recebe um e-mail para criar a senha."
          enviarRotulo="Enviar convite"
          acao={(form) => convidarOutroGestor(id, form)}
          aoFechar={() => setPedido(null)}
        />
      )}
      <ConfirmDialog
        aberto={pedido === "ativa"}
        aoMudar={(a) => !a && setPedido(null)}
        titulo={`${ativa ? "Desativar" : "Reativar"} ${nome}?`}
        confirmar={ativa ? "Desativar" : "Reativar"}
        variante={ativa ? "destructive" : "primary"}
        ocupado={ocupado}
        aoConfirmar={() =>
          iniciar(async () => {
            const r = await definirEmpresaAtiva(id, !ativa);
            setPedido(null);
            if (r.erro) toast.error(r.erro);
            else toast.success(r.ok);
          })
        }
      >
        {ativa ? "Gestores e celulares da empresa perdem o acesso na hora. Os dados ficam guardados." : "Gestores e celulares voltam a ter acesso."}
      </ConfirmDialog>
    </>
  );
}

export function ReenviarAcesso({ email }: { email: string }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <Button
      size="small"
      variant="ghost"
      disabled={ocupado}
      onClick={() =>
        iniciar(async () => {
          const r = await reenviarAcesso(email);
          if (r.erro) toast.error(r.erro);
          else toast.success(r.ok);
        })
      }
    >
      {ocupado ? "Enviando…" : "Reenviar acesso"}
    </Button>
  );
}
