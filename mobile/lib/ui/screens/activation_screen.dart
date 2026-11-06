import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
import '../../data/workers_repo.dart';
import '../../state/device.dart';
import '../../state/setup.dart';
import '../logo.dart';
import '../theme.dart';
import '../widgets.dart';

/// Primeiro uso do celular: o gestor gera um código no painel e alguém digita aqui.
/// O código liga o aparelho à empresa, e o resto do app só abre depois disso.
class ActivationScreen extends ConsumerStatefulWidget {
  const ActivationScreen({super.key});

  @override
  ConsumerState<ActivationScreen> createState() => _ActivationScreenState();
}

class _ActivationScreenState extends ConsumerState<ActivationScreen> {
  final _code = TextEditingController();
  var _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(speakerProvider).say(Phrases.activation));
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(deviceProvider.notifier).activate(_code.text);
    if (!mounted) return;
    if (error == null) {
      // Celular ligado: segue para a primeira inicialização, baixa a lista e envia o que ficou guardado.
      await ref.read(setupProvider.notifier).load();
      if (!mounted) return;
      ref.read(workersProvider.notifier).refresh();
      ref.read(ordersProvider.notifier).sync();
      context.go(ref.read(setupProvider) ? '/primeira-vez' : '/');
      return;
    }
    final text = error == ActivationError.invalid ? Phrases.activationInvalid : Phrases.activationOffline;
    setState(() {
      _busy = false;
      _error = text;
    });
    ref.read(speakerProvider).say(text);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZeloSizes.gutter),
          child: FillOrScroll(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Align(alignment: Alignment.centerLeft, child: ZeloBrand()),
                const SizedBox(height: 24),
                Text('Ligar este celular', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                Text('Peça o código ao gestor. Ele gera no painel, em Celulares.', style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 16),
                TextField(
                  key: const Key('activation-code'),
                  controller: _code,
                  autofocus: true,
                  autocorrect: false,
                  enableSuggestions: false,
                  textCapitalization: TextCapitalization.characters,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: 4),
                  decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'ABCD 2345'),
                  onChanged: (_) => setState(() {}),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, key: const Key('activation-error'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: ZeloColors.overdue)),
                ],
                const Spacer(),
                BigActionButton(
                  key: const Key('activation-send'),
                  label: _busy ? 'Conferindo…' : 'Ligar',
                  icon: Icons.check_circle,
                  color: ZeloColors.ok,
                  spokenHelp: Phrases.activationButton,
                  disabledHint: Phrases.activation,
                  onPressed: _busy || _code.text.replaceAll(RegExp(r'[\s-]'), '').length != 8 ? null : _send,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
