import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { button } from "@/components/zelo/button";
import { Card } from "@/components/zelo/card";
import { TabelaEsqueleto } from "@/components/zelo/esqueletos";
import { Empty } from "@/components/zelo/feedback";
import { PilulaDeFrequencia } from "@/components/zelo/frequencia";
import { PageHeader } from "@/components/zelo/misc";
import { Table, TD, TH, TR } from "@/components/zelo/table";
import { FREQUENCIAS, type Equipamento, type Frequencia } from "@/lib/plano";
import { supabaseForUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { salvarEquipamento } from "./actions";
import { FormularioDeEquipamento } from "./formularios";

export const metadata = { title: "Equipamentos" };

export default function EquipamentosPage(props: PageProps<"/gestor/equipamentos">) {
  return (
    <>
      <PageHeader eyebrow="Plano de manutenção" title="Equipamentos">
        Cada equipamento, seus componentes e quantas atividades tem em cada frequência. Abra um equipamento para alterar.
      </PageHeader>
      <Suspense
        fallback={
          <Card>
            <TabelaEsqueleto colunas={4} />
          </Card>
        }
      >
        <Lista {...props} />
      </Suspense>
    </>
  );
}

async function Lista({ searchParams }: PageProps<"/gestor/equipamentos">) {
  await connection();
  const sp = await searchParams;
  const filtro = typeof sp.setor === "string" ? sp.setor : null;
  const q = typeof sp.q === "string" ? sp.q.trim().toUpperCase() : "";

  const supabase = await supabaseForUser();
  const [eq, itens, cadastro] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, tag, name, parent_id, sector_code, brand, model, power_cv, rpm, working_temp, lubricant")
      .is("archived_at", null)
      .order("tag")
      .range(0, 9999),
    supabase.from("plan_item").select("equipment_id, frequency").eq("status", "active").range(0, 9999),
    supabase.from("sector").select("code").order("code"),
  ]);
  if (eq.error) return <Card>Não consegui carregar: {eq.error.message}</Card>;
  const todos = eq.data as Equipamento[];
  const codigos = (cadastro.data ?? []).map((s) => s.code);
  const acoes = (
    <div className="flex flex-wrap items-center gap-2">
      {codigos.length > 0 && <FormularioDeEquipamento acao={salvarEquipamento} setores={codigos} />}
      <Link href="/gestor/equipamentos/setores" className={button({ size: "small" })}>
        Setores
      </Link>
    </div>
  );
  if (todos.length === 0)
    return (
      <div className="flex flex-col gap-4">
        {acoes}
        <Card>
          <Empty>{codigos.length ? "Nenhum equipamento ainda." : "Crie um setor primeiro, em Setores."}</Empty>
        </Card>
      </div>
    );

  const principalDe = new Map(todos.map((e) => [e.id, e.parent_id ?? e.id]));
  const contagem = new Map<string, Partial<Record<Frequencia, number>>>();
  for (const i of itens.data ?? []) {
    if (!i.equipment_id) continue;
    const raiz = principalDe.get(i.equipment_id)!;
    const c = contagem.get(raiz) ?? {};
    c[i.frequency as Frequencia] = (c[i.frequency as Frequencia] ?? 0) + 1;
    contagem.set(raiz, c);
  }
  const componentes = new Map<string, number>();
  for (const e of todos) if (e.parent_id) componentes.set(e.parent_id, (componentes.get(e.parent_id) ?? 0) + 1);

  const setores = [...new Set(todos.map((e) => e.sector_code))].sort();
  const principais = todos.filter(
    (e) =>
      !e.parent_id &&
      (!filtro || e.sector_code === filtro) &&
      (!q || e.tag.includes(q) || (e.name ?? "").toUpperCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Filtrar por setor" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">Setor</span>
        {[null, ...setores].map((s) => (
          <Link
            key={s ?? "todos"}
            href={s ? `/gestor/equipamentos?setor=${s}` : "/gestor/equipamentos"}
            aria-current={filtro === s ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3 text-sm transition-colors",
              filtro === s ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {s ?? "Todos"}
          </Link>
        ))}
      </nav>
      {acoes}
      </div>

      {setores
        .filter((s) => principais.some((e) => e.sector_code === s))
        .map((s) => {
          const doSetor = principais.filter((e) => e.sector_code === s);
          return (
            <Card key={s} title={`Setor ${s}`} actions={<span className="text-sm text-muted-foreground">{doSetor.length} equipamentos</span>}>
              <Table rotulo={`Equipamentos do setor ${s}`}>
                <thead>
                  <tr>
                    <TH width={140}>Tag</TH>
                    <TH>Equipamento</TH>
                    <TH num>Componentes</TH>
                    <TH>Atividades por frequência</TH>
                  </tr>
                </thead>
                <tbody>
                  {doSetor.map((e) => {
                    const c = contagem.get(e.id) ?? {};
                    return (
                      <TR key={e.id}>
                        <TD className="num whitespace-nowrap text-muted-foreground">{e.tag}</TD>
                        <TD>
                          <Link href={`/gestor/equipamentos/${e.id}`} className="font-medium text-foreground hover:underline">
                            {e.name ?? e.tag}
                          </Link>
                        </TD>
                        <TD num>{componentes.get(e.id) ?? 0}</TD>
                        <TD>
                          <div className="flex flex-wrap gap-1">
                            {FREQUENCIAS.filter((f) => c[f]).map((f) => (
                              <PilulaDeFrequencia key={f} f={f}>
                                <span className="num">{c[f]}</span>
                              </PilulaDeFrequencia>
                            ))}
                            {FREQUENCIAS.every((f) => !c[f]) && <span className="text-sm text-subtle-foreground">sem atividades</span>}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          );
        })}
      {principais.length === 0 && (
        <Card>
          <Empty>Nenhum equipamento com esse filtro.</Empty>
        </Card>
      )}
    </div>
  );
}
