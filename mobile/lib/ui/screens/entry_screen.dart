import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/workers_repo.dart';
import '../../domain/models.dart';
import '../../state/device.dart';
import '../../state/recent.dart';
import '../../state/session.dart';
import '../../state/setup.dart';
import '../logo.dart';
import '../theme.dart';
import '../widgets.dart';

/// Entrada: crachá QR entra direto. Sem crachá, a pessoa digita os quatro números dela, e o app
/// descobre quem é; se não lembrar, toca a própria foto e digita (escopo, seções 4 e 5).
/// Vários funcionários se revezam no mesmo celular: "Trocar de pessoa" volta para cá.
class EntryScreen extends ConsumerStatefulWidget {
  const EntryScreen({super.key});

  @override
  ConsumerState<EntryScreen> createState() => _EntryScreenState();
}

class _EntryScreenState extends ConsumerState<EntryScreen> {
  final _typed = <int>[];

  /// Foto tocada: o PIN digitado é conferido só para esta pessoa.
  Worker? _selected;

  /// Lista de fotos aberta. [_alreadyChecked]: veio de um PIN que serve para mais de um, então tocar entra.
  List<Worker>? _choosing;
  var _alreadyChecked = false;

  /// Some o botão "Voltar" quando o prazo acaba.
  Timer? _backTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'entrada');
      _watchBack();
      if (ref.read(startupProvider)) {
        _speakPrompt();
        return;
      }
      // Ao abrir o app: se o tutorial ou a ligação do celular vão tomar a tela, esta não começa a falar.
      ref.listenManual(startupProvider, (_, ready) {
        if (ready && mounted && !ref.read(setupProvider) && !ref.read(deviceProvider)) _speakPrompt();
      });
    });
  }

  @override
  void dispose() {
    _backTimer?.cancel();
    super.dispose();
  }

  void _watchBack() {
    final until = ref.read(sessionProvider).previousUntil;
    if (until == null) return;
    final left = until.difference(DateTime.now());
    if (left.isNegative) return;
    _backTimer = Timer(left, () {
      if (mounted) setState(() {});
    });
  }

  void _speakPrompt() {
    final selected = _selected;
    final session = ref.read(sessionProvider);
    final String text;
    if (selected != null && session.lockedFor(selected.id)) {
      text = Phrases.locked;
    } else if (selected != null) {
      text = Phrases.pinFor(selected.name);
    } else if (_choosing != null && _alreadyChecked) {
      text = Phrases.pinChoose;
    } else if (ref.read(workersProvider).isEmpty) {
      text = Phrases.noWorkers;
    } else if (session.canGoBackTo != null) {
      text = Phrases.entryAfterSwitch;
    } else if (session.lockedFor(directPinKey)) {
      text = Phrases.locked;
    } else {
      text = Phrases.entry;
    }
    ref.read(speakerProvider).say(text);
  }

  void _enter() {
    _backTimer?.cancel();
    context.go('/hoje');
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
    _enter();
  }

  void _goBack() {
    final worker = ref.read(sessionProvider.notifier).goBack();
    if (worker == null) return setState(() {});
    ref.read(eventLogProvider.notifier).add('troca', 'voltou ${worker.name}');
    _enter();
  }

  void _openPhotos() {
    setState(() {
      _choosing = ref.read(workersProvider).where((w) => w.active).toList();
      _alreadyChecked = false;
      _selected = null;
      _typed.clear();
    });
    ref.read(speakerProvider).say(Phrases.choosePhotoButton);
  }

  void _closePhotos() {
    setState(() {
      _choosing = null;
      _selected = null;
      _typed.clear();
    });
    _speakPrompt();
  }

  void _pickPhoto(Worker worker) {
    if (_alreadyChecked) {
      ref.read(sessionProvider.notifier).enterChosen(worker);
      ref.read(eventLogProvider.notifier).add('pin', 'certo, escolheu ${worker.name}');
      _enter();
      return;
    }
    setState(() {
      _selected = worker;
      _choosing = null;
      _typed.clear();
    });
    _speakPrompt();
  }

  void _tap(int digit) {
    if (_typed.length >= pinLength) return;
    setState(() => _typed.add(digit));
    if (_typed.length < pinLength) return;
    final pin = List.of(_typed);
    setState(_typed.clear);
    final log = ref.read(eventLogProvider.notifier);
    final session = ref.read(sessionProvider.notifier);
    final worker = _selected;

    if (worker != null) {
      if (session.tryPin(worker, pin)) {
        log.add('pin', 'certo');
        _enter();
        return;
      }
      log.add('pin', 'errado');
      ref.read(speakerProvider).say(ref.read(sessionProvider).lockedFor(worker.id) ? Phrases.locked : Phrases.pinWrong);
      return;
    }

    switch (session.tryPinAny(pin)) {
      case PinEntered():
        log.add('pin', 'certo, direto');
        _enter();
      case PinChoose(:final workers):
        log.add('pin', 'certo, ${workers.length} pessoas');
        setState(() {
          _choosing = workers;
          _alreadyChecked = true;
        });
        _speakPrompt();
      case PinWrong():
        log.add('pin', 'errado, direto');
        ref.read(speakerProvider).say(Phrases.pinWrong);
      case PinLocked():
        log.add('pin', 'bloqueado, direto');
        setState(() {});
        ref.read(speakerProvider).say(Phrases.locked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final workers = ref.watch(workersProvider).where((w) => w.active).toList();
    final session = ref.watch(sessionProvider);
    final selected = _selected;
    final choosing = _choosing;
    final back = session.canGoBackTo;
    final locked = selected != null ? session.lockedFor(selected.id) : session.lockedFor(directPinKey);
    final title = Theme.of(context).textTheme.titleMedium;
    final byId = {for (final w in workers) w.id: w};
    // Enquanto o "Voltar" aparece, quem acabou de sair já está nele: as fotos esperam, e o teclado cabe.
    final recent = back != null ? const <Worker>[] : [for (final id in ref.watch(recentWorkersProvider)) ?byId[id]];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZelarSizes.gutter),
          child: FillOrScroll(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Align(alignment: Alignment.centerLeft, child: ZelarBrand()),
                    ),
                    IconButton(iconSize: 48, tooltip: 'Ouvir de novo', icon: const Icon(Icons.volume_up), onPressed: _speakPrompt),
                  ],
                ),
                if (back != null && choosing == null && selected == null) ...[
                  BigActionButton(
                    key: const Key('switch-back'),
                    label: 'Voltar para ${back.name}',
                    icon: Icons.undo,
                    color: ZelarColors.ok,
                    compact: true,
                    spokenHelp: Phrases.backButton(back.name),
                    onPressed: _goBack,
                  ),
                  const SizedBox(height: 12),
                ],
                BigActionButton(
                  key: const Key('badge'),
                  label: 'Ler meu crachá',
                  icon: Icons.badge,
                  color: ZelarColors.scan,
                  compact: choosing != null || selected != null || recent.isNotEmpty || back != null,
                  spokenHelp: Phrases.badgeButton,
                  onPressed: _scanBadge,
                ),
                const SizedBox(height: 16),
                if (choosing != null) ...[
                  Row(
                    children: [
                      Expanded(child: Text(_alreadyChecked ? 'Toque na sua foto' : 'Toque na sua foto e digite seus números', style: title)),
                      _BackIcon(onPressed: _closePhotos, onHelp: () => ref.read(speakerProvider).say(Phrases.otherPerson)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _WorkerGrid(workers: choosing, onTap: _pickPhoto),
                ] else ...[
                  if (selected != null)
                    Row(
                      children: [
                        WorkerAvatar(worker: selected, radius: 28),
                        const SizedBox(width: 12),
                        Expanded(child: Text(selected.name, style: title)),
                        _BackIcon(onPressed: _closePhotos, onHelp: () => ref.read(speakerProvider).say(Phrases.otherPerson)),
                      ],
                    )
                  else ...[
                    if (recent.isNotEmpty) ...[
                      Text('Quem usa este celular', style: title),
                      const SizedBox(height: 8),
                      _RecentRow(workers: recent, onTap: _pickPhoto),
                      const SizedBox(height: 12),
                    ],
                    Text(workers.isEmpty ? 'A lista de funcionários ainda não chegou.' : 'Ou digite seus números', style: title),
                  ],
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
                        child: const Center(child: Icon(Icons.lock, size: 120, color: ZelarColors.overdue)),
                      ),
                    )
                  else ...[
                    _PinDots(filled: _typed.length, total: pinLength),
                    const SizedBox(height: 12),
                    // Linhas e colunas flexíveis: o teclado cabe sem rolar, até em 360x640.
                    Expanded(
                      child: _PinPad(
                        onDigit: workers.isEmpty ? (_) {} : _tap,
                        onErase: _typed.isEmpty ? null : () => setState(_typed.removeLast),
                        onEraseHelp: () => ref.read(speakerProvider).say(Phrases.eraseDigit),
                      ),
                    ),
                  ],
                  if (selected == null && workers.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      key: const Key('choose-photo'),
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(ZelarSizes.minTouch)),
                      onPressed: _openPhotos,
                      onLongPress: () => ref.read(speakerProvider).say(Phrases.choosePhotoButton),
                      icon: const Icon(Icons.photo_camera_front, size: 28),
                      label: const Text('Escolher pela foto', style: TextStyle(fontSize: 20)),
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

/// Fotos de quem já entrou neste celular, numa linha que rola de lado: o teclado continua cabendo.
class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.workers, required this.onTap});

  final List<Worker> workers;
  final void Function(Worker) onTap;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final w in workers)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Semantics(
                button: true,
                label: w.name,
                excludeSemantics: true,
                child: InkWell(
                  key: Key('recent-${w.id}'),
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => onTap(w),
                  child: SizedBox(
                    width: 88,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        WorkerAvatar(worker: w, radius: 34),
                        const SizedBox(height: 4),
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
      ),
    );
  }
}

class _BackIcon extends StatelessWidget {
  const _BackIcon({required this.onPressed, required this.onHelp});

  final VoidCallback onPressed;
  final VoidCallback onHelp;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onLongPress: onHelp,
        child: IconButton(
          key: const Key('worker-back'),
          iconSize: 40,
          tooltip: 'Voltar',
          icon: const Icon(Icons.arrow_back),
          onPressed: onPressed,
        ),
      );
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
              color: i < filled ? ZelarColors.ink : Colors.transparent,
              border: Border.all(color: ZelarColors.ink, width: 3),
            ),
          ),
      ],
    );
  }
}
