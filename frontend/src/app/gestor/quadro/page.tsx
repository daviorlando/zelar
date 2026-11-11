import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EsqueletoDeQuadro } from "@/components/zelar/esqueletos";
import { Notice } from "@/components/zelar/feedback";
import { PageHeader } from "@/components/zelar/misc";
import { FREQUENCIAS, ROTULO_FREQUENCIA, type Frequencia } from "@/lib/plano";
import { MOTIVO, nomeLegivel, type CartaoDaOrdem, type SituacaoDaOrdem } from "@/lib/quadro";
import { hojeNaUnidade, periodoQueContem, somarDias } from "@/lib/schedule";
import { setoresComAtividades } from "@/lib/setores";
import { supabaseForUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AoVivo } from "./ao-vivo";
import { DetalheDaOrdem } from "./detalhe";
import { Quadro } from "./quadro";

export const metadata = { title: "Quadro" };

type Filtros = { periodo: "hoje" | "semana" | "tudo"; setor: string | null; freq: Frequencia | null };

function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const periodo = um("periodo");
  const setor = um("setor");
  const freq = um("freq");
  return {
    periodo: periodo === "semana" || periodo === "tudo" ? periodo : "hoje",
    setor: setor && /^[A-Z]$/.test(setor) ? setor : null,
    freq: FREQUENCIAS.includes(freq as Frequencia) ? (freq as Frequencia) : null,
  };
}

/** Query string dos filtros (sem a ordem aberta), para links e para fechar o detalhe. */
function consultaDe(f: Filtros, troca: Partial<Filtros> = {}) {
  const x = { ...f, ...troca };
  const p = new URLSearchParams();
  if (x.periodo !== "hoje") p.set("periodo", x.periodo);
  if (x.setor) p.set("setor", x.setor);
  if (x.freq) p.set("freq", x.freq);
  return p.toString();
}

export default function QuadroPage(props: PageProps<"/gestor/quadro">) {
  return (
    <>
      <PageHeader eyebrow="Acompanhar" title="Quadro">
        As ordens de manutenção, do que falta fazer ao que já foi validado. Clique no nome para ver as respostas do celular.
      </PageHeader>
      <Suspense fallback={<EsqueletoDeQuadro colunas={5} />}>
        <Conteudo {...props} />
      </Suspense>
    </>
  );
}

type Linha = {
  id: string;
  sector_code: string;
  frequency: Frequencia;
  due_date: string;
  status: SituacaoDaOrdem;
  returned_reason: string | null;
  equipment: { tag: string; name: string | null };
  work_order_item: { result: string | null; block_reason: string | null }[];
};

