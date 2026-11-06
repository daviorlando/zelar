import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../state/setup.dart';
import '../theme.dart';
import '../widgets.dart';

/// Primeira inicialização: deixa a voz pronta e mostra, em poucas falas, como o app funciona.
/// Tudo escrito e falado: com o som desligado, quem está configurando ainda consegue seguir.
class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});

  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<SetupScreen> {
  late final AppLifecycleListener _lifecycle;
  var _step = 0;
  bool? _voice;
  int? _volume;
  var _checked = false;

  @override
  void initState() {
    super.initState();
    // Voltando das configurações do Android, confere de novo sem a pessoa pedir.
    _lifecycle = AppLifecycleListener(onResume: () {
      if (_step == 0) _check();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    final voice = await ref.read(speakerProvider).ptBrInstalled();
    final volume = await ref.read(systemSettingsProvider).mediaVolume();
    if (!mounted) return;
    final firstTime = !_checked;
    final changed = voice != _voice;
    setState(() {
      _voice = voice;
      _volume = volume;
      _checked = true;
    });
    if (firstTime || changed) _say();
  }

  bool get _voiceMissing => _voice == false;
  bool get _muted => _volume == 0;

  String get _spoken => switch (_step) {
        0 => _voiceMissing ? Phrases.setupVoiceMissing : Phrases.setupVoiceReady,
        1 => Phrases.setupHowItWorks,
        _ => Phrases.setupDone,
      };

  void _say() => ref.read(speakerProvider).say(_spoken);

  void _goTo(int step) {
    setState(() => _step = step);
    _say();
  }

  Future<void> _finish() async {
    await ref.read(setupProvider.notifier).finish();
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 72,
        automaticallyImplyLeading: false,
        title: Text('Passo ${_step + 1} de 3'),
        actions: [AudioButton(key: const Key('setup-listen'), text: _spoken, size: 56), const SizedBox(width: 8)],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(ZeloSizes.gutter),
          child: ListView(
            children: [
              if (_muted) ...[const _MutedWarning(), const SizedBox(height: 12)],
              ...switch (_step) {
                0 => _voiceStep(context),
                1 => _howItWorksStep(context),
                _ => _doneStep(context),
              },
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(padding: const EdgeInsets.all(ZeloSizes.gutter), child: _actions()),
      ),
    );
  }

  List<Widget> _voiceStep(BuildContext context) {
    final style = Theme.of(context).textTheme;
    if (!_checked) return const [Center(child: Padding(padding: EdgeInsets.all(48), child: CircularProgressIndicator()))];
    if (!_voiceMissing) {
      return [
        const Icon(Icons.record_voice_over, size: 120, color: ZeloColors.ok),
        const SizedBox(height: 16),
        Text('A voz está pronta', textAlign: TextAlign.center, style: style.titleLarge),
        const SizedBox(height: 8),
        const Text('O Zelo fala em português, mesmo sem internet.', textAlign: TextAlign.center, style: TextStyle(fontSize: 20)),
      ];
    }
    return [
      const Icon(Icons.record_voice_over, size: 96, color: ZeloColors.overdue),
      const SizedBox(height: 12),
      Text('Falta instalar a voz', textAlign: TextAlign.center, style: style.titleLarge),
      const SizedBox(height: 8),
      const Text('Sem ela, o Zelo pode ficar mudo quando não houver internet.', textAlign: TextAlign.center, style: TextStyle(fontSize: 20)),
      const SizedBox(height: 16),
      const _Step(number: 1, text: 'Toque em Abrir configurações.'),
      const _Step(number: 2, text: 'Toque na engrenagem do serviço de voz e em Instalar dados de voz.'),
      const _Step(number: 3, text: 'Baixe Português (Brasil).'),
      const _Step(number: 4, text: 'Volte para o Zelo.'),
    ];
  }

  List<Widget> _howItWorksStep(BuildContext context) => [
        Text('Como funciona', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 16),
        const _Explain(icon: Icons.badge, color: ZeloColors.scan, text: 'Para entrar: leia o crachá ou toque na sua foto.'),
        const _Explain(icon: Icons.check_circle, color: ZeloColors.ok, text: 'Verde: está tudo certo.'),
        const _Explain(icon: Icons.warning, color: ZeloColors.problem, text: 'Amarelo: encontrei um problema.'),
        const _Explain(icon: Icons.block, color: ZeloColors.blocked, text: 'Azul: não consegui fazer.'),
        const _Explain(icon: Icons.help, color: ZeloColors.skip, text: 'Cinza: não sei responder.'),
        const _Explain(icon: Icons.touch_app, color: ZeloColors.ink, text: 'Segure um botão para ouvir o que ele faz.'),
      ];

  List<Widget> _doneStep(BuildContext context) => [
        const Icon(Icons.task_alt, size: 120, color: ZeloColors.ok),
        const SizedBox(height: 16),
        Text('Tudo pronto', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        const Text('Agora é só entrar.', textAlign: TextAlign.center, style: TextStyle(fontSize: 20)),
      ];

  Widget _actions() {
    final next = BigActionButton(
      key: const Key('setup-next'),
      label: 'Próximo',
      icon: Icons.arrow_forward,
      color: ZeloColors.ok,
      spokenHelp: Phrases.setupNextButton,
      onPressed: () => _goTo(_step + 1),
    );
    return switch (_step) {
      0 when !_checked => const SizedBox.shrink(),
      0 when _voiceMissing => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BigActionButton(
              key: const Key('setup-open-voice'),
              label: 'Abrir configurações',
              icon: Icons.settings,
              color: ZeloColors.blocked,
              spokenHelp: Phrases.setupOpenButton,
              onPressed: () => ref.read(systemSettingsProvider).openVoiceSettings(),
            ),
            const SizedBox(height: 12),
            // Pode não haver internet na hora: não trava quem está configurando.
            OutlinedButton(
              key: const Key('setup-later'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(ZeloSizes.minTouch)),
              onPressed: () => _goTo(1),
              child: const Text('Fazer depois', style: TextStyle(fontSize: 20)),
            ),
          ],
        ),
      0 || 1 => next,
      _ => BigActionButton(
          key: const Key('setup-finish'),
          label: 'Começar',
          icon: Icons.check_circle,
          color: ZeloColors.ok,
          spokenHelp: Phrases.setupStartButton,
          onPressed: _finish,
        ),
    };
  }
}

class _MutedWarning extends StatelessWidget {
  const _MutedWarning();

  @override
  Widget build(BuildContext context) => Container(
        key: const Key('setup-muted'),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: ZeloColors.problem, borderRadius: BorderRadius.circular(16)),
        child: const Row(
          children: [
            Icon(Icons.volume_off, size: 40, color: ZeloColors.ink),
            SizedBox(width: 12),
            Expanded(child: Text('O som está desligado. Aumente o volume para ouvir o Zelo.', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
          ],
        ),
      );
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.text});

  final int number;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(radius: 16, child: Text('$number', style: const TextStyle(fontWeight: FontWeight.w700))),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 20))),
          ],
        ),
      );
}

class _Explain extends StatelessWidget {
  const _Explain({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Icon(icon, size: 48, color: color),
            const SizedBox(width: 16),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 20))),
          ],
        ),
      );
}
