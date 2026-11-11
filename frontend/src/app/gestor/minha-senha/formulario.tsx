"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelar/button";
import { Field, Input } from "@/components/zelar/input";
import { trocarMinhaSenha, type Resultado } from "../gestores/actions";

export function FormularioDeSenha({ depois = "/gestor/quadro" }: { depois?: string }) {
  const router = useRouter();
  const [estado, enviar, ocupado] = useActionState<Resultado, FormData>(trocarMinhaSenha, {});

  useEffect(() => {
    if (!estado.ok) return;
    toast.success(estado.ok);
    router.push(depois);
  }, [estado, router, depois]);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <Field label="Nova senha (pelo menos 8 caracteres)" htmlFor="senha">
        <Input id="senha" name="senha" type="password" required minLength={8} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirmacao">
        <Input id="confirmacao" name="confirmacao" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      {estado.erro && (
        <p role="alert" className="text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button variant="primary" className="self-start" disabled={ocupado}>
        {ocupado ? "Trocando…" : "Trocar senha"}
      </Button>
    </form>
  );
}
