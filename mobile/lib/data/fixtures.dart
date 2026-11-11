import 'package:flutter/material.dart';

import '../domain/models.dart';

// Dados de exemplo do protótipo do Sprint 1, no formato da planilha (Setor D).
// Continuam no app: sem ZELO_API (build de depuração e testes), entram este funcionário
// e estas ordens. Em produção sem painel o app nem abre (app.dart).
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
