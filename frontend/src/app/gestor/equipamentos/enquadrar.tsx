"use client";

import { Minus, Move, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/zelo/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aproximar, centralizar, escalaDe, prender, recortarQuadrado, type Enquadramento } from "@/lib/imagem";

/**
 * Antes de salvar, o gestor enquadra a máquina num quadrado: é exatamente o que o celular mostra.
 * Arrasta para posicionar e aproxima pelo controle ou pela roda do mouse. A foto sempre cobre o quadro.
 */
export function Enquadrar({
  imagem,
  url,
  onConfirmar,
  onCancelar,
}: {
  imagem: ImageBitmap;
  url: string;
  onConfirmar: (foto: Blob) => void;
  onCancelar: () => void;
}) {
  // O diálogo monta o conteúdo depois de abrir: o quadro chega por callback, e só então é medido.
  const [quadro, setQuadro] = useState<HTMLDivElement | null>(null);
  const [e, setE] = useState<Enquadramento | null>(null);
  const arrasto = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [salvando, setSalvando] = useState(false);

  // O lado do quadro depende da largura da tela: mede quando abre e quando a janela muda.
  useEffect(() => {
    if (!quadro) return;
    const medir = () =>
      setE((atual) => {
        const lado = quadro.clientWidth;
        if (!lado) return atual;
        if (!atual) return centralizar(imagem.width, imagem.height, lado);
        const fator = lado / atual.quadro;
        return prender({ ...atual, quadro: lado, x: atual.x * fator, y: atual.y * fator });
      });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(quadro);
    return () => obs.disconnect();
  }, [imagem, quadro]);

  const s = e ? escalaDe(e) : 0;

  async function confirmar() {
    if (!e) return;
    setSalvando(true);
    try {
      onConfirmar(await recortarQuadrado(imagem, e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onCancelar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enquadrar a foto</DialogTitle>
          <DialogDescription>Deixe a máquina inteira dentro do quadro. É assim que ela aparece no celular.</DialogDescription>
        </DialogHeader>
        <div
          ref={setQuadro}
          data-testid="quadro-da-foto"
          className="relative mx-auto aspect-square w-full max-w-80 cursor-grab touch-none select-none overflow-hidden rounded-md border-2 border-primary bg-muted active:cursor-grabbing"
          onPointerDown={(ev) => {
            if (!e) return;
            ev.currentTarget.setPointerCapture(ev.pointerId);
            arrasto.current = { px: ev.clientX, py: ev.clientY, x: e.x, y: e.y };
          }}
          onPointerMove={(ev) => {
            const a = arrasto.current;
            if (!a || !e) return;
            setE(prender({ ...e, x: a.x + ev.clientX - a.px, y: a.y + ev.clientY - a.py }));
          }}
          onPointerUp={() => (arrasto.current = null)}
          onPointerCancel={() => (arrasto.current = null)}
          onWheel={(ev) => e && setE(aproximar(e, e.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)))}
        >
          {e && (
            // eslint-disable-next-line @next/next/no-img-element -- imagem local, ainda não enviada
            <img
              src={url}
              alt="Foto escolhida"
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
              style={{ width: imagem.width * s, height: imagem.height * s, transform: `translate(${e.x}px, ${e.y}px)` }}
            />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="border border-white/25" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" aria-label="Afastar" disabled={!e || e.zoom <= 1} onClick={() => e && setE(aproximar(e, e.zoom / 1.25))}>
            <Minus className="size-4" aria-hidden />
          </Button>
          <input
            type="range"
            aria-label="Aproximar"
            min={1}
            max={4}
            step={0.01}
            value={e?.zoom ?? 1}
            onChange={(ev) => e && setE(aproximar(e, Number(ev.target.value)))}
            className="flex-1 accent-[var(--primary)]"
          />
          <Button variant="ghost" aria-label="Aproximar mais" disabled={!e || e.zoom >= 4} onClick={() => e && setE(aproximar(e, e.zoom * 1.25))}>
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Move className="size-3.5" aria-hidden /> Arraste a foto para posicionar.
        </p>
        <DialogFooter>
          <Button variant="ghost" disabled={salvando} onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!e || salvando} onClick={confirmar}>
            {salvando ? "Salvando…" : "Usar esta foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
