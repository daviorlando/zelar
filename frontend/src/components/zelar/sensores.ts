"use client";

/*
 * Sensores do quadro.
 *
 * O cartão inteiro é a superfície de arrasto — e dentro dele existem um botão
 * de título, um avatar que abre popover e um menu de ações. Sem filtro,
 * pressionar qualquer um deles começaria a arrastar a demanda.
 *
 * O dnd-kit 6 **não** tem esse filtro embutido: o `activators` do
 * `PointerSensor` só checa `event.isPrimary` e o botão do mouse (o
 * `isInteractiveElement` da v5 não existe mais). O ponto de extensão que a
 * biblioteca oferece é sobrescrever `activators` numa subclasse — um lugar só,
 * valendo para todo cartão do quadro.
 *
 * A alternativa seria `stopPropagation` no `onPointerDown` de cada filho
 * interativo. Funciona, mas é regra que mora em N lugares e que o próximo
 * componente acrescentado ao cartão vai esquecer.
 *
 * Cada handler abaixo repete a guarda do original — botão direito não arrasta,
 * dois dedos não arrastam — porque sobrescrever `activators` substitui a
 * checagem inteira, não acrescenta uma.
 */

import { MouseSensor, TouchSensor } from "@dnd-kit/core";
import type { MouseSensorOptions, TouchSensorOptions } from "@dnd-kit/core";
import type { MouseEvent, TouchEvent } from "react";

/**
 * O que nunca inicia arrasto.
 *
 * `[role='menuitem']` cobre itens de menu do Base UI, que nem sempre são
 * `<button>`. O punho `⠿` **não** entra aqui de propósito: ele é um `<span>`,
 * justamente para continuar sendo o lugar mais óbvio de agarrar o cartão.
 */
const INTERATIVOS = "button, a, input, select, textarea, [role='menuitem'], [data-arrasto='nao']";

function veioDeAlgoInterativo(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(INTERATIVOS) !== null;
}

/** Botão direito do mouse, na numeração do DOM. */
const BOTAO_DIREITO = 2;

export class SensorDeMouse extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (
        { nativeEvent: evento }: MouseEvent,
        { onActivation }: MouseSensorOptions,
      ) => {
        if (evento.button === BOTAO_DIREITO) return false;
        if (veioDeAlgoInterativo(evento.target)) return false;
        onActivation?.({ event: evento });
        return true;
      },
    },
  ];
}

export class SensorDeToque extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (
        { nativeEvent: evento }: TouchEvent,
        { onActivation }: TouchSensorOptions,
      ) => {
        if (evento.touches.length > 1) return false;
        if (veioDeAlgoInterativo(evento.target)) return false;
        onActivation?.({ event: evento });
        return true;
      },
    },
  ];
}
