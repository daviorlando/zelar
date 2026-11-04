"use client";

import type { ComponentProps } from "react";

/** Botão de envio que pede confirmação antes (ações que não se desfazem). */
export function ConfirmButton({ message, ...props }: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}
