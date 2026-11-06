"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { ConfirmDialog } from "@/components/zelo/confirmacao";
import { PilulaDeFrequencia } from "@/components/zelo/frequencia";
import { Field, Input } from "@/components/zelo/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FREQUENCIAS, type Frequencia } from "@/lib/plano";
import { periodosDoSetor, primeiroPeriodo } from "@/lib/schedule";
import { desfazerInicio, iniciarSetor } from "./actions";

const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const formatar = (d: string) => dia.format(new Date(`${d}T12:00:00Z`));

/** Iniciar ou desfazer o início de um setor. */
export function AcoesDoSetor({
  codigo,
  iniciado,
  podeIniciar,
  falta,
  podeDesfazer,
  grupos,
  hoje,
}: {
  codigo: string;
  iniciado: boolean;
  podeIniciar: boolean;
  falta: string | null;
  podeDesfazer: boolean;
  grupos: Partial<Record<Frequencia, number>>;
  hoje: string;
}) {
  const [iniciando, setIniciando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (iniciado) {
    if (!podeDesfazer) return null;
    return (
      <>
        <Button variant="ghost" className="self-start" onClick={() => setDesfazendo(true)}>
          Desfazer início
        </Button>
        <ConfirmDialog
          aberto={desfazendo}
          aoMudar={setDesfazendo}
          titulo={`Desfazer o início do setor ${codigo}?`}
          confirmar="Desfazer início"
          variante="destructive"
          ocupado={ocupado}
          aoConfirmar={() =>
            iniciar(async () => {
              const r = await desfazerInicio(codigo);
              if (r.erro) toast.error(r.erro);
              else toast.success(`Setor ${codigo}: início desfeito.`);
              setDesfazendo(false);
            })
          }
        >
          As ordens do setor serão removidas. Nenhuma tem resposta. O cadastro continua como está.
        </ConfirmDialog>
      </>
    );
  }

  return (
    <>
      <Button variant="primary" className="self-start" disabled={!podeIniciar} onClick={() => setIniciando(true)}>
        Iniciar setor
      </Button>
      {falta && <p className="text-xs text-muted-foreground">{falta}.</p>}
      {iniciando && <DialogoDeInicio codigo={codigo} grupos={grupos} hoje={hoje} aoFechar={() => setIniciando(false)} />}
    </>
  );
}

function DialogoDeInicio({
  codigo,
  grupos,
  hoje,
  aoFechar,
}: {
  codigo: string;
  grupos: Partial<Record<Frequencia, number>>;
  hoje: string;
  aoFechar: () => void;
}) {
  const [inicio, setInicio] = useState(hoje);
  const [erro, setErro] = useState<string>();
  const [ocupado, iniciar] = useTransition();
  const valida = inicio >= hoje;

  // A mesma conta que o gerador faz: o que aparece aqui é o que será criado agora.
  const previa = valida
    ? FREQUENCIAS.flatMap((f) => {
        const equipamentos = grupos[f] ?? 0;
        if (!equipamentos) return [];
        return [{ f, vencimento: primeiroPeriodo(f, inicio).period_end, ordens: equipamentos * periodosDoSetor(f, hoje, inicio).length }];
      })
    : [];
  const total = previa.reduce((soma, p) => soma + p.ordens, 0);

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Iniciar o setor {codigo}</DialogTitle>
          <DialogDescription>O cronograma começa nesta data e aparece no quadro e no celular dos responsáveis.</DialogDescription>
        </DialogHeader>
        <Field label="Data de início" htmlFor={`inicio-${codigo}`}>
          <Input id={`inicio-${codigo}`} type="date" min={hoje} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Field>
        {previa.length > 0 && (
          <table className="w-full text-sm">
            <caption className="mb-1 text-left text-xs text-muted-foreground">
              Serão criadas {total} {total === 1 ? "ordem" : "ordens"} para os próximos 60 dias. As demais são geradas a cada dia.
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Frequência</th>
                <th className="py-1 font-normal">Primeiro vencimento</th>
                <th className="py-1 text-right font-normal">Ordens</th>
              </tr>
            </thead>
            <tbody>
              {previa.map((p) => (
                <tr key={p.f} className="border-t border-border">
                  <td className="py-1.5">
                    <PilulaDeFrequencia f={p.f} />
                  </td>
                  <td className="num py-1.5 text-foreground">{formatar(p.vencimento)}</td>
                  <td className="num py-1.5 text-right text-foreground">{p.ordens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={aoFechar}>
            Voltar
          </Button>
          <Button
            variant="primary"
            disabled={ocupado || !valida}
            onClick={() =>
              iniciar(async () => {
                const r = await iniciarSetor(codigo, inicio);
                if (r.erro) return setErro(r.erro);
                toast.success(`Setor ${codigo} iniciado: ${r.ordens ?? 0} ordens criadas.`);
                aoFechar();
              })
            }
          >
            {ocupado ? "Iniciando…" : "Iniciar setor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
