import { cn } from "@/lib/utils";

/** Iniciais em círculo (padrão da tabela de usuários do Figma); com foto, a foto. */
export function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className?: string }) {
  const iniciais = nome
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-3xs font-semibold text-foreground",
        className,
      )}
      aria-hidden
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage
        <img src={foto} alt="" className="size-full object-cover" />
      ) : (
        iniciais
      )}
    </span>
  );
}
