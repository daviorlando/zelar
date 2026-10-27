import 'package:flutter/material.dart';

import '../domain/models.dart';

// Dados de exemplo do protótipo do Sprint 1, no formato da planilha (Setor D).
// As faixas de medição são FICTÍCIAS, só para o teste de uso: em produção os
// limites vêm do responsável técnico e o sistema não inventa valores.

const demoWorker = Worker(id: 'w1', name: 'Trabalhador de teste', pin: [0, 1, 2, 5]);

const _rosca = Equipment(
  id: 'e1',
  tag: 'D - RT',
  shortName: 'Rosca do forno',
  icon: Icons.precision_manufacturing,
  color: Color(0xFF1565C0),
  components: [
    Component(id: 'c1', tag: 'D - RT - ME', shortName: 'Motor', icon: Icons.bolt),
    Component(id: 'c2', tag: 'D - RT - RD', shortName: 'Redutor', icon: Icons.settings),
    Component(id: 'c3', tag: 'D - RT - MAN', shortName: 'Mancal', icon: Icons.album),
    Component(id: 'c4', tag: 'D - RT - ROL', shortName: 'Rolamento', icon: Icons.radio_button_checked),
  ],
);

const _silo = Equipment(
  id: 'e2',
  tag: 'D - SIL',
  shortName: 'Silo do forno',
  icon: Icons.inventory,
  color: Color(0xFF6A1B9A),
  components: [
    Component(id: 'c5', tag: 'D - SIL - MT', shortName: 'Motovibrador', icon: Icons.vibration),
  ],
);

const _elevador = Equipment(
  id: 'e3',
  tag: 'D - ELE',
  shortName: 'Elevador de canecas',
  icon: Icons.elevator,
  color: Color(0xFF2E7D32),
  components: [
    Component(id: 'c6', tag: 'D - ELE - ME', shortName: 'Motor', icon: Icons.bolt),
    Component(id: 'c7', tag: 'D - ELE - CT', shortName: 'Correia', icon: Icons.loop),
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
        spokenText: 'Olhe o motor. Veja se tem vazamento, se está torto, muito quente ou sujo.',
      ),
      PlanItem(
        id: 'i2',
        componentId: 'c1',
        type: ItemType.measurement,
        shortText: 'Medir a corrente',
        spokenText: 'Meça a corrente do motor com o alicate amperímetro. Digite o número que aparecer.',
        measurement: Measurement(symbol: 'A', spokenUnit: 'ampères', min: 6, max: 8.5),
      ),
      PlanItem(
        id: 'i3',
        componentId: 'c2',
        type: ItemType.measurement,
        shortText: 'Temperatura do redutor',
        spokenText: 'Meça a temperatura da caixa do redutor com o termômetro. Digite o número.',
        measurement: Measurement(symbol: '°C', spokenUnit: 'graus', min: 20, max: 90),
      ),
      PlanItem(
        id: 'i4',
        componentId: 'c2',
        type: ItemType.inspection,
        shortText: 'Ouvir o redutor',
        spokenText: 'Escute o redutor funcionando. Veja se tem barulho diferente do normal.',
      ),
      PlanItem(
        id: 'i5',
        componentId: 'c3',
        type: ItemType.inspection,
        shortText: 'Olhar o mancal',
        spokenText: 'Olhe o mancal. Veja se tem vazamento, desgaste ou se está esquentando demais.',
      ),
      PlanItem(
        id: 'i6',
        componentId: 'c4',
        type: ItemType.inspection,
        shortText: 'Olhar o rolamento',
        spokenText: 'Olhe o rolamento. Veja se tem folga, desgaste ou vazamento.',
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
        spokenText: 'Olhe o motovibrador do silo. Veja se está bem preso e sem barulho estranho.',
      ),
      PlanItem(
        id: 'i8',
        componentId: 'c5',
        type: ItemType.action,
        shortText: 'Limpar o motovibrador',
        spokenText: 'Limpe a poeira do motovibrador com o pano seco. Não use água.',
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
        spokenText: 'Olhe o motor do elevador. Veja se tem vazamento, se está muito quente ou sujo.',
      ),
      PlanItem(
        id: 'i10',
        componentId: 'c7',
        type: ItemType.inspection,
        shortText: 'Olhar a correia',
        spokenText: 'Olhe a correia. Veja se está rachada, frouxa ou fora do lugar.',
      ),
      PlanItem(
        id: 'i11',
        componentId: 'c6',
        type: ItemType.action,
        shortText: 'Lubrificar',
        spokenText: 'Coloque graxa nos pontos marcados de amarelo. Duas bombadas em cada ponto.',
      ),
    ],
  ),
];

/// Figuras do PIN visual: devem ser validadas com os trabalhadores no Sprint 1.
const pinFigures = <(IconData, Color, String)>[
  (Icons.wb_sunny, Color(0xFFF9A825), 'sol'),
  (Icons.home, Color(0xFF6D4C41), 'casa'),
  (Icons.directions_car, Color(0xFFC62828), 'carro'),
  (Icons.park, Color(0xFF2E7D32), 'árvore'),
  (Icons.water_drop, Color(0xFF1565C0), 'gota'),
  (Icons.star, Color(0xFFFF8F00), 'estrela'),
  (Icons.favorite, Color(0xFFAD1457), 'coração'),
  (Icons.key, Color(0xFF455A64), 'chave'),
  (Icons.pets, Color(0xFF5D4037), 'cachorro'),
];

/// Motivos de impedimento padrão (escopo, seção 6).
const blockReasons = <(String, IconData, String)>[
  ('no_tool', Icons.build, 'Falta ferramenta'),
  ('running', Icons.play_circle, 'Equipamento funcionando'),
  ('stopped_other', Icons.engineering, 'Parado para outro serviço'),
  ('no_material', Icons.inventory_2, 'Falta material'),
  ('need_tech', Icons.support_agent, 'Preciso de apoio técnico'),
  ('unsafe', Icons.dangerous, 'Lugar inseguro'),
  ('other', Icons.mic, 'Outro motivo'),
];

/// Tipos de problema encontrados na inspeção (a validar com a equipe).
const problemKinds = <(String, IconData, String)>[
  ('leak', Icons.water_drop, 'Vazamento'),
  ('noise', Icons.hearing, 'Barulho estranho'),
  ('hot', Icons.local_fire_department, 'Muito quente'),
  ('loose', Icons.hardware, 'Peça solta'),
  ('broken', Icons.broken_image, 'Peça quebrada'),
  ('dirty', Icons.cleaning_services, 'Muita sujeira'),
  ('other', Icons.mic, 'Outro problema'),
];

WorkOrder orderById(String id) => demoOrders.firstWhere((o) => o.id == id);
