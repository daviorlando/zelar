import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../domain/models.dart';
import '../state/outbox.dart';
import '../state/session.dart';
import 'fixtures.dart';
import 'workers_repo.dart';

/// Ordens do funcionário, geradas no painel a partir da planilha. Ficam guardadas
/// no celular (JSON) para trabalhar sem internet até o fim da janela de 60 dias.
class OrdersRepo {
  static Future<Directory> Function() directory = () async {
    final dir = Directory('${(await getApplicationDocumentsDirectory()).path}/ordens');
    await dir.create(recursive: true);
    return dir;
  };

  Future<File> _file(String workerId) async => File('${(await directory()).path}/$workerId.json');

  Future<Map<String, dynamic>?> loadCached(String workerId) async {
    final file = await _file(workerId);
    if (!await file.exists()) return null;
    return jsonDecode(await file.readAsString()) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> download(String workerId, {http.Client? client}) async {
    final c = client ?? http.Client();
    try {
      final res = await c
          .get(Uri.parse('${WorkersRepo.api}/api/mobile/orders?worker=$workerId'),
              headers: {'x-device-key': WorkersRepo.deviceKey})
          .timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw HttpException('painel respondeu ${res.statusCode}');
      final body = utf8.decode(res.bodyBytes);
      final file = await _file(workerId);
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(body);
      await tmp.rename(file.path);
      return jsonDecode(body) as Map<String, dynamic>;
    } finally {
      if (client == null) c.close();
    }
  }
}

/// Ordens montadas e as respostas que o servidor já tem.
typedef ParsedOrders = ({List<WorkOrder> orders, Map<String, Map<String, Answer>> answers});

/// Monta as ordens a partir do JSON de `GET /api/mobile/orders`.
ParsedOrders parseOrders(Map<String, dynamic> json) {
  final components = <String, Component>{};
  final equipment = <String, Equipment>{};
  for (final e in (json['equipment'] as List).cast<Map<String, dynamic>>()) {
    final name = shortEquipmentName(e['name'] as String?, e['tag'] as String);
    final comps = [
      // O próprio equipamento, para atividades lançadas na tag principal.
      Component(id: e['id'] as String, tag: e['tag'] as String, shortName: name, icon: iconOf(ComponentKind.other), kind: ComponentKind.other),
      for (final c in (e['components'] as List).cast<Map<String, dynamic>>())
        componentFrom(c['id'] as String, c['tag'] as String, c['name'] as String?),
    ];
    for (final c in comps) {
      components[c.id] = c;
    }
    equipment[e['id'] as String] = Equipment(
      id: e['id'] as String,
      tag: e['tag'] as String,
      shortName: name,
      icon: Icons.precision_manufacturing,
      color: colorOf(e['tag'] as String),
      components: comps,
    );
  }

  final plan = {for (final p in (json['planItems'] as List).cast<Map<String, dynamic>>()) p['id'] as String: p};

  final orders = <WorkOrder>[];
  final answers = <String, Map<String, Answer>>{};
  for (final o in (json['orders'] as List).cast<Map<String, dynamic>>()) {
    final eq = equipment[o['equipmentId']];
    if (eq == null) continue;
    final items = <PlanItem>[];
    for (final i in (o['items'] as List).cast<Map<String, dynamic>>()) {
      final p = plan[i['planItemId']];
      if (p == null) continue;
      final component = components[p['componentId']] ?? eq.components.first;
      final type = ItemType.values.firstWhere((t) => t.name == p['type'], orElse: () => ItemType.inspection);
      final unit = (p['unit'] as String?) ?? '';
      items.add(PlanItem(
        // O id do item é o da linha da ordem (work_order_item): é o que o servidor espera de volta.
        id: i['id'] as String,
        componentId: component.id,
        type: type,
        shortText: capitalize(p['kind'] as String? ?? ''),
        spokenText: '${component.shortName}. ${(p['activity'] as String).trim()}',
        measurement: type == ItemType.measurement
            ? Measurement(symbol: unit, spokenUnit: unit, min: (p['min'] as num?)?.toDouble(), max: (p['max'] as num?)?.toDouble())
            : null,
      ));
      final result = i['result'] as String?;
      if (result != null) {
        (answers[o['id'] as String] ??= {})[i['id'] as String] = answerFromServer(
          i['id'] as String,
          result,
          reason: i['reason'] as String?,
          value: (i['value'] as num?)?.toDouble(),
        );
      }
    }
    if (items.isEmpty) continue;
    orders.add(WorkOrder(
      id: o['id'] as String,
      equipment: eq,
      items: items,
      frequency: Frequency.parse(o['frequency'] as String?),
      periodStart: DateTime.parse(o['periodStart'] as String),
      dueDate: DateTime.parse(o['dueDate'] as String),
      returnedReason: o['returnedReason'] as String?,
    ));
  }
  return (orders: orders, answers: answers);
}

/// Resposta guardada no servidor → resposta no app. "Preciso de ajuda" vai como impedimento com motivo.
Answer answerFromServer(String itemId, String result, {String? reason, double? value}) {
  final outcome = switch (result) {
    'ok' => Outcome.ok,
    'problem' => Outcome.problem,
    'done' => Outcome.done,
    'measured' => Outcome.measured,
    'blocked' when reason == helpReason => Outcome.help,
    _ => Outcome.blocked,
  };
  return Answer(itemId: itemId, outcome: outcome, at: DateTime.now(), reason: outcome == Outcome.help ? null : reason, value: value);
}

/// Motivo gravado no servidor quando o funcionário pede ajuda numa medição.
const helpReason = 'need_help';

/// Tipo do componente pelo sufixo da tag: "A - BMAN - ME" → motor, "… - ROL2" → rolamento.
ComponentKind kindOfTag(String tag) {
  final parts = tag.split(' - ');
  if (parts.length < 3) return ComponentKind.other;
  final suffix = parts.last.replaceAll(RegExp(r'[\d\s]'), '');
  return switch (suffix) {
    'ME' => ComponentKind.motor,
    'RD' || 'RED' => ComponentKind.gearbox,
    'MAN' => ComponentKind.bearingHousing,
    'ROL' => ComponentKind.bearing,
    'MT' => ComponentKind.vibrator,
    'CT' || 'COR' => ComponentKind.belt,
    _ => ComponentKind.other,
  };
}

const _kindName = {
  ComponentKind.motor: 'Motor',
  ComponentKind.gearbox: 'Redutor',
  ComponentKind.bearingHousing: 'Mancal',
  ComponentKind.bearing: 'Rolamento',
  ComponentKind.vibrator: 'Motovibrador',
  ComponentKind.belt: 'Correia',
};

Component componentFrom(String id, String tag, String? name) {
  final kind = kindOfTag(tag);
  final number = RegExp(r'(\d+)$').firstMatch(tag.split(' - ').last.replaceAll(' ', ''))?.group(1);
  final short = switch (_kindName[kind]) {
    final base? => number == null ? base : '$base $number',
    null => shortEquipmentName(name, tag),
  };
  return Component(id: id, tag: tag, shortName: short, icon: iconOf(kind), kind: kind);
}

IconData iconOf(ComponentKind kind) => switch (kind) {
      ComponentKind.motor => Icons.bolt,
      ComponentKind.gearbox => Icons.settings,
      ComponentKind.bearingHousing => Icons.album,
      ComponentKind.bearing => Icons.radio_button_checked,
      ComponentKind.vibrator => Icons.vibration,
      ComponentKind.belt => Icons.loop,
      ComponentKind.other => Icons.build_circle,
    };

/// Nome do cadastro em maiúsculas → "Britador Mandíbula". Sem nome, a tag.
String shortEquipmentName(String? name, String tag) {
  final n = name?.trim();
  if (n == null || n.isEmpty) return tag;
  const small = {'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'para', 'com'};
  final words = n.toLowerCase().split(RegExp(r'\s+'));
  return [
    for (var i = 0; i < words.length; i++)
      i > 0 && small.contains(words[i]) ? words[i] : capitalize(words[i]),
  ].join(' ');
}

String capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

/// Cores de equipamento: fogem do verde, amarelo, azul, roxo e laranja dos botões.
const _palette = [
  Color(0xFF6D4C41),
  Color(0xFFAD1457),
  Color(0xFF00838F),
  Color(0xFF37474F),
  Color(0xFF827717),
  Color(0xFF880E4F),
  Color(0xFF006064),
  Color(0xFF4E342E),
];

/// A mesma tag sempre ganha a mesma cor, em qualquer celular.
Color colorOf(String tag) => _palette[tag.codeUnits.fold<int>(0, (a, c) => (a * 31 + c) & 0x7fffffff) % _palette.length];

/// Lista vazia não quer dizer "nada a fazer": pode ainda não ter chegado. A tela só
/// afirma que acabou com a lista em `ready`.
enum OrdersLoad { loading, ready, failed }

class OrdersLoadNotifier extends Notifier<OrdersLoad> {
  @override
  OrdersLoad build() => WorkersRepo.configured ? OrdersLoad.loading : OrdersLoad.ready;

  void set(OrdersLoad value) => state = value;
}

final ordersLoadProvider = NotifierProvider<OrdersLoadNotifier, OrdersLoad>(OrdersLoadNotifier.new);

class OrdersNotifier extends Notifier<List<WorkOrder>> {
  final _repo = OrdersRepo();

  /// Último erro ao atualizar (mostrado só na tela do facilitador).
  String? lastError;
  DateTime? lastUpdate;
  var _syncing = false;
  var _syncAgain = false;

  @override
  List<WorkOrder> build() => WorkersRepo.configured ? const [] : demoOrders;

  WorkOrder byId(String id) => state.firstWhere((o) => o.id == id);

  /// Ao entrar: o que está guardado primeiro (offline), depois envia e atualiza.
  Future<void> loadFor(Worker worker) async {
    if (!WorkersRepo.configured) return;
    final load = ref.read(ordersLoadProvider.notifier);
    // Sai a lista de quem usou o celular antes: enquanto a nova não chega, não há o que mostrar.
    state = const [];
    load.set(OrdersLoad.loading);
    try {
      final cached = await _repo.loadCached(worker.id);
      if (cached != null) {
        final parsed = parseOrders(cached);
        _apply(parsed);
        // Guardada sem nada para hoje pode estar velha: quem decide é o download.
        if (parsed.orders.any((o) => o.current)) load.set(OrdersLoad.ready);
      }
    } catch (e) {
      debugPrint('ordens guardadas ilegíveis: $e');
    }
    await sync();
  }

  /// Envia o que está na fila e baixa as ordens de novo. Sem internet, fica com o que tem.
  /// Pedido no meio de outro envio roda logo depois dele: quem entra enquanto o app
  /// ainda sincroniza não pode ficar sem as ordens até o próximo ciclo.
  Future<void> sync() async {
    if (!WorkersRepo.configured) return;
    if (_syncing) {
      _syncAgain = true;
      return;
    }
    _syncing = true;
    try {
      do {
        _syncAgain = false;
        await _syncOnce();
      } while (_syncAgain);
    } finally {
      _syncing = false;
    }
  }

  Future<void> _syncOnce() async {
    final worker = ref.read(sessionProvider).worker;
    final load = ref.read(ordersLoadProvider.notifier);
    try {
      final outbox = ref.read(outboxProvider.notifier);
      await outbox.flush();
      if (worker == null) return;
      // Se algo foi enviado durante o download, o que veio pode estar sem essa resposta
      // (e ela já saiu da fila): aplicar faria a resposta sumir da tela. Baixa de novo.
      for (var attempt = 0; attempt < 3; attempt++) {
        final before = outbox.delivered;
        final parsed = parseOrders(await _repo.download(worker.id));
        // Trocou de funcionário durante o download: estas ordens não são de quem está aqui.
        if (ref.read(sessionProvider).worker?.id != worker.id) {
          _syncAgain = true;
          return;
        }
        if (outbox.delivered == before) {
          _apply(parsed);
          load.set(OrdersLoad.ready);
          break;
        }
      }
      lastError = null;
      lastUpdate = DateTime.now();
    } catch (e) {
      lastError = '$e';
      debugPrint('sem atualização de ordens: $e');
      if (ref.read(ordersLoadProvider) == OrdersLoad.loading) load.set(OrdersLoad.failed);
    }
  }

  void _apply(ParsedOrders parsed) {
    state = parsed.orders;
    ref.read(sessionProvider.notifier).restore(parsed.answers, ref.read(outboxProvider));
  }
}

final ordersProvider = NotifierProvider<OrdersNotifier, List<WorkOrder>>(OrdersNotifier.new);
