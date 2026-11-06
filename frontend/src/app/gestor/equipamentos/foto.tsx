"use client";

import { Camera, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { removerFotoDaMaquina, salvarFotoDaMaquina } from "./actions";

const LADO_MAXIMO = 1280;

/** Foto de celular costuma passar do limite de envio: reduz no navegador antes de mandar. */
async function reduzir(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  tela.getContext("2d")!.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("sem imagem"))), "image/jpeg", 0.85),
  );
}

export function FotoDaMaquina({ id, nome, url }: { id: string; nome: string; url: string | null }) {
  const [ocupado, iniciar] = useTransition();

  function enviar(arquivo: File) {
    iniciar(async () => {
      let blob: Blob;
      try {
        blob = await reduzir(arquivo);
      } catch {
        toast.error("Não consegui abrir esta imagem. Tente outra foto.");
        return;
      }
      const form = new FormData();
      form.set("foto", blob, "maquina.jpg");
      const r = await salvarFotoDaMaquina(id, form);
      if (r.erro) toast.error(r.erro);
      else toast.success("Foto salva. O celular recebe na próxima atualização.");
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex aspect-[4/3] w-full max-w-xs items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
          <img src={url} alt={`Foto de ${nome}`} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm text-muted-foreground">Sem foto: o celular mostra um desenho</span>
        )}
      </div>
      <div className="flex flex-col items-start gap-2">
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-border bg-card px-4 py-2 text-md font-medium text-foreground transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          <Camera className="size-4" aria-hidden />
          {ocupado ? "Enviando…" : url ? "Trocar foto" : "Tirar ou escolher foto"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={ocupado}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              if (arquivo) enviar(arquivo);
            }}
          />
        </label>
        {url && (
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={ocupado}
            onClick={() =>
              iniciar(async () => {
                const r = await removerFotoDaMaquina(id);
                if (r.erro) toast.error(r.erro);
                else toast.success("Foto removida.");
              })
            }
          >
            <Trash2 className="size-4" aria-hidden /> Remover foto
          </Button>
        )}
        <p className="max-w-xs text-xs text-muted-foreground">Mostre a máquina inteira, com boa luz: é por ela que o funcionário reconhece o que vai revisar.</p>
      </div>
    </div>
  );
}
