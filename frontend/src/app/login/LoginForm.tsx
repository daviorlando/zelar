"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/zelar/button";
import { Field, Input } from "@/components/zelar/input";
import { login, type LoginState } from "./actions";

export function LoginForm({ back }: { back: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [mostrar, setMostrar] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="voltar" value={back} />
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Senha" htmlFor="password">
        <Input id="password" name="password" type={mostrar ? "text" : "password"} autoComplete="current-password" required />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} />
        Mostrar senha
      </label>
      {state.error && (
        <p role="alert" className="rounded-sm border border-destructive bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button variant="primary" size="large" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
