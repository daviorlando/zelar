"use client";

import { useActionState } from "react";
import { Button } from "@/components/zelo/button";
import { confirmarAcesso, type EstadoDaConfirmacao } from "./actions";

type Link = { token: string; tipo: "invite" | "recovery"; codigo?: never } | { codigo: string; token?: never; tipo?: never };

export function Confirmar({ token, tipo, codigo }: Link) {
  const [estado, enviar, ocupado] = useActionState<EstadoDaConfirmacao, FormData>(confirmarAcesso, {});
  return (
    <form action={enviar} className="flex flex-col gap-4">
      {codigo ? (
        <input type="hidden" name="codigo" value={codigo} />
      ) : (
        <>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="tipo" value={tipo} />
        </>
      )}
      <p className="text-sm text-muted-foreground">Toque no botão para continuar e escolher sua senha.</p>
      {estado.erro && (
        <p role="alert" className="rounded-sm border border-destructive bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button variant="primary" size="large" disabled={ocupado}>
        {ocupado ? "Confirmando…" : "Continuar"}
      </Button>
    </form>
  );
}
