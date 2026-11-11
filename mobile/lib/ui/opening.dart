import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'logo.dart';
import 'theme.dart';

/// Continua a abertura do Android: mesma logo, tamanho, lugar e fundo. O nome surge e tudo
/// some sobre a primeira tela. Só existe ao abrir o app, e dura menos de um segundo.
class ZelarOpening extends StatefulWidget {
  const ZelarOpening({super.key, required this.ready, required this.child});

  /// Igual ao tamanho da logo em android/.../drawable-*/splash_logo.png (tool/gerar_icones.sh).
  static const logoSize = 160.0;

  /// A primeira tela já está decidida: antes disso, a abertura não sai.
  final bool ready;
  final Widget child;

  @override
  State<ZelarOpening> createState() => _ZelarOpeningState();
}

class _ZelarOpeningState extends State<ZelarOpening> with SingleTickerProviderStateMixin {
  static const _nameEnd = 0.4;
  static const _appear = Duration(milliseconds: 360);
  static const _leave = Duration(milliseconds: 500);

  late final AnimationController _controller = AnimationController(vsync: this);
  var _started = false;
  var _appeared = false;
  var _leaving = false;
  var _done = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _appeared = true;
      _maybeLeave();
      return;
    }
    _controller.animateTo(_nameEnd, duration: _appear, curve: Curves.easeOut).whenCompleteOrCancel(() {
      _appeared = true;
      _maybeLeave();
    });
  }

  @override
  void didUpdateWidget(ZelarOpening oldWidget) {
    super.didUpdateWidget(oldWidget);
    _maybeLeave();
  }

  void _maybeLeave() {
    if (!mounted || _leaving || !_appeared || !widget.ready) return;
    _leaving = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      // Pode vir de dentro de um build (didChangeDependencies): o setState fica para o fim do quadro.
      SchedulerBinding.instance.addPostFrameCallback((_) => _finish());
      return;
    }
    _controller.animateTo(1, duration: _leave, curve: Curves.easeInOut).whenCompleteOrCancel(_finish);
  }

  void _finish() {
    if (mounted) setState(() => _done = true);
  }

  /// O Android centraliza a logo na tela inteira; o Flutter desenha acima da barra de navegação.
  /// Sem esta diferença, a logo pula alguns pixels ao trocar de um para o outro.
  double _toScreenCenter(BuildContext context) {
    final view = View.of(context);
    final gap = (view.display.size.height - view.physicalSize.height) / view.devicePixelRatio / 2;
    return gap.clamp(0.0, 48.0);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        widget.child,
        if (!_done)
          ExcludeSemantics(
            key: const Key('opening'),
            // Absorve os toques: nada na tela de baixo reage antes de aparecer.
            child: AbsorbPointer(
              child: AnimatedBuilder(
                animation: _controller,
                builder: (context, _) {
                  final t = _controller.value;
                  final name = (t / _nameEnd).clamp(0.0, 1.0);
                  final leaving = ((t - _nameEnd) / (1 - _nameEnd)).clamp(0.0, 1.0);
                  return Opacity(
                    opacity: 1 - leaving,
                    child: Material(
                      color: ZelarColors.surface,
                      child: Transform.translate(
                        offset: Offset(0, _toScreenCenter(context)),
                        child: Transform.scale(
                          scale: 1 + 0.06 * leaving,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              const ZelarLogo(size: ZelarOpening.logoSize),
                              // Fora do fluxo: o nome surgir não pode empurrar a logo do centro.
                              Transform.translate(
                                offset: Offset(0, ZelarOpening.logoSize / 2 + 16 + 12 * (1 - name)),
                                child: FractionalTranslation(
                                  translation: const Offset(0, 0.5),
                                  child: Opacity(opacity: name, child: const ZelarName(fontSize: 36)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
      ],
    );
  }
}
