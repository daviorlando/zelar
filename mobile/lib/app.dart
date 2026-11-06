import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'audio/speaker.dart';
import 'data/orders_repo.dart';
import 'data/workers_repo.dart';
import 'state/outbox.dart';
import 'state/session.dart';
import 'ui/screens/entry_screen.dart';
import 'ui/screens/facilitator_screen.dart';
import 'ui/screens/finish_screen.dart';
import 'ui/screens/item_screen.dart';
import 'ui/screens/reason_screen.dart';
import 'ui/screens/recognize_screen.dart';
import 'ui/screens/setup_screen.dart';
import 'ui/screens/today_screen.dart';
import 'ui/opening.dart';
import 'ui/theme.dart';
import 'state/setup.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    // Sem trabalhador identificado, tudo leva à tela de entrada.
    // A leitura do crachá (/qr) também é permitida antes de entrar.
    redirect: (context, state) =>
        ref.read(sessionProvider).worker == null && !{'/', '/qr', '/primeira-vez'}.contains(state.matchedLocation) ? '/' : null,
    routes: [
      GoRoute(path: '/', builder: (_, _) => const EntryScreen()),
      GoRoute(path: '/primeira-vez', builder: (_, _) => const SetupScreen()),
      GoRoute(path: '/hoje', builder: (_, _) => const TodayScreen()),
      GoRoute(path: '/facilitador', builder: (_, _) => const FacilitatorScreen()),
      GoRoute(path: '/qr', builder: (_, _) => const QrScanScreen()),
      GoRoute(
        path: '/ordem/:id',
        builder: (_, s) => RecognizeScreen(orderId: s.pathParameters['id']!),
        routes: [
          GoRoute(
            path: 'item/:i',
            builder: (_, s) => ItemScreen(
              // Chave pelo caminho do item, não pela URI completa: abrir /problema por cima
              // não pode recriar o item embaixo (ele falaria a instrução de novo).
              key: ValueKey('${s.pathParameters['id']}/${s.pathParameters['i']}'),
              orderId: s.pathParameters['id']!,
              index: int.parse(s.pathParameters['i']!),
              undoItemId: s.extra as String?,
            ),
            routes: [
              GoRoute(
                path: 'problema',
                builder: (_, s) => ReasonScreen(
                  orderId: s.pathParameters['id']!,
                  index: int.parse(s.pathParameters['i']!),
                  kind: ReasonKind.problem,
                ),
              ),
              GoRoute(
                path: 'impedimento',
                builder: (_, s) => ReasonScreen(
                  orderId: s.pathParameters['id']!,
                  index: int.parse(s.pathParameters['i']!),
                  kind: ReasonKind.blocked,
                ),
              ),
            ],
          ),
          GoRoute(
            path: 'finalizar',
            builder: (_, s) => FinishScreen(orderId: s.pathParameters['id']!, undoItemId: s.extra as String?),
          ),
        ],
      ),
    ],
  );
});

class ZeloApp extends ConsumerStatefulWidget {
  const ZeloApp({super.key});

  @override
  ConsumerState<ZeloApp> createState() => _ZeloAppState();
}

class _ZeloAppState extends ConsumerState<ZeloApp> {
  late final AppLifecycleListener _lifecycle;
  Timer? _periodic;

  /// Com o app aberto, tenta enviar a cada 5 minutos (escopo, seção 8.2).
  static const _every = Duration(minutes: 5);

  @override
  void initState() {
    super.initState();
    // A voz do Android roda fora do app: sem isto, a frase continua depois de fechar.
    void silence() => ref.read(speakerProvider).stop();
    void refresh() {
      ref.read(workersProvider.notifier).refresh();
      ref.read(ordersProvider.notifier).sync();
    }

    _lifecycle = AppLifecycleListener(onHide: silence, onPause: silence, onDetach: silence, onResume: refresh);
    // Quem entra recebe as ordens dos seus setores: guardadas primeiro (offline), depois do painel.
    ref.listenManual(sessionProvider.select((s) => s.worker), (before, worker) {
      if (worker != null && worker.id != before?.id) ref.read(ordersProvider.notifier).loadFor(worker);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await ref.read(setupProvider.notifier).load();
        if (ref.read(setupProvider)) ref.read(routerProvider).go('/primeira-vez');
      } finally {
        // Mesmo com erro: a abertura não pode ficar presa na tela.
        ref.read(startupProvider.notifier).done();
      }
      // Lista guardada primeiro (offline), depois tenta atualizar pelo painel.
      ref.read(workersProvider.notifier).load();
      await ref.read(outboxProvider.notifier).load();
      ref.read(ordersProvider.notifier).sync();
    });
    if (WorkersRepo.configured) _periodic = Timer.periodic(_every, (_) => ref.read(ordersProvider.notifier).sync());
  }

  @override
  void dispose() {
    _periodic?.cancel();
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Zelo',
      theme: buildTheme(),
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => ZeloOpening(ready: ref.watch(startupProvider), child: child!),
    );
  }
}
