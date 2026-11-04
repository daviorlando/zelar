import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
import '../../domain/models.dart';
import '../../state/session.dart';
import '../flow.dart';
import '../theme.dart';
import '../widgets.dart';
import 'item_screen.dart';

/// Finalizar: resumo falado e confirmação antes de guardar para envio.
class FinishScreen extends ConsumerStatefulWidget {
  const FinishScreen({super.key, required this.orderId, this.undoItemId});

  final String orderId;
  final String? undoItemId;

  @override
  ConsumerState<FinishScreen> createState() => _FinishScreenState();
}

class _FinishScreenState extends ConsumerState<FinishScreen> {
  late final order = ref.read(ordersProvider.notifier).byId(widget.orderId);

  String _summary(Map<String, Answer> answers) {
    final missing = order.items.length - answers.length;
    if (missing > 0) return Phrases.answerMissing(missing);
    final problems = answers.values.where((a) => a.isProblem).length;
    final blocked = answers.values.where((a) => a.isBlocked).length;
    final parts = [
      'Você respondeu ${answers.length} itens',
      if (problems > 0) '$problems ${problems == 1 ? 'problema' : 'problemas'}',
      if (blocked > 0) '$blocked que não conseguiu',
    ];
    final note = Phrases.orderNote(order);
    final next = blocked > 0 ? Phrases.waitingManager(blocked) : 'Toque no botão verde, Concluir.';
    return '${note == null ? '' : '$note '}${Phrases.finish('${parts.join(', ')}. $next')}';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'finalizar ${order.equipment.shortName}');
      ref.read(speakerProvider).say(_summary(ref.read(sessionProvider).answersFor(order.id)));
    });
  }

  /// Devolvida e sem nenhuma mudança: confirma antes, para não voltar ao gestor do mesmo jeito.
  Future<void> _tryConclude() async {
    final session = ref.read(sessionProvider);
    if (order.returned && !session.changed.contains(order.id)) {
      final speaker = ref.read(speakerProvider);
      final text = Phrases.concludeUnchanged(order.returnedReason!);
      speaker.say(text);
      final go = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (dialog) => AlertDialog(
          scrollable: true,
          title: const Text('Nada mudou'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ReturnedBanner(reason: order.returnedReason!),
              const SizedBox(height: 16),
              BigActionButton(
                key: const Key('conclude-fix'),
                label: 'Corrigir',
                icon: Icons.edit,
                color: ZeloColors.blocked,
                compact: true,
                spokenHelp: Phrases.fixButton,
                onPressed: () => Navigator.of(dialog).pop(false),
              ),
              const SizedBox(height: 12),
              BigActionButton(
                key: const Key('conclude-anyway'),
                label: 'Concluir assim mesmo',
                icon: Icons.check_circle,
                color: ZeloColors.ok,
                compact: true,
                spokenHelp: Phrases.concludeAnywayButton,
                onPressed: () => Navigator.of(dialog).pop(true),
              ),
            ],
          ),
        ),
      );
      if (!mounted || go != true) return;
    }
    _conclude();
  }

  void _conclude() {
    final notifier = ref.read(sessionProvider.notifier);
    notifier.finish(order.id);
    // Concluir é um bom momento para mandar o que foi feito (sem esperar: segue offline se não houver rede).
    ref.read(ordersProvider.notifier).sync();
    ref.read(eventLogProvider.notifier).add('concluiu', order.equipment.shortName);
    ref.read(speakerProvider).say(Phrases.concluded);
    context.go('/hoje');
  }

  @override
  Widget build(BuildContext context) {
    final answers = ref.watch(sessionProvider.select((s) => s.answersFor(widget.orderId)));
    final blocked = answers.values.where((a) => a.isBlocked).length;
    final missing = order.items.length - answers.length;
    // Item impedido é verificação pendente: a ordem espera o gestor ou o próprio funcionário resolver.
    final complete = missing == 0 && blocked == 0;
    final summary = _summary(answers);

    return ZeloScaffold(
      title: Text(order.equipment.shortName),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.undoItemId != null) UndoBanner(orderId: order.id, itemId: widget.undoItemId!),
          if (order.released || order.returned) ...[ReturnedBanner.of(order), const SizedBox(height: 8)],
          Align(alignment: Alignment.centerRight, child: AudioButton(text: summary)),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: [
                for (var i = 0; i < order.items.length; i++)
                  _ResultRow(
                    item: order.items[i],
                    component: order.equipment.component(order.items[i].componentId),
                    answer: answers[order.items[i].id],
                    onTap: () => context.go(OrderFlow.item(order.id, i)),
                  ),
              ],
            ),
          ),
        ],
      ),
      bottom: BigActionButton(
        key: const Key('conclude'),
        label: 'Concluir',
        icon: Icons.check_circle,
        color: ZeloColors.ok,
        spokenHelp: Phrases.concludeButton,
        disabledHint: missing > 0 ? Phrases.answerMissing(missing) : Phrases.waitingManager(blocked),
        onPressed: complete ? _tryConclude : null,
      ),
    );
  }
}

class _ResultRow extends ConsumerWidget {
  const _ResultRow({required this.item, required this.component, required this.answer, required this.onTap});

  final PlanItem item;
  final Component component;
  final Answer? answer;
  final VoidCallback onTap;

  (IconData, Color) get _status => switch (answer) {
        null => (Icons.help, ZeloColors.overdue),
        final a when a.isProblem => (Icons.warning, ZeloColors.problem),
        Answer(outcome: Outcome.blocked || Outcome.help) => (Icons.disabled_by_default, ZeloColors.blocked),
        _ => (Icons.check_circle, ZeloColors.ok),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, color) = _status;
    return ListTile(
      minTileHeight: ZeloSizes.minTouch + 8,
      leading: Icon(component.icon, size: 40),
      title: Text(item.shortText, style: const TextStyle(fontSize: 18)),
      trailing: Icon(icon, color: color, size: 44),
      onTap: onTap,
      onLongPress: () => ref.read(speakerProvider).say(item.shortText),
    );
  }
}
