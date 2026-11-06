import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';

/// Tipos de item de plano (escopo, seção 6).
enum ItemType { inspection, action, measurement }

/// Resultado de um item. `help` = medição sem valor, pediu ajuda.
/// `skipped` = o funcionário não soube responder: a ordem conclui e o gestor decide.
enum Outcome { ok, problem, blocked, done, measured, help, skipped }

/// Estados de sincronização visíveis ao trabalhador (escopo, seção 8.3).
enum SyncState { savedLocal, sending, received, attention }

/// Frequências da planilha (escopo, seção 7).
enum Frequency {
  daily('diária'),
  weekly('semanal'),
  monthly('mensal'),
  quarterly('trimestral'),
  semiannual('semestral'),
  annual('anual');

  const Frequency(this.spoken);

  /// Como a voz fala a frequência.
  final String spoken;

  static Frequency parse(String? v) => Frequency.values.firstWhere((f) => f.name == v, orElse: () => Frequency.weekly);
}

class Measurement {
  const Measurement({
    this.symbol = '',
    this.spokenUnit = '',
    this.min,
    this.max,
    this.tolerance = 0.1,
  });

  final String symbol;
  final String spokenUnit;

  /// Limites vêm do responsável técnico. A planilha não traz: sem eles, o app só
  /// anota o número, sem faixa e sem aviso de fora do normal (o sistema não inventa limites).
  final double? min;
  final double? max;

  /// Fração da faixa usada como zona amarela de cada lado.
  final double tolerance;

  bool get hasRange => min != null && max != null && max! > min!;

  double get margin => hasRange ? (max! - min!) * tolerance : 0;

  /// 0 = dentro da faixa, 1 = perto do limite, 2 = fora da faixa. Sem limites, sempre 0.
  int classify(double value) {
    if (!hasRange) return 0;
    if (value < min! - margin || value > max! + margin) return 2;
    if (value < min! || value > max!) return 1;
    return 0;
  }
}

class PlanItem {
  const PlanItem({
    required this.id,
    required this.componentId,
    required this.type,
    required this.shortText,
    required this.spokenText,
    this.measurement,
    this.recordedAudio = false,
    this.needsRunning = false,
  });

  final String id;
  final String componentId;
  final ItemType type;

  /// Texto curto exibido como reforço; o canal principal é o áudio.
  final String shortText;

  /// Texto da instrução acessível (no protótipo, falado por voz sintética).
  final String spokenText;
  final Measurement? measurement;

  /// Sem gravação humana aprovada, a voz sintética é marcada como provisória.
  final bool recordedAudio;

  /// O item só se faz com o equipamento ligado: "Equipamento funcionando" não serve de motivo.
  final bool needsRunning;
}

/// Tipo de componente: define os problemas que fazem sentido na inspeção.
/// `other` = sufixo de tag sem tipo conhecido (volante, polia, tambor...): lista genérica.
enum ComponentKind { motor, gearbox, bearingHousing, bearing, vibrator, belt, other }

class Component {
  const Component({required this.id, required this.tag, required this.shortName, required this.icon, required this.kind});

  final String id;
  final String tag;
  final String shortName;
  final IconData icon;
  final ComponentKind kind;
}

class Equipment {
  const Equipment({
    required this.id,
    required this.tag,
    required this.shortName,
    required this.icon,
    required this.color,
    required this.components,
    this.photoFile,
    this.details,
  });

  final String id;

  /// O QR da etiqueta codifica só a tag.
  final String tag;
  final String shortName;
  final IconData icon;
  final Color color;
  final List<Component> components;

  /// Foto cadastrada pelo gestor, guardada no celular. Nula ou ainda não baixada: fica o ícone.
  final String? photoFile;

  /// "WEG W22 · 5 CV · 1750 RPM", para ajudar a reconhecer a máquina.
  final String? details;

  Component component(String id) => components.firstWhere((c) => c.id == id);
}

class WorkOrder {
  const WorkOrder({
    required this.id,
    required this.equipment,
    required this.items,
    this.frequency = Frequency.weekly,
    this.periodStart,
    this.dueDate,
    this.returnedReason,
    this.releasedNote,
    bool overdue = false,
  }) : _overdue = overdue; // ignore: prefer_initializing_formals

  final String id;
  final Equipment equipment;
  final List<PlanItem> items;
  final Frequency frequency;

