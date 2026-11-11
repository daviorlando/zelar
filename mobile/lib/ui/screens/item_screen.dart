import 'dart:async';

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
import 'measurement_panel.dart';

/// Item: foto do ponto a verificar, áudio grande e botões de resposta fixos.
class ItemScreen extends ConsumerStatefulWidget {
  const ItemScreen({super.key, required this.orderId, required this.index, this.undoItemId});

  final String orderId;
  final int index;
  final String? undoItemId;

  @override
  ConsumerState<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends ConsumerState<ItemScreen> {
  late final order = ref.read(ordersProvider.notifier).byId(widget.orderId);
  late final item = order.items[widget.index];
  late final component = order.equipment.component(item.componentId);
  late final guide = Phrases.item(item);

  /// A foto é da máquina: num componente (motor, mancal), vale o desenho dele.
  String? get _photo => component.id == order.equipment.id ? order.equipment.photoFile : null;
  final _openedAt = DateTime.now();
  var _replays = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'item ${item.id} (${item.shortText})');
      // Só fala quando é a tela visível (não quando está por baixo de Problema).
      if (ModalRoute.of(context)?.isCurrent ?? true) ref.read(speakerProvider).say(guide);
    });
  }

  void _record(Outcome outcome, {double? value, String? reason}) {
    ref.read(sessionProvider.notifier).answer(
          order.id,
          Answer(itemId: item.id, outcome: outcome, at: DateTime.now(), value: value, reason: reason),
        );
    final secs = DateTime.now().difference(_openedAt).inSeconds;
    ref.read(eventLogProvider.notifier).add('resposta', '${item.id}: ${outcome.name}${value != null ? ' $value' : ''} em ${secs}s, $_replays repetições do áudio');
    OrderFlow.goNext(context, order, widget.index, ref.read(sessionProvider).answersFor(order.id));
  }

  void _goReason(String kind) {
    ref.read(eventLogProvider.notifier).add('escolheu', '${item.id}: $kind');
    context.go('${OrderFlow.item(order.id, widget.index)}/$kind');
  }

  /// Lado a lado: quatro botões grandes não cabem em celular pequeno.
  Widget _blockedAndSkip() => Row(
        children: [
          Expanded(
            child: BigActionButton(
              key: const Key('answer-blocked'),
              label: 'Não consegui',
              icon: Icons.disabled_by_default,
              compact: true,
              oneLine: true,
              color: ZelarColors.blocked,
              spokenHelp: Phrases.blockedButton,
              onPressed: () => _goReason('impedimento'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: BigActionButton(
              key: const Key('answer-skip'),
              label: 'Não sei',
              icon: Icons.help,
              compact: true,
              oneLine: true,
              color: ZelarColors.skip,
              spokenHelp: Phrases.skipButton,
              onPressed: () => _record(Outcome.skipped),
            ),
          ),
        ],
      );

  Widget _body(bool measuring, Widget content) => measuring ? FillOrScroll(child: content) : content;

  @override
  Widget build(BuildContext context) {
    final eq = order.equipment;
    final audio = AudioButton(text: guide, provisional: !item.recordedAudio, onPlay: () => _replays++);
    final measuring = item.type == ItemType.measurement;

    return ZelarScaffold(
      title: Text('${widget.index + 1} / ${order.items.length}'),
      // Na medição, a tela inteira rola quando a fonte grande não deixa o teclado caber.
      body: _body(measuring, Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.undoItemId != null) UndoBanner(orderId: order.id, itemId: widget.undoItemId!),
          if (measuring) ...[
            // Medição: cabeçalho compacto para o teclado caber em telas pequenas.
            Row(
              children: [
                SizedBox(
                  width: 80,
                  child: EquipmentPicture(icon: component.icon, color: eq.color, size: 80, label: component.shortName, photoFile: _photo),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(item.shortText, style: Theme.of(context).textTheme.titleMedium)),
                const SizedBox(width: 8),
                AudioButton(text: guide, provisional: !item.recordedAudio, onPlay: () => _replays++, size: 72),
              ],
            ),
            const SizedBox(height: 8),
            Expanded(
              child: MeasurementPanel(
                measurement: item.measurement!,
                onConfirm: (value, outOfRange) =>
                    _record(Outcome.measured, value: value, reason: outOfRange ? Answer.outOfRange : null),
                onHelp: () => _record(Outcome.help),
                onSkip: () => _record(Outcome.skipped),
              ),
            ),
          ] else ...[
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: EquipmentPicture(icon: component.icon, color: eq.color, label: component.shortName, photoFile: _photo)),
                  const SizedBox(width: 16),
                  audio,
                ],
              ),
            ),
            const SizedBox(height: 12),
            // Texto longo com fonte grande rola aqui, sem empurrar os botões.
            Flexible(
              child: SingleChildScrollView(child: Text(item.shortText, style: Theme.of(context).textTheme.titleLarge)),
            ),
          ],
        ],
      )),
      bottom: switch (item.type) {
        ItemType.inspection => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BigActionButton(
                key: const Key('answer-ok'),
                label: 'Tudo certo',
                icon: Icons.check_circle,
                color: ZelarColors.ok,
                spokenHelp: Phrases.okButton,
                onPressed: () => _record(Outcome.ok),
              ),
              const SizedBox(height: 12),
              BigActionButton(
                key: const Key('answer-problem'),
                label: 'Encontrei problema',
                icon: Icons.warning,
                color: ZelarColors.problem,
                foreground: ZelarColors.ink,
                spokenHelp: Phrases.problemButton,
                onPressed: () => _goReason('problema'),
              ),
              const SizedBox(height: 12),
              _blockedAndSkip(),
            ],
          ),
        ItemType.action => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BigActionButton(
                key: const Key('answer-done'),
                label: 'Fiz',
                icon: Icons.check_circle,
                color: ZelarColors.ok,
                spokenHelp: Phrases.doneButton,
                onPressed: () => _record(Outcome.done),
              ),
              const SizedBox(height: 12),
              _blockedAndSkip(),
            ],
          ),
        ItemType.measurement => null,
      },
    );
  }
}

/// "Desfazer" o último toque, visível por alguns segundos na tela seguinte.
class UndoBanner extends ConsumerStatefulWidget {
  const UndoBanner({super.key, required this.orderId, required this.itemId});

  final String orderId;
  final String itemId;

  @override
  ConsumerState<UndoBanner> createState() => _UndoBannerState();
}

class _UndoBannerState extends ConsumerState<UndoBanner> {
  static const _visibleFor = Duration(seconds: 8);
  Timer? _timer;
  var _visible = true;

  @override
  void initState() {
    super.initState();
    _timer = Timer(_visibleFor, () {
      if (mounted) setState(() => _visible = false);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: FilledButton.tonalIcon(
        key: const Key('undo'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(ZelarSizes.minTouch)),
        icon: const Icon(Icons.undo, size: 36),
        label: const Text('Desfazer'),
        onLongPress: () => ref.read(speakerProvider).say(Phrases.undoButton),
        onPressed: () {
          final order = ref.read(ordersProvider.notifier).byId(widget.orderId);
          ref.read(sessionProvider.notifier).undo(order.id, widget.itemId);
          ref.read(eventLogProvider.notifier).add('desfez', widget.itemId);
          final index = order.items.indexWhere((i) => i.id == widget.itemId);
          context.go(OrderFlow.item(order.id, index));
        },
      ),
    );
  }
}
