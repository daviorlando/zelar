import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zelar/app.dart';
import 'package:zelar/audio/phrases.dart';
import 'package:zelar/audio/speaker.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:record/record.dart';
import 'package:zelar/data/fixtures.dart';
import 'package:zelar/data/orders_repo.dart';
import 'package:zelar/data/workers_repo.dart';
import 'package:zelar/domain/models.dart';
import 'package:zelar/domain/reasons.dart';
import 'package:zelar/state/device.dart';
import 'package:zelar/state/outbox.dart';
import 'package:zelar/state/recent.dart';
import 'package:zelar/state/session.dart';
import 'package:zelar/state/setup.dart';
import 'package:zelar/ui/screens/reason_screen.dart';
import 'package:zelar/ui/widgets.dart';

WorkOrder orderById(String id) => demoOrders.firstWhere((o) => o.id == id);

const phones = {'comum 412x915': Size(412, 915), 'pequeno 360x640': Size(360, 640)};

/// Guarda o que a voz falaria, para conferir a ordem das falas.
class FakeSpeaker extends Speaker {
  final said = <String>[];
  var stops = 0;

  @override
  Future<void> say(String text) async => said.add(text);

  @override
  Future<void> stop() async => stops++;

  bool? installed = true;

  @override
  Future<bool?> ptBrInstalled() async => installed;
}

class FakeSystem extends SystemSettings {
  var opened = 0;
  int? volume = 7;

  @override
  Future<bool> openVoiceSettings() async {
    opened++;
    return true;
  }

  @override
  Future<int?> mediaVolume() async => volume;
}

/// Microfone de mentira: permissão escolhida pelo teste e um início que só termina quando ele quer.
class FakeRecorder implements AudioRecorder {
  var granted = false;
  var allowOnAsk = false;
  var asked = 0;
  var stops = 0;
  final started = <String>[];
  Completer<void>? starting;

  @override
  Future<bool> hasPermission({bool request = true}) async {
    if (!granted && request) {
      asked++;
      granted = allowOnAsk;
    }
    return granted;
  }

  @override
  Future<void> start(RecordConfig config, {required String path}) async {
    started.add(path);
    await starting?.future;
  }

  @override
  Future<String?> stop() async {
    stops++;
    return started.last;
  }

  @override
  Future<void> dispose() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Troca o microfone da tela de motivo durante um teste.
FakeRecorder fakeMic() {
  final rec = FakeRecorder();
  final recorder = ReasonScreen.recorder;
  final directory = ReasonScreen.audioDirectory;
  ReasonScreen.recorder = () => rec;
  ReasonScreen.audioDirectory = () async => Directory.systemTemp;
  addTearDown(() {
    ReasonScreen.recorder = recorder;
    ReasonScreen.audioDirectory = directory;
  });
  return rec;
}

/// Como num celular novo: ainda não passou pela primeira inicialização.
class SetupPendente extends SetupNotifier {
  var finished = false;

  @override
  Future<void> load() async => state = true;

