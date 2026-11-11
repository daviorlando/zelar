import 'package:flutter/material.dart';

import 'models.dart';

/// Motivo ilustrado: id, figura, rótulo curto e explicação falada ao tocar.
typedef Reason = (String id, IconData icon, String label, String spoken);

/// Motivos de impedimento padrão (escopo, seção 6).
const blockReasons = <Reason>[
  ('no_tool', Icons.build, 'Falta ferramenta', 'Falta ferramenta.'),
  ('running', Icons.play_circle, 'Equipamento funcionando', 'O equipamento estava funcionando e não podia parar.'),
  ('stopped_other', Icons.engineering, 'Parado para outro serviço', 'O equipamento está parado para outro serviço.'),
  ('no_material', Icons.inventory_2, 'Falta material', 'Falta material, como graxa, óleo ou pano.'),
  ('need_tech', Icons.support_agent, 'Preciso de apoio técnico', 'Preciso de apoio técnico.'),
  ('unsafe', Icons.dangerous, 'Lugar inseguro', 'O lugar está inseguro.'),
  ('other', Icons.mic, 'Outro motivo', 'Outro motivo. Segure o botão laranja e conte o que aconteceu.'),
];

/// Motivos para itens que exigem o equipamento ligado: "funcionando" não impede.
List<Reason> blockReasonsFor(PlanItem item) =>
    item.needsRunning ? blockReasons.where((r) => r.$1 != 'running').toList() : blockReasons;

const _otherProblem = ('other', Icons.mic, 'Outro problema', 'Outro problema. Segure o botão laranja e conte o que viu.');
const _hot = ('hot', Icons.local_fire_department, 'Muito quente', 'Muito quente: esquenta mais que o normal.');
const _noise = ('noise', Icons.hearing, 'Barulho estranho', 'Barulho estranho: faz um som diferente do normal.');
const _vibration = ('vibration', Icons.vibration, 'Vibração forte', 'Vibração forte: treme mais que o normal.');
const _loose = ('loose', Icons.hardware, 'Parafuso solto', 'Parafuso ou base solta.');
const _play = ('play', Icons.open_in_full, 'Folga', 'Folga: o eixo balança ou tem jogo.');
const _cable = ('cable', Icons.cable, 'Cabo danificado', 'Cabo ou fio danificado.');

/// Problemas de inspeção por tipo de componente (a validar com a equipe no Sprint 1).
/// Só entra o que acontece naquele componente: motor elétrico não vaza óleo, correia não esquenta.
const problemsByKind = <ComponentKind, List<Reason>>{
  ComponentKind.motor: [
    _hot,
    _noise,
    _vibration,
    ('burnt', Icons.air, 'Cheiro de queimado', 'Cheiro de queimado.'),
    _cable,
    ('loose', Icons.hardware, 'Base solta', 'Base ou parafuso do motor solto.'),
    ('dust', Icons.cleaning_services, 'Coberto de poeira', 'Motor coberto de poeira.'),
    _otherProblem,
  ],
  ComponentKind.gearbox: [
    ('oil_leak', Icons.water_drop, 'Vazando óleo', 'Óleo vazando do redutor.'),
    _hot,
    _noise,
    _vibration,
    _loose,
    ('low_oil', Icons.water_drop_outlined, 'Pouco óleo', 'Pouco óleo no visor.'),
    _otherProblem,
  ],
  ComponentKind.bearingHousing: [
    _hot,
    _noise,
    _play,
    ('grease_leak', Icons.opacity, 'Graxa vazando', 'Graxa vazando do mancal.'),
    _loose,
    _otherProblem,
  ],
  ComponentKind.bearing: [_noise, _hot, _vibration, _play, _otherProblem],
  ComponentKind.vibrator: [
    ('weak', Icons.do_not_disturb_on, 'Não vibra', 'Não vibra ou vibra fraco.'),
    ('loose', Icons.hardware, 'Fixação solta', 'O motovibrador está solto.'),
    _noise,
    _hot,
    _cable,
    _otherProblem,
  ],
  ComponentKind.belt: [
    ('worn', Icons.broken_image, 'Rachada ou gasta', 'Correia rachada ou gasta.'),
    ('loose_belt', Icons.swap_vert, 'Frouxa', 'Correia frouxa ou patinando.'),
    ('misaligned', Icons.compare_arrows, 'Fora do lugar', 'Correia fora do lugar.'),
    ('bucket', Icons.shopping_basket, 'Caneca solta', 'Caneca solta ou quebrada.'),
    ('splice', Icons.link_off, 'Emenda ruim', 'Emenda da correia danificada.'),
    _otherProblem,
  ],
  // Peças sem tipo conhecido (volante, polia, tambor, chapa...): o que vale para qualquer peça.
  ComponentKind.other: [
    _noise,
    _vibration,
    _loose,
    ('worn', Icons.broken_image, 'Gasto ou quebrado', 'Peça gasta, rachada ou quebrada.'),
    ('dirty', Icons.cleaning_services, 'Muita sujeira', 'Muita sujeira ou material acumulado.'),
    _otherProblem,
  ],
};
