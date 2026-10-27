import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../audio/speaker.dart';
import '../domain/models.dart';
import '../state/session.dart';
import 'theme.dart';

/// Botão grande de resposta. Toque longo fala o rótulo, para quem não lê.
class BigActionButton extends ConsumerWidget {
  const BigActionButton({
    super.key,
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.foreground = Colors.white,
    this.compact = false,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color foreground;
  final VoidCallback? onPressed;

  /// Versão para meia largura: ícone e texto menores, mesma altura de toque.
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      button: true,
      label: label,
      child: SizedBox(
        height: ZeloSizes.responseHeight,
        width: double.infinity,
        child: FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: color,
            foregroundColor: foreground,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 20),
          ),
          onPressed: onPressed,
          onLongPress: () => ref.read(speakerProvider).say(label),
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
              style: FilledButton.styleFrom(shape: const CircleBorder(), padding: EdgeInsets.zero),
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

const _syncInfo = <SyncState, (IconData, Color, String)>{
  SyncState.savedLocal: (Icons.phone_android, Color(0xFF1565C0), 'Salvo no celular. Vai ser enviado quando tiver internet.'),
  SyncState.sending: (Icons.sync, Color(0xFF6A1B9A), 'Enviando.'),
  SyncState.received: (Icons.cloud_done, ZeloColors.ok, 'Recebido. O gestor já tem tudo.'),
  SyncState.attention: (Icons.error, ZeloColors.overdue, 'Precisa de atenção. Chame o gestor.'),
};

/// Ícone persistente de estado de sincronização; toque explica em áudio.
class SyncStatusIcon extends ConsumerWidget {
  const SyncStatusIcon({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sync = ref.watch(sessionProvider.select((s) => s.sync));
    final (icon, color, explanation) = _syncInfo[sync]!;
    return IconButton(
      iconSize: 36,
      constraints: const BoxConstraints(minWidth: ZeloSizes.minTouch, minHeight: ZeloSizes.minTouch),
      tooltip: explanation,
      icon: Icon(icon, color: color),
      onPressed: () => ref.read(speakerProvider).say(explanation),
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
class ZeloScaffold extends StatelessWidget {
  const ZeloScaffold({super.key, required this.body, this.showHome = true, this.title, this.bottom});

  final Widget body;
  final bool showHome;
  final Widget? title;
  final Widget? bottom;

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
        actions: const [SyncStatusIcon(), SizedBox(width: 8)],
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
