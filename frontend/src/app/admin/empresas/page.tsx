import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/zelar/badge";
import { Card } from "@/components/zelar/card";
import { Empty, Loading, Notice } from "@/components/zelar/feedback";
import { PageHeader } from "@/components/zelar/misc";
import { supabaseAdmin } from "@/lib/supabase/server";
import { exigirSuperAdmin } from "@/lib/empresa";
import { AcoesDaEmpresa, NovaEmpresa, ReenviarAcesso } from "./formularios";

export const metadata = { title: "Empresas" };

export default function EmpresasPage() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow="Administração" title="Empresas">
          Cada empresa só enxerga os próprios dados. O primeiro gestor recebe o convite por e-mail.
        </PageHeader>
        <NovaEmpresa />
      </div>
      <Suspense fallback={<Loading what="empresas" />}>
        <Lista />
      </Suspense>
    </>
  );
}

async function Lista() {
  await connection();
  // A lista usa a chave secreta (todas as empresas): só depois de conferir o papel.
  if (!(await exigirSuperAdmin())) return null;
  const supabase = supabaseAdmin();
  const [empresas, perfis, contas] = await Promise.all([
    supabase.from("company").select("id, name, active, created_at").order("name"),
    supabase.from("app_user").select("user_id, company_id").eq("role", "manager"),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (empresas.error) return <Notice tone="error">Não consegui carregar: {empresas.error.message}</Notice>;
  if (empresas.data.length === 0) return <Empty>Nenhuma empresa ainda.</Empty>;
  const emailDe = new Map((contas.data?.users ?? []).map((u) => [u.id, { email: u.email ?? "", pendente: !!u.app_metadata?.trocar_senha }]));

  return (
    <div className="flex flex-col gap-3">
      {empresas.data.map((e) => {
        const gestores = (perfis.data ?? []).filter((p) => p.company_id === e.id).flatMap((p) => emailDe.get(p.user_id) ?? []);
        return (
          <Card
            key={e.id}
            title={e.name}
            actions={
              <div className="flex items-center gap-2">
                {e.active ? <Badge tone="ok">Ativa</Badge> : <Badge tone="danger">Desativada</Badge>}
                <AcoesDaEmpresa id={e.id} nome={e.name} ativa={e.active} />
              </div>
            }
          >
            {gestores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem gestores.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {gestores.map((g) => (
                  <li key={g.email} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all text-foreground">
                      {g.email} {g.pendente && <span className="text-muted-foreground">· ainda não criou a senha</span>}
                    </span>
                    <ReenviarAcesso email={g.email} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
