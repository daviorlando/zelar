import { Skeleton } from "@/components/zelo/feedback";

/*
 * Esqueletos com a FORMA do conteúdo que vem.
 *
 * A diferença entre um esqueleto que ajuda e um que atrapalha é se a chegada
 * do dado move a tela. Um retângulo genérico no lugar de uma tabela some e é
 * substituído por algo de outro tamanho — o salto de layout que o esqueleto
 * existia para evitar. Por isso o da tabela vai DENTRO do `<Table>` e do
 * `<thead>` verdadeiros: largura de coluna, fonte e borda já são as
 * definitivas.
 *
 * Nenhum bloco daqui é anunciado. Quem anuncia é um `role="status"` único, do
 * lado — ver `Loading` em `feedback.tsx`. Sem isso, um leitor de tela lê
 * dezenas de caixas vazias.
 *
 * Nota para quando um esqueleto NÃO SAIR: neste repositório isso já teve duas
 * vezes causa que não é o componente de carregamento. A CSP sem nonce
 * (`src/proxy.ts`) e o bloqueio de origem do `next dev` deixam a tela
 * montada sem uma única chamada à API. Antes de procurar aqui, rode
 * `npm run build && npm run start:prova` e clique — renderizar não é hidratar.
 */

/** Uma célula de esqueleto, com largura variada para não parecer um pente. */
function Celula({ largura }: { largura: string }) {
  return (
    <td className="border-b border-border px-2.5 py-2.5">
      <Skeleton className={`h-4 ${largura}`} />
    </td>
  );
}

const LARGURAS = ["w-full", "w-3/4", "w-1/2", "w-5/6", "w-2/3"];

/**
 * O corpo de uma tabela que ainda não chegou. Vai dentro do `<tbody>`, com o
 * `<thead>` de verdade acima — é ele que fixa as colunas.
 */
export function LinhasEsqueleto({ colunas, linhas = 5 }: { colunas: number; linhas?: number }) {
  return (
    <>
      {Array.from({ length: linhas }).map((_, i) => (
        <tr key={i} aria-hidden>
          {Array.from({ length: colunas }).map((_, j) => (
            <Celula key={j} largura={LARGURAS[(i + j) % LARGURAS.length] ?? "w-full"} />
          ))}
        </tr>
      ))}
    </>
  );
}

/** Tabela inteira carregando, para quando o `<thead>` também vem do servidor. */
export function TabelaEsqueleto({ colunas, linhas = 5 }: { colunas: number; linhas?: number }) {
  return (
    <table className="w-full border-collapse" aria-hidden>
      <tbody>
        <LinhasEsqueleto colunas={colunas} linhas={linhas} />
      </tbody>
    </table>
  );
}

/** Um indicador que ainda não chegou, com a moldura do `Stat`. */
export function StatEsqueleto() {
  return (
    <div
      data-esqueleto="stat"
      aria-hidden
      className="min-w-0 rounded-md border border-border bg-card px-[1.125rem] py-4 shadow-[var(--shadow-card)]"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-2 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  );
}

/** A faixa de indicadores do topo, na mesma grade que o conteúdo vai usar. */
export function GradeDeStats({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <StatEsqueleto key={i} />
      ))}
    </div>
  );
}

/** Um cartão inteiro que ainda não chegou — título e algumas linhas. */
export function EsqueletoDeCartao({ linhas = 4 }: { linhas?: number }) {
  return (
    <div
      aria-hidden
      className="min-w-0 rounded-md border border-border bg-card px-[1.125rem] py-4 shadow-[var(--shadow-card)]"
    >
      <Skeleton className="mb-3 h-4 w-40" />
      <div className="space-y-2.5">
        {Array.from({ length: linhas }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${LARGURAS[i % LARGURAS.length] ?? "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** As colunas do quadro, com alguns cartões em cada uma. */
export function EsqueletoDeQuadro({ colunas = 4 }: { colunas?: number }) {
  return (
    <div aria-hidden className="flex gap-3.5 overflow-x-auto pb-2">
      {Array.from({ length: colunas }).map((_, i) => (
        <div key={i} className="w-[18.75rem] shrink-0 rounded-md border border-border bg-card p-3">
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-16 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** O detalhe de duas colunas, na mesma grade do conteúdo. */
export function EsqueletoDeDetalhe() {
  return (
    <div
      aria-hidden
      className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,26.875rem)_minmax(0,1fr)]"
    >
      <EsqueletoDeCartao linhas={6} />
      <EsqueletoDeCartao linhas={4} />
    </div>
  );
}
