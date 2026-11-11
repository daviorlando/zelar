"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelar/button";
import { ConfirmDialog } from "@/components/zelar/confirmacao";
import { Field, Input } from "@/components/zelar/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarGestor, definirAtivo, redefinirSenha } from "./actions";

/** A senha só existe aqui: depois de fechar, não dá para ver de novo. */
function SenhaGerada({ email, senha, aoFechar }: { email: string; senha: string; aoFechar: () => void }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(`Painel Zelar\nE-mail: ${email}\nSenha temporária: ${senha}`);
      toast.success("Copiado.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }
  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Senha temporária</DialogTitle>
          <DialogDescription>Passe para a pessoa agora: ela não aparece de novo. No primeiro acesso, o painel pede uma senha nova.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">E-mail</dt>
            <dd className="break-all text-foreground">{email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Senha temporária</dt>
            <dd className="num select-all text-lg font-medium break-all text-foreground">{senha}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={copiar}>
            Copiar
          </Button>
          <Button type="button" variant="primary" onClick={aoFechar}>
            Já passei a senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NovoGestor() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [gerada, setGerada] = useState<{ email: string; senha: string }>();
  const [ocupado, iniciar] = useTransition();

  return (
    <>
      <Button
        size="small"
        variant="primary"
        onClick={() => {
          setErro(undefined);
          setAberto(true);
        }}
      >
        <Plus className="size-4" aria-hidden /> Novo gestor
      </Button>
      {aberto && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent className="sm:max-w-md">
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const dados = new FormData(e.currentTarget);
                const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                dados.set("modo", botao?.value ?? "convite");
                iniciar(async () => {
                  const r = await criarGestor(dados);
                  if (r.erro) return setErro(r.erro);
                  setAberto(false);
                  if (r.senha) setGerada({ email: String(dados.get("email")).trim().toLowerCase(), senha: r.senha });
                  else toast.success(r.ok);
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>Novo gestor</DialogTitle>
                <DialogDescription>A pessoa recebe um e-mail para criar a senha. Se o e-mail não chegar, use a senha temporária.</DialogDescription>
              </DialogHeader>
              <Field label="Nome" htmlFor="gestor-nome">
                <Input id="gestor-nome" name="nome" required maxLength={120} autoFocus />
              </Field>
              <Field label="E-mail" htmlFor="gestor-email">
                <Input id="gestor-email" name="email" type="email" required maxLength={200} />
              </Field>
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                  Voltar
                </Button>
                <Button variant="ghost" name="modo" value="senha" disabled={ocupado}>
                  Usar senha temporária
                </Button>
                <Button variant="primary" name="modo" value="convite" disabled={ocupado}>
                  {ocupado ? "Enviando…" : "Enviar convite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {gerada && <SenhaGerada {...gerada} aoFechar={() => setGerada(undefined)} />}
    </>
  );
}

export function AcoesDoGestor({ id, email, ativo }: { id: string; email: string; ativo: boolean }) {
  const [pedido, setPedido] = useState<"senha" | "ativo" | null>(null);
  const [senha, setSenha] = useState<string>();
  const [ocupado, iniciar] = useTransition();

  return (
    <div className="flex justify-end gap-1">
      {ativo && (
        <Button size="small" variant="ghost" onClick={() => setPedido("senha")}>
          Nova senha
        </Button>
      )}
      <Button size="small" variant="ghost" className={ativo ? "text-destructive" : undefined} onClick={() => setPedido("ativo")}>
        {ativo ? "Desativar" : "Reativar"}
      </Button>
      <ConfirmDialog
        aberto={pedido === "senha"}
        aoMudar={(a) => !a && setPedido(null)}
        titulo={`Gerar nova senha para ${email}?`}
        confirmar="Gerar senha"
        ocupado={ocupado}
        aoConfirmar={() =>
          iniciar(async () => {
            const r = await redefinirSenha(id);
            setPedido(null);
            if (r.erro) toast.error(r.erro);
            else setSenha(r.senha);
          })
        }
      >
        A senha atual deixa de funcionar na hora.
      </ConfirmDialog>
      <ConfirmDialog
        aberto={pedido === "ativo"}
        aoMudar={(a) => !a && setPedido(null)}
        titulo={`${ativo ? "Desativar" : "Reativar"} ${email}?`}
        confirmar={ativo ? "Desativar" : "Reativar"}
        variante={ativo ? "destructive" : "primary"}
        ocupado={ocupado}
        aoConfirmar={() =>
          iniciar(async () => {
            const r = await definirAtivo(id, !ativo);
            setPedido(null);
            if (r.erro) toast.error(r.erro);
            else toast.success(r.ok);
          })
        }
      >
        {ativo ? "A pessoa não consegue mais entrar. O que ela fez continua no histórico. Uma sessão já aberta pode durar até uma hora." : "A pessoa volta a poder entrar com a senha dela."}
      </ConfirmDialog>
      {senha && <SenhaGerada email={email} senha={senha} aoFechar={() => setSenha(undefined)} />}
    </div>
  );
}
