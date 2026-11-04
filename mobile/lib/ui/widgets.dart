import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../audio/phrases.dart';
import '../audio/speaker.dart';
import '../domain/models.dart';
import '../state/outbox.dart';
import '../state/session.dart';
import 'theme.dart';

/// Botão grande de resposta. Toque longo fala o que o botão faz, para quem não lê;
/// desativado, o toque fala por que ainda não funciona.
class BigActionButton extends ConsumerWidget {
  const BigActionButton({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.foreground = Colors.white,
    this.compact = false,
    this.spokenHelp,
    this.disabledHint,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color foreground;
  final VoidCallback? onPressed;

  /// Versão para meia largura: ícone e texto menores, mesma altura de toque.
  final bool compact;

  /// O que o botão faz, com a cor (ver Phrases). Sem valor, fala o rótulo.
  final String? spokenHelp;

  /// Falado ao tocar no botão desativado.
  final String? disabledHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final speaker = ref.read(speakerProvider);
    final hint = disabledHint;
    final button = Semantics(
      button: true,
      label: label,
      child: SizedBox(
        height: ZeloSizes.responseHeight,
        width: double.infinity,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: color,
            foregroundColor: foreground,
            // A cor continua dizendo qual é o botão; mais clara, diz que ainda não dá para usar.
            disabledBackgroundColor: color.withValues(alpha: 0.35),
            disabledForegroundColor: foreground,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 20),
          ),
          onPressed: onPressed,
          // Com onLongPress o botão conta como ativo e engole o toque: desativado, quem ouve é o detector abaixo.
          onLongPress: onPressed == null && hint != null ? null : () => speaker.say(spokenHelp ?? label),
          child: Row(
            children: [
              Icon(icon, size: compact ? 36 : 52),
              SizedBox(width: compact ? 8 : 16),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: compact ? 18 : 24, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (onPressed != null || hint == null) return button;
    // Botão desativado não recebe toques; o detector por cima explica o que falta.
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => speaker.say(hint),
      onLongPress: () => speaker.say(spokenHelp ?? label),
      child: button,
    );
  }
}

/// Botão de áudio grande, sempre visível; repete a instrução a cada toque.
class AudioButton extends ConsumerWidget {
  const AudioButton({super.key, required this.text, this.provisional = true, this.onPlay, this.size = 96});

  final String text;
  final bool provisional;
  final VoidCallback? onPlay;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      button: true,
      label: 'Ouvir instrução',
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: FilledButton(
              // Preto, para não se confundir com o azul do "Não consegui".
              style: FilledButton.styleFrom(
                backgroundColor: ZeloColors.ink,
                foregroundColor: Colors.white,
                shape: const CircleBorder(),
                padding: EdgeInsets.zero,
              ),
              onPressed: () {
                onPlay?.call();
                ref.read(speakerProvider).say(text);
              },
              child: Icon(Icons.volume_up, size: size * 0.58),
            ),
          ),
          if (provisional)
            const Positioned(
              right: -4,
              top: -4,
              child: Tooltip(
                message: 'Voz provisória (sem gravação aprovada)',
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: ZeloColors.problem,
                  child: Icon(Icons.smart_toy, size: 20, color: ZeloColors.ink),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Envio é implícito: o trabalhador não vê nada enquanto tudo corre bem.
/// O ícone só aparece quando algo travou e o gestor precisa agir.
class SyncStatusIcon extends ConsumerWidget {
  const SyncStatusIcon({super.key});

  static const attentionText = 'Precisa de atenção. Chame o gestor.';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Envio é implícito: o ícone só aparece quando algo foi recusado ou está parado há mais de 24 h.
    final sync = ref.watch(sessionProvider.select((s) => s.sync));
    ref.watch(outboxProvider);
    final stuck = ref.read(outboxProvider.notifier).needsAttention;
    if (sync != SyncState.attention && !stuck) return const SizedBox.shrink();
    return IconButton(
      key: const Key('sync-attention'),
      iconSize: 36,
      constraints: const BoxConstraints(minWidth: ZeloSizes.minTouch, minHeight: ZeloSizes.minTouch),
      tooltip: attentionText,
      icon: const Icon(Icons.error, color: ZeloColors.overdue),
      onPressed: () => ref.read(speakerProvider).say(attentionText),
    );
  }
}

/// Foto do equipamento ou componente. Sem foto cadastrada, mostra ilustração provisória.
class EquipmentPicture extends StatelessWidget {
  const EquipmentPicture({super.key, required this.icon, required this.color, this.size, this.label});

  final IconData icon;
  final Color color;

  /// Altura fixa; sem valor, ocupa o espaço que o pai oferecer.
  final double? size;
  final String? label;

  @override
  Widget build(BuildContext context) {
    Widget frame(double height, double iconSize) => Container(
          width: double.infinity,
          height: height,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            border: Border.all(color: color, width: 3),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(icon, size: iconSize, color: color),
        );

    final fixed = size;
    return Semantics(
      image: true,
      label: label,
      // Altura fixa evita LayoutBuilder (incompatível com IntrinsicHeight na tela Hoje).
      child: fixed != null
          ? frame(fixed, fixed * 0.6)
          : LayoutBuilder(
              builder: (context, box) {
                final side = box.maxHeight.isFinite && box.maxHeight < box.maxWidth ? box.maxHeight : box.maxWidth;
                return frame(box.maxHeight.isFinite ? box.maxHeight : side, side * 0.6);
              },
            ),
    );
  }
}

/// Estrutura comum: botão de início à esquerda, estado de sincronização à direita.
/// Aviso do gestor na ordem (devolvida ou liberada), por escrito e na voz (toque para ouvir).
class ReturnedBanner extends ConsumerWidget {
  const ReturnedBanner({super.key, required this.reason, this.released = false});

  /// A ordem da liberação vem antes da devolução: é o aviso mais recente.
  factory ReturnedBanner.of(WorkOrder order) =>
      order.released ? ReturnedBanner(reason: order.releasedNote!, released: true) : ReturnedBanner(reason: order.returnedReason!);

  final String reason;
  final bool released;

  String get _spoken => released ? Phrases.released(reason) : Phrases.returned(reason);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      button: true,
      label: _spoken,
      excludeSemantics: true,
      child: Material(
        key: const Key('returned-banner'),
        color: ZeloColors.returned,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => ref.read(speakerProvider).say(_spoken),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(released ? Icons.lock_open : Icons.undo, color: Colors.white, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(released ? 'Liberado pelo gestor' : 'Devolvido pelo gestor', style: const TextStyle(color: Colors.white, fontSize: 16)),
                      Text(
                        reason,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
                      ),
                    ],
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

class ZeloScaffold extends StatelessWidget {
  const ZeloScaffold({super.key, required this.body, this.showHome = true, this.title, this.bottom, this.action});

  final Widget body;
  final bool showHome;
  final Widget? title;
  final Widget? bottom;

  /// Botão extra na barra do topo, antes do estado do envio.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 72,
        automaticallyImplyLeading: false,
        leading: showHome
            ? IconButton(
                iconSize: 40,
                tooltip: 'Voltar para as tarefas de hoje',
                icon: const Icon(Icons.home),
                onPressed: () => context.go('/hoje'),
              )
            : null,
        title: title,
        actions: [?action, const SyncStatusIcon(), const SizedBox(width: 8)],
      ),
      body: SafeArea(
        child: Padding(padding: const EdgeInsets.all(ZeloSizes.gutter), child: body),
      ),
      bottomNavigationBar: bottom == null
          ? null
          : SafeArea(child: Padding(padding: const EdgeInsets.all(ZeloSizes.gutter), child: bottom)),
    );
  }
}

/// Anel de progresso com contador de itens restantes no centro.
class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, required this.done, required this.total, required this.color});

  final int done;
  final int total;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final finished = done >= total;
    return SizedBox(
      width: 64,
      height: 64,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: total == 0 ? 0 : done / total,
              strokeWidth: 8,
              color: finished ? ZeloColors.ok : color,
              backgroundColor: color.withValues(alpha: 0.15),
            ),
          ),
          finished
              ? const Icon(Icons.check, size: 36, color: ZeloColors.ok)
              : Text('${total - done}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

/// Foto do funcionário guardada no celular; sem foto, silhueta.
class WorkerAvatar extends StatelessWidget {
  const WorkerAvatar({super.key, required this.worker, this.radius = 48});

  final Worker? worker;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final path = worker?.photoPath;
    final file = path == null ? null : File(path);
    final hasPhoto = file != null && file.existsSync();
    return CircleAvatar(
      radius: radius,
      backgroundImage: hasPhoto ? FileImage(file) : null,
      child: hasPhoto ? null : Icon(Icons.person, size: radius * 1.3),
    );
  }
}
