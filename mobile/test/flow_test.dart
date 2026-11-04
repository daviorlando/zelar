import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zelo/app.dart';
import 'package:zelo/audio/phrases.dart';
import 'package:zelo/audio/speaker.dart';
import 'package:zelo/data/fixtures.dart';
import 'package:zelo/data/orders_repo.dart';
import 'package:zelo/data/workers_repo.dart';
import 'package:zelo/domain/models.dart';
import 'package:zelo/state/session.dart';

const phones = {'comum 412x915': Size(412, 915), 'pequeno 360x640': Size(360, 640)};

/// Guarda o que a voz falaria, para conferir a ordem das falas.
class FakeSpeaker extends Speaker {
  final said = <String>[];
  var stops = 0;

  @override
  Future<void> say(String text) async => said.add(text);

  @override
  Future<void> stop() async => stops++;
}

Future<ProviderContainer> startApp(WidgetTester tester, Size size, {Speaker? speaker, List<dynamic> overrides = const []}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [if (speaker != null) speakerProvider.overrideWithValue(speaker), ...overrides.cast()],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const ZeloApp()));
  await tester.pumpAndSettle();
  return container;
}

Future<void> tapKey(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
}

/// Sem crachá: toca a própria foto (se ainda não escolheu) e as figuras.
Future<void> enterPin(WidgetTester tester, List<int> pin) async {
  final photo = find.byKey(Key('worker-${demoWorker.id}'));
  if (photo.evaluate().isNotEmpty) await tapKey(tester, 'worker-${demoWorker.id}');
  for (final i in pin) {
    await tapKey(tester, 'pin-$i');
  }
}

/// Como no celular de verdade: a tela abre antes de a lista chegar.
class ListaDemorada extends OrdersNotifier {
  @override
  List<WorkOrder> build() => const [];

  void chegou() => state = demoOrders;
}

class ComecaCarregando extends OrdersLoadNotifier {
  @override
  OrdersLoad build() => OrdersLoad.loading;
}

