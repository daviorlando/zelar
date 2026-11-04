import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
import '../../state/session.dart';
import '../flow.dart';
import '../theme.dart';
import '../widgets.dart';

/// Reconhecer: a foto é o caminho principal; o QR da etiqueta confirma.
class RecognizeScreen extends ConsumerStatefulWidget {
  const RecognizeScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<RecognizeScreen> createState() => _RecognizeScreenState();
}

class _RecognizeScreenState extends ConsumerState<RecognizeScreen> {
  late final order = ref.read(ordersProvider.notifier).byId(widget.orderId);

  String get _prompt =>
      '${Phrases.orderNote(order) ?? ''} ${Phrases.recognize(order.equipment.shortName)}'.trim();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', 'reconhecer ${order.equipment.shortName}');
      ref.read(speakerProvider).say(_prompt);
    });
  }

  void _start(String how) {
    ref.read(eventLogProvider.notifier).add('reconheceu', how);
    OrderFlow.goFirstPending(context, order, ref.read(sessionProvider).answersFor(order.id));
  }

  Future<void> _scan() async {
    final tag = await context.push<String>('/qr');
    if (!mounted || tag == null) return;
    final eq = order.equipment;
    final valid = {eq.tag, ...eq.components.map((c) => c.tag)};
    final speaker = ref.read(speakerProvider);
    if (valid.contains(tag.trim().toUpperCase())) {
      speaker.say('Etiqueta certa.');
      _start('qr');
    } else {
      ref.read(eventLogProvider.notifier).add('qr errado', tag);
      speaker.say('Esta etiqueta é de outro equipamento. Procure ${eq.shortName}.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final eq = order.equipment;
    return ZeloScaffold(
      title: Text(eq.shortName),
      body: Column(
        children: [
          if (order.released || order.returned) ...[ReturnedBanner.of(order), const SizedBox(height: 12)],
          Expanded(child: EquipmentPicture(icon: eq.icon, color: eq.color, label: eq.shortName)),
          const SizedBox(height: 16),
          AudioButton(text: _prompt),
        ],
      ),
      bottom: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          BigActionButton(
            key: const Key('recognize-ok'),
            label: 'Estou aqui',
            icon: Icons.check_circle,
            color: ZeloColors.ok,
            spokenHelp: Phrases.hereButton,
            onPressed: () => _start('foto'),
          ),
          const SizedBox(height: 12),
          BigActionButton(
            label: 'Ler etiqueta',
            icon: Icons.qr_code_scanner,
            color: ZeloColors.scan,
            spokenHelp: Phrases.qrButton,
            onPressed: _scan,
          ),
        ],
      ),
    );
  }
}

/// Leitura do QR da etiqueta (ML Kit, funciona offline). O QR codifica só a tag.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  var _done = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          MobileScanner(
            onDetect: (capture) {
              final value = capture.barcodes.firstOrNull?.rawValue;
              if (_done || value == null) return;
              _done = true;
              context.pop(value);
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(ZeloSizes.gutter),
              child: IconButton.filled(
                iconSize: 40,
                tooltip: 'Fechar',
                icon: const Icon(Icons.close),
                onPressed: () => context.pop(),
              ),
            ),
          ),
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 4),
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
