import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/zelar/card";
import { TabelaEsqueleto } from "@/components/zelar/esqueletos";
import { Empty } from "@/components/zelar/feedback";
import { PageHeader } from "@/components/zelar/misc";
import { Table, TD, TH, TR } from "@/components/zelar/table";
import { supabaseForUser } from "@/lib/supabase/server";
import { todasAsLinhas } from "@/lib/supabase/todas-as-linhas";
import { excluirSetor, salvarSetor } from "../actions";
import { BotaoExcluir, FormularioDeSetor } from "../formularios";

export const metadata = { title: "Setores" };

export default function SetoresPage() {
  return (
    <>
      <PageHeader eyebrow="Configuração" title="Setores">
        As áreas da fábrica. Cada funcionário vê no celular as tarefas dos setores marcados no cadastro dele.
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

async function Lista() {
  await connection();
  const supabase = await supabaseForUser();
  // Acima de 1000 linhas o banco cortava a contagem sem avisar: equipamentos vêm somados do
  // banco; funcionários em páginas (conta também os desativados, que ainda impedem excluir).
  const [setores, resumo, pessoas] = await Promise.all([
    supabase.from("sector").select("code, name").order("code"),
    supabase.from("resumo_do_setor").select("code, equipamentos"),
    todasAsLinhas((de, ate) =>
      supabase.from("worker_sector").select("sector_code").order("worker_id").order("sector_code").range(de, ate),
    ),
  ]);
  if (setores.error) return <Card>Não consegui carregar: {setores.error.message}</Card>;
  const nEquip = new Map((resumo.data ?? []).map((r) => [r.code, r.equipamentos]));
  const nPessoas = new Map<string, number>();
  for (const l of pessoas.data) nPessoas.set(l.sector_code, (nPessoas.get(l.sector_code) ?? 0) + 1);

  return (
    <Card title={`${setores.data.length} setores`} actions={<FormularioDeSetor acao={salvarSetor} />}>
      {setores.data.length === 0 ? (
        <Empty>Nenhum setor ainda.</Empty>
      ) : (
        <Table rotulo="Setores">
          <thead>
            <tr>
              <TH width={80}>Letra</TH>
              <TH>Nome</TH>
              <TH num>Equipamentos</TH>
              <TH num>Funcionários</TH>
              <TH width={88}>
                <span className="sr-only">Ações</span>
              </TH>
            </tr>
          </thead>
          <tbody>
            {setores.data.map((s) => (
              <TR key={s.code}>
                <TD className="font-medium text-foreground">{s.code}</TD>
                <TD>{s.name}</TD>
                <TD num>{nEquip.get(s.code) ?? 0}</TD>
                <TD num>{nPessoas.get(s.code) ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <FormularioDeSetor acao={salvarSetor} setor={s} />
                    <BotaoExcluir
                      rotulo={`Excluir setor ${s.code}`}
                      titulo={`Excluir o setor ${s.code}?`}
                      explicacao="Só dá para excluir um setor sem equipamentos e sem funcionários marcados."
                      acao={excluirSetor.bind(null, s.code)}
                    />
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
