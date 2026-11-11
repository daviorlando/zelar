"use client";

import { useSyncExternalStore } from "react";

const CHAVE = "zelar.barra";
/** Chave de antes da troca de nome: lida uma vez e mudada para a nova. */
const CHAVE_ANTIGA = "zelo.barra";

/*
 * A escolha entre navegar e ter espaço é de quem usa, e precisa sobreviver ao
 * recarregamento. Mora fora do React pelo mesmo motivo que o tema (`lib/tema.ts`):
 * é estado do navegador, não da árvore de componentes, e lê-lo com
 * `useState` + `useEffect` faria render em cascata — além de esbarrar na regra
 * `react-hooks/set-state-in-effect`, que é erro neste projeto.
 *
 * Diferente do tema, aqui não há script anti-lampejo: o servidor não tem como
 * saber a preferência, então ele sempre renderiza a barra **aberta**. Quem
 * escolheu o trilho vê a barra encolher logo depois da hidratação. É o lado
 * certo do erro — a pesquisa da NN/g mediu 43% de uso para navegação visível
 * contra 17–28% quando ela fica atrás de um ícone, então o padrão é abrir.
 */

let estado: boolean | null = null;
const ouvintes = new Set<() => void>();

function lerCliente(): boolean {
  if (estado === null) {
    try {
      const antiga = localStorage.getItem(CHAVE_ANTIGA);
      if (antiga !== null) {
        localStorage.setItem(CHAVE, antiga);
        localStorage.removeItem(CHAVE_ANTIGA);
      }
      estado = localStorage.getItem(CHAVE) !== "recolhida";
    } catch {
      // Navegação privada ou storage bloqueado: vale o padrão, só nesta sessão.
      estado = true;
    }
  }
  return estado;
}

/** Aberta. O servidor não conhece a preferência de ninguém. */
const lerServidor = () => true;

function inscrever(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  // Duas abas abertas são a mesma pessoa: recolher numa recolhe na outra.
  const deOutraAba = (evento: StorageEvent) => {
    if (evento.key !== CHAVE) return;
    estado = evento.newValue !== "recolhida";
    aoMudar();
  };
  window.addEventListener("storage", deOutraAba);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", deOutraAba);
  };
}

/** `true` quando a barra lateral está aberta com rótulos. */
export function useBarraAberta() {
  return useSyncExternalStore(inscrever, lerCliente, lerServidor);
}

export function alternarBarra(proxima?: boolean) {
  estado = proxima ?? !lerCliente();
  try {
    localStorage.setItem(CHAVE, estado ? "aberta" : "recolhida");
  } catch {
    // Sem persistência, a escolha vale enquanto a aba viver.
  }
  for (const avisar of ouvintes) avisar();
}
