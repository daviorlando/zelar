import { Lock, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * Os dois estados que o geo-control não tinha (doc 17 §3.3). Vazio, erro e
 * carregando vêm de `feedback.tsx` e `esqueletos.tsx`, herdados.
 */

/**
 * Sem permissão (StateBlock Type=NoPermission). Mostra QUAL permissão falta,
 * a partir de `details.required` do 403 da API — "você não pode" sem dizer o
 * quê obriga a pessoa a adivinhar o que pedir ao administrador.
 */
export function SemPermissao({
  permissao,
  children,
  className,
}: {
  /** Ex.: "alerts:view". */
  permissao?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "vidro-cartao flex flex-col items-center gap-2 rounded-md border px-6 py-8 text-center",
        className,
      )}
    >
      <Lock aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-xl font-semibold text-foreground">Sem permissão</p>
      <p className="max-w-[22rem] text-md text-muted-foreground">
        {children ??
          (permissao ? (
            <>
              Você precisa da permissão <code className="tabular">{permissao}</code>. Fale com o
              administrador da organização.
            </>
          ) : (
            "Seu perfil não dá acesso a esta tela. Fale com o administrador da organização."
          ))}
      </p>
    </div>
  );
}

/**
 * Aviso de dado antigo (StaleBanner). `offline`: sem rede, mostrando a
 * última leitura guardada com a hora dela (M5-30). `antigo`: com rede, a hora
 * da última atualização. Nunca um erro genérico de rede na frente da pessoa.
 */
export function AvisoDeDadoAntigo({
  tipo,
  hora,
  className,
}: {
  tipo: "offline" | "antigo";
  /** "14:32". */
  hora: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-sm px-4 py-2 text-md font-semibold",
        tipo === "offline"
          ? "bg-severity-warning text-severity-warning-foreground"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {tipo === "offline" && <WifiOff aria-hidden className="size-4" />}
      {tipo === "offline" ? `Sem conexão · dado de ${hora}` : `Atualizado às ${hora}`}
    </div>
  );
}
