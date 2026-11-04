import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zelo/app.dart';
import 'package:zelo/audio/phrases.dart';
import 'package:zelo/audio/speaker.dart';
import 'package:zelo/data/fixtures.dart';
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

Future<ProviderContainer> startApp(WidgetTester tester, Size size, {Speaker? speaker}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [if (speaker != null) speakerProvider.overrideWithValue(speaker)],
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
