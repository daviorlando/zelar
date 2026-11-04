# Sprint 1 — Teste de uso do protótipo

Objetivo: validar com 3 a 5 trabalhadores, **antes de codificar as telas finais**, se figuras, áudios, botões e o PIN visual são entendidos sem leitura. Critério para avançar: **4 de 5 participantes completam o fluxo sem intervenção** (escopo v0.5, seções 14 e 17, critério 10).

## Preparação

- Celular Android 10+ com o APK do protótipo (`mobile/build/app/outputs/flutter-apk/app-debug.apk`), volume alto e voz pt-BR instalada (tela do facilitador → "Verificar voz").
- Testar no local real: ruído, poeira e luvas. Anotar se o participante usa luva.
- Etiquetas QR impressas com as tags de exemplo (`D - RT - ME`, `D - SIL - MT`, `D - ELE - ME`) e uma de outro equipamento (ex.: `A - BMAN - ME`).
- PIN de teste: **sol, casa, carro, estrela**. Ensinar uma vez, mostrando as figuras, sem dizer os nomes em voz alta perto de outros.
- Antes de cada participante: tela do facilitador (segurar a foto na tela Hoje) → "Novo participante (zerar)".

## Tarefas (dizer, não mostrar)

1. Entrar no celular com as suas figuras.
2. Fazer as tarefas do **silo** (uma inspeção e uma limpeza) e concluir.
3. Fazer as tarefas da **rosca**: no motor, dizer que está muito quente e tirar uma foto; medir a corrente (dar o valor 12, fora do normal); na temperatura, pedir ajuda.
4. Ler a etiqueta errada e depois a certa no **elevador**; gravar um áudio explicando um impedimento ("Outro motivo").
5. Errar uma resposta de propósito e desfazer.

## O que observar e anotar

| Ponto | Pergunta |
| --- | --- |
| PIN visual | As nove figuras são distinguíveis? Alguma é confundida? Quantos erros? |
| Hoje | Entende que o cartão vermelho com relógio está atrasado? Entende o número no anel? |
| Áudio | O texto falado é compreendido? Precisou repetir? Vocabulário estranho? |
| Botões de resposta | Cor + forma + posição são entendidas (verde = tudo certo, amarelo = problema, azul = não consegui, roxo = ler etiqueta)? Segurar o botão para ouvir o que ele faz é descoberto? Algum toque errado com luva? |
| Motivos | As figuras de problema e de impedimento são reconhecidas? Os problemas de cada componente (motor, redutor, mancal, rolamento, motovibrador, correia) batem com o que acontece na fábrica? Falta algum? |
| Medição | Consegue digitar decimal? Entende a barra verde/amarela/vermelha? |
| Gravar áudio | Entende "segurar para falar"? |
| Estado | Envio é implícito: o participante fica tranquilo sem ícone de envio? Entende o ícone vermelho de atenção (simulado pela tela do facilitador)? |

O registro da tela do facilitador (botão copiar) traz tempos por item, repetições do áudio, PIN errado, desfazer, QR errado e pedidos de ajuda. Colar no relatório de cada participante.

## Saída do Sprint 1

- Lista de ajustes por tela (figuras a trocar, textos falados a reescrever, motivos a incluir).
- Decisão sobre as figuras do PIN e dos motivos.
- Tempo médio por item, base para a estimativa de capacidade (escopo, seção 7).

## Limites do protótipo

Dados de exemplo fixos e faixas de medição fictícias; voz sintética (marcada com o robô amarelo) no lugar das gravações; sem fotos reais dos equipamentos; respostas só na memória (fechar o app apaga); sem sincronização (o ícone de atenção é simulado pela tela do facilitador).
