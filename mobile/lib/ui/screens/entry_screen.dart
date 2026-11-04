import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/fixtures.dart';
import '../../data/workers_repo.dart';
import '../../domain/models.dart';
import '../../state/session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Entrada: crachá QR entra direto; sem crachá, a pessoa toca a própria foto
/// e as quatro figuras dela (escopo, seções 4 e 5).
class EntryScreen extends ConsumerStatefulWidget {
  const EntryScreen({super.key});

  @override
  ConsumerState<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends ConsumerState<EntryScreen> {
  final _typed = <int>[];
  Worker? _selected;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'entrada');
      _speakPrompt();
    });
  }

  void _speakPrompt() {
    final selected = _selected;
    final String text;
    if (ref.read(sessionProvider).locked) {
      text = Phrases.locked;
    } else if (selected != null) {
      text = Phrases.pinFor(selected.name);
    } else if (ref.read(workersProvider).isEmpty) {
      text = Phrases.noWorkers;
    } else {
      text = Phrases.entry;
    }
    ref.read(speakerProvider).say(text);
  }

  Future<void> _scanBadge() async {
    final qr = await context.push<String>('/qr');
    if (!mounted || qr == null) return;
    final log = ref.read(eventLogProvider.notifier);
    final worker = ref.read(sessionProvider.notifier).tryBadge(qr);
    if (worker == null) {
      log.add('crachá', 'não reconhecido');
      ref.read(speakerProvider).say(Phrases.badgeUnknown);
      return;
    }
    log.add('crachá', worker.name);
    context.go('/hoje');
  }

  void _select(Worker? worker) {
    setState(() {
      _selected = worker;
      _typed.clear();
    });
    _speakPrompt();
  }

  void _tap(int figure) {
    final worker = _selected;
    if (worker == null || _typed.length >= worker.pin.length) return;
    setState(() => _typed.add(figure));
    if (_typed.length < worker.pin.length) return;

    final ok = ref.read(sessionProvider.notifier).tryPin(worker, List.of(_typed));
    final log = ref.read(eventLogProvider.notifier);
    if (ok) {
      log.add('pin', 'certo');
      context.go('/hoje');
      return;
    }
    log.add('pin', 'errado');
    setState(_typed.clear);
    final locked = ref.read(sessionProvider).locked;
    if (locked) setState(() => _selected = null);
    ref.read(speakerProvider).say(locked ? Phrases.locked : Phrases.pinWrong);
  }

  @override
  Widget build(BuildContext context) {
    final locked = ref.watch(sessionProvider.select((s) => s.locked));
    final workers = ref.watch(workersProvider).where((w) => w.active).toList();
    final selected = _selected;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZeloSizes.gutter),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: IconButton(
                  iconSize: 48,
                  tooltip: 'Ouvir de novo',
                  icon: const Icon(Icons.volume_up),
                  onPressed: _speakPrompt,
                ),
              ),
              BigActionButton(
                key: const Key('badge'),
                label: 'Ler meu crachá',
                icon: Icons.badge,
                color: ZeloColors.scan,
                spokenHelp: Phrases.badgeButton,
                onPressed: _scanBadge,
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
              else if (selected == null) ...[
                Text('Sem crachá? Toque na sua foto', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 12),
                Expanded(child: _WorkerGrid(workers: workers, onTap: _select)),
              ] else ...[
                Row(
                  children: [
                    WorkerAvatar(worker: selected, radius: 28),
                    const SizedBox(width: 12),
                    Expanded(child: Text(selected.name, style: Theme.of(context).textTheme.titleMedium)),
                    GestureDetector(
                      onLongPress: () => ref.read(speakerProvider).say(Phrases.otherPerson),
                      child: IconButton(
                        key: const Key('worker-back'),
                        iconSize: 40,
                        tooltip: 'Escolher outra foto',
                        icon: const Icon(Icons.arrow_back),
                        onPressed: () => _select(null),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _PinDots(filled: _typed.length, total: selected.pin.length),
                const SizedBox(height: 12),
                // Linhas e colunas flexíveis: as nove figuras cabem sem rolar, até em 360x640.
                Expanded(
                  child: Column(
                    children: [
                      for (var row = 0; row < 3; row++)
                        Expanded(
                          child: Row(
                            children: [
                              for (var i = row * 3; i < row * 3 + 3; i++)
                                Expanded(
                                  child: Padding(
                                    padding: const EdgeInsets.all(5),
                                    // O nome da figura nunca é falado: revelaria o PIN para quem está perto.
                                    child: Semantics(
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
                                          child: Center(
                                            child: FittedBox(
                                              child: Padding(
                                                padding: const EdgeInsets.all(6),
                                                child: Icon(pinFigures[i].$1, size: 64, color: pinFigures[i].$2),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  height: ZeloSizes.minTouch,
                  child: GestureDetector(
                    onLongPress: () => ref.read(speakerProvider).say(Phrases.eraseFigure),
                    child: IconButton(
                      iconSize: 40,
                      tooltip: 'Apagar a última figura',
                      icon: const Icon(Icons.backspace),
                      onPressed: _typed.isEmpty ? null : () => setState(_typed.removeLast),
                    ),
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

/// Fotos dos funcionários ativos; tocar fala o nome e abre as figuras.
class _WorkerGrid extends StatelessWidget {
  const _WorkerGrid({required this.workers, required this.onTap});

  final List<Worker> workers;
  final void Function(Worker) onTap;

  @override
  Widget build(BuildContext context) {
    if (workers.isEmpty) {
      return Center(
        child: Text(
          'Lista de funcionários ainda não baixada.\nConecte à internet ou chame o gestor.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      );
    }
    return GridView.count(
      crossAxisCount: 3,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.8,
      children: [
        for (final w in workers)
          Semantics(
            button: true,
            label: w.name,
            child: Material(
              color: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: const BorderSide(color: Colors.black26, width: 2),
              ),
              child: InkWell(
                key: Key('worker-${w.id}'),
                borderRadius: BorderRadius.circular(16),
                onTap: () => onTap(w),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      WorkerAvatar(worker: w, radius: 34),
                      const SizedBox(height: 6),
                      Text(
                        w.name.split(' ').first,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
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
