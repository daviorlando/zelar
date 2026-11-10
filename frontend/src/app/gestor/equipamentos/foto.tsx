"use client";

import { Camera, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { removerFotoDaMaquina, salvarFotoDaMaquina } from "./actions";
import { Enquadrar } from "./enquadrar";

export function FotoDaMaquina({ id, nome, url }: { id: string; nome: string; url: string | null }) {
  const [ocupado, iniciar] = useTransition();
  const [escolhida, setEscolhida] = useState<{ imagem: ImageBitmap; url: string } | null>(null);

  function fecharEnquadramento() {
    if (!escolhida) return;
    escolhida.imagem.close();
    URL.revokeObjectURL(escolhida.url);
    setEscolhida(null);
  }

  /** Abre a foto para enquadrar; o envio só acontece depois de "Usar esta foto". */
  async function abrir(arquivo: File) {
    try {
      const imagem = await createImageBitmap(arquivo);
      setEscolhida({ imagem, url: URL.createObjectURL(arquivo) });
    } catch {
      toast.error("Não consegui abrir esta imagem. Tente outra foto.");
    }
  }

  function enviar(blob: Blob) {
    fecharEnquadramento();
    iniciar(async () => {
      const form = new FormData();
      form.set("foto", blob, "maquina.jpg");
      const r = await salvarFotoDaMaquina(id, form);
      if (r.erro) toast.error(r.erro);
      else toast.success("Foto salva. O celular recebe na próxima atualização.");
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {escolhida && <Enquadrar imagem={escolhida.imagem} url={escolhida.url} onConfirmar={enviar} onCancelar={fecharEnquadramento} />}
      <div className="flex aspect-square w-full max-w-xs items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
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
              if (arquivo) void abrir(arquivo);
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
        <p className="max-w-xs text-xs text-muted-foreground">Mostre a máquina inteira, com boa luz: é por ela que o funcionário reconhece o que vai revisar. Depois de escolher, você enquadra a foto num quadrado, igual ao celular.</p>
      </div>
    </div>
  );
}
