"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fundoSuaveDoTom } from "@/components/zelar/badge";
import { SensorDeMouse, SensorDeToque } from "@/components/zelar/sensores";
import { COLUNAS, type CartaoDaOrdem, type SituacaoDaOrdem } from "@/lib/quadro";
import { cn } from "@/lib/utils";
import { cancelar, devolver, liberar, validar } from "./actions";
import { Cartao, type AcaoDoCartao } from "./cartao";
import { PedirMotivo } from "./motivo";

const TITULO = Object.fromEntries(COLUNAS.map((c) => [c.id, c.titulo])) as Record<string, string>;

/* O leitor de tela ouve o arrasto em português. */
const ANUNCIOS = {
  onDragStart: () => "Peguei a ordem. Use as setas para mover, espaço para soltar, Escape para desistir.",
  onDragOver: ({ over }: { over: { id: string | number } | null }) =>
    over ? `Sobre ${TITULO[String(over.id)] ?? over.id}.` : "Fora de qualquer coluna.",
  onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
    over ? `Soltei em ${TITULO[String(over.id)] ?? over.id}.` : "Soltei fora; a ordem voltou ao lugar.",
  onDragCancel: () => "Desisti; a ordem voltou ao lugar.",
};

type Pedido = { acao: "devolver" | "cancelar" | "liberar"; ordem: CartaoDaOrdem };

const TEXTO_DO_PEDIDO = {
  devolver: {
    titulo: "Devolver",
    explicacao: "A ordem volta para o celular do funcionário. Diga o que falta ou o que precisa ser refeito.",
    confirmar: "Devolver",
    sucesso: "devolvida ao funcionário",
  },
  cancelar: {
    titulo: "Cancelar",
    explicacao: "A ordem sai do quadro e não é mais cobrada. Fica registrado quem cancelou e por quê.",
    confirmar: "Cancelar ordem",
    sucesso: "cancelada",
  },
  liberar: {
    titulo: "Liberar",
    explicacao: "Os itens impedidos voltam a ficar pendentes e o funcionário é avisado no celular. Diga o que foi resolvido.",
    confirmar: "Liberar para refazer",
    sucesso: "liberada para refazer",
  },
} as const;

/**
 * O quadro de ordens. As colunas seguem as respostas do celular; o gestor só move
 * onde a decisão é dele: validar (Aguardando validação → Concluída), devolver e
 * liberar um impedimento (→ A fazer). Cancelar fica no menu do cartão. O movimento é otimista e volta se
 * o servidor recusar.
 */
