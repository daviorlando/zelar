import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
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
      _speak();
    });
  }

  /// Só o que já começou: as futuras ficam guardadas para trabalhar sem internet.
  List<WorkOrder> _visible(List<WorkOrder> all, SessionState session) => all.where((o) => o.current).toList()
    ..sort((a, b) {
      final fa = session.finished.contains(a.id) ? 1 : 0;
      final fb = session.finished.contains(b.id) ? 1 : 0;
      if (fa != fb) return fa - fb;
      final late = (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0);
      if (late != 0) return late;
      return a.frequency.index - b.frequency.index;
    });

  void _speak() {
    final session = ref.read(sessionProvider);
    final pending = [
      for (final o in _visible(ref.read(ordersProvider), session))
        if (!session.finished.contains(o.id)) (o.spokenName, o.overdue),
    ];
    ref.read(speakerProvider).say(Phrases.today(session.worker?.name ?? '', pending));
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final orders = _visible(ref.watch(ordersProvider), session);

    return ZeloScaffold(
      showHome: false,
      title: GestureDetector(
        // Facilitador: segurar a foto abre o registro do teste de uso.
        onLongPress: () => context.push('/facilitador'),
        child: Row(
          children: [
            WorkerAvatar(worker: session.worker, radius: 24),
            const SizedBox(width: 12),
            Flexible(child: Text(session.worker?.name.split(' ').first ?? '', overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
      // Puxar para baixo envia o que está guardado e baixa as ordens de novo.
      body: RefreshIndicator(
        onRefresh: () => ref.read(ordersProvider.notifier).sync(),
        child: orders.isEmpty
            ? ListView(
                children: [
                  const SizedBox(height: 48),
                  GestureDetector(
                    onTap: _speak,
                    child: const Column(
                      children: [
                        Icon(Icons.task_alt, size: 120, color: ZeloColors.ok),
                        SizedBox(height: 16),
                        Text('Nada para hoje', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              )
            : ListView.separated(
                itemCount: orders.length,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) => _OrderCard(order: orders[i], session: session),
              ),
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
      label: '${order.spokenName}${order.overdue && !finished ? ', atrasado' : ''}',
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
                '${order.spokenName}. ${order.overdue && !finished ? 'Atrasado. ' : ''}'
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
                        Text(eq.shortName, style: Theme.of(context).textTheme.titleMedium, maxLines: 3, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (order.frequency != Frequency.daily) _FrequencyTag(order.frequency),
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

/// Etiqueta da frequência (diárias não levam: são a maioria e o padrão).
class _FrequencyTag extends StatelessWidget {
  const _FrequencyTag(this.frequency);

  final Frequency frequency;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: ZeloColors.ink.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(20)),
      child: Text(capitalize(frequency.spoken), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
    );
  }
}
