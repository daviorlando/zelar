"use client";

import { startTransition, useActionState, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/zelo/button";
import { Card } from "@/components/zelo/card";
import { Caixa } from "@/components/zelo/checkbox";
import { Notice } from "@/components/zelo/feedback";
import { Field, Input } from "@/components/zelo/input";
import { PIN_LENGTH } from "@/lib/pin";
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
  const [pin, setPin] = useState(worker?.pin.join("") ?? "");
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
          title="PIN de entrada"
          note={`${PIN_LENGTH} números, combinados com o funcionário. Ele usa quando estiver sem o crachá. O PIN não aparece no crachá impresso.`}
        >
          <Field label="PIN" htmlFor="pin">
            <Input
              id="pin"
              name="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
              inputMode="numeric"
              autoComplete="off"
              required
              className="num max-w-40 text-center text-2xl tracking-[0.4em]"
              aria-describedby={pin.length === PIN_LENGTH ? undefined : "pin-ajuda"}
            />
          </Field>
          {pin.length !== PIN_LENGTH && (
            <p id="pin-ajuda" className="mt-2 text-xs text-muted-foreground">
              Faltam {PIN_LENGTH - pin.length} {PIN_LENGTH - pin.length === 1 ? "número" : "números"}.
            </p>
          )}
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