export function Quadro({ ordens, hoje, consulta }: { ordens: CartaoDaOrdem[]; hoje: string; consulta: string }) {
  // Mudanças otimistas valem só para a lista que as originou: quando o servidor
  // manda a lista nova (depois da ação), elas deixam de existir sozinhas.
  const [otimista, setOtimista] = useState<{ base: CartaoDaOrdem[]; m: Record<string, SituacaoDaOrdem> }>({ base: ordens, m: {} });
  const mudancas = otimista.base === ordens ? otimista.m : {};
  const [arrastando, setArrastando] = useState<CartaoDaOrdem | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [, iniciar] = useTransition();

  const sensores = useSensors(
    useSensor(SensorDeMouse, { activationConstraint: { distance: 6 } }),
    useSensor(SensorDeToque, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const situacao = (o: CartaoDaOrdem) => mudancas[o.id] ?? o.situacao;
  const mover = (id: string, para: SituacaoDaOrdem | null) =>
    setOtimista((atual) => {
      const m = { ...(atual.base === ordens ? atual.m : {}) };
      if (para) m[id] = para;
      else delete m[id];
      return { base: ordens, m };
    });
  const href = (id: string) => `?${consulta ? `${consulta}&` : ""}ordem=${id}`;

  function fazerValidar(ordem: CartaoDaOrdem) {
    // Com item sem resposta, a decisão é no detalhe, que mostra quais são e pede o aceite.
    if (ordem.pulados > 0) {
      toast.info(`${ordem.equipamento} tem ${ordem.pulados} sem resposta: abra a ordem para validar.`);
      return;
    }
    mover(ordem.id, "done");
    iniciar(async () => {
      const r = await validar(ordem.id);
      if (r.erro) {
        mover(ordem.id, null);
        toast.error(r.erro);
      } else toast.success(`${ordem.equipamento}: validada.`);
    });
  }

  async function confirmarPedido(motivo: string) {
    if (!pedido) return;
    const { acao, ordem } = pedido;
    const r = await { devolver, cancelar, liberar }[acao](ordem.id, motivo);
    if (r.erro) return r.erro;
    toast.success(`${ordem.equipamento}: ${TEXTO_DO_PEDIDO[acao].sucesso}.`);
  }

  function agir(acao: AcaoDoCartao, ordem: CartaoDaOrdem) {
    if (acao === "validar") fazerValidar({ ...ordem, situacao: situacao(ordem) });
    else setPedido({ acao, ordem });
  }

  function aoSoltar(e: DragEndEvent) {
    setArrastando(null);
    const ordem = e.active.data.current as CartaoDaOrdem | undefined;
    const para = e.over?.id as SituacaoDaOrdem | undefined;
    if (!ordem || !para) return;
    const de = situacao(ordem);
    if (de === para) return;
    if (de === "awaiting_validation" && para === "done") return fazerValidar(ordem);
    if ((de === "awaiting_validation" || de === "done") && para === "open") return setPedido({ acao: "devolver", ordem });
    if (de === "blocked" && para === "open") return setPedido({ acao: "liberar", ordem });
    toast.info(
      de === "blocked"
        ? "Para tirar daqui, libere o impedimento: arraste para A fazer ou use o menu do cartão."
        : para === "done"
          ? "Para concluir, a ordem precisa estar em Aguardando validação: o funcionário conclui no celular."
          : "Essa coluna muda sozinha pelas respostas do celular.",
    );
  }

  return (
    <>
      <DndContext
        // Id fixo: sem ele, os ids de acessibilidade do servidor e do navegador divergem (erro de hidratação).
        id="quadro-de-ordens"
        sensors={sensores}
        collisionDetection={pointerWithin}
        accessibility={{ announcements: ANUNCIOS }}
        onDragStart={(e: DragStartEvent) => setArrastando((e.active.data.current as CartaoDaOrdem) ?? null)}
        onDragCancel={() => setArrastando(null)}
        onDragEnd={aoSoltar}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
          {COLUNAS.map((col) => {
            const daColuna = ordens.filter((o) => situacao(o) === col.id);
            return (
              <Coluna key={col.id} id={col.id} titulo={col.titulo} ajuda={col.ajuda} tom={col.tom} total={daColuna.length}>
                {daColuna.map((o) => (
                  <Cartao key={o.id} ordem={{ ...o, situacao: situacao(o) }} hoje={hoje} href={href(o.id)} aoAgir={agir} />
                ))}
              </Coluna>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {arrastando && <Cartao ordem={arrastando} hoje={hoje} href={href(arrastando.id)} fantasma />}
        </DragOverlay>
      </DndContext>

      {pedido && (
        <PedirMotivo
          titulo={`${TEXTO_DO_PEDIDO[pedido.acao].titulo} ${pedido.ordem.equipamento}`}
          explicacao={TEXTO_DO_PEDIDO[pedido.acao].explicacao}
          confirmar={TEXTO_DO_PEDIDO[pedido.acao].confirmar}
          rotulo={pedido.acao === "liberar" ? "O que foi resolvido" : "Motivo"}
          perigo={pedido.acao === "cancelar"}
          aoConfirmar={confirmarPedido}
          aoFechar={() => setPedido(null)}
        />
      )}
    </>
  );
}

function Coluna({
  id,
  titulo,
  ajuda,
  tom,
  total,
  children,
}: {
  id: string;
  titulo: string;
  ajuda: string;
  tom: string;
  total: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${titulo}: ${total}`}
      className={cn(
        "flex w-[80vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-md border border-border p-2 transition-colors sm:w-72 xl:w-auto xl:max-w-none xl:min-w-0 xl:flex-1",
        fundoSuaveDoTom(tom),
        isOver && "border-brand-border bg-primary-soft",
      )}
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1 pb-2" title={ajuda}>
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        <span className="num text-sm text-muted-foreground">{total}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-15rem)] min-h-24 flex-col gap-2 overflow-y-auto">
        {total === 0 ? <p className="px-1.5 py-4 text-center text-xs text-subtle-foreground">{ajuda}</p> : children}
      </div>
    </section>
  );
}
