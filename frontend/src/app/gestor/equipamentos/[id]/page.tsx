import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/zelo/card";
import { EsqueletoDeDetalhe } from "@/components/zelo/esqueletos";
import { PilulaDeFrequencia } from "@/components/zelo/frequencia";
import { PageHeader } from "@/components/zelo/misc";
import { Table, TD, TH, TR } from "@/components/zelo/table";
import { FREQUENCIAS, ROTULO_FREQUENCIA, ROTULO_TIPO, type Atividade, type Equipamento } from "@/lib/plano";
import { supabaseForUser } from "@/lib/supabase/server";
import { excluirAtividade, excluirEquipamento, salvarAtividade, salvarEquipamento } from "../actions";
import { BotaoExcluir, FormularioDeAtividade, FormularioDeComponente, FormularioDeEquipamento } from "../formularios";

export const metadata = { title: "Equipamento" };

export default function EquipamentoPage(props: PageProps<"/gestor/equipamentos/[id]">) {
  return (
    <Suspense fallback={<EsqueletoDeDetalhe />}>
      <Detalhe {...props} />
    </Suspense>
  );
}

const TIPO_CURTO = { inspection: "Inspeção", action: "Ação", measurement: "Medição" } as const;
const CAMPOS = "id, tag, name, parent_id, sector_code, brand, model, power_cv, rpm, working_temp, lubricant";

async function Detalhe({ params }: PageProps<"/gestor/equipamentos/[id]">) {
  await connection();
  const { id } = await params;
  const supabase = await supabaseForUser();
  const { data: principal } = await supabase
    .from("equipment")
    .select(CAMPOS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle<Equipamento>();
  if (!principal || principal.parent_id) notFound();

  const [comps, cadastro] = await Promise.all([
    supabase.from("equipment").select(CAMPOS).eq("parent_id", id).is("archived_at", null).order("tag"),
    supabase.from("sector").select("code").order("code"),
  ]);
  const componentes = (comps.data ?? []) as Equipamento[];
  const alvos = [principal, ...componentes];
  const { data: itens } = await supabase
    .from("plan_item")
    .select("id, frequency, equipment_id, activity, instruction_kind, item_type, measurement_unit, measurement_min, measurement_max, status")
    .in("equipment_id", alvos.map((e) => e.id))
    .eq("status", "active")
    .order("created_at")
    .order("source_row");
  const atividades = (itens ?? []) as Atividade[];
  const nomeDe = new Map(alvos.map((e) => [e.id, e]));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader eyebrow={`Setor ${principal.sector_code} · ${principal.tag}`} title={principal.name ?? principal.tag}>
          {componentes.length} componentes · {atividades.length} atividades no plano
        </PageHeader>
        <div className="flex gap-2">
          <FormularioDeEquipamento
            acao={salvarEquipamento}
            setores={(cadastro.data ?? []).map((s) => s.code)}
            equipamento={principal}
          />
          <BotaoExcluir
            comTexto
            rotulo="Excluir"
            titulo={`Excluir ${principal.tag}?`}
            explicacao="O equipamento, os componentes e as atividades saem do plano, e as tarefas ainda não feitas saem do celular. O histórico de ordens já feitas continua guardado."
            acao={excluirEquipamento.bind(null, principal.id)}
            irPara="/gestor/equipamentos"
          />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Card title="Dados técnicos">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {(
              [
                ["Marca", principal.brand],
                ["Modelo", principal.model],
                ["Potência", principal.power_cv != null ? `${principal.power_cv} CV` : null],
                ["Rotação", principal.rpm != null ? `${principal.rpm} RPM` : null],
                ["Temperatura de trabalho", principal.working_temp],
                ["Lubrificante", principal.lubricant],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-muted-foreground">{rotulo}</dt>
                <dd className="text-foreground">{valor ?? "–"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Componentes" actions={<FormularioDeComponente acao={salvarEquipamento} principal={principal} />}>
          {componentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem componentes. As atividades podem ser do equipamento todo.</p>
          ) : (
            <Table rotulo="Componentes">
              <thead>
                <tr>
                  <TH width={170}>Tag</TH>
                  <TH>Nome</TH>
                  <TH>Marca · modelo</TH>
                  <TH num>CV</TH>
                  <TH num>RPM</TH>
                  <TH>Lubrificante</TH>
                  <TH width={88}>
                    <span className="sr-only">Ações</span>
                  </TH>
                </tr>
              </thead>
              <tbody>
                {componentes.map((c) => (
                  <TR key={c.id}>
                    <TD className="num whitespace-nowrap text-muted-foreground">{c.tag}</TD>
                    <TD className="text-foreground">{c.name ?? "–"}</TD>
                    <TD>{[c.brand, c.model].filter(Boolean).join(" · ") || "–"}</TD>
                    <TD num>{c.power_cv ?? "–"}</TD>
                    <TD num>{c.rpm ?? "–"}</TD>
                    <TD>{c.lubricant ?? "–"}</TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <FormularioDeComponente acao={salvarEquipamento} principal={principal} componente={c} />
                        <BotaoExcluir
                          rotulo={`Excluir ${c.tag}`}
                          titulo={`Excluir ${c.tag}?`}
                          explicacao="O componente e as atividades dele saem do plano e das tarefas ainda não feitas."
                          acao={excluirEquipamento.bind(null, c.id)}
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card
          title={atividades.length ? "Atividades" : "Sem atividades"}
          note={atividades.length ? undefined : "Sem atividades, o equipamento não gera tarefas para o celular."}
          actions={<FormularioDeAtividade acao={salvarAtividade} alvos={alvos} />}
        >
          <div className="flex flex-col gap-5">
            {FREQUENCIAS.map((f) => {
              const daFrequencia = atividades.filter((a) => a.frequency === f);
              if (daFrequencia.length === 0) return null;
              return (
                <section key={f} aria-label={`Atividades: ${ROTULO_FREQUENCIA[f]}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <PilulaDeFrequencia f={f} />
                    <span className="num text-xs text-muted-foreground">{daFrequencia.length}</span>
                  </div>
                  <ul className="flex flex-col divide-y divide-border">
                    {daFrequencia.map((a) => {
                      const alvo = a.equipment_id ? nomeDe.get(a.equipment_id) : null;
                      return (
                        <li key={a.id} className="flex items-start gap-3 py-2.5">
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              <span className="num">{alvo?.tag}</span>
                              <span>{alvo?.id === principal.id ? "equipamento todo" : alvo?.name}</span>
                              <span title={ROTULO_TIPO[a.item_type]}>· {TIPO_CURTO[a.item_type]}</span>
                              {a.item_type === "measurement" && (a.measurement_min != null || a.measurement_max != null) && (
                                <span className="num">
                                  · {a.measurement_min ?? "…"} a {a.measurement_max ?? "…"} {a.measurement_unit}
                                </span>
                              )}
                            </div>
                            <p className="text-md text-foreground">{a.activity}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <FormularioDeAtividade acao={salvarAtividade} alvos={alvos} atividade={a} />
                            <BotaoExcluir
                              rotulo="Excluir atividade"
                              titulo="Excluir esta atividade?"
                              explicacao="Ela sai do plano e das tarefas ainda não feitas. O que já foi respondido continua no histórico."
                              acao={excluirAtividade.bind(null, a.id)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
