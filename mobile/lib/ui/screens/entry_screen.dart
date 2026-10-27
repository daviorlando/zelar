import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/speaker.dart';
import '../../data/fixtures.dart';
import '../../state/session.dart';
import '../theme.dart';

/// Entrada: foto do trabalhador e PIN visual de quatro figuras (escopo, seções 4 e 5).
class EntryScreen extends ConsumerStatefulWidget {
  const EntryScreen({super.key});

  @override
  ConsumerState<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends ConsumerState<EntryScreen> {
  final _typed = <int>[];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'entrada');
      _speakPrompt();
    });
  }

  void _speakPrompt() {
    final locked = ref.read(sessionProvider).locked;
    ref.read(speakerProvider).say(locked ? 'Celular bloqueado. Chame o gestor.' : 'Toque suas quatro figuras.');
  }

  void _tap(int figure) {
    if (_typed.length >= demoWorker.pin.length) return;
    setState(() => _typed.add(figure));
    if (_typed.length < demoWorker.pin.length) return;

    final ok = ref.read(sessionProvider.notifier).tryPin(List.of(_typed));
    final log = ref.read(eventLogProvider.notifier);
    if (ok) {
      log.add('pin', 'certo');
      context.go('/hoje');
      return;
    }
    log.add('pin', 'errado');
    setState(_typed.clear);
    final session = ref.read(sessionProvider);
    ref.read(speakerProvider).say(
          session.locked ? 'Celular bloqueado. Chame o gestor.' : 'Figuras erradas. Tente de novo.',
        );
  }

  @override
  Widget build(BuildContext context) {
    final locked = ref.watch(sessionProvider.select((s) => s.locked));
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZeloSizes.gutter),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const CircleAvatar(radius: 48, child: Icon(Icons.person, size: 64)),
                  IconButton(
                    iconSize: 48,
                    tooltip: 'Ouvir de novo',
                    icon: const Icon(Icons.volume_up),
                    onPressed: _speakPrompt,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (locked)
                Expanded(
                  child: GestureDetector(
                    // Facilitador: segurar o cadeado desbloqueia (em produção, só o gestor pelo painel).
                    onLongPress: () {
                      ref.read(sessionProvider.notifier).reset();
                      ref.read(eventLogProvider.notifier).add('pin', 'desbloqueado pelo facilitador');
                    },
                    child: const Center(child: Icon(Icons.lock, size: 160, color: ZeloColors.overdue)),
                  ),
                )
              else ...[
                _PinDots(filled: _typed.length, total: demoWorker.pin.length),
                const SizedBox(height: 16),
                Expanded(
                  child: GridView.count(
                    crossAxisCount: 3,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    children: [
                      for (var i = 0; i < pinFigures.length; i++)
                        Semantics(
                          button: true,
                          label: pinFigures[i].$3,
                          child: Material(
                            color: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                              side: const BorderSide(color: Colors.black26, width: 2),
                            ),
                            child: InkWell(
                              key: Key('pin-$i'),
                              borderRadius: BorderRadius.circular(16),
                              onTap: () => _tap(i),
                              child: Icon(pinFigures[i].$1, size: 64, color: pinFigures[i].$2),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  height: ZeloSizes.minTouch,
                  child: IconButton(
                    iconSize: 40,
                    tooltip: 'Apagar a última figura',
                    icon: const Icon(Icons.backspace),
                    onPressed: _typed.isEmpty ? null : () => setState(_typed.removeLast),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PinDots extends StatelessWidget {
  const _PinDots({required this.filled, required this.total});

  final int filled;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < total; i++)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 8),
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i < filled ? ZeloColors.ink : Colors.transparent,
              border: Border.all(color: ZeloColors.ink, width: 3),
            ),
          ),
      ],
    );
  }
}
