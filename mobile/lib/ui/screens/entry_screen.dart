import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/workers_repo.dart';
import '../../domain/models.dart';
import '../../state/session.dart';
import '../../state/setup.dart';
import '../logo.dart';
import '../theme.dart';
import '../widgets.dart';

/// Entrada: crachá QR entra direto; sem crachá, a pessoa toca a própria foto
/// e digita os quatro números dela (escopo, seções 4 e 5).
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
      if (ref.read(startupProvider)) {
        _speakPrompt();
        return;
      }
      // Ao abrir o app: se a primeira inicialização vai tomar a tela, esta não começa a falar.
      ref.listenManual(startupProvider, (_, ready) {
        if (ready && mounted && !ref.read(setupProvider)) _speakPrompt();
      });
    });
  }

  void _speakPrompt() {
    final selected = _selected;
    final String text;
    if (selected != null && ref.read(sessionProvider).lockedFor(selected.id)) {
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

  void _tap(int digit) {
    final worker = _selected;
    if (worker == null || _typed.length >= pinLength) return;
    setState(() => _typed.add(digit));
    if (_typed.length < pinLength) return;

    final ok = ref.read(sessionProvider.notifier).tryPin(worker, List.of(_typed));
    final log = ref.read(eventLogProvider.notifier);
    if (ok) {
      log.add('pin', 'certo');
      context.go('/hoje');
      return;
    }
    log.add('pin', 'errado');
    setState(_typed.clear);
    final locked = ref.read(sessionProvider).lockedFor(worker.id);
    ref.read(speakerProvider).say(locked ? Phrases.locked : Phrases.pinWrong);
  }

  @override
  Widget build(BuildContext context) {
    final workers = ref.watch(workersProvider).where((w) => w.active).toList();
    final selected = _selected;
    final locked = selected != null && ref.watch(sessionProvider.select((s) => s.lockedFor(selected.id)));

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZeloSizes.gutter),
          child: FillOrScroll(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Align(alignment: Alignment.centerLeft, child: ZeloBrand()),
                    ),
                    IconButton(iconSize: 48, tooltip: 'Ouvir de novo', icon: const Icon(Icons.volume_up), onPressed: _speakPrompt),
                  ],
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
                if (selected == null) ...[
                  Text('Sem crachá? Toque na sua foto', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),
                  _WorkerGrid(workers: workers, onTap: _select),
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
                  if (locked)
                    Expanded(
                      child: GestureDetector(
                        // Só em teste de uso: em produção o bloqueio vence sozinho, e o crachá continua entrando.
                        onLongPress: kReleaseMode
                            ? null
                            : () {
                                ref.read(sessionProvider.notifier).reset();
                                ref.read(eventLogProvider.notifier).add('pin', 'desbloqueado pelo facilitador');
                              },
                        child: const Center(child: Icon(Icons.lock, size: 160, color: ZeloColors.overdue)),
                      ),
                    )
                  else ...[
                    _PinDots(filled: _typed.length, total: pinLength),
                    const SizedBox(height: 12),
                    // Linhas e colunas flexíveis: o teclado cabe sem rolar, até em 360x640.
                    Expanded(
                      child: _PinPad(
                        onDigit: _tap,
                        onErase: _typed.isEmpty ? null : () => setState(_typed.removeLast),
                        onEraseHelp: () => ref.read(speakerProvider).say(Phrases.eraseDigit),
                      ),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Teclado do PIN. Os números tocados nunca são falados: revelariam o PIN para quem está perto.
class _PinPad extends StatelessWidget {
  const _PinPad({required this.onDigit, required this.onErase, required this.onEraseHelp});

  final void Function(int) onDigit;
  final VoidCallback? onErase;
  final VoidCallback onEraseHelp;

  @override
  Widget build(BuildContext context) {
    Widget key(int digit) => Padding(
          padding: const EdgeInsets.all(4),
          child: FilledButton.tonal(
            key: Key('pin-$digit'),
            style: FilledButton.styleFrom(
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              padding: EdgeInsets.zero,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              textStyle: const TextStyle(fontSize: 36, fontWeight: FontWeight.w800),
            ),
            onPressed: () => onDigit(digit),
            child: Text('$digit'),
          ),
        );
    Widget row(List<Widget> cells) => Expanded(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final c in cells) Expanded(child: c)]),
        );
    return Column(
      children: [
        row([key(1), key(2), key(3)]),
        row([key(4), key(5), key(6)]),
        row([key(7), key(8), key(9)]),
        row([
          const SizedBox.shrink(),
          key(0),
          GestureDetector(
            onLongPress: onEraseHelp,
            child: IconButton(
              key: const Key('pin-erase'),
              iconSize: 40,
              tooltip: 'Apagar o último número',
              icon: const Icon(Icons.backspace),
              onPressed: onErase,
            ),
          ),
        ]),
      ],
    );
  }
}

/// Fotos dos funcionários ativos; tocar fala o nome e abre o teclado.
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
    // A altura vem do conteúdo, e a tela inteira rola: fonte grande não corta o nome.
    // Com a fonte bem grande, duas colunas, para o primeiro nome caber inteiro.
    final columns = MediaQuery.textScalerOf(context).scale(1) >= 1.5 ? 2 : 3;
    return Column(
      children: [
        for (var start = 0; start < workers.length; start += columns)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = start; i < start + columns; i++) ...[
                  if (i > start) const SizedBox(width: 12),
                  Expanded(
                    child: i < workers.length ? _WorkerCard(worker: workers[i], onTap: onTap) : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _WorkerCard extends StatelessWidget {
  const _WorkerCard({required this.worker, required this.onTap});

  final Worker worker;
  final void Function(Worker) onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: worker.name,
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Colors.black26, width: 2),
        ),
        child: InkWell(
          key: Key('worker-${worker.id}'),
          borderRadius: BorderRadius.circular(16),
          onTap: () => onTap(worker),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                WorkerAvatar(worker: worker, radius: 34),
                const SizedBox(height: 6),
                Text(
                  worker.name.split(' ').first,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ],
            ),
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
