import type { PostgrestError } from "@supabase/supabase-js";

/** O max_rows do PostgREST: backend/supabase/config.toml e o padrão do Supabase hospedado. */
const PAGINA = 1000;

/**
 * Todas as linhas de uma consulta, em páginas: acima de max_rows o PostgREST corta a resposta
 * sem avisar, mesmo com .range() maior. `pagina(de, ate)` monta a consulta a cada chamada,
 * com .range(de, ate) e uma ordem que não empata (termine em "id"), senão linhas se repetem
 * ou somem entre as páginas. Só para na página vazia e avança pelo que veio: com max_rows
 * menor que PAGINA, página curta não quer dizer que acabou.
 */
export async function todasAsLinhas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const linhas: T[] = [];
  for (;;) {
    const de = linhas.length;
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) return { data: linhas, error };
    if (!data?.length) return { data: linhas, error: null };
    linhas.push(...data);
  }
}
