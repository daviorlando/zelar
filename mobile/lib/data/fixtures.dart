import 'package:flutter/material.dart';

import '../domain/models.dart';

// Dados de exemplo do protótipo do Sprint 1, no formato da planilha (Setor D).
// As faixas de medição são FICTÍCIAS, só para o teste de uso: em produção os
// limites vêm do responsável técnico e o sistema não inventa valores.

/// PIN do trabalhador de teste.
const demoPin = [0, 1, 2, 5];

/// Sem painel configurado (testes e demonstração), entra este trabalhador.
/// Crachá de teste: QR com o texto `zelo:cracha:demo-cracha-teste`.
const demoWorker = Worker(
  id: 'w1',
  name: 'Trabalhador de teste',
  pinHash: 'b5320752bb5e3029fda4b939894092ecd5a4aa3cf2fd65182ac8929c2f11b13c',
  badgeHash: '32cef541342c0da2b81512a5ef63cd1b56ac29641f03e6fc561b73372a686c06',
);

const _rosca = Equipment(
  id: 'e1',
  tag: 'D - RT',
  shortName: 'Rosca do forno',
  icon: Icons.precision_manufacturing,
  // Cores de equipamento fogem do verde, amarelo, azul e roxo dos botões.
  color: Color(0xFF6D4C41),
  components: [
    Component(id: 'c1', tag: 'D - RT - ME', shortName: 'Motor', icon: Icons.bolt, kind: ComponentKind.motor),
    Component(id: 'c2', tag: 'D - RT - RD', shortName: 'Redutor', icon: Icons.settings, kind: ComponentKind.gearbox),
    Component(id: 'c3', tag: 'D - RT - MAN', shortName: 'Mancal', icon: Icons.album, kind: ComponentKind.bearingHousing),
    Component(id: 'c4', tag: 'D - RT - ROL', shortName: 'Rolamento', icon: Icons.radio_button_checked, kind: ComponentKind.bearing),
  ],
);

const _silo = Equipment(
  id: 'e2',
  tag: 'D - SIL',
  shortName: 'Silo do forno',
  icon: Icons.inventory,
  color: Color(0xFFAD1457),
  components: [
    Component(id: 'c5', tag: 'D - SIL - MT', shortName: 'Motovibrador', icon: Icons.vibration, kind: ComponentKind.vibrator),
  ],
);

const _elevador = Equipment(
  id: 'e3',
  tag: 'D - ELE',
  shortName: 'Elevador de canecas',
  icon: Icons.elevator,
  color: Color(0xFF00838F),
  components: [
    Component(id: 'c6', tag: 'D - ELE - ME', shortName: 'Motor', icon: Icons.bolt, kind: ComponentKind.motor),
    Component(id: 'c7', tag: 'D - ELE - CT', shortName: 'Correia', icon: Icons.loop, kind: ComponentKind.belt),
    Component(id: 'c8', tag: 'D - ELE - MAN', shortName: 'Mancal', icon: Icons.album, kind: ComponentKind.bearingHousing),
  ],
);

final demoOrders = <WorkOrder>[
  WorkOrder(
    id: 'o1',
    equipment: _rosca,
    overdue: true,
    items: const [
      PlanItem(
        id: 'i1',
        componentId: 'c1',
        type: ItemType.inspection,
        shortText: 'Olhar o motor',
        spokenText: 'Olhe e escute o motor. Veja se está muito quente, com barulho, tremendo ou coberto de poeira.',
      ),
      PlanItem(
        id: 'i2',
        componentId: 'c1',
        type: ItemType.measurement,
        shortText: 'Medir a corrente',
        spokenText: 'Meça a corrente do motor com o alicate amperímetro.',
        measurement: Measurement(symbol: 'A', spokenUnit: 'ampères', min: 6, max: 8.5),
        needsRunning: true,
      ),
      PlanItem(
        id: 'i3',
        componentId: 'c2',
        type: ItemType.measurement,
        shortText: 'Temperatura do redutor',
        spokenText: 'Meça a temperatura da caixa do redutor com o termômetro.',
        measurement: Measurement(symbol: '°C', spokenUnit: 'graus', min: 20, max: 90),
        needsRunning: true,
      ),
      PlanItem(
        id: 'i4',
        componentId: 'c2',
        type: ItemType.inspection,
        shortText: 'Ouvir o redutor',
        spokenText: 'Escute o redutor funcionando. Veja se tem barulho diferente do normal ou óleo vazando.',
        needsRunning: true,
      ),
      PlanItem(
        id: 'i5',
        componentId: 'c3',
        type: ItemType.inspection,
        shortText: 'Olhar o mancal',
        spokenText: 'Olhe o mancal. Veja se tem graxa vazando, parafuso solto ou se está esquentando demais.',
      ),
      PlanItem(
        id: 'i6',
        componentId: 'c4',
        type: ItemType.inspection,
        shortText: 'Escutar o rolamento',
        spokenText: 'Com a rosca funcionando, escute de perto o rolamento, sem encostar nas partes que giram. '
            'Veja se faz barulho, treme ou esquenta.',
        needsRunning: true,
      ),
    ],
  ),
  WorkOrder(
    id: 'o2',
    equipment: _silo,
    items: const [
      PlanItem(
        id: 'i7',
        componentId: 'c5',
        type: ItemType.inspection,
        shortText: 'Olhar o motovibrador',
        spokenText: 'Olhe o motovibrador do silo. Veja se está bem preso, se vibra e se não faz barulho estranho.',
      ),
      PlanItem(
        id: 'i8',
        componentId: 'c5',
        type: ItemType.action,
        shortText: 'Limpar o motovibrador',
        spokenText: 'Com o motovibrador desligado, limpe a poeira com o pano seco. Não use água.',
      ),
    ],
  ),
  WorkOrder(
    id: 'o3',
    equipment: _elevador,
    items: const [
      PlanItem(
        id: 'i9',
        componentId: 'c6',
        type: ItemType.inspection,
        shortText: 'Olhar o motor',
        spokenText: 'Olhe e escute o motor do elevador. Veja se está muito quente, com barulho, tremendo ou coberto de poeira.',
      ),
      PlanItem(
        id: 'i10',
        componentId: 'c7',
        type: ItemType.inspection,
        shortText: 'Olhar a correia',
        spokenText: 'Só olhe a correia com o elevador desligado. Veja se está rachada, frouxa, fora do lugar ou com caneca solta.',
      ),
      PlanItem(
        id: 'i11',
        componentId: 'c8',
        type: ItemType.action,
        shortText: 'Lubrificar o mancal',
        spokenText: 'Coloque graxa nos pontos dos mancais marcados de amarelo. Duas bombadas em cada ponto.',
      ),
    ],
  ),
];

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

WorkOrder orderById(String id) => demoOrders.firstWhere((o) => o.id == id);
