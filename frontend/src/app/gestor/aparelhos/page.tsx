import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/zelo/badge";
import { Card } from "@/components/zelo/card";
import { TabelaEsqueleto } from "@/components/zelo/esqueletos";
import { Empty, Notice } from "@/components/zelo/feedback";
import { PageHeader } from "@/components/zelo/misc";
import { Table, TD, TH, TR } from "@/components/zelo/table";
import { supabaseForUser } from "@/lib/supabase/server";
import { NovoAparelho, RevogarAparelho } from "./formularios";

export const metadata = { title: "Celulares" };

export default function AparelhosPage() {
  return (
    <>
      <PageHeader eyebrow="Configuração" title="Celulares">
        Os celulares que podem baixar as tarefas desta empresa. Se um sumir, revogue aqui.
      </PageHeader>
      <Suspense
        fallback={
          <Card>
            <TabelaEsqueleto colunas={3} />
          </Card>
        }
      >
        <Lista />
      </Suspense>
    </>
  );
}

const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function Lista() {
  await connection();
  const supabase = await supabaseForUser();
  const { data, error } = await supabase.from("device").select("id, name, last_seen_at, revoked_at").order("created_at", { ascending: false });
  if (error) return <Notice tone="error">Não consegui carregar: {error.message}</Notice>;
  return (
    <Card title={`${data.length} ${data.length === 1 ? "celular" : "celulares"}`} actions={<NovoAparelho />}>
      {data.length === 0 ? (
        <Empty>Nenhum celular ligado ainda.</Empty>
      ) : (
        <Table rotulo="Celulares">
          <thead>
            <tr>
              <TH>Nome</TH>
              <TH>Situação</TH>
              <TH>
                <span className="sr-only">Ações</span>
              </TH>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <TR key={d.id}>
                <TD className="font-medium text-foreground">
                  {d.name}
                  {/* Debaixo do nome: como coluna, empurrava o Revogar para fora da tela do celular. */}
                  <span className="block text-xs font-normal text-muted-foreground">
                    Último contato: {d.last_seen_at ? quando.format(new Date(d.last_seen_at)) : "nunca"}
                  </span>
                </TD>
                <TD>{d.revoked_at ? <Badge tone="danger">Revogado</Badge> : <Badge tone="ok">Ativo</Badge>}</TD>
                <TD>{!d.revoked_at && <RevogarAparelho id={d.id} nome={d.name} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
