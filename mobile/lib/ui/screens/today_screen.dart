import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/speaker.dart';
import '../../data/fixtures.dart';
import '../../domain/models.dart';
import '../../state/session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Hoje: um cartão por equipamento com tarefas vencendo; atrasados primeiro.
class TodayScreen extends ConsumerStatefulWidget {
  const TodayScreen({super.key});

  @override
  ConsumerState<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends ConsumerState<TodayScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'hoje');
      final pending = demoOrders.where((o) => !ref.read(sessionProvider).finished.contains(o.id)).length;
      ref.read(speakerProvider).say(
            pending == 0 ? 'Tudo feito por hoje. Obrigado.' : 'Você tem $pending equipamentos para hoje. Toque em um.',
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final orders = [...demoOrders]..sort((a, b) {
        final fa = session.finished.contains(a.id) ? 1 : 0;
        final fb = session.finished.contains(b.id) ? 1 : 0;
        if (fa != fb) return fa - fb;
        return (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0);
      });

    return ZeloScaffold(
      showHome: false,
      title: GestureDetector(
        // Facilitador: segurar a foto abre o registro do teste de uso.
        onLongPress: () => context.push('/facilitador'),
        child: const Row(
          children: [
            CircleAvatar(radius: 24, child: Icon(Icons.person, size: 32)),
            SizedBox(width: 12),
            Icon(Icons.today, size: 36),
          ],
        ),
      ),
      body: ListView.separated(
        itemCount: orders.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) => _OrderCard(order: orders[i], session: session),
      ),
    );
  }
}

class _OrderCard extends ConsumerWidget {
  const _OrderCard({required this.order, required this.session});

  final WorkOrder order;
  final SessionState session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eq = order.equipment;
    final done = session.answersFor(order.id).length;
    final finished = session.finished.contains(order.id);
    final hasProblem = session.answersFor(order.id).values.any((a) => a.isProblem);

    return Semantics(
      button: true,
      label: '${eq.shortName}${order.overdue && !finished ? ', atrasado' : ''}',
      child: Material(
        color: Colors.white,
        elevation: 1,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('order-${order.id}'),
          onTap: () {
            ref.read(eventLogProvider.notifier).add('abriu', eq.shortName);
            context.go('/ordem/${order.id}');
          },
          onLongPress: () => ref.read(speakerProvider).say(
                '${eq.shortName}. ${order.overdue && !finished ? 'Atrasado. ' : ''}'
                '${finished ? 'Feito.' : 'Faltam ${order.items.length - done} itens.'}',
              ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Faixa distinta para atrasados: cor + ícone de relógio.
                Container(width: 12, color: order.overdue && !finished ? ZeloColors.overdue : Colors.transparent),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: SizedBox(
                    width: 112,
                    child: EquipmentPicture(icon: eq.icon, color: eq.color, size: 112, label: eq.shortName),
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(eq.shortName, style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            if (order.overdue && !finished) const Icon(Icons.alarm, color: ZeloColors.overdue, size: 32),
                            if (hasProblem) const Icon(Icons.warning, color: ZeloColors.problem, size: 32),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Center(
                    child: ProgressRing(done: finished ? order.items.length : done, total: order.items.length, color: eq.color),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
