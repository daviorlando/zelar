import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
import '../../data/workers_repo.dart';
import '../../state/device.dart';
import '../logo.dart';
import '../theme.dart';
import '../widgets.dart';

/// Liga o celular à empresa, uma vez por aparelho. O gestor entra com o email e a senha do
/// painel; quem não tiver o gestor por perto usa um código gerado em Celulares.
/// O funcionário nunca vê esta tela: depois dela, o app abre direto na entrada.
class ActivationScreen extends ConsumerStatefulWidget {
  const ActivationScreen({super.key});

  @override
  ConsumerState<ActivationScreen> createState() => _ActivationScreenState();
}

class _ActivationScreenState extends ConsumerState<ActivationScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  var _byCode = false;
  var _hidePassword = true;
  var _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(speakerProvider).say(Phrases.activation));
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _ready => _byCode
      ? _code.text.replaceAll(RegExp(r'[\s-]'), '').length == 8
      : _email.text.contains('@') && _password.text.isNotEmpty;

  void _toggleMode() {
    setState(() {
      _byCode = !_byCode;
      _error = null;
    });
    ref.read(speakerProvider).say(_byCode ? Phrases.activationCode : Phrases.activation);
  }

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final device = ref.read(deviceProvider.notifier);
    final error = _byCode ? await device.activate(code: _code.text) : await device.activate(email: _email.text, password: _password.text);
    if (!mounted) return;
    if (error == null) {
      // Celular ligado: baixa a lista, envia o que ficou guardado e segue para a entrada.
      ref.read(workersProvider.notifier).refresh();
      ref.read(ordersProvider.notifier).sync();
      context.go('/');
      return;
    }
    final text = switch (error) {
      ActivationError.invalid => Phrases.activationInvalid,
      ActivationError.wrongLogin => Phrases.activationWrongLogin,
      ActivationError.notManager => Phrases.activationNotManager,
      ActivationError.tooMany => Phrases.activationWait,
      ActivationError.offline => Phrases.activationOffline,
    };
    setState(() {
      _busy = false;
      _error = text;
    });
    ref.read(speakerProvider).say(text);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    const field = TextStyle(fontSize: 22);
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
                Text('Ligar este celular à empresa', style: text.titleLarge),
                const SizedBox(height: 8),
                Text(
                  _byCode
                      ? 'Digite o código que o gestor gerou no painel, em Celulares.'
                      : 'O gestor entra uma vez com o email e a senha do painel.',
                  style: text.bodyLarge,
                ),
                const SizedBox(height: 16),
                if (_byCode)
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
                  )
                else ...[
                  TextField(
                    key: const Key('activation-email'),
                    controller: _email,
                    autocorrect: false,
                    enableSuggestions: false,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    style: field,
                    decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Email do gestor'),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('activation-password'),
                    controller: _password,
                    obscureText: _hidePassword,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    style: field,
                    decoration: InputDecoration(
                      border: const OutlineInputBorder(),
                      labelText: 'Senha',
                      suffixIcon: IconButton(
                        tooltip: _hidePassword ? 'Mostrar senha' : 'Esconder senha',
                        icon: Icon(_hidePassword ? Icons.visibility : Icons.visibility_off),
                        onPressed: () => setState(() => _hidePassword = !_hidePassword),
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                    onSubmitted: (_) => _ready && !_busy ? _send() : null,
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, key: const Key('activation-error'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: ZeloColors.overdue)),
                ],
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    key: const Key('activation-mode'),
                    onPressed: _busy ? null : _toggleMode,
                    child: Text(_byCode ? 'Entrar com email e senha' : 'Tenho um código', style: const TextStyle(fontSize: 18)),
                  ),
                ),
                const Spacer(),
                const SizedBox(height: 16),
                BigActionButton(
                  key: const Key('activation-send'),
                  label: _busy ? 'Conferindo…' : 'Ligar',
                  icon: Icons.check_circle,
                  color: ZeloColors.ok,
                  spokenHelp: Phrases.activationButton,
                  disabledHint: _byCode ? Phrases.activationCode : Phrases.activation,
                  onPressed: _busy || !_ready ? null : _send,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
