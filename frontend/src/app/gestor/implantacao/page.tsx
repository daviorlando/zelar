import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/zelar/badge";
import { Card } from "@/components/zelar/card";
import { TabelaEsqueleto } from "@/components/zelar/esqueletos";
import { Empty, Notice } from "@/components/zelar/feedback";
import { PageHeader } from "@/components/zelar/misc";
import type { Frequencia } from "@/lib/plano";
import { hojeNaUnidade } from "@/lib/schedule";
import { supabaseForUser } from "@/lib/supabase/server";
import { AcoesDoSetor } from "./acoes";

export const metadata = { title: "Implantação" };

export default function ImplantacaoPage() {
  return (
    <>
      <PageHeader eyebrow="Configuração" title="Implantação">
        Cadastre os equipamentos, as atividades e os responsáveis de cada setor. O cronograma só começa quando você iniciar o setor.
      </PageHeader>
      <Suspense
        fallback={
          <Card>
            <TabelaEsqueleto colunas={4} />
          </Card>
        }
      >
        <Setores />
      </Suspense>
    </>
  );
}

const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/** Contagens somadas no banco: baixar as linhas e contar esbarrava no limite de 1000 linhas. */
type Resumo = {
  code: string;
  equipamentos: number;
  atividades: number;
  responsaveis: number;
  // Uma ordem por equipamento principal e frequência: é isso que a prévia multiplica pelos períodos.
  ordens_por_frequencia: Partial<Record<Frequencia, number>>;
  // Já tem resposta ou decisão: o início não pode mais ser desfeito.
  tocado: boolean;
};

async function Setores() {
  await connection();
  const supabase = await supabaseForUser();
  const [setores, resumos] = await Promise.all([
    supabase.from("sector").select("code, name, start_date").order("code"),
    supabase.from("resumo_do_setor").select("code, equipamentos, atividades, responsaveis, ordens_por_frequencia, tocado"),
  ]);
  if (setores.error) return <Notice tone="error">Não consegui carregar: {setores.error.message}</Notice>;
  if (setores.data.length === 0) {
    return (
      <Card>
        <Empty>
          Nenhum setor ainda.{" "}
          <Link href="/gestor/equipamentos/setores" className="underline">
            Cadastrar setores
          </Link>
        </Empty>
      </Card>
    );
  }

  const resumo = new Map(((resumos.data ?? []) as Resumo[]).map((r) => [r.code, r]));

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {setores.data.map((s) => {
        const r = resumo.get(s.code);
        const equip = r?.equipamentos ?? 0;
        const ativ = r?.atividades ?? 0;
        const gente = r?.responsaveis ?? 0;
        const iniciado = !!s.start_date;
        return (
          <Card key={s.code} title={`Setor ${s.code}`} actions={<Badge tone={iniciado ? "ok" : "neutral"}>{iniciado ? "Iniciado" : "Não iniciado"}</Badge>}>
            <div className="flex flex-col gap-3">
              {s.name !== `Setor ${s.code}` && <p className="text-sm text-muted-foreground">{s.name}</p>}
              <ul className="flex flex-col gap-1.5 text-sm">
                <ItemDaLista ok={equip > 0} href="/gestor/equipamentos" texto={`${equip} ${equip === 1 ? "equipamento" : "equipamentos"}`} />
                <ItemDaLista ok={ativ > 0} href="/gestor/equipamentos" texto={`${ativ} ${ativ === 1 ? "atividade" : "atividades"}`} />
                <ItemDaLista ok={gente > 0} href="/gestor/funcionarios" texto={`${gente} ${gente === 1 ? "responsável ativo" : "responsáveis ativos"}`} />
              </ul>
              {iniciado && <p className="text-sm text-muted-foreground">Início em {dia.format(new Date(`${s.start_date}T12:00:00Z`))}</p>}
              {iniciado && gente === 0 && <Notice tone="warn">Sem responsável ativo: as ordens deste setor estão vencendo sem ninguém para executar.</Notice>}
              <AcoesDoSetor
                codigo={s.code}
                iniciado={iniciado}
                podeIniciar={ativ > 0 && gente > 0}
                falta={ativ === 0 ? "Falta cadastrar atividades" : gente === 0 ? "Falta vincular um responsável" : null}
                podeDesfazer={!r?.tocado}
                grupos={r?.ordens_por_frequencia ?? {}}
                hoje={hojeNaUnidade()}
              />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ItemDaLista({ ok, href, texto }: { ok: boolean; href: string; texto: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={ok ? "text-success" : "text-warning"}>
        {ok ? "✓" : "○"}
      </span>
      <Link href={href} className="text-foreground hover:underline">
        {texto}
      </Link>
      <span className="sr-only">{ok ? "pronto" : "falta"}</span>
    </li>
  );
}
