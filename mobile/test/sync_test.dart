import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:zelo/data/orders_repo.dart';
import 'package:zelo/data/workers_repo.dart';
import 'package:zelo/domain/models.dart';
import 'package:zelo/state/outbox.dart';
import 'package:zelo/state/session.dart';

/// Formato de GET /api/mobile/orders, com dados no estilo da planilha.
Map<String, dynamic> sampleJson() => {
      'today': '2026-10-29',
      'sectors': ['D'],
      'equipment': [
        {
          'id': 'eq-rt',
          'tag': 'D - RT',
          'name': 'ROSCA TRANSPORTADORA DO FORNO',
          'components': [
            {'id': 'c-me', 'tag': 'D - RT - ME', 'name': 'MOTOR 5 CV 1740 RPM'},
            {'id': 'c-rol2', 'tag': 'D - RT - ROL2', 'name': 'ROLAMENTO 6205'},
            {'id': 'c-vol', 'tag': 'D - RT - VOL1', 'name': 'VOLANTE 01'},
          ],
        },
      ],
      'planItems': [
        {'id': 'p1', 'componentId': 'c-me', 'type': 'inspection', 'kind': 'inspeção visual', 'activity': 'Inspeção Visual: verificar vazamentos.', 'unit': null, 'min': null, 'max': null},
        {'id': 'p2', 'componentId': 'c-me', 'type': 'measurement', 'kind': 'verificação de tensão e corrente', 'activity': 'Medir a corrente.', 'unit': null, 'min': null, 'max': null},
        {'id': 'p3', 'componentId': 'eq-rt', 'type': 'action', 'kind': 'limpeza', 'activity': 'Limpar a rosca.', 'unit': null, 'min': null, 'max': null},
      ],
      'orders': [
        {
          'id': 'wo-1',
          'equipmentId': 'eq-rt',
          'frequency': 'weekly',
          'periodStart': '2020-01-06',
          'dueDate': '2020-01-12',
          'status': 'in_progress',
          'returnedReason': null,
          'items': [
            {'id': 'it-1', 'planItemId': 'p1', 'result': 'problem', 'value': null, 'reason': 'noise'},
            {'id': 'it-2', 'planItemId': 'p2', 'result': 'blocked', 'value': null, 'reason': 'need_help'},
            {'id': 'it-3', 'planItemId': 'p3', 'result': null, 'value': null, 'reason': null},
          ],
        },
        {
          'id': 'wo-futura',
          'equipmentId': 'eq-rt',
          'frequency': 'daily',
          'periodStart': '2999-01-01',
          'dueDate': '2999-01-01',
          'status': 'open',
          'returnedReason': null,
          'items': [
            {'id': 'it-9', 'planItemId': 'p3', 'result': null, 'value': null, 'reason': null},
          ],
        },
      ],
    };

