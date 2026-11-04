"use client"

import { useTemaClaro } from "@/lib/tema"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/*
 * O tema não vem do next-themes: o painel guarda o tema na classe `light` do
 * <html>, e `useTemaClaro` lê de lá. Uma segunda fonte de verdade para tema
 * significaria toast claro sobre painel escuro no primeiro quadro.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const claro = useTemaClaro()

  return (
    <Sonner
      theme={claro ? "light" : "dark"}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
