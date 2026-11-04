import type { ReactNode } from "react";

/**
 * KPI. O valor recebe `num` (tabular-nums): comparar coluna de dinheiro com
 * largura de dígito variável é desnecessariamente difícil.
 */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    // `min-w-0` pela mesma razão do `Card`: numa grade, a trilha tem piso
    // `min-content`, e o número do indicador com a fonte grande não encolhe —
    // o cartão empurrava o documento para fora da tela em vez de deixar o
    // texto quebrar. (Esta superfície repete as classes do `Card` em vez de
    // usá-lo; unificar as três é assunto de outro dia, mas é o motivo de a
    // mesma correção precisar ser feita em três lugares.)
    <div className="vidro-cartao min-w-0 rounded-md border px-4 py-4">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="num mt-0.5 text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
