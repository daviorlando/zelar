import { Plus, Printer } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { button } from "@/components/zelo/button";
import { Card } from "@/components/zelo/card";
import { TabelaEsqueleto } from "@/components/zelo/esqueletos";
import { Empty } from "@/components/zelo/feedback";
import { PageHeader } from "@/components/zelo/misc";
import { Avatar } from "@/components/zelo/painel/avatar";
import { Table, TD, TH, TR } from "@/components/zelo/table";
import { supabaseForUser } from "@/lib/supabase/server";
import { PHOTO_BUCKET, type Worker } from "@/lib/workers";
import { cn } from "@/lib/utils";
import { rotateBadge, setActive } from "./actions";
import { ConfirmButton } from "./ConfirmButton";

export const metadata = { title: "Funcionários" };

export default function WorkersPage(props: PageProps<"/gestor/funcionarios">) {
  return (
    <>
      <PageHeader eyebrow="Cadastros" title="Funcionários">
        Quem usa o aplicativo de campo e o crachá de entrada de cada um.
      </PageHeader>
      <Suspense
        fallback={
          <Card>
            <TabelaEsqueleto colunas={5} />
          </Card>
        }
      >
        <WorkerTable {...props} />
      </Suspense>
    </>
  );
}

type Linha = Pick<
  Worker,
  "id" | "name" | "photo_path" | "badge_version" | "active"
> & { worker_sector: { sector_code: string }[] };

const setoresDe = (w: Linha) =>
  w.worker_sector.map((s) => s.sector_code).sort().join(" · ") || "sem setor";

async function WorkerTable({
  searchParams,
}: PageProps<"/gestor/funcionarios">) {
  // Dados do gestor conectado: sempre na hora do pedido, nunca no prerender.
  await connection();
  const q = (await searchParams).q;
  const busca = typeof q === "string" ? q.trim() : "";

  const supabase = await supabaseForUser();
  let consulta = supabase
    .from("worker")
    .select("id, name, photo_path, badge_version, active, worker_sector (sector_code)")
    .order("active", { ascending: false })
    .order("name");
  if (busca)
    consulta = consulta.ilike("name", `%${busca.replace(/[%_]/g, "")}%`);
  const { data, error } = await consulta;
  if (error) return <Card>Não consegui carregar: {error.message}</Card>;
  const workers = data as Linha[];

  const paths = workers.flatMap((w) => (w.photo_path ? [w.photo_path] : []));
  const signed = paths.length
    ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600))
        .data
    : [];
  const photo = new Map(
    signed?.flatMap((s) =>
      s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [],
    ),
  );
  const ativos = workers.filter((w) => w.active).length;

  // Um só formulário: as caixas vão para a impressão (GET); os botões das linhas
  // chamam a ação do servidor com o id já ligado (bind).
  return (
    <form action="/gestor/funcionarios/imprimir">
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {busca ? `Resultado para “${busca}”` : "Pessoas"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {workers.length} {workers.length === 1 ? "pessoa" : "pessoas"} ·{" "}
              {ativos} {ativos === 1 ? "ativa" : "ativas"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {busca && (
              <Link
                href="/gestor/funcionarios"
                className={button({ variant: "ghost" })}
              >
                Limpar busca
              </Link>
            )}
            <button type="submit" className={button()}>
              <Printer className="size-4" aria-hidden /> Imprimir marcados
            </button>
            <Link
              href="/gestor/funcionarios/novo"
              className={button({ variant: "primary" })}
            >
              <Plus className="size-4" aria-hidden /> Novo funcionário
            </Link>
          </div>
        </div>

        {workers.length === 0 ? (
          <Empty>
            {busca
              ? "Ninguém com esse nome."
              : "Nenhum funcionário ainda. Comece em Novo funcionário."}
          </Empty>
        ) : (
          <>
            {/* Celular: uma pessoa por cartão, ações embaixo (a tabela rolaria de lado e cortaria os botões). */}
            <ul className="flex flex-col gap-2 md:hidden">
              {workers.map((w) => (
                <li
                  key={w.id}
                  className="rounded-md border border-border bg-muted/40 p-3"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={w.id}
                      disabled={!w.active}
                      aria-label={`Imprimir crachá de ${w.name}`}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <Link
                      href={`/gestor/funcionarios/${w.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar
                        nome={w.name}
                        foto={w.photo_path ? photo.get(w.photo_path) : null}
                        className="size-10"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {w.name}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              w.active ? "bg-primary" : "bg-subtle-foreground",
                            )}
                            aria-hidden
                          />
                          {w.active ? "Ativo" : "Desativado"} · Setores{" "}
                          {setoresDe(w)}
                        </span>
                      </span>
                    </Link>
                  </div>
                  <AcoesDaLinha w={w} />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table rotulo="Funcionários">
                <thead>
                  <tr>
                    <TH width={40}>
                      <span className="sr-only">Imprimir</span>
                    </TH>
                    <TH>Pessoa</TH>
                    <TH>Setores</TH>
                    <TH>Crachá</TH>
                    <TH>Situação</TH>
                    <TH>
                      <span className="sr-only">Ações</span>
                    </TH>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <TR key={w.id}>
                      <TD>
                        <input
                          type="checkbox"
                          name="ids"
                          value={w.id}
                          disabled={!w.active}
                          aria-label={`Imprimir crachá de ${w.name}`}
                          className="size-4 accent-[var(--primary)]"
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/gestor/funcionarios/${w.id}`}
                          className="group flex items-center gap-3"
                        >
                          <Avatar
                            nome={w.name}
                            foto={w.photo_path ? photo.get(w.photo_path) : null}
                            className="size-9"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground group-hover:underline">
                              {w.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Abrir cadastro
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <span
                          className={cn(
                            w.worker_sector.length ? "text-foreground" : "text-warning",
                          )}
                        >
                          {setoresDe(w)}
                        </span>
                      </TD>
                      <TD>
                        <span className="num text-foreground">
                          nº {w.badge_version}
                        </span>
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              w.active ? "bg-primary" : "bg-subtle-foreground",
                            )}
                            aria-hidden
                          />
                          {w.active ? "Ativo" : "Desativado"}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <AcoesDaLinha w={w} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Desativar mantém o histórico; não há exclusão. &quot;Crachá
          perdido&quot; invalida o crachá impresso na próxima atualização do
          celular.
        </p>
      </Card>
    </form>
  );
}

/** Imprimir, crachá perdido e desativar/reativar: as mesmas na tabela e nos cartões do celular. */
function AcoesDaLinha({ w }: { w: Linha }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 md:mt-0 md:justify-end">
      {w.active && (
        <Link
          href={`/gestor/funcionarios/imprimir?ids=${w.id}`}
          className={button({ size: "small" })}
        >
          Imprimir
        </Link>
      )}
      {w.active && (
        <ConfirmButton
          formAction={rotateBadge.bind(null, w.id)}
          className={button({ size: "small" })}
          message={`Gerar crachá novo para ${w.name}? O crachá impresso antes deixa de funcionar.`}
        >
          Crachá perdido
        </ConfirmButton>
      )}
      <ConfirmButton
        formAction={setActive.bind(null, w.id)}
        className={button({
          size: "small",
          variant: w.active ? "danger" : "default",
        })}
        message={
          w.active
            ? `Desativar ${w.name}? O crachá e as figuras deixam de entrar.`
            : `Reativar ${w.name}?`
        }
      >
        {w.active ? "Desativar" : "Reativar"}
      </ConfirmButton>
    </div>
  );
}
