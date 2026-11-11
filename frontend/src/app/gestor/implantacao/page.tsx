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

function contar<T>(linhas: T[] | null, chave: (l: T) => string) {
  const m = new Map<string, number>();
  for (const l of linhas ?? []) m.set(chave(l), (m.get(chave(l)) ?? 0) + 1);
  return m;
}

type Atividade = { sector_code: string; frequency: Frequencia; equipment: { id: string; parent_id: string | null } | null };

async function Setores() {
  await connection();
  const supabase = await supabaseForUser();
  const [setores, equipamentos, atividades, pessoas, respondidas, mexidas] = await Promise.all([
    supabase.from("sector").select("code, name, start_date").order("code"),
    supabase.from("equipment").select("sector_code").is("parent_id", null).is("archived_at", null).range(0, 9999),
    supabase.from("plan_item").select("sector_code, frequency, equipment:equipment_id (id, parent_id)").eq("status", "active").range(0, 9999),
    supabase.from("worker_sector").select("sector_code, worker!inner(active)").eq("worker.active", true).range(0, 9999),
    supabase.from("work_order_item").select("work_order!inner(sector_code)").not("result", "is", null).range(0, 9999),
    supabase.from("work_order").select("sector_code").or("status.neq.open,returned_reason.not.is.null").range(0, 9999),
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

  const nEquip = contar(equipamentos.data, (l) => l.sector_code);
  const nPessoas = contar(pessoas.data, (l) => l.sector_code);
  const linhas = (atividades.data ?? []) as unknown as Atividade[];
  const nAtividades = contar(linhas, (l) => l.sector_code);
  const tocados = new Set([
    ...(mexidas.data ?? []).map((l) => l.sector_code),
    ...((respondidas.data ?? []) as unknown as { work_order: { sector_code: string } }[]).map((l) => l.work_order.sector_code),
  ]);

  // Uma ordem por equipamento principal e frequência: é isso que a prévia multiplica pelos períodos.
  const grupos = (codigo: string) => {
    const vistos = new Map<Frequencia, Set<string>>();
    for (const a of linhas) {
      if (a.sector_code !== codigo || !a.equipment) continue;
      if (!vistos.has(a.frequency)) vistos.set(a.frequency, new Set());
      vistos.get(a.frequency)!.add(a.equipment.parent_id ?? a.equipment.id);
    }
    return Object.fromEntries([...vistos].map(([f, s]) => [f, s.size])) as Partial<Record<Frequencia, number>>;
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {setores.data.map((s) => {
        const equip = nEquip.get(s.code) ?? 0;
        const ativ = nAtividades.get(s.code) ?? 0;
        const gente = nPessoas.get(s.code) ?? 0;
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
                podeDesfazer={!tocados.has(s.code)}
                grupos={grupos(s.code)}
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
