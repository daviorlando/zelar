import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'state/session.dart';
import 'ui/screens/entry_screen.dart';
import 'ui/screens/facilitator_screen.dart';
import 'ui/screens/finish_screen.dart';
import 'ui/screens/item_screen.dart';
import 'ui/screens/reason_screen.dart';
import 'ui/screens/recognize_screen.dart';
import 'ui/screens/today_screen.dart';
import 'ui/theme.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    // Sem trabalhador identificado, tudo leva à tela de entrada.
    redirect: (context, state) => ref.read(sessionProvider).worker == null && state.matchedLocation != '/' ? '/' : null,
    routes: [
      GoRoute(path: '/', builder: (_, _) => const EntryScreen()),
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
              key: ValueKey(s.uri.toString()),
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

class ZeloApp extends ConsumerWidget {
  const ZeloApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Zelo',
      theme: buildTheme(),
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
