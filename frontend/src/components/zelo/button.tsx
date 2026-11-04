import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/*
 * Botão do SIG Agro IA (componente Button do Figma, doc 06).
 *
 * Herdado do geo-control (cva + `estiloDeBotao` reaproveitável em `<Link>`),
 * com o desenho do SIG:
 *   - raio de 8px (`radius/sm`), e não a pílula da GeoSpace;
 *   - primary com texto ESCURO sobre o verde — branco dá 2,57:1 — e o brilho
 *     verde (`Glow/Brand`);
 *   - default é vidro, como os cartões, mas com a borda OPACA do tema: a borda
 *     de vidro é branca e some no modo claro;
 *   - `danger` continua contorno (fica ao lado da ação primária sem disputar o
 *     alvo); `destructive` é o preenchido, para a ação final de um diálogo de
 *     confirmação.
 *
 * Navegação que PARECE botão é `<a>` com `estiloDeBotao`, não `<button>` com
 * `router.push`: teclado, botão do meio e "abrir em nova aba" só funcionam no
 * link.
 */
export const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm border font-medium " +
    "transition-[background,opacity,border-color,box-shadow] duration-200 " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-border bg-card text-foreground hover:bg-accent",
        primary:
          "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-brand)] hover:brightness-95",
        danger:
          "border-destructive bg-transparent text-destructive hover:bg-destructive-soft",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:brightness-95",
        ghost: "border-transparent bg-transparent text-brand-text hover:bg-accent",
      },
      size: {
        default: "px-4 py-2 text-md",
        small: "px-2.5 py-1 text-sm",
        // Alvo de toque de 48px (size/touch-min) para tablet e uso em campo.
        large: "min-h-12 px-5 py-3 text-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