  @override
  Future<void> finish() async {
    finished = true;
    state = false;
  }
}

Future<ProviderContainer> startApp(WidgetTester tester, Size size, {Speaker? speaker, List<dynamic> overrides = const []}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final container = ProviderContainer(
    overrides: [if (speaker != null) speakerProvider.overrideWithValue(speaker), ...overrides.cast()],
  );
  addTearDown(container.dispose);
  await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const ZelarApp()));
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
/// PIN direto, sem tocar na foto.
Future<void> entrarComListaCarregando(WidgetTester tester) async {
  for (final i in demoPin) {
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
  await enterPin(tester, demoPin);
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
  await enterPin(tester, demoPin);
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

/// Tem que dar para chegar ao botão rolando a tela, e o toque tem que acertá-lo.
Future<void> alcancar(WidgetTester tester, String key) async {
  final alvo = find.byKey(Key(key));
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  final centro = tester.getCenter(alvo);
  final tela = tester.view.physicalSize / tester.view.devicePixelRatio;
  expect(centro.dx >= 0 && centro.dx <= tela.width && centro.dy >= 0 && centro.dy <= tela.height, isTrue, reason: '$key fora da tela: $centro');
  await tester.tap(alvo);
  await tester.pumpAndSettle();
}

/// Pelo caminho mais longo: abre as fotos, toca a própria e digita.
Future<void> enterPinAlcancando(WidgetTester tester) async {
  await alcancar(tester, 'choose-photo');
  await alcancar(tester, 'worker-${demoWorker.id}');
  for (final i in demoPin) {
    await alcancar(tester, 'pin-$i');
  }
}

void main() {
  group('abertura', () {
    testWidgets('aparece, some sozinha e deixa a entrada falar', (tester) async {
      final voz = FakeSpeaker();
      tester.view.physicalSize = phones.values.first * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final c = ProviderContainer(overrides: [speakerProvider.overrideWithValue(voz)]);
      addTearDown(c.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(container: c, child: const ZelarApp()));
      expect(find.byKey(const Key('opening')), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('opening')), findsNothing);
      expect(voz.said, [Phrases.entry]);
    });

    testWidgets('na primeira vez, cobre a troca de tela e a entrada não começa a falar', (tester) async {
      final voz = FakeSpeaker();
      await startApp(tester, phones.values.first, speaker: voz, overrides: [
        setupProvider.overrideWith(SetupPendente.new),
        systemSettingsProvider.overrideWithValue(FakeSystem()),
      ]);
      expect(find.byKey(const Key('opening')), findsNothing);
      expect(find.text('A voz está pronta'), findsOneWidget);
      expect(voz.said, isNot(contains(Phrases.entry)));
    });

    testWidgets('com as animações do sistema desligadas, sai sem animar', (tester) async {
      tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
      addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
      await startApp(tester, phones.values.first);
      expect(find.byKey(const Key('opening')), findsNothing);
    });
  });

  group('fonte do celular', () {
    for (final escala in const [1.0, 1.3, 2.0]) {
      for (final MapEntry(key: name, value: size) in phones.entries) {
        testWidgets('escala $escala, $name: telas sem estouro e botões alcançáveis', (tester) async {
          tester.platformDispatcher.textScaleFactorTestValue = escala;
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

          // Primeira inicialização, com a voz faltando e o som desligado: o passo mais cheio.
          final voz = FakeSpeaker()..installed = false;
          final c = await startApp(tester, size, speaker: voz, overrides: [
            setupProvider.overrideWith(SetupPendente.new),
            systemSettingsProvider.overrideWithValue(FakeSystem()..volume = 0),
          ]);
          await alcancar(tester, 'setup-later');
          await alcancar(tester, 'setup-next');
          await alcancar(tester, 'setup-finish');

          // Entrada: escolher pela foto, a foto e os números.
          await alcancar(tester, 'choose-photo');
          await alcancar(tester, 'worker-${demoWorker.id}');
          for (final i in demoPin) {
            await alcancar(tester, 'pin-$i');
          }

          // Hoje, reconhecer, problema com motivo e medição.
          await alcancar(tester, 'order-o1');
          await alcancar(tester, 'recognize-ok');
          await alcancar(tester, 'answer-problem');
          await alcancar(tester, 'reason-hot');
          await alcancar(tester, 'reason-done');
          await alcancar(tester, 'key-7');
          await alcancar(tester, 'measure-confirm');
          expect(c.read(sessionProvider).answersFor('o1')['i2']!.value, 7);

          // Outra ordem, até concluir.
          c.read(sessionProvider.notifier).reset();
          await tester.pumpAndSettle();
          c.read(routerProvider).go('/');
          await tester.pumpAndSettle();
          await enterPinAlcancando(tester);
          await alcancar(tester, 'order-o2');
          await alcancar(tester, 'recognize-ok');
          await alcancar(tester, 'answer-ok');
          await alcancar(tester, 'answer-done');
          await alcancar(tester, 'conclude');
          expect(c.read(sessionProvider).finished, contains('o2'));
          await drainTimers(tester);
        });
      }
    }
  });

  group('voz pt-BR offline', () {
    test('reconhece a voz do Samsung, que vem com locale diferente', () {
      expect(
        temVozPtBrOffline([
          {'name': 'en-US-SMTf00', 'locale': 'eng-x-lvariant-f00', 'network_required': '0', 'features': ''},
          {'name': 'pt-BR-SMTf00', 'locale': 'por-x-lvariant-f00', 'network_required': '0', 'features': 'preload=true'},
        ]),
        isTrue,
      );
    });
    test('reconhece a voz local do Google, pelo locale', () {
      expect(
        temVozPtBrOffline([
          {'name': 'pt-br-x-afs-local', 'locale': 'pt-BR', 'network_required': '0', 'features': 'embeddedTts'},
        ]),
        isTrue,
      );
    });
    test('não aceita voz que depende de internet, não instalada ou de outro idioma', () {
      expect(
        temVozPtBrOffline([
          {'name': 'pt-br-x-afs-network', 'locale': 'pt-BR', 'network_required': '1', 'features': ''},
          {'name': 'pt-br-x-afs-local', 'locale': 'pt-BR', 'network_required': '0', 'features': 'notInstalled'},
          {'name': 'pt-PT-SMTf00', 'locale': 'por-x-lvariant-f00', 'network_required': '0', 'features': ''},
        ]),
        isFalse,
      );
    });
  });

  testWidgets('ligar o celular pela tela segue para a entrada, sem travar em Conferindo', (tester) async {
    final c = await startApp(tester, const Size(412, 915), speaker: FakeSpeaker(), overrides: [deviceProvider.overrideWith(_AtivaDeCerteza.new)]);
    c.read(routerProvider).go('/ativar');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('activation-code')), findsNothing, reason: 'o padrão é o login do gestor');
    await tester.enterText(find.byKey(const Key('activation-email')), 'gestor@empresa.com');
    await tester.enterText(find.byKey(const Key('activation-password')), 'senha');
    await tester.pump();
    await tapKey(tester, 'activation-send');
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('activation-send')), findsNothing);
    expect(find.byKey(const Key('badge')), findsOneWidget);
    expect((c.read(deviceProvider.notifier) as _AtivaDeCerteza).pedidos, [('gestor@empresa.com', 'senha', null)]);
  });

  testWidgets('"Tenho um código" troca para o código e liga do mesmo jeito', (tester) async {
    final c = await startApp(tester, const Size(360, 640), speaker: FakeSpeaker(), overrides: [deviceProvider.overrideWith(_AtivaDeCerteza.new)]);
    c.read(routerProvider).go('/ativar');
    await tester.pumpAndSettle();
    await tapKey(tester, 'activation-mode');
    await tester.enterText(find.byKey(const Key('activation-code')), 'ABCD2345');
    await tester.pump();
    await tapKey(tester, 'activation-send');
    expect(find.byKey(const Key('badge')), findsOneWidget);
    expect((c.read(deviceProvider.notifier) as _AtivaDeCerteza).pedidos, [(null, null, 'ABCD2345')]);
  });

  testWidgets('celular novo: tutorial primeiro, depois ligar à empresa, depois a entrada', (tester) async {
    final voz = FakeSpeaker();
    await startApp(tester, const Size(412, 915), speaker: voz, overrides: [
      setupProvider.overrideWith(SetupPendente.new),
      systemSettingsProvider.overrideWithValue(FakeSystem()),
      deviceProvider.overrideWith(_SemLigar.new),
    ]);
    expect(find.text('A voz está pronta'), findsOneWidget);
    await tapKey(tester, 'setup-next');
    await tapKey(tester, 'setup-next');
    expect(voz.said.last, Phrases.setupDoneActivate);
    expect(find.text('Agora o gestor liga este celular à empresa.'), findsOneWidget);
    await tapKey(tester, 'setup-finish');
    expect(find.byKey(const Key('activation-email')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('activation-email')), 'gestor@empresa.com');
    await tester.enterText(find.byKey(const Key('activation-password')), 'senha');
    await tester.pump();
    await tapKey(tester, 'activation-send');
    expect(find.byKey(const Key('choose-photo')), findsOneWidget);
  });

  for (final MapEntry(key: name, value: size) in phones.entries) {
    group('celular $name', () {
      testWidgets('PIN direto bloqueia após cinco erros; a foto e o crachá continuam', (tester) async {
        final c = await startApp(tester, size);
        for (var n = 0; n < maxPinAttempts; n++) {
          await enterPin(tester, [8, 8, 8, 8]);
        }
        expect(c.read(sessionProvider).lockedFor(directPinKey), isTrue);
        expect(c.read(sessionProvider).lockedFor(demoWorker.id), isFalse);
        expect(find.byIcon(Icons.lock), findsOneWidget);
        expect(find.byKey(const Key('pin-0')), findsNothing);
        // Pela foto, o PIN certo ainda entra.
        await tapKey(tester, 'choose-photo');
        await tapKey(tester, 'worker-${demoWorker.id}');
        for (final i in demoPin) {
          await tapKey(tester, 'pin-$i');
        }
        expect(c.read(sessionProvider).worker?.id, demoWorker.id);
      });

      testWidgets('PIN pela foto bloqueia aquela pessoa após cinco erros', (tester) async {
        final c = await startApp(tester, size);
        await tapKey(tester, 'choose-photo');
        await tapKey(tester, 'worker-${demoWorker.id}');
        for (var n = 0; n < maxPinAttempts; n++) {
          await enterPin(tester, [8, 8, 8, 8]);
        }
        expect(c.read(sessionProvider).lockedFor(demoWorker.id), isTrue);
        expect(find.byIcon(Icons.lock), findsOneWidget);
        expect(find.byKey(const Key('pin-0')), findsNothing); // teclado some até o bloqueio vencer
        expect(c.read(sessionProvider).worker, isNull);
      });

      testWidgets('"Não sei" pula o item, a ordem conclui e não conta como feito', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoPin);
        final s = c.read(sessionProvider.notifier);
        final ordem = demoOrders.first;
        await tapKey(tester, 'order-${ordem.id}');
        await tapKey(tester, 'recognize-ok');
        expect(find.byKey(const Key('answer-skip')), findsOneWidget);
        await tapKey(tester, 'answer-skip');
        final primeiro = ordem.items.first.id;
        expect(c.read(sessionProvider).answersFor(ordem.id)[primeiro]?.outcome, Outcome.skipped);
        for (final item in ordem.items.skip(1)) {
          s.answer(ordem.id, Answer(itemId: item.id, outcome: Outcome.skipped, at: DateTime.now()));
        }
        c.read(routerProvider).go('/ordem/${ordem.id}/finalizar');
        await tester.pumpAndSettle();
        final concluir = tester.widget<BigActionButton>(find.byKey(const Key('conclude')));
        expect(concluir.onPressed, isNotNull, reason: 'pular não impede concluir');
      });

      testWidgets('crachá entra direto; crachá desconhecido, antigo ou de desativado não', (tester) async {
        final c = await startApp(tester, size);
        final session = c.read(sessionProvider.notifier);
        expect(session.tryBadge('zelar:cracha:outro-codigo'), isNull);
        expect(session.tryBadge('D - RT - ME'), isNull); // etiqueta de equipamento
        expect(session.tryBadge('demo-cracha-teste'), isNull); // sem o prefixo do Zelar
        expect(c.read(sessionProvider).worker, isNull);
        expect(c.read(sessionProvider).pinFails, isEmpty); // crachá errado não bloqueia o PIN

        expect(session.tryBadge('zelar:cracha:demo-cracha-teste')?.id, demoWorker.id);
        expect(c.read(sessionProvider).worker?.id, demoWorker.id);
      });

      testWidgets('crachá impresso antes da troca de nome (zelo:cracha:) continua entrando', (tester) async {
        final c = await startApp(tester, size);
        final session = c.read(sessionProvider.notifier);
        expect(session.tryBadge('zelo:cracha:'), isNull);
        expect(session.tryBadge('zelo:cracha:demo-cracha-teste')?.id, demoWorker.id);
      });

      testWidgets('inspeção + ação até concluir a ordem', (tester) async {
        final c = await startApp(tester, size);
        await enterPin(tester, demoPin);
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

      testWidgets('primeira inicialização: voz faltando, abre as configurações, tutorial e entra', (tester) async {
        final voz = FakeSpeaker()..installed = false;
        final sistema = FakeSystem()..volume = 0;
        final c = await startApp(tester, size, speaker: voz, overrides: [
          setupProvider.overrideWith(SetupPendente.new),
          systemSettingsProvider.overrideWithValue(sistema),
        ]);
        expect(find.text('Falta instalar a voz'), findsOneWidget);
        expect(voz.said.last, Phrases.setupVoiceMissing);
        expect(find.byKey(const Key('setup-muted')), findsOneWidget); // volume em zero avisa por escrito

        await tapKey(tester, 'setup-open-voice');
        expect(sistema.opened, 1);

        // Voltou das configurações já com a voz instalada e o som ligado.
        voz.installed = true;
        sistema.volume = 7;
        for (final estado in [AppLifecycleState.resumed, AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused, AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
          tester.binding.handleAppLifecycleStateChanged(estado);
          await tester.pump();
        }
        await tester.pumpAndSettle();
        expect(find.text('A voz está pronta'), findsOneWidget);
        expect(find.byKey(const Key('setup-muted')), findsNothing);
        expect(voz.said.last, Phrases.setupVoiceReady);

        await tapKey(tester, 'setup-next');
        expect(voz.said.last, Phrases.setupHowItWorks);
        await tapKey(tester, 'setup-next');
        expect(voz.said.last, Phrases.setupDone);
        await tapKey(tester, 'setup-finish');
        expect((c.read(setupProvider.notifier) as SetupPendente).finished, isTrue);
        expect(find.byKey(const Key('choose-photo')), findsOneWidget); // tela de entrada
      });

      testWidgets('primeira inicialização: sem internet, dá para fazer a voz depois', (tester) async {
        final voz = FakeSpeaker()..installed = false;
        await startApp(tester, size, speaker: voz, overrides: [
          setupProvider.overrideWith(SetupPendente.new),
          systemSettingsProvider.overrideWithValue(FakeSystem()),
        ]);
        await tapKey(tester, 'setup-later');
        expect(find.text('Como funciona'), findsOneWidget);
      });

      testWidgets('quem já passou pela primeira inicialização vai direto para a entrada', (tester) async {
        await startApp(tester, size);
        expect(find.byKey(const Key('setup-next')), findsNothing);
        expect(find.byKey(const Key('choose-photo')), findsOneWidget);
      });

      testWidgets('quem já entrou fica com a foto na entrada; tocar nela pede só o PIN dela', (tester) async {
        final c = await startApp(tester, size, speaker: FakeSpeaker());
        expect(find.byKey(Key('recent-${demoWorker.id}')), findsNothing, reason: 'celular novo: ninguém usou ainda');
        await enterPin(tester, demoPin);
        expect(c.read(recentWorkersProvider), [demoWorker.id]);

        await tapKey(tester, 'logout');
        // Passado o prazo do "Voltar", a foto continua.
        c.read(sessionProvider.notifier).logout();
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('switch-back')), findsNothing);
        expect(find.text('Quem usa este celular'), findsOneWidget);
        await tapKey(tester, 'recent-${demoWorker.id}');
        expect(find.text(demoWorker.name), findsOneWidget);
        for (final i in demoPin) {
          await tapKey(tester, 'pin-$i');
        }
        expect(c.read(sessionProvider).worker?.id, demoWorker.id);
      });

      testWidgets('trocar de pessoa sai na hora, não deixa respostas para o próximo e dá para voltar', (tester) async {
        final voz = FakeSpeaker();
        final c = await startApp(tester, size, speaker: voz);
        await enterPin(tester, demoPin);
        c.read(sessionProvider.notifier).answer('o2', Answer(itemId: orderById('o2').items.first.id, outcome: Outcome.ok, at: DateTime.now()));
        await tester.pumpAndSettle();

        await tapKey(tester, 'logout');
        expect(c.read(sessionProvider).worker, isNull);
        expect(c.read(sessionProvider).answersFor('o2'), isEmpty);
        expect(voz.said.last, Phrases.entryAfterSwitch);
        expect(find.text('Voltar para ${demoWorker.name}'), findsOneWidget);

        // Toque sem querer: volta sem digitar o PIN.
        await tapKey(tester, 'switch-back');
        expect(c.read(sessionProvider).worker?.id, demoWorker.id);
        expect(find.byKey(const Key('order-o2')), findsOneWidget);

        // Troca de verdade: a próxima pessoa entra pelo PIN, e o "voltar" deixa de valer.
        await tapKey(tester, 'logout');
        await enterPin(tester, demoPin);
        expect(find.byKey(const Key('order-o2')), findsOneWidget);
        expect(c.read(sessionProvider).canGoBackTo, isNull);
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
        await enterPin(tester, demoPin);
        await tester.pump();
        expect(voz.said.last, contains(Phrases.allDone));
        expect(find.text('Nada para hoje'), findsOneWidget);
      });

      testWidgets('tela principal fala só a quantidade; segurar o cartão fala a atividade', (tester) async {
        final voz = FakeSpeaker();
        final c = await startApp(tester, size, speaker: voz);
        await enterPin(tester, demoPin);
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
        await enterPin(tester, demoPin);
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
        expect(voz.said.last, contains('Falta 1 item.'));
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
        await enterPin(tester, demoPin);
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
        await enterPin(tester, demoPin);
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
        await enterPin(tester, demoPin);
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
        fakeMic();
        final c = await startApp(tester, size);
        await enterPin(tester, demoPin);
        await tapKey(tester, 'order-o3');
        await tapKey(tester, 'recognize-ok');
        await tapKey(tester, 'answer-ok'); // motor do elevador
        await tapKey(tester, 'answer-problem'); // correia
        expect(find.byKey(const Key('reason-loose_belt')), findsOneWidget);
        expect(find.byKey(const Key('reason-hot')), findsNothing);

        expect(find.byKey(const Key('sync-attention')), findsNothing);
        // Recusa do painel na fila: aí sim o aviso aparece.
        final dir = Directory.systemTemp.createTempSync('zelar-aviso');
        final original = OutboxNotifier.directory;
        addTearDown(() => OutboxNotifier.directory = original);
        OutboxNotifier.directory = () async => dir;
        await tester.runAsync(() => c.read(outboxProvider.notifier).add(OutboxOp(
              opId: newOpId(),
              workerId: 'w1',
              type: 'answer',
              payload: const {},
              createdAt: DateTime.now(),
              rejected: true,
            )));
        await tester.pumpAndSettle();
        expect(find.byKey(const Key('sync-attention')), findsOneWidget);
        await drainTimers(tester);
      });
    });
  }

  group('microfone na tela de motivo', () {
    Future<FakeSpeaker> abrirProblema(WidgetTester tester) async {
      final voz = FakeSpeaker();
      await startApp(tester, const Size(412, 915), speaker: voz);
      await enterPin(tester, demoPin);
      await tapKey(tester, 'order-o1');
      await tapKey(tester, 'recognize-ok');
      await tapKey(tester, 'answer-problem');
      return voz;
    }

    testWidgets('primeiro uso só pede a permissão; soltar enquanto o microfone liga para a gravação', (tester) async {
      final mic = fakeMic()..allowOnAsk = true;
      final voz = await abrirProblema(tester);
      await tester.longPress(find.byKey(const Key('reason-mic')));
      await tester.pumpAndSettle();
      expect(mic.asked, 1);
      expect(mic.started, isEmpty, reason: 'o dedo soltou no pedido do Android: não grava sozinho');
      expect(voz.said.last, Phrases.micAllowed);

      mic.starting = Completer();
      await tester.longPress(find.byKey(const Key('reason-mic')));
      await tester.pumpAndSettle();
      expect(mic.started, hasLength(1));
      expect(mic.stops, 0);
      mic.starting!.complete();
      await tester.pumpAndSettle();
      expect(mic.stops, 1, reason: 'soltou antes de o microfone ligar: para logo depois');
      expect(voz.said.last, 'Áudio guardado.');
      await drainTimers(tester);
    });

    testWidgets('sem permissão fala pedindo ajuda e "Outro" segue sem áudio', (tester) async {
      fakeMic();
      final voz = await abrirProblema(tester);
      final c = ProviderScope.containerOf(tester.element(find.byType(ReasonScreen)));
      // A grade só monta o que cabe: rola até "Outro problema", a última figura.
      await tester.scrollUntilVisible(find.byKey(const Key('reason-other')), 200,
          scrollable: find.descendant(of: find.byType(GridView), matching: find.byType(Scrollable)));
      await tapKey(tester, 'reason-other');
      await alcancar(tester, 'reason-done');
      expect(c.read(sessionProvider).answersFor('o1'), isEmpty, reason: '"Outro" pede o áudio');
      await tester.longPress(find.byKey(const Key('reason-mic')));
      await tester.pumpAndSettle();
      expect(voz.said.last, Phrases.micDenied);
      await alcancar(tester, 'reason-done');
      expect(c.read(sessionProvider).answersFor('o1')['i1']!.reason, 'other');
      await drainTimers(tester);
    });
  });

  test('cada componente tem seus problemas e sempre "outro"', () {
    for (final kind in ComponentKind.values) {
      final ids = problemsByKind[kind]!.map((r) => r.$1).toList();
      expect(ids, contains('other'), reason: '$kind');
      expect(ids.toSet().length, ids.length, reason: '$kind sem ids repetidos');
    }
    expect(problemsByKind[ComponentKind.motor]!.map((r) => r.$1), isNot(contains('oil_leak')));
    expect(problemsByKind[ComponentKind.vibrator]!.map((r) => r.$1), isNot(contains('oil_leak')));
  });

  testWidgets('sem código abre a tela de ligar; código certo segue sem travar', (tester) async {
    WorkersRepo.override = (api: 'http://painel.test', key: '');
    addTearDown(() {
      WorkersRepo.override = null;
      WorkersRepo.deviceToken = null;
      DeviceNotifier.store = SecureTokenStore();
    });
    final guardado = _TokenNaMemoria();
    DeviceNotifier.store = guardado;
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final device = c.read(deviceProvider.notifier);
    await device.load();
    expect(c.read(deviceProvider), isTrue);
    final ok = await device.activate(code: 'abcd2345', client: MockClient((_) async => http.Response(jsonEncode({'token': 'novo', 'company': 'X'}), 200)));
    expect(ok, isNull);
    expect(guardado.valor, 'novo');
    expect(WorkersRepo.headers['x-device-token'], 'novo');
    expect(c.read(deviceProvider), isFalse);
    final errado = await device.activate(code: 'errado00', client: MockClient((_) async => http.Response('{}', 400)));
    expect(errado, ActivationError.invalid);

    // Login do gestor: o corpo leva email e senha, e cada recusa vira a fala certa.
    Map<String, dynamic>? enviado;
    final login = await device.activate(
      email: ' gestor@empresa.com ',
      password: 'segredo',
      client: MockClient((req) async {
        enviado = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(jsonEncode({'token': 'outro', 'company': 'X'}), 200);
      }),
    );
    expect(login, isNull);
    expect(enviado, {'email': 'gestor@empresa.com', 'password': 'segredo'});
    expect(guardado.valor, 'outro');
    Future<ActivationError?> recusado(int status, String erro) =>
        device.activate(email: 'g@e.com', password: 'x', client: MockClient((_) async => http.Response(jsonEncode({'error': erro}), status)));
    expect(await recusado(400, 'email ou senha incorretos'), ActivationError.wrongLogin);
    expect(await recusado(400, 'use uma conta de gestor'), ActivationError.notManager);
    expect(await recusado(400, 'empresa desativada'), ActivationError.notManager);
    expect(await recusado(429, 'aguarde'), ActivationError.tooMany);
    device.refused();
    expect(c.read(deviceProvider), isTrue);
  });

  test('PIN confere pelo hash, igual ao do painel, e bloqueio é por funcionário', () {
    // Mesmo valor de frontend/src/lib/workers.ts: se um lado mudar, ninguém entra sem crachá.
    expect(pinHashOf('w1', demoPin), demoWorker.pinHash);
    final colega = Worker(id: 'w3', name: 'Colega', pinHash: pinHashOf('w3', [9, 9, 9, 9]), badgeHash: 'x');
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final session = c.read(sessionProvider.notifier);
    for (var n = 0; n < maxPinAttempts; n++) {
      expect(session.tryPin(demoWorker, [9, 9, 9, 9]), isFalse);
    }
    expect(c.read(sessionProvider).lockedFor(demoWorker.id), isTrue);
    // Bloqueado: nem o PIN certo entra.
    expect(session.tryPin(demoWorker, demoPin), isFalse);
    // O colega no mesmo celular continua entrando, e aqui o 9 existe.
    expect(session.tryPin(colega, [9, 9, 9, 9]), isTrue);
    session.logout();
    expect(c.read(sessionProvider).lockedFor(demoWorker.id), isTrue, reason: 'sair não dá novas tentativas');
  });

  group('PIN direto, sem tocar na foto', () {
    final ana = Worker(id: 'wa', name: 'Ana', pinHash: pinHashOf('wa', [1, 2, 3, 4]), badgeHash: 'a');
    final beto = Worker(id: 'wb', name: 'Beto', pinHash: pinHashOf('wb', [5, 6, 7, 8]), badgeHash: 'b');
    final caio = Worker(id: 'wc', name: 'Caio', pinHash: pinHashOf('wc', [5, 6, 7, 8]), badgeHash: 'c');
    final saiu = Worker(id: 'wd', name: 'Desligado', pinHash: pinHashOf('wd', [1, 2, 3, 4]), badgeHash: 'd', active: false);

    ProviderContainer comEquipe() {
      final c = ProviderContainer(overrides: [workersProvider.overrideWithBuild((ref, notifier) => [ana, beto, caio, saiu])]);
      addTearDown(c.dispose);
      return c;
    }

    test('um só bate: entra direto; desativado com o mesmo PIN não atrapalha', () {
      final c = comEquipe();
      final r = c.read(sessionProvider.notifier).tryPinAny([1, 2, 3, 4]);
      expect(r, isA<PinEntered>());
      expect(c.read(sessionProvider).worker?.id, 'wa');
    });

    test('dois com o mesmo PIN: pede a foto e só entra quem for escolhido', () {
      final c = comEquipe();
      final s = c.read(sessionProvider.notifier);
      final r = s.tryPinAny([5, 6, 7, 8]);
      expect(r, isA<PinChoose>());
      expect((r as PinChoose).workers.map((w) => w.id), ['wb', 'wc']);
      expect(c.read(sessionProvider).worker, isNull);
      s.enterChosen(caio);
      expect(c.read(sessionProvider).worker?.id, 'wc');
    });

    test('cinco erros bloqueiam o PIN direto do celular; foto e crachá seguem', () {
      final c = comEquipe();
      final s = c.read(sessionProvider.notifier);
      for (var n = 0; n < maxPinAttempts - 1; n++) {
        expect(s.tryPinAny([0, 0, 0, 0]), isA<PinWrong>());
      }
      expect(s.tryPinAny([0, 0, 0, 0]), isA<PinLocked>());
      expect(s.tryPinAny([1, 2, 3, 4]), isA<PinLocked>(), reason: 'bloqueado, nem o PIN certo entra direto');
      expect(c.read(sessionProvider).worker, isNull);
      expect(s.tryPin(ana, [1, 2, 3, 4]), isTrue, reason: 'pela foto, cada um tem a própria contagem');
      s.logout();
      expect(c.read(sessionProvider).lockedFor(directPinKey), isTrue, reason: 'sair não dá novas tentativas');
    });

    test('quem está bloqueado pela foto também não entra pelo PIN direto', () {
      final c = comEquipe();
      final s = c.read(sessionProvider.notifier);
      for (var n = 0; n < maxPinAttempts; n++) {
        s.tryPin(ana, [9, 9, 9, 9]);
      }
      expect(c.read(sessionProvider).lockedFor('wa'), isTrue);
      expect(s.tryPinAny([1, 2, 3, 4]), isA<PinWrong>());
      expect(c.read(sessionProvider).worker, isNull);
    });

    test('acertar zera os erros do PIN direto', () {
      final c = comEquipe();
      final s = c.read(sessionProvider.notifier);
      for (var n = 0; n < maxPinAttempts - 1; n++) {
        s.tryPinAny([0, 0, 0, 0]);
      }
      expect(s.tryPinAny([1, 2, 3, 4]), isA<PinEntered>());
      s.logout();
      expect(s.tryPinAny([0, 0, 0, 0]), isA<PinWrong>(), reason: 'a contagem recomeçou');
    });

    test('trocar de pessoa guarda quem saiu; voltar entra sem PIN, uma vez', () {
      final c = comEquipe();
      final s = c.read(sessionProvider.notifier);
      s.tryPinAny([1, 2, 3, 4]);
      s.switchPerson();
      expect(c.read(sessionProvider).worker, isNull);
      expect(c.read(sessionProvider).canGoBackTo?.id, 'wa');
      expect(s.goBack()?.id, 'wa');
      expect(c.read(sessionProvider).worker?.id, 'wa');
      expect(c.read(sessionProvider).canGoBackTo, isNull);
      expect(s.goBack(), isNull);
    });
  });

  test('lista guardada pelo app antigo vira hash ao ler', () {
    final w = Worker.fromJson({'id': 'w1', 'name': 'x', 'pin': demoPin, 'badgeHash': 'y'});
    expect(w.pinHash, demoWorker.pinHash);
  });

  test('funcionário desativado não entra nem por crachá nem por PIN', () {
    final c = ProviderContainer(overrides: [
      workersProvider.overrideWithBuild((ref, notifier) => [
            Worker(id: 'w2', name: 'Desativado', pinHash: pinHashOf('w2', demoPin), badgeHash: demoWorker.badgeHash, active: false),
          ]),
    ]);
    addTearDown(c.dispose);
    final session = c.read(sessionProvider.notifier);
    final w = c.read(workersProvider).single;
    expect(session.tryBadge('zelar:cracha:demo-cracha-teste'), isNull);
    expect(session.tryPin(w, demoPin), isFalse);
  });

  test('item com equipamento ligado não aceita "funcionando" como motivo', () {
    final i6 = orderById('o1').items.firstWhere((i) => i.id == 'i6');
    expect(blockReasonsFor(i6).map((r) => r.$1), isNot(contains('running')));
  });
}

class _TokenNaMemoria implements TokenStore {
  String? valor;

  @override
  Future<String?> read() async => valor;

  @override
  Future<void> write(String token) async => valor = token;
}

class _AtivaDeCerteza extends DeviceNotifier {
  final pedidos = <(String?, String?, String?)>[];

  @override
  Future<ActivationError?> activate({String? code, String? email, String? password, http.Client? client}) async {
    pedidos.add((email, password, code));
    state = false;
    return null;
  }
}

/// Celular novo, ainda sem ligar à empresa: a abertura não lê token nenhum.
class _SemLigar extends _AtivaDeCerteza {
  @override
  bool build() => true;

  @override
  Future<void> load() async {}
}
