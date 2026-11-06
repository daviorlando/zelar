import { AlertTriangle, Ban, CheckCircle2, CircleHelp, Gauge, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/zelo/badge";
import { PilulaDeFrequencia } from "@/components/zelo/frequencia";
import type { Frequencia } from "@/lib/plano";
import { COLUNAS, MOTIVO, nomeLegivel, prazoRelativo, RESULTADO } from "@/lib/quadro";
import { hojeNaUnidade } from "@/lib/schedule";
import { supabaseForUser } from "@/lib/supabase/server";
import { AcoesDoDetalhe, PainelLateral } from "./painel";

type Item = {
  id: string;
  result: string | null;
  measured_value: number | null;
  block_reason: string | null;
  device_time: string | null;
  worker: { name: string } | null;
  plan_item: {
    activity: string;
    instruction_kind: string;
    item_type: string;
    measurement_unit: string | null;
    source_row: number;
    equipment: { tag: string; name: string | null } | null;
  };
  evidence: { kind: "photo" | "audio"; storage_path: string }[];
};

type Ordem = {
  id: string;
  status: string;
  frequency: Frequencia;
  sector_code: string;
  period_start: string;
  period_end: string;
  due_date: string;
  finished_at: string | null;
  validated_at: string | null;
  returned_reason: string | null;
  released_note: string | null;
  cancel_reason: string | null;
  equipment: { tag: string; name: string | null };
  work_order_item: Item[];
};

const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const dia = (d: string) => data.format(new Date(`${d}T12:00:00Z`));

const ICONE = { ok: CheckCircle2, done: CheckCircle2, measured: Gauge, problem: AlertTriangle, blocked: Ban, skipped: CircleHelp } as const;

/** Detalhe de uma ordem: o que o celular respondeu em cada atividade, com foto e áudio. */
export async function DetalheDaOrdem({ id, voltar }: { id: string; voltar: string }) {
  const supabase = await supabaseForUser();
  const { data: ordem } = await supabase
    .from("work_order")
    .select(
      `id, status, frequency, sector_code, period_start, period_end, due_date, finished_at, validated_at, returned_reason, released_note, cancel_reason,
       equipment:equipment_id (tag, name),
       work_order_item (id, result, measured_value, block_reason, device_time,
         worker:executed_by (name),
         plan_item:plan_item_id (activity, instruction_kind, item_type, measurement_unit, source_row, equipment:equipment_id (tag, name)),
         evidence (kind, storage_path))`,
    )
    .eq("id", id)
    .maybeSingle<Ordem>();

  if (!ordem) {
    return (
      <PainelLateral titulo="Ordem" voltar={voltar}>
        <p className="text-muted-foreground">Ordem não encontrada.</p>
      </PainelLateral>
    );
  }

  // Impedidos e pulados primeiro: é por eles que o gestor abriu a ordem.
  const impedido = (i: Item) => (i.result === "blocked" ? 0 : i.result === "skipped" ? 1 : 2);
  const itens = [...ordem.work_order_item].sort((a, b) => impedido(a) - impedido(b) || a.plan_item.source_row - b.plan_item.source_row);
  const caminhos = itens.flatMap((i) => i.evidence.map((e) => e.storage_path));
  const assinadas = caminhos.length ? (await supabase.storage.from("evidence").createSignedUrls(caminhos, 3600)).data ?? [] : [];
  const url = new Map(assinadas.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  const nome = nomeLegivel(ordem.equipment.name, ordem.equipment.tag);
  const coluna = COLUNAS.find((c) => c.id === ordem.status);
  const prazo = prazoRelativo(ordem.due_date, hojeNaUnidade());
  const pulados = itens.filter((i) => i.result === "skipped").length;
  const respondidos = itens.filter((i) => i.result && i.result !== "skipped" && i.result !== "blocked").length;
  const quem = [...new Set(itens.flatMap((i) => (i.worker ? [i.worker.name] : [])))];

  return (
    <PainelLateral titulo={nome} voltar={voltar}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={coluna?.tom ?? "neutral"}>{coluna?.titulo ?? "Cancelada"}</Badge>
          <PilulaDeFrequencia f={ordem.frequency} />
          <span className="text-muted-foreground">
            Setor {ordem.sector_code} · {ordem.equipment.tag}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Período</dt>
            <dd className="text-foreground">
              {ordem.period_start === ordem.period_end ? dia(ordem.period_start) : `${dia(ordem.period_start)} a ${dia(ordem.period_end)}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Prazo</dt>
            <dd className={prazo.atrasada && !["done", "awaiting_validation"].includes(ordem.status) ? "text-destructive" : "text-foreground"}>
              {prazo.texto}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Respondidas</dt>
            <dd className="num text-foreground">
              {respondidos} de {itens.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Quem fez</dt>
            <dd className="text-foreground">{quem.join(", ") || "ninguém ainda"}</dd>
          </div>
          {ordem.finished_at && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Concluída no celular</dt>
              <dd className="text-foreground">{quando.format(new Date(ordem.finished_at))}</dd>
            </div>
          )}
        </dl>

        {ordem.returned_reason && ordem.status !== "awaiting_validation" && (
          <p className="rounded-sm border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">
            Devolvida: {ordem.returned_reason}
          </p>
        )}
        {ordem.released_note && (
          <p className="rounded-sm border border-info bg-info-soft px-3 py-2 text-sm text-info">Liberada: {ordem.released_note}</p>
        )}
        {ordem.cancel_reason && (
          <p className="rounded-sm border border-destructive bg-destructive-soft px-3 py-2 text-sm text-destructive">
            Cancelada: {ordem.cancel_reason}
          </p>
        )}

        {pulados > 0 && (
          <p className="rounded-sm border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">
            {pulados === 1 ? "1 item ficou" : `${pulados} itens ficaram`} sem resposta: o funcionário não soube responder.{ordem.status === "awaiting_validation" && " Valide assim mesmo ou devolva depois de explicar."}
          </p>
        )}

        <AcoesDoDetalhe id={ordem.id} nome={nome} situacao={ordem.status} pulados={pulados} />

        <ol className="flex flex-col divide-y divide-border border-t border-border">
          {itens.map((i) => {
            const r = i.result ? RESULTADO[i.result] : null;
            const Icone = i.result ? (ICONE[i.result as keyof typeof ICONE] ?? CheckCircle2) : null;
            const alvo = i.plan_item.equipment;
            return (
              <li key={i.id} className="flex flex-col gap-1.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {alvo ? nomeLegivel(alvo.name, alvo.tag) : ""} · {i.plan_item.instruction_kind}
                  </p>
                  {r && Icone ? (
                    <Badge tone={r.tom} className="inline-flex items-center gap-1">
                      <Icone className="size-3" aria-hidden />
                      {r.texto}
                    </Badge>
                  ) : (
                    <Badge>sem resposta</Badge>
                  )}
                </div>
                <p className="text-sm text-foreground">{i.plan_item.activity}</p>
                {(i.block_reason || i.measured_value != null) && (
                  <p className="text-sm font-medium text-foreground">
                    {i.measured_value != null && (
                      <span className="num">
                        {String(i.measured_value).replace(".", ",")} {i.plan_item.measurement_unit ?? ""}
                      </span>
                    )}
                    {i.measured_value != null && i.block_reason && " · "}
                    {i.block_reason && (MOTIVO[i.block_reason] ?? i.block_reason)}
                  </p>
                )}
                {i.evidence.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {i.evidence.map((e) =>
                      e.kind === "photo" ? (
                        <a key={e.storage_path} href={url.get(e.storage_path)} target="_blank" rel="noreferrer" title="Abrir a foto">
                          {url.get(e.storage_path) ? (
                            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
                            <img src={url.get(e.storage_path)} alt="Foto da resposta" className="size-20 rounded-sm border border-border object-cover" />
                          ) : (
                            <ImageIcon className="size-5" aria-label="Foto indisponível" />
                          )}
                        </a>
                      ) : (
                        <audio key={e.storage_path} controls preload="none" src={url.get(e.storage_path)} className="h-9 max-w-full">
                          Áudio da resposta
                        </audio>
                      ),
                    )}
                  </div>
                )}
                {i.device_time && i.worker && (
                  <p className="text-xs text-subtle-foreground">
                    {i.worker.name} · {quando.format(new Date(i.device_time))}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </PainelLateral>
  );
}
