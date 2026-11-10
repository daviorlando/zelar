"use client";

import { useActionState } from "react";
import { Button } from "@/components/zelo/button";
import { Field, Input } from "@/components/zelo/input";
import { pedirNovaSenha, type EstadoEsqueci } from "../actions";

export function FormularioEsqueci() {
  const [estado, enviar, ocupado] = useActionState<EstadoEsqueci, FormData>(pedirNovaSenha, {});
  if (estado.enviado) {
    return (
      <p role="status" className="rounded-sm border border-border bg-muted px-3 py-2 text-sm text-foreground">
        Se este e-mail tiver conta no Zelo, o link chega em alguns minutos. Confira também a caixa de spam.
      </p>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.erro && (
        <p role="alert" className="rounded-sm border border-destructive bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus defaultValue={estado.email} />
      </Field>
      <Button variant="primary" size="large" disabled={ocupado}>
        {ocupado ? "Enviando…" : "Enviar link"}
      </Button>
    </form>
  );
}
