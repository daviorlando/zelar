"use client";

import { useTransition, type ComponentProps } from "react";
import { toast } from "sonner";

/** Botão que pede confirmação antes (ações que não se desfazem) e avisa se a ação falhar. */
export function ConfirmButton({
  message,
  acao,
  ...props
}: ComponentProps<"button"> & { message: string; acao: () => Promise<{ erro?: string }> }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <button
      {...props}
      type="button"
      disabled={ocupado || props.disabled}
      onClick={() => {
        if (!window.confirm(message)) return;
        iniciar(async () => {
          const r = await acao();
          if (r.erro) toast.error(r.erro);
        });
      }}
    />
  );
}
