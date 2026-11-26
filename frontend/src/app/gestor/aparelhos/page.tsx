import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/zelar/badge";
import { Card } from "@/components/zelar/card";
import { TabelaEsqueleto } from "@/components/zelar/esqueletos";
import { Empty, Notice } from "@/components/zelar/feedback";
import { PageHeader } from "@/components/zelar/misc";
import { Qr } from "@/components/zelar/qr";
import { Table, TD, TH, TR } from "@/components/zelar/table";
import { enderecoDaPaginaBaixar } from "@/lib/app-android";
import { decifrar } from "@/lib/cifra";
import { exigirGestor } from "@/lib/empresa";
import { supabaseAdmin, supabaseForUser } from "@/lib/supabase/server";
import { ExcluirAparelho, NovoAparelho, RevogarAparelho } from "./formularios";

export const metadata = { title: "Celulares" };

export default function AparelhosPage() {
  return (
    <>
      <PageHeader eyebrow="Configuração" title="Celulares">
        Os celulares que podem baixar as tarefas desta empresa. Se um sumir, revogue aqui; se não for mais usado, exclua.
      </PageHeader>
      <InstalarApp />
      <Suspense fallback={null}>
        <CodigosEsperando />
      </Suspense>
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

async function InstalarApp() {
  const endereco = enderecoDaPaginaBaixar();
  if (!endereco) return null;
  return (
    <Card title="Instalar o app no celular" className="mb-4">
      <div className="flex items-center gap-4">
        <Qr texto={endereco} rotulo="QR code da página de baixar o app" className="size-28 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Aponte a câmera do celular para o quadrado, ou abra{" "}
          <a href="/baixar" className="break-words text-foreground underline">
            {endereco.replace(/^https?:\/\//, "")}
          </a>
          . Depois, toque em <strong className="font-medium text-foreground">Ligar celular</strong> para gerar o código.
        </p>
      </div>
    </Card>
  );
}

const hora = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Códigos gerados que ainda não foram usados nem venceram, para o gestor ver de novo depois de
 * fechar a janela. O gestor não lê a cópia cifrada pela API: o servidor lê só os da empresa dele.
 */
async function CodigosEsperando() {
  await connection();
  const gestor = await exigirGestor();
  if (!gestor) return null;
  const { data } = await supabaseAdmin()
    .from("device_activation")
    .select("name, expires_at, code_cipher, created_at")
    .eq("company_id", gestor.empresaId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .not("code_cipher", "is", null)
    .order("created_at", { ascending: false });
  const codigos = (data ?? []).map((c) => ({ ...c, codigo: decifrar(c.code_cipher!) })).filter((c) => c.codigo);
  if (!codigos.length) return null;
  return (
    <Card title="Códigos esperando o celular" className="mb-4">
      <ul className="flex flex-col divide-y divide-border">
        {codigos.map((c) => (
          <li key={c.created_at} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0">
            <span className="text-sm">
              <span className="font-medium text-foreground">{c.name}</span>
              <span className="block text-xs text-muted-foreground">Vale até {hora.format(new Date(c.expires_at))}, uma só vez</span>
            </span>
            <span className="num select-all text-2xl font-medium tracking-widest text-foreground">
              {c.codigo!.slice(0, 4)} {c.codigo!.slice(4)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
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
                <TD>
                  <div className="flex flex-wrap justify-end gap-1">
                    {!d.revoked_at && <RevogarAparelho id={d.id} nome={d.name} />}
                    <ExcluirAparelho id={d.id} nome={d.name} ativo={!d.revoked_at} />
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
