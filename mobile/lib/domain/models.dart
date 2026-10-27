import 'package:flutter/material.dart';

/// Tipos de item de plano (escopo, seção 6).
enum ItemType { inspection, action, measurement }

/// Resultado de um item. `help` = medição sem valor, pediu ajuda.
enum Outcome { ok, problem, blocked, done, measured, help }

/// Estados de sincronização visíveis ao trabalhador (escopo, seção 8.3).
enum SyncState { savedLocal, sending, received, attention }

class Measurement {
  const Measurement({
    required this.symbol,
    required this.spokenUnit,
    required this.min,
    required this.max,
    this.tolerance = 0.1,
  });

  final String symbol;
  final String spokenUnit;
  final double min;
  final double max;

  /// Fração da faixa usada como zona amarela de cada lado.
  final double tolerance;

  double get margin => (max - min) * tolerance;

  /// 0 = dentro da faixa, 1 = perto do limite, 2 = fora da faixa.
  int classify(double value) {
    if (value < min - margin || value > max + margin) return 2;
    if (value < min || value > max) return 1;
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
}

class Component {
  const Component({required this.id, required this.tag, required this.shortName, required this.icon});

  final String id;
  final String tag;
  final String shortName;
  final IconData icon;
}

class Equipment {
  const Equipment({
    required this.id,
    required this.tag,
    required this.shortName,
    required this.icon,
    required this.color,
    required this.components,
  });

  final String id;

  /// O QR da etiqueta codifica só a tag.
  final String tag;
  final String shortName;
  final IconData icon;
  final Color color;
  final List<Component> components;

  Component component(String id) => components.firstWhere((c) => c.id == id);
}

class WorkOrder {
  const WorkOrder({required this.id, required this.equipment, required this.items, this.overdue = false});

  final String id;
  final Equipment equipment;
  final List<PlanItem> items;
  final bool overdue;
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

  static const outOfRange = 'out_of_range';
}

class Worker {
  const Worker({required this.id, required this.name, required this.pin});

  final String id;
  final String name;

  /// Índices das figuras na grade de nove (escopo, seção 4).
  final List<int> pin;
}
