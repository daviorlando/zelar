"use client";

import { startTransition, useActionState, useState } from "react";
import { Camera, Eraser } from "lucide-react";
import { Button } from "@/components/zelo/button";
import { Card } from "@/components/zelo/card";
import { Caixa } from "@/components/zelo/checkbox";
import { Notice } from "@/components/zelo/feedback";
import { Field, Input } from "@/components/zelo/input";
import { FIGURES, PIN_LENGTH } from "@/lib/figures";
import type { OpcaoDeSetor } from "@/lib/setores";
import { saveWorker, type SaveState } from "./actions";

type Props = {
  worker?: { id: string; name: string; pin: number[] };
  photoUrl?: string | null;
  setores: OpcaoDeSetor[];
  marcados?: string[];
};

export function WorkerForm({ worker, photoUrl, setores, marcados = [] }: Props) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveWorker, {});
  const [pin, setPin] = useState<number[]>(worker?.pin ?? []);
  const [preview, setPreview] = useState<string | null>(photoUrl ?? null);
  const [meusSetores, setMeusSetores] = useState<string[]>(marcados);

  return (
    <form
      // Enviado à mão: com action={...}, o React limpa nome e foto a cada erro de validação.
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => action(dados));
      }} className="grid items-start gap-4 lg:grid-cols-[260px_1fr]">
      {worker && <input type="hidden" name="id" value={worker.id} />}
      <input type="hidden" name="pin" value={pin.join(",")} />
      {meusSetores.map((s) => (
        <input key={s} type="hidden" name="setores" value={s} />
      ))}

      <Card title="Foto">
        <div className="flex flex-col gap-3">
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- prévia local ou URL assinada
              <img src={preview} alt="Foto do funcionário" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm text-muted-foreground">Sem foto</span>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm border border-border bg-card px-4 py-2 text-md font-medium text-foreground transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
            <Camera className="size-4" aria-hidden />
            {preview ? "Trocar foto" : "Tirar ou escolher foto"}
            <input
              type="file"
              name="photo"
              accept="image/*"
              capture="user"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">Aparece no celular e no crachá: rosto de frente, boa luz.</p>
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Dados">
          <Field label="Nome" htmlFor="nome">
            <Input id="nome" name="name" defaultValue={worker?.name} required maxLength={80} autoComplete="off" />
          </Field>
        </Card>

        <Card
          title="Setores"
          note="O celular mostra para este funcionário as tarefas dos setores marcados."
        >
          {setores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum setor ainda: crie em Equipamentos › Setores.</p>
          ) : (
            <fieldset className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
              <legend className="sr-only">Setores</legend>
              {setores.map((s) => (
                <Caixa
                  key={s.code}
                  marcada={meusSetores.includes(s.code)}
                  aoMudar={(m) =>
                    setMeusSetores((atual) => (m ? [...atual, s.code].sort() : atual.filter((c) => c !== s.code)))
                  }
                >
                  <span>
                    Setor {s.code}
                    <span className="block text-xs text-muted-foreground">
                      {s.atividades ? `${s.atividades} atividades` : "sem atividades"}
                    </span>
                  </span>
                </Caixa>
              ))}
            </fieldset>
          )}
        </Card>

        <Card
          title="Figuras de entrada"
          note={`Escolha com o funcionário ${PIN_LENGTH} figuras, na ordem. Ele usa quando estiver sem o crachá. Elas não aparecem no crachá impresso.`}
        >
          <fieldset className="flex flex-col gap-4">
            <legend className="sr-only">Figuras de entrada</legend>
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <span
                  key={i}
                  className="grid size-14 place-items-center rounded-md border-2 border-dashed border-border-strong text-3xl"
                  title={pin[i] !== undefined ? FIGURES[pin[i]].name : "vazio"}
                >
                  {pin[i] !== undefined ? FIGURES[pin[i]].emoji : ""}
                </span>
              ))}
              <Button type="button" variant="ghost" onClick={() => setPin([])} disabled={pin.length === 0}>
                <Eraser className="size-4" aria-hidden /> Limpar
              </Button>
            </div>
            <div className="grid max-w-sm grid-cols-3 gap-2">
              {FIGURES.map((f, i) => (
                <button
                  key={f.name}
                  type="button"
                  className="vidro-cartao flex flex-col items-center gap-1 rounded-md border py-2.5 text-3xl transition hover:border-brand-border disabled:opacity-40"
                  disabled={pin.length >= PIN_LENGTH}
                  onClick={() => setPin((p) => [...p, i])}
                >
                  {f.emoji}
                  <span className="text-xs text-muted-foreground">{f.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </Card>

        {state.error && <Notice tone="error">{state.error}</Notice>}
        <div>
          <Button variant="primary" size="large" disabled={pending || pin.length !== PIN_LENGTH}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
