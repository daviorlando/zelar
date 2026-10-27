import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zelo/app.dart';
import 'package:zelo/data/fixtures.dart';
import 'package:zelo/domain/models.dart';
import 'package:zelo/state/session.dart';

const phones = {'comum 412x915': Size(412, 915), 'pequeno 360x640': Size(360, 640)};

Future<ProviderContainer> startApp(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final container = ProviderContainer();
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const ZeloApp()));
  await tester.pumpAndSettle();
  return container;
}

Future<void> tapKey(WidgetTester tester, String key) async {
  await tester.tap(find.byKey(Key(key)));
  await tester.pumpAndSettle();
}

Future<void> enterPin(WidgetTester tester, List<int> pin) async {
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
        await tapKey(tester, 'reason-leak');
        await tapKey(tester, 'reason-done');
        expect(c.read(sessionProvider).answersFor('o1')['i1']!.reason, 'leak');

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
    });
  }
}
