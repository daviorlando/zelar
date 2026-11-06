import { KeyRound } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/zelo/badge";
import { button } from "@/components/zelo/button";
import { Card } from "@/components/zelo/card";
import { TabelaEsqueleto } from "@/components/zelo/esqueletos";
import { Notice } from "@/components/zelo/feedback";
import { PageHeader } from "@/components/zelo/misc";
import { Table, TD, TH, TR } from "@/components/zelo/table";
import { exigirGestor } from "@/lib/empresa";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AcoesDoGestor, NovoGestor } from "./formularios";

export const metadata = { title: "Gestores" };

export default function GestoresPage() {
  return (
    <>
      <PageHeader eyebrow="Configuração" title="Gestores">
        Quem entra neste painel. Todos os gestores têm os mesmos poderes.
      </PageHeader>
      <Suspense
        fallback={
          <Card>
            <TabelaEsqueleto colunas={4} />
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
  const eu = await exigirGestor();
  if (!eu) return null;
  // A lista de contas do Auth é de todas as empresas: o perfil diz quais são desta.
  const admin = supabaseAdmin();
  const [{ data, error }, perfis] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("app_user").select("user_id").eq("company_id", eu.empresaId),
  ]);
  if (error) return <Notice tone="error">Não consegui carregar: {error.message}</Notice>;
  const daEmpresa = new Set((perfis.data ?? []).map((p) => p.user_id));
  const agora = new Date();
  const gestores = data.users
    .filter((u) => daEmpresa.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      nome: (u.user_metadata?.nome as string | undefined) ?? "",
      temporaria: !!u.app_metadata?.trocar_senha,
      ultimoAcesso: u.last_sign_in_at,
      ativo: !u.banned_until || new Date(u.banned_until) <= agora,
      eu: u.id === eu.id,
    }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.email.localeCompare(b.email));

  return (
    <Card
      title={`${gestores.length} ${gestores.length === 1 ? "gestor" : "gestores"}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/gestor/minha-senha" className={button({ size: "small" })}>
            <KeyRound className="size-4" aria-hidden /> Trocar minha senha
          </Link>
          <NovoGestor />
        </div>
      }
    >
      <Table rotulo="Gestores">
        <thead>
          <tr>
            <TH>Nome</TH>
            <TH>E-mail</TH>
            <TH>Último acesso</TH>
            <TH>Situação</TH>
            <TH>
              <span className="sr-only">Ações</span>
            </TH>
          </tr>
        </thead>
        <tbody>
          {gestores.map((g) => (
            <TR key={g.id}>
              <TD className="font-medium text-foreground">
                {g.nome || "—"} {g.eu && <span className="font-normal text-muted-foreground">(você)</span>}
              </TD>
              <TD>{g.email}</TD>
              <TD>{g.ultimoAcesso ? quando.format(new Date(g.ultimoAcesso)) : "nunca entrou"}</TD>
              <TD>
                {!g.ativo ? <Badge tone="danger">Desativado</Badge> : g.temporaria ? <Badge tone="warn">Falta criar a senha</Badge> : <Badge tone="ok">Ativo</Badge>}
              </TD>
              <TD>{!g.eu && <AcoesDoGestor id={g.id} email={g.email} ativo={g.ativo} />}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