async function Conteudo({ searchParams }: PageProps<"/gestor/quadro">) {
  await connection();
  const sp = await searchParams;
  const f = lerFiltros(sp);
  const ordemAberta = typeof sp.ordem === "string" ? sp.ordem : null;
  const hoje = hojeNaUnidade();
  // "Hoje" = vence hoje ou já venceu; "Semana" = até domingo; "Tudo" = todo período já começado.
  const limite = f.periodo === "hoje" ? hoje : f.periodo === "semana" ? periodoQueContem("weekly", hoje).period_end : null;

  const supabase = await supabaseForUser();
  let consulta = supabase
    .from("work_order")
    .select("id, sector_code, frequency, due_date, status, returned_reason, equipment:equipment_id (tag, name), work_order_item (result, block_reason)")
    .lte("period_start", hoje)
    .neq("status", "cancelled")
    // Concluídas: só as validadas na última semana.
    .or(`status.neq.done,validated_at.gte.${somarDias(hoje, -7)}`)
    .order("due_date")
    .range(0, 4999);
  // Fora do prazo do filtro, ainda aparece o que alguém já mexeu: o gestor não pode perder uma ordem concluída.
  if (limite) consulta = consulta.or(`due_date.lte.${limite},status.neq.open`);
  if (f.setor) consulta = consulta.eq("sector_code", f.setor);
  if (f.freq) consulta = consulta.eq("frequency", f.freq);
  const [{ data, error }, setores, iniciados] = await Promise.all([
    consulta,
    setoresComAtividades(),
    supabase.from("sector").select("code", { count: "exact", head: true }).not("start_date", "is", null),
  ]);
  if (error) return <p className="text-destructive">Não consegui carregar o quadro: {error.message}</p>;

  const ordens: CartaoDaOrdem[] = (data as unknown as Linha[]).map((o) => ({
    id: o.id,
    equipamento: nomeLegivel(o.equipment.name, o.equipment.tag),
    tag: o.equipment.tag,
    setor: o.sector_code,
    frequencia: o.frequency,
    vencimento: o.due_date,
    situacao: o.status,
    total: o.work_order_item.length,
    // Impedido e pulado não estão feitos: igual ao anel do celular.
    respondidos: o.work_order_item.filter((i) => i.result && i.result !== "blocked" && i.result !== "skipped").length,
    pulados: o.work_order_item.filter((i) => i.result === "skipped").length,
    // Medição fora da faixa também é problema, como no celular.
    problemas: o.work_order_item.filter((i) => i.result === "problem" || i.block_reason === "out_of_range").length,
    impedimentos: o.work_order_item
      .filter((i) => i.result === "blocked")
      .map((i) => (i.block_reason ? (MOTIVO[i.block_reason] ?? i.block_reason) : "Sem motivo")),
    devolvida: !!o.returned_reason,
  }));
  const codigos = setores.filter((s) => s.atividades > 0).map((s) => s.code);
  const base = consultaDe(f);

  return (
    <>
      <div className="mb-4 flex flex-col gap-1.5">
        <Filtro rotulo="Prazo">
          <Pilula href={consultaDe(f, { periodo: "hoje" })} ativa={f.periodo === "hoje"}>
            Hoje e atrasadas
          </Pilula>
          <Pilula href={consultaDe(f, { periodo: "semana" })} ativa={f.periodo === "semana"}>
            Esta semana
          </Pilula>
          <Pilula href={consultaDe(f, { periodo: "tudo" })} ativa={f.periodo === "tudo"}>
            Tudo em aberto
          </Pilula>
        </Filtro>
        <Filtro rotulo="Setor">
          <Pilula href={consultaDe(f, { setor: null })} ativa={!f.setor}>
            Todos
          </Pilula>
          {codigos.map((c) => (
            <Pilula key={c} href={consultaDe(f, { setor: c })} ativa={f.setor === c}>
              {c}
            </Pilula>
          ))}
        </Filtro>
        <Filtro rotulo="Frequência">
          <Pilula href={consultaDe(f, { freq: null })} ativa={!f.freq}>
            Todas
          </Pilula>
          {FREQUENCIAS.map((q) => (
            <Pilula key={q} href={consultaDe(f, { freq: q })} ativa={f.freq === q}>
              {ROTULO_FREQUENCIA[q]}
            </Pilula>
          ))}
        </Filtro>
      </div>

      {iniciados.count === 0 && (
        <Notice tone="info">
          Nenhum setor iniciado: o quadro fica vazio até você começar a operação em{" "}
          <Link href="/gestor/implantacao" className="font-medium underline">
            Implantação
          </Link>
          .
        </Notice>
      )}
      <AoVivo />
      <Quadro ordens={ordens} hoje={hoje} consulta={base} />

      {ordemAberta && (
        <Suspense>
          <DetalheDaOrdem id={ordemAberta} voltar={`/gestor/quadro${base ? `?${base}` : ""}`} />
        </Suspense>
      )}
    </>
  );
}

function Filtro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    // Uma linha por filtro: no celular rola para o lado em vez de empilhar e empurrar o quadro.
    <div className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 whitespace-nowrap md:mx-0 md:flex-wrap md:px-0">
      <span className="mr-1 w-20 shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

function Pilula({ href, ativa, children }: { href: string; ativa: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={`/gestor/quadro${href ? `?${href}` : ""}`}
      scroll={false}
      aria-current={ativa ? "true" : undefined}
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-sm transition-colors",
        ativa ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