void main() {
  group('ordens vindas do painel', () {
    test('item pulado volta do servidor como pulado, nunca como impedido', () {
    final a = answerFromServer('i1', 'skipped');
    expect(a.outcome, Outcome.skipped);
    expect(a.isBlocked, isFalse);
    expect(a.isSkipped, isTrue);
  });

  test('frequência desconhecida não vira diária', () {
    expect(Frequency.parse('mensalidade'), isNot(Frequency.daily));
  });

  test('monta equipamento, componentes pelo sufixo da tag e itens pelo id da ordem', () {
      final p = parseOrders(sampleJson());
      final o = p.orders.firstWhere((x) => x.id == 'wo-1');
      expect(o.equipment.shortName, 'Rosca Transportadora do Forno');
      expect(o.frequency, Frequency.weekly);
      expect(o.spokenName, 'Rosca Transportadora do Forno, semanal');
      expect(o.items.map((i) => i.id), ['it-1', 'it-2', 'it-3']);

      final comps = {for (final c in o.equipment.components) c.tag: c};
      expect(comps['D - RT - ME']!.kind, ComponentKind.motor);
      expect(comps['D - RT - ROL2']!.shortName, 'Rolamento 2');
      expect(comps['D - RT - VOL1']!.kind, ComponentKind.other);
      // Atividade lançada na tag principal usa o próprio equipamento como componente.
      expect(o.equipment.component(o.items[2].componentId).tag, 'D - RT');
      expect(o.items[0].spokenText, startsWith('Motor. '));
      expect(o.items[0].shortText, 'Inspeção visual');
    });

    test('medição da planilha vem sem limites: só anota o número', () {
      final item = parseOrders(sampleJson()).orders.first.items[1];
      expect(item.type, ItemType.measurement);
      expect(item.measurement!.hasRange, isFalse);
      expect(item.measurement!.classify(9999), 0);
    });

    test('aviso de liberação do gestor chega na ordem', () {
      final json = sampleJson();
      (json['orders'] as List).first['releasedNote'] = 'Ferramenta entregue';
      final p = parseOrders(json);
      expect(p.orders.firstWhere((x) => x.id == 'wo-1').released, isTrue);
      expect(p.orders.firstWhere((x) => x.id == 'wo-futura').released, isFalse);
    });

    test('atrasada e futura', () {
      final p = parseOrders(sampleJson());
      expect(p.orders.firstWhere((x) => x.id == 'wo-1').overdue, isTrue);
      final futura = p.orders.firstWhere((x) => x.id == 'wo-futura');
      expect(futura.current, isFalse);
      expect(futura.overdue, isFalse);
    });

    test('respostas do servidor voltam como respostas do app ("preciso de ajuda" incluso)', () {
      final a = parseOrders(sampleJson()).answers['wo-1']!;
      expect(a['it-1']!.outcome, Outcome.problem);
      expect(a['it-1']!.reason, 'noise');
      expect(a['it-2']!.outcome, Outcome.help);
      expect(a.containsKey('it-3'), isFalse);
    });

    test('restaurar: servidor + fila do celular, na ordem em que foi feito', () {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final server = parseOrders(sampleJson()).answers;
      OutboxOp op(String type, Map<String, dynamic> payload) =>
          OutboxOp(opId: newOpId(), workerId: 'w', type: type, payload: payload, createdAt: DateTime.now());
      final now = DateTime.now().toUtc().toIso8601String();
      c.read(sessionProvider.notifier).restore(server, [
        op('answer', {'orderId': 'wo-1', 'itemId': 'it-3', 'result': 'done', 'deviceTime': now}),
        op('clear', {'orderId': 'wo-1', 'itemId': 'it-1'}),
        op('finish', {'orderId': 'wo-1', 'deviceTime': now}),
      ]);
      final s = c.read(sessionProvider);
      expect(s.answersFor('wo-1')['it-3']!.outcome, Outcome.done);
      expect(s.answersFor('wo-1').containsKey('it-1'), isFalse);
      expect(s.finished, contains('wo-1'));
    });
  });

  group('fila de envio', () {
    late Directory dir;
    late List<http.BaseRequest> sent;
    late http.Response Function(http.Request) respond;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('zelo-fila');
      OutboxNotifier.directory = () async => dir;
      WorkersRepo.override = (api: 'http://painel.test', key: 'k');
      sent = [];
      OutboxNotifier.client = () => MockClient((req) async {
            sent.add(req);
            return respond(req);
          });
    });

    tearDown(() async {
      WorkersRepo.override = null;
      await dir.delete(recursive: true);
    });

    Future<OutboxNotifier> fila(ProviderContainer c) async {
      final n = c.read(outboxProvider.notifier);
      await n.addAnswer(workerId: 'w1', orderId: 'o', itemId: 'i1', result: 'ok', at: DateTime.now());
      await n.addAnswer(workerId: 'w1', orderId: 'o', itemId: 'i2', result: 'problem', reason: 'noise', at: DateTime.now());
      return n;
    }

    test('grava em arquivo antes de enviar e sobrevive a reabrir o app', () async {
      final c1 = ProviderContainer();
      await fila(c1);
      c1.dispose();
      final c2 = ProviderContainer();
      addTearDown(c2.dispose);
      await c2.read(outboxProvider.notifier).load();
      expect(c2.read(outboxProvider).map((o) => o.payload['itemId']), ['i1', 'i2']);
    });

    test('aceita e repetida saem da fila; recusada fica e pede atenção', () async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final n = await fila(c);
      respond = (req) {
        final ops = (jsonDecode(req.body) as Map)['ops'] as List;
        return http.Response(
          jsonEncode({
            'results': [
              {'opId': ops[0]['opId'], 'status': 'duplicate', 'reason': null},
              {'opId': ops[1]['opId'], 'status': 'rejected', 'reason': 'ordem de outro setor'},
            ],
          }),
          200,
        );
      };
      expect(n.needsAttention, isFalse);
      await n.flush();
      final body = jsonDecode((sent.single as http.Request).body) as Map;
      expect(body['workerId'], 'w1');
      expect((body['ops'] as List).first['itemId'], 'i1');
      expect(c.read(outboxProvider).single.payload['itemId'], 'i2');
      expect(c.read(outboxProvider).single.rejected, isTrue);
      expect(n.needsAttention, isTrue);
    });

    test('sem internet não perde nada e tenta de novo depois', () async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final n = await fila(c);
      respond = (_) => throw const SocketException('sem rede');
      await n.flush();
      expect(n.pending, 2);
      expect(n.lastError, contains('sem rede'));

      respond = (req) {
        final ops = (jsonDecode(req.body) as Map)['ops'] as List;
        return http.Response(jsonEncode({'results': [for (final o in ops) {'opId': o['opId'], 'status': 'accepted'}]}), 200);
      };
      await n.flush();
      expect(c.read(outboxProvider), isEmpty);
    });

    test('foto sobe só depois da resposta aceita', () async {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final foto = File('${dir.path}/camera.jpg')..writeAsBytesSync([1, 2, 3]);
      final n = c.read(outboxProvider.notifier);
      await n.addAnswer(workerId: 'w1', orderId: 'o', itemId: 'i1', result: 'problem', at: DateTime.now(), photoPath: foto.path);
      expect(c.read(outboxProvider).map((o) => o.type), ['answer', 'media']);

      respond = (req) {
        if (req.url.path.endsWith('/sync')) {
          final ops = (jsonDecode(req.body) as Map)['ops'] as List;
          return http.Response(jsonEncode({'results': [for (final o in ops) {'opId': o['opId'], 'status': 'accepted'}]}), 200);
        }
        return http.Response(jsonEncode({'status': 'accepted'}), 200);
      };
      await n.flush();
      expect(sent.map((r) => r.url.path), ['/api/mobile/sync', '/api/mobile/media']);
      expect(c.read(outboxProvider), isEmpty);
    });

    http.Response aceitaTudo(http.Request req) {
      final ops = (jsonDecode(req.body) as Map)['ops'] as List;
      return http.Response(jsonEncode({'results': [for (final o in ops) {'opId': o['opId'], 'status': 'accepted'}]}), 200);
    }

    ProviderContainer comFuncionario() {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final w = Worker(id: 'w1', name: 'Teste', pinHash: pinHashOf('w1', const [1, 2, 3, 4]), badgeHash: 'x');
      c.read(sessionProvider.notifier).tryPin(w, const [1, 2, 3, 4]);
      return c;
    }

    test('resposta dada no app sai para o painel na hora, sem esperar o ciclo de 5 minutos', () async {
      final c = comFuncionario();
      respond = aceitaTudo;
      c.read(sessionProvider.notifier).answer('o', Answer(itemId: 'i1', outcome: Outcome.ok, at: DateTime.now()));
      for (var i = 0; i < 200 && c.read(outboxProvider).isNotEmpty || sent.isEmpty && i < 200; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(sent.map((r) => r.url.path), ['/api/mobile/sync']);
      expect(c.read(outboxProvider), isEmpty);
    });

    test('sem internet a resposta dada no app continua guardada na fila', () async {
      final c = comFuncionario();
      respond = (_) => throw const SocketException('sem rede');
      c.read(sessionProvider.notifier).answer('o', Answer(itemId: 'i1', outcome: Outcome.ok, at: DateTime.now()));
      for (var i = 0; i < 200 && sent.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(c.read(outboxProvider).single.payload['itemId'], 'i1');
      expect(c.read(sessionProvider).answersFor('o').containsKey('i1'), isTrue);
    });

    test('entrar durante outro envio ainda baixa as ordens', () async {
      OrdersRepo.directory = () async => dir;
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final segura = Completer<void>();
      var downloads = 0;
      OutboxNotifier.client = () => MockClient((req) async {
            await segura.future;
            return aceitaTudo(req);
          });
      await c.read(outboxProvider.notifier).addAnswer(workerId: 'w0', orderId: 'o', itemId: 'i', result: 'ok', at: DateTime.now());
      final servidor = MockClient((req) async {
        if (req.url.path.endsWith('orders')) downloads++;
        return http.Response.bytes(utf8.encode(jsonEncode(sampleJson())), 200);
      });
      await http.runWithClient(() async {
        final primeiro = c.read(ordersProvider.notifier).sync(); // app abrindo, ninguém logado, enviando a fila
        final w = Worker(id: 'w1', name: 'Teste', pinHash: pinHashOf('w1', const [1, 2, 3, 4]), badgeHash: 'x');
        c.read(sessionProvider.notifier).tryPin(w, const [1, 2, 3, 4]);
        await c.read(ordersProvider.notifier).loadFor(w);
        expect(c.read(ordersLoadProvider), OrdersLoad.loading);
        segura.complete();
        await primeiro;
      }, () => servidor);
      expect(downloads, 1);
      expect(c.read(ordersLoadProvider), OrdersLoad.ready);
      expect(c.read(ordersProvider), isNotEmpty);
    });

    test('sem nada guardado e sem internet: falhou, não "tudo feito"; com guardado: pronto', () async {
      OrdersRepo.directory = () async => dir;
      final c = comFuncionario();
      final w = Worker(id: 'w1', name: 'Teste', pinHash: pinHashOf('w1', const [1, 2, 3, 4]), badgeHash: 'x');
      final caiu = MockClient((_) async => throw const SocketException('sem rede'));
      await http.runWithClient(() => c.read(ordersProvider.notifier).loadFor(w), () => caiu);
      expect(c.read(ordersLoadProvider), OrdersLoad.failed);

      File('${dir.path}/w1.json').writeAsStringSync(jsonEncode(sampleJson()));
      await http.runWithClient(() => c.read(ordersProvider.notifier).loadFor(w), () => caiu);
      expect(c.read(ordersLoadProvider), OrdersLoad.ready);
      expect(c.read(ordersProvider), isNotEmpty);
    });

    test('resposta enviada durante o download não some da tela', () async {
      OrdersRepo.directory = () async => dir;
      final c = comFuncionario();
      respond = aceitaTudo;
      var downloads = 0;
      final servidor = MockClient((req) async {
        if (req.url.path.endsWith('orders')) downloads++;
        final json = sampleJson();
        if (downloads == 1) {
          // O servidor já montou esta resposta quando o funcionário responde e o envio termina.
          await c.read(outboxProvider.notifier).addAnswer(workerId: 'w1', orderId: 'wo-1', itemId: 'it-3', result: 'done', at: DateTime.now());
          await c.read(outboxProvider.notifier).flush();
        } else {
          ((json['orders'] as List).first['items'] as List)[2]['result'] = 'done';
        }
        return http.Response.bytes(utf8.encode(jsonEncode(json)), 200);
      });
      await http.runWithClient(() => c.read(ordersProvider.notifier).sync(), () => servidor);
      expect(downloads, 2);
      expect(c.read(sessionProvider).answersFor('wo-1')['it-3']!.outcome, Outcome.done);
    });
  });
}