/// O indicador de carregando gira sem parar: aqui não dá para esperar a tela assentar.
Future<void> entrarComListaCarregando(WidgetTester tester) async {
  await tapKey(tester, 'worker-${demoWorker.id}');
  for (final i in demoWorker.pin) {
    await tester.tap(find.byKey(Key('pin-$i')));
    await tester.pump(const Duration(milliseconds: 100));
  }
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

const motivo = 'Refazer a limpeza';
const resolvido = 'Ferramenta entregue';

class OrdensComLiberada extends OrdersNotifier {
  @override
  List<WorkOrder> build() => [
        orderById('o1'),
        WorkOrder(id: 'o2', equipment: orderById('o2').equipment, items: orderById('o2').items, releasedNote: resolvido),
      ];
}

/// Responde tudo da o2, com o primeiro item em "não consegui".
Future<ProviderContainer> abrirImpedida(WidgetTester tester, Size size, FakeSpeaker voz) async {
  final c = await startApp(tester, size, speaker: voz);
  await enterPin(tester, demoWorker.pin);
  final s = c.read(sessionProvider.notifier);
  final itens = orderById('o2').items;
  s.answer('o2', Answer(itemId: itens.first.id, outcome: Outcome.blocked, at: DateTime.now(), reason: 'no_tool'));
  for (final i in itens.skip(1)) {
    s.answer('o2', Answer(itemId: i.id, outcome: Outcome.ok, at: DateTime.now()));
  }
  await tester.pumpAndSettle();
  return c;
}

/// A segunda ordem de demonstração, devolvida pelo gestor com as respostas guardadas.
class OrdensComDevolvida extends OrdersNotifier {
  @override
  List<WorkOrder> build() => [
        orderById('o1'),
        WorkOrder(id: 'o2', equipment: orderById('o2').equipment, items: orderById('o2').items, returnedReason: motivo),
      ];
}

/// Entra e deixa a ordem como volta do painel: respondida, sem "concluída" e sem mudanças.
Future<ProviderContainer> abrirDevolvida(WidgetTester tester, Size size, FakeSpeaker voz) async {
  final c = await startApp(tester, size, speaker: voz, overrides: [ordersProvider.overrideWith(OrdensComDevolvida.new)]);
  await enterPin(tester, demoWorker.pin);
  final s = c.read(sessionProvider.notifier);
  final itens = orderById('o2').items;
  for (final i in itens) {
    s.answer('o2', Answer(itemId: i.id, outcome: Outcome.ok, at: DateTime.now()));
  }
  s.finish('o2');
  s.restore({'o2': c.read(sessionProvider).answersFor('o2')}, const []);
  await tester.pumpAndSettle();
  return c;
}

/// Deixa vencer o temporizador do "Desfazer" antes do fim do teste.
Future<void> drainTimers(WidgetTester tester) => tester.pump(const Duration(seconds: 9));

void main() {
  for (final MapEntry(key: name, value: size) in phones.entries) {
    group('celular $name', () {
      testWidgets('PIN visual bloqueia após cinco erros', (tester) async {
        final c = await startApp(tester, size);
        for (var n = 0; n < maxPinAttempts; n++) {
          await enterPin(tester, [8, 8, 8, 8]);
        }
        expect(c.read(sessionProvider).locked, isTrue);
        expect(find.byIcon(Icons.lock), findsOneWidget);
        expect(find.byKey(const Key('pin-0')), findsNothing); // grade some até o gestor desbloquear
        expect(c.read(sessionProvider).worker, isNull);
      });

      testWidgets('crachá entra direto; crachá desconhecido, antigo ou de desativado não', (tester) async {
        final c = await startApp(tester, size);
        final session = c.read(sessionProvider.notifier);
        expect(session.tryBadge('zelo:cracha:outro-codigo'), isNull);
        expect(session.tryBadge('D - RT - ME'), isNull); // etiqueta de equipamento
        expect(session.tryBadge('demo-cracha-teste'), isNull); // sem o prefixo do Zelo
        expect(c.read(sessionProvider).worker, isNull);
        expect(c.read(sessionProvider).failedAttempts, 0); // crachá errado não bloqueia as figuras

        expect(session.tryBadge('zelo:cracha:demo-cracha-teste')?.id, demoWorker.id);
        expect(c.read(sessionProvider).worker?.id, demoWorker.id);
      });

      testWidgets('inspeção + ação até concluir a ordem', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoWorker.pin);
        expect(find.byKey(const Key('order-o2')), findsOneWidget);

        await tapKey(tester, 'order-o2');
        await tapKey(tester, 'recognize-ok');
        await tapKey(tester, 'answer-ok');
        await tapKey(tester, 'answer-done');
        await tapKey(tester, 'conclude');

        final s = c.read(sessionProvider);
        expect(s.finished, contains('o2'));
        expect(s.answersFor('o2').values.map((a) => a.outcome), [Outcome.ok, Outcome.done]);
        expect(find.byKey(const Key('order-o2')), findsOneWidget); // de volta à tela Hoje
        await drainTimers(tester);
      });

      testWidgets('lista ainda não chegou: não diz que acabou e fala a quantidade quando chega', (tester) async {
        final voz = FakeSpeaker();
        final c = await startApp(tester, size, speaker: voz, overrides: [
          ordersProvider.overrideWith(ListaDemorada.new),
          ordersLoadProvider.overrideWith(ComecaCarregando.new),
        ]);
        await entrarComListaCarregando(tester);
        expect(voz.said.where((f) => f.contains(Phrases.allDone)), isEmpty);
        expect(find.text('Nada para hoje'), findsNothing);
        expect(find.byKey(const Key('orders-loading')), findsOneWidget);

        (c.read(ordersProvider.notifier) as ListaDemorada).chegou();
        c.read(ordersLoadProvider.notifier).set(OrdersLoad.ready);
        await tester.pump();
        expect(voz.said.where((f) => f.contains('atividades pendentes')), hasLength(1));
        expect(voz.said.where((f) => f.contains(Phrases.allDone)), isEmpty);
      });

      testWidgets('download falhou sem nada guardado: avisa, não diz que acabou; depois atualiza', (tester) async {
        final voz = FakeSpeaker();
        final c = await startApp(tester, size, speaker: voz, overrides: [
          ordersProvider.overrideWith(ListaDemorada.new),
          ordersLoadProvider.overrideWith(ComecaCarregando.new),
        ]);
        await entrarComListaCarregando(tester);
        c.read(ordersLoadProvider.notifier).set(OrdersLoad.failed);
        await tester.pump();
        expect(voz.said.last, Phrases.loadFailed);
        expect(find.byKey(const Key('orders-failed')), findsOneWidget);
        expect(voz.said.where((f) => f.contains(Phrases.allDone)), isEmpty);

        (c.read(ordersProvider.notifier) as ListaDemorada).chegou();
        c.read(ordersLoadProvider.notifier).set(OrdersLoad.ready);
        await tester.pump();
        expect(voz.said.last, contains('atividades pendentes'));
      });

      testWidgets('lista carregada e vazia ainda diz que acabou', (tester) async {
        final voz = FakeSpeaker();
        await startApp(tester, size, speaker: voz, overrides: [ordersProvider.overrideWith(ListaDemorada.new)]);
        await enterPin(tester, demoWorker.pin);
        await tester.pump();
        expect(voz.said.last, contains(Phrases.allDone));
        expect(find.text('Nada para hoje'), findsOneWidget);
      });

      testWidgets('tela principal fala só a quantidade; segurar o cartão fala a atividade', (tester) async {
        final voz = FakeSpeaker();
        final c = await startApp(tester, size, speaker: voz);
        await enterPin(tester, demoWorker.pin);
        final total = c.read(ordersProvider).where((o) => o.current).length;
        expect(voz.said.last, contains('$total atividades pendentes'));
        for (final o in c.read(ordersProvider)) {
          expect(voz.said.last, isNot(contains(o.equipment.shortName)));
        }

        final primeira = c.read(ordersProvider).firstWhere((o) => o.id == 'o2');
        await tester.longPress(find.byKey(const Key('order-o2')));
        await tester.pumpAndSettle();
        expect(voz.said.last, startsWith(primeira.spokenName));
        expect(find.byKey(const Key('recognize-ok')), findsNothing); // segurar não abre a atividade
      });

      testWidgets('depois de responder, vai só para o que falta', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoWorker.pin);
        final itens = orderById('o1').items;
        expect(itens.length, greaterThanOrEqualTo(3));
        // Como numa ordem liberada: falta o primeiro e o último; os do meio já têm resposta.
        final s = c.read(sessionProvider.notifier);
        for (final i in itens.sublist(1, itens.length - 1)) {
          s.answer('o1', Answer(itemId: i.id, outcome: Outcome.ok, at: DateTime.now()));
        }
        await tester.pumpAndSettle();
        await tapKey(tester, 'order-o1');
        await tapKey(tester, 'recognize-ok');
        expect(find.text('1 / ${itens.length}'), findsOneWidget);

        await tapKey(tester, 'answer-ok');
        expect(find.text('${itens.length} / ${itens.length}'), findsOneWidget);
        expect(c.read(sessionProvider).answersFor('o1').length, itens.length - 1);
        await drainTimers(tester);
      });

      testWidgets('item impedido: cartão marca, não conta como feito e Concluir fica bloqueado', (tester) async {
        final voz = FakeSpeaker();
        final c = await abrirImpedida(tester, size, voz);
        expect(find.byKey(const Key('blocked-o2')), findsOneWidget);
        await tester.longPress(find.byKey(const Key('order-o2')));
        await tester.pumpAndSettle();
        expect(voz.said.last, contains('Faltam 1 itens'));
        expect(voz.said.last, contains('1 esperando o gestor'));

        await tapKey(tester, 'order-o2');
        await tapKey(tester, 'recognize-ok');
        expect(voz.said.last, contains(Phrases.waitingManager(1)));

        await tester.tap(find.byKey(const Key('conclude')));
        await tester.pumpAndSettle();
        expect(c.read(sessionProvider).finished, isNot(contains('o2')));
        expect(voz.said.last, Phrases.waitingManager(1));

        // Resolveu sozinho: responde de novo e já pode concluir.
        final item = orderById('o2').items.first.id;
        c.read(sessionProvider.notifier).answer('o2', Answer(itemId: item, outcome: Outcome.ok, at: DateTime.now()));
        await tester.pumpAndSettle();
        await tapKey(tester, 'conclude');
        expect(c.read(sessionProvider).finished, contains('o2'));
        await drainTimers(tester);
      });

      testWidgets('liberada pelo gestor: primeiro na lista, com marca, aviso escrito e falado', (tester) async {
        final voz = FakeSpeaker();
        await startApp(tester, size, speaker: voz, overrides: [ordersProvider.overrideWith(OrdensComLiberada.new)]);
        await enterPin(tester, demoWorker.pin);
        expect(voz.said.last, contains('1 foi liberada pelo gestor'));
        expect(find.byKey(const Key('released-o2')), findsOneWidget);
        final y = tester.getTopLeft(find.byKey(const Key('order-o2'))).dy;
        expect(y, lessThan(tester.getTopLeft(find.byKey(const Key('order-o1'))).dy));

        await tapKey(tester, 'order-o2');
        expect(find.text(resolvido), findsOneWidget);
        expect(find.text('Liberado pelo gestor'), findsOneWidget);
        expect(voz.said.last, contains(resolvido));
        await drainTimers(tester);
      });

      testWidgets('devolvida vem primeiro, com marca, motivo escrito e falado', (tester) async {
        final voz = FakeSpeaker();
        await abrirDevolvida(tester, size, voz);
        expect(find.byKey(const Key('returned-o2')), findsOneWidget);
        expect(find.byIcon(Icons.undo), findsOneWidget); // a atrasada o1 não leva a marca
        final y = tester.getTopLeft(find.byKey(const Key('order-o2'))).dy;
        expect(y, lessThan(tester.getTopLeft(find.byKey(const Key('order-o1'))).dy));

        await tapKey(tester, 'order-o2');
        expect(find.text(motivo), findsOneWidget);
        expect(voz.said.last, contains(motivo));

        await tapKey(tester, 'recognize-ok'); // tudo respondido: cai direto na revisão
        expect(find.byKey(const Key('conclude')), findsOneWidget);
        expect(find.text(motivo), findsOneWidget);
        await drainTimers(tester);
      });

      testWidgets('devolvida sem mudança pede confirmação; corrigir não conclui', (tester) async {
        final voz = FakeSpeaker();
        final c = await abrirDevolvida(tester, size, voz);
        await tapKey(tester, 'order-o2');
        await tapKey(tester, 'recognize-ok');

        await tapKey(tester, 'conclude');
        expect(voz.said.last, Phrases.concludeUnchanged(motivo));
        await tapKey(tester, 'conclude-fix');
        expect(c.read(sessionProvider).finished, isNot(contains('o2')));
        expect(find.byKey(const Key('conclude-fix')), findsNothing);

        await tapKey(tester, 'conclude');
        await tapKey(tester, 'conclude-anyway');
        expect(c.read(sessionProvider).finished, contains('o2'));
        expect(find.byKey(const Key('returned-o2')), findsNothing); // concluída perde a marca
        await drainTimers(tester);
      });

      testWidgets('devolvida com resposta mudada conclui direto', (tester) async {
        final c = await abrirDevolvida(tester, size, FakeSpeaker());
        await tapKey(tester, 'order-o2');
        await tapKey(tester, 'recognize-ok');
        final item = orderById('o2').items.first.id;
        c.read(sessionProvider.notifier).answer('o2', Answer(itemId: item, outcome: Outcome.done, at: DateTime.now()));
        await tester.pumpAndSettle();

        await tapKey(tester, 'conclude');
        expect(find.byKey(const Key('conclude-anyway')), findsNothing);
        expect(c.read(sessionProvider).finished, contains('o2'));
        await drainTimers(tester);
      });

      testWidgets('problema com motivo, desfazer e medição fora da faixa', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoWorker.pin);
        await tapKey(tester, 'order-o1');
        await tapKey(tester, 'recognize-ok');

        // Item 1: problema exige motivo antes de "Pronto".
        await tapKey(tester, 'answer-problem');
        await tapKey(tester, 'reason-done');
        expect(c.read(sessionProvider).answersFor('o1'), isEmpty);
        expect(find.byKey(const Key('reason-leak')), findsNothing); // motor elétrico não vaza óleo
        await tapKey(tester, 'reason-hot');
        await tapKey(tester, 'reason-done');
        expect(c.read(sessionProvider).answersFor('o1')['i1']!.reason, 'hot');

        // Item 2 (medição) oferece desfazer o item 1.
        await tapKey(tester, 'undo');
        expect(c.read(sessionProvider).answersFor('o1'), isEmpty);
        await tapKey(tester, 'answer-ok');

        // Corrente 12 A: fora da faixa 6–8,5. Primeiro toque avisa, segundo registra.
        await tapKey(tester, 'key-1');
        await tapKey(tester, 'key-2');
        await tapKey(tester, 'measure-confirm');
        expect(c.read(sessionProvider).answersFor('o1').containsKey('i2'), isFalse);
        await tapKey(tester, 'measure-confirm');
        final a = c.read(sessionProvider).answersFor('o1')['i2']!;
        expect(a.value, 12);
        expect(a.isProblem, isTrue);

        // Item 3: pede ajuda sem valor.
        await tapKey(tester, 'measure-help');
        expect(c.read(sessionProvider).answersFor('o1')['i3']!.outcome, Outcome.help);
        await drainTimers(tester);
      });

      testWidgets('botão amarelo fala as instruções do problema, não repete o item', (tester) async {
        final voice = FakeSpeaker();
        await startApp(tester, size, speaker: voice);
        await enterPin(tester, demoWorker.pin);
        await tapKey(tester, 'order-o1');
        await tapKey(tester, 'recognize-ok');
        voice.said.clear();

        await tapKey(tester, 'answer-problem');
        expect(voice.said, [Phrases.problem('Motor')]);

        await tapKey(tester, 'reason-hot');
        expect(voice.said.last, startsWith('Muito quente'));
        expect(voice.said.last, contains('botão verde'));
      });

      testWidgets('voz para quando o app sai da tela', (tester) async {
        final voice = FakeSpeaker();
        await startApp(tester, size, speaker: voice);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
        tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
        expect(voice.stops, greaterThan(0));
        for (final back in [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
          tester.binding.handleAppLifecycleStateChanged(back);
        }
      });

      testWidgets('correia mostra problemas de correia; envio só aparece com erro', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoWorker.pin);
        await tapKey(tester, 'order-o3');
        await tapKey(tester, 'recognize-ok');
        await tapKey(tester, 'answer-ok'); // motor do elevador
        await tapKey(tester, 'answer-problem'); // correia
        expect(find.byKey(const Key('reason-loose_belt')), findsOneWidget);
        expect(find.byKey(const Key('reason-hot')), findsNothing);

        expect(find.byKey(const Key('sync-attention')), findsNothing);
        c.read(sessionProvider.notifier).setSync(SyncState.attention);
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('sync-attention')), findsOneWidget);
        await drainTimers(tester);
      });
    });
  }

  test('cada componente tem seus problemas e sempre "outro"', () {
    for (final kind in ComponentKind.values) {
      final ids = problemsByKind[kind]!.map((r) => r.$1).toList();
      expect(ids, contains('other'), reason: '$kind');
      expect(ids.toSet().length, ids.length, reason: '$kind sem ids repetidos');
    }
    expect(problemsByKind[ComponentKind.motor]!.map((r) => r.$1), isNot(contains('oil_leak')));
    expect(problemsByKind[ComponentKind.vibrator]!.map((r) => r.$1), isNot(contains('oil_leak')));
  });

  test('funcionário desativado não entra nem por crachá nem por figuras', () {
    final c = ProviderContainer(overrides: [
      workersProvider.overrideWithBuild((ref, notifier) => [
            Worker(id: 'w2', name: 'Desativado', pin: demoWorker.pin, badgeHash: demoWorker.badgeHash, active: false),
          ]),
    ]);
    addTearDown(c.dispose);
    final session = c.read(sessionProvider.notifier);
    final w = c.read(workersProvider).single;
    expect(session.tryBadge('zelo:cracha:demo-cracha-teste'), isNull);
    expect(session.tryPin(w, w.pin), isFalse);
  });

  test('item com equipamento ligado não aceita "funcionando" como motivo', () {
    final i6 = orderById('o1').items.firstWhere((i) => i.id == 'i6');
    expect(blockReasonsFor(i6).map((r) => r.$1), isNot(contains('running')));
  });
}
