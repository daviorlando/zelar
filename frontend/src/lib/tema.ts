"use client";

import { useSyncExternalStore } from "react";

import { CHAVE_TEMA } from "@/lib/tema-chave";

/*
 * O tema vive no DOM (classe `light` no <html>), posta lá pelo script
 * anti-lampejo antes da primeira pintura. Herdado do geo-control: ler isso com
 * useState + useEffect causaria render em cascata; useSyncExternalStore é o
 * primitivo para estado que mora fora do React.
 *
 * Diferença do SIG (Q-17): sem escolha salva, o tema SEGUE O SISTEMA — e
 * continua seguindo se o sistema mudar com a página aberta (o modo noturno
 * automático do celular, por exemplo).
 */
const CONSULTA_CLARO = "(prefers-color-scheme: light)";

export type Preferencia = "claro" | "escuro" | "sistema";

function lerPreferencia(): Preferencia {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    return salvo === "claro" || salvo === "escuro" ? salvo : "sistema";
  } catch {
    return "sistema";
  }
}

function aplicar(preferencia: Preferencia) {
  const claro =
    preferencia === "claro" ||
    (preferencia === "sistema" && window.matchMedia(CONSULTA_CLARO).matches);
  document.documentElement.classList.toggle("light", claro);
}

function inscrever(aoMudar: () => void) {
  const obs = new MutationObserver(aoMudar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const sistema = window.matchMedia(CONSULTA_CLARO);
  const aoMudarSistema = () => {
    if (lerPreferencia() === "sistema") aplicar("sistema");
  };
  sistema.addEventListener("change", aoMudarSistema);
  return () => {
    obs.disconnect();
    sistema.removeEventListener("change", aoMudarSistema);
  };
}

const lerCliente = () => document.documentElement.classList.contains("light");

/* No servidor não há como saber: o escuro é a base do CSS, e o script
 * anti-lampejo corrige antes da primeira pintura. */
const lerServidor = () => false;

/** `true` quando a página está no tema claro (escolhido ou vindo do sistema). */
export function useTemaClaro() {
  return useSyncExternalStore(inscrever, lerCliente, lerServidor);
}

/** Fixa claro ou escuro, ou volta a seguir o sistema. */
export function definirTema(preferencia: Preferencia) {
  try {
    if (preferencia === "sistema") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, preferencia);
  } catch {
    // Navegação privada ou storage bloqueado: vale só para esta sessão.
  }
  aplicar(preferencia);
}

/** Compatível com o `ThemeToggle` do geo-control: alterna entre claro e escuro. */
export function alternarTema(claro: boolean) {
  definirTema(claro ? "claro" : "escuro");
}

export { lerPreferencia };
