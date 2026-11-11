/**
 * Chave do tema no `localStorage`. Mora fora de `tema.ts` porque aquele é
 * módulo de cliente e o `layout.tsx` (servidor) precisa dela para montar o
 * script anti-lampejo.
 *
 * Valores: "claro", "escuro" ou ausente (= segue o sistema, Q-17).
 */
export const CHAVE_TEMA = "zelar.tema";
/** Chave de antes da troca de nome; o script anti-lampejo a muda para a nova. */
export const CHAVE_TEMA_ANTIGA = "zelo.tema";