  /// Datas do período (sem hora). Nulas nos dados de exemplo.
  final DateTime? periodStart;
  final DateTime? dueDate;

  /// O gestor devolveu a ordem para completar (motivo escrito por ele).
  final String? returnedReason;

  /// O gestor resolveu o impedimento e liberou os itens (o que ele escreveu).
  final String? releasedNote;
  final bool _overdue;

  /// Venceu antes de hoje e ainda não foi finalizada.
  /// O gestor devolveu: as respostas continuam, o funcionário corrige o que foi pedido.
  bool get returned => returnedReason?.trim().isNotEmpty ?? false;

  /// O gestor resolveu o que impedia: os itens voltaram a pendentes.
  bool get released => releasedNote?.trim().isNotEmpty ?? false;

  bool get overdue => _overdue || (dueDate != null && dueDate!.isBefore(today()));

  /// Já começou: o período em curso ou um anterior (atrasado). Futuras ficam guardadas para offline.
  bool get current => periodStart == null || !periodStart!.isAfter(today());

  /// Nome para a voz: a frequência só entra quando não é diária ("Rosca, semanal").
  String get spokenName => frequency == Frequency.daily ? equipment.shortName : '${equipment.shortName}, ${frequency.spoken}';
}

/// Diferença em dias entre o painel e o relógio do celular, medida no último download.
/// Celular com a data errada não pode esconder nem atrasar tarefa.
var _serverDayOffset = 0;

/// Guarda o "hoje" do painel. Sem internet, vale a última diferença medida.
void setServerToday(String? serverToday) {
  final server = DateTime.tryParse(serverToday ?? '');
  if (server == null) return;
  final n = DateTime.now();
  _serverDayOffset = DateTime.utc(server.year, server.month, server.day).difference(DateTime.utc(n.year, n.month, n.day)).inDays;
}

/// Hoje, sem hora, pelo painel quando já se conectou; senão, pelo relógio do celular.
DateTime today() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day + _serverDayOffset);
}

class Answer {
  const Answer({
    required this.itemId,
    required this.outcome,
    required this.at,
    this.reason,
    this.value,
    this.photoPath,
    this.audioPath,
  });

  final String itemId;
  final Outcome outcome;
  final DateTime at;
  final String? reason;
  final double? value;
  final String? photoPath;
  final String? audioPath;

  /// Medição fora da faixa conta como problema, sem bloquear o registro.
  bool get isProblem => outcome == Outcome.problem || reason == outOfRange;

  /// "Não consegui" ou "preciso de ajuda": a verificação fica pendente, esperando o gestor.
  bool get isBlocked => outcome == Outcome.blocked || outcome == Outcome.help;

  /// "Não soube responder": tem resposta, mas não conta como feito.
  bool get isSkipped => outcome == Outcome.skipped;

  static const outOfRange = 'out_of_range';
}

/// Quantos números tem o PIN.
const pinLength = 4;

/// O mesmo hash do painel (frontend/src/lib/workers.ts): o id do funcionário faz o papel de sal.
String pinHashOf(String workerId, List<int> pin) => sha256.convert(utf8.encode('zelo:pin:$workerId:${pin.join()}')).toString();

class Worker {
  const Worker({
    required this.id,
    required this.name,
    required this.pinHash,
    required this.badgeHash,
    this.photoPath,
    this.active = true,
  });

  final String id;
  final String name;

  /// Hash do PIN de números, para entrar sem crachá e sem internet. O celular não guarda o PIN.
  final String pinHash;

  /// SHA-256 (hex) do código do crachá. O celular nunca guarda o código em si.
  final String badgeHash;

  /// Foto baixada do painel, guardada no celular para funcionar offline.
  final String? photoPath;
  final bool active;

  factory Worker.fromJson(Map<String, dynamic> j) => Worker(
        id: j['id'] as String,
        name: j['name'] as String,
        // Lista guardada pelo app antigo ainda traz o PIN: vira hash ao ler, até a próxima atualização.
        pinHash: j['pinHash'] as String? ?? pinHashOf(j['id'] as String, [for (final n in j['pin'] as List) (n as num).toInt()]),
        badgeHash: j['badgeHash'] as String,
        photoPath: j['localPhoto'] as String?,
        active: j['active'] as bool? ?? true,
      );
}
