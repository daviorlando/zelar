import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../audio/speaker.dart';
import '../../data/fixtures.dart';
import '../../domain/models.dart';
import '../../state/session.dart';
import '../flow.dart';
import '../theme.dart';
import '../widgets.dart';

enum ReasonKind { problem, blocked }

/// Problema ou impedimento: grade de motivos ilustrados, foto e áudio. Nenhum texto obrigatório.
class ReasonScreen extends ConsumerStatefulWidget {
  const ReasonScreen({super.key, required this.orderId, required this.index, required this.kind});

  final String orderId;
  final int index;
  final ReasonKind kind;

  @override
  ConsumerState<ReasonScreen> createState() => _ReasonScreenState();
}

class _ReasonScreenState extends ConsumerState<ReasonScreen> {
  /// Limite de 2 minutos por gravação (escopo, seção 6).
  static const _maxRecording = Duration(minutes: 2);

  late final order = orderById(widget.orderId);
  late final item = order.items[widget.index];
  late final reasons = widget.kind == ReasonKind.problem ? problemKinds : blockReasons;
  final _recorder = AudioRecorder();
  Timer? _limit;
  String? _reason;
  String? _photoPath;
  String? _audioPath;
  var _recording = false;

  String get _prompt => widget.kind == ReasonKind.problem
      ? 'O que você encontrou? Toque na figura. Se puder, tire uma foto ou grave um áudio.'
      : 'Por que não conseguiu? Toque na figura.';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(eventLogProvider.notifier).add('tela', '${widget.kind.name} ${item.id}');
      ref.read(speakerProvider).say(_prompt);
    });
  }

  @override
  void dispose() {
    _limit?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    try {
      // Compressão do escopo: no máximo 1600 px no lado maior.
      final photo = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, maxHeight: 1600, imageQuality: 70);
      if (photo == null || !mounted) return;
      setState(() => _photoPath = photo.path);
      ref.read(eventLogProvider.notifier).add('foto', item.id);
      ref.read(speakerProvider).say('Foto guardada.');
    } catch (e) {
      ref.read(eventLogProvider.notifier).add('erro foto', '$e');
    }
  }

  Future<void> _startRecording() async {
    try {
      if (!await _recorder.hasPermission()) return;
      await ref.read(speakerProvider).stop();
      final dir = await getApplicationDocumentsDirectory();
      final path = '${dir.path}/relato_${item.id}_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 32000, numChannels: 1, sampleRate: 22050),
        path: path,
      );
      setState(() => _recording = true);
      _limit = Timer(_maxRecording, _stopRecording);
    } catch (e) {
      ref.read(eventLogProvider.notifier).add('erro áudio', '$e');
    }
  }

  Future<void> _stopRecording() async {
    _limit?.cancel();
    if (!_recording) return;
    try {
      final path = await _recorder.stop();
      if (!mounted) return;
      setState(() {
        _recording = false;
        _audioPath = path;
      });
      ref.read(eventLogProvider.notifier).add('áudio', item.id);
      ref.read(speakerProvider).say('Áudio guardado.');
    } catch (e) {
      ref.read(eventLogProvider.notifier).add('erro áudio', '$e');
    }
  }

  void _choose(String id, String label) {
    setState(() => _reason = id);
    ref.read(speakerProvider).say(label);
  }

  /// "Outro" exige ao menos o áudio explicando.
  bool get _canFinish => _reason != null && (_reason != 'other' || _audioPath != null);

  void _finish() {
    final outcome = widget.kind == ReasonKind.problem ? Outcome.problem : Outcome.blocked;
    ref.read(sessionProvider.notifier).answer(
          order.id,
          Answer(
            itemId: item.id,
            outcome: outcome,
            at: DateTime.now(),
            reason: _reason,
            photoPath: _photoPath,
            audioPath: _audioPath,
          ),
        );
    ref.read(eventLogProvider.notifier).add('resposta', '${item.id}: ${outcome.name} ($_reason)');
    OrderFlow.goNext(context, order, widget.index);
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.kind == ReasonKind.problem ? ZeloColors.problem : ZeloColors.blocked;
    return ZeloScaffold(
      title: Icon(widget.kind == ReasonKind.problem ? Icons.warning : Icons.disabled_by_default, color: accent, size: 40),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(alignment: Alignment.centerRight, child: AudioButton(text: _prompt)),
          const SizedBox(height: 12),
          Expanded(
            child: GridView.count(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.25,
              children: [
                for (final (id, icon, label) in reasons)
                  Semantics(
                    button: true,
                    selected: _reason == id,
                    label: label,
                    child: Material(
                      color: _reason == id ? accent.withValues(alpha: 0.25) : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(color: _reason == id ? accent : Colors.black26, width: _reason == id ? 5 : 2),
                      ),
                      child: InkWell(
                        key: Key('reason-$id'),
                        borderRadius: BorderRadius.circular(16),
                        onTap: () => _choose(id, label),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(icon, size: 56, color: ZeloColors.ink),
                              const SizedBox(height: 4),
                              Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 16)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MediaButton(
                  icon: Icons.photo_camera,
                  done: _photoPath != null,
                  label: 'Tirar foto',
                  onTap: _takePhoto,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                // Segurar para falar.
                child: GestureDetector(
                  onLongPressStart: (_) => _startRecording(),
                  onLongPressEnd: (_) => _stopRecording(),
                  child: _MediaButton(
                    icon: _recording ? Icons.fiber_manual_record : Icons.mic,
                    done: _audioPath != null,
                    recording: _recording,
                    label: 'Segure para gravar áudio',
                    onTap: () => ref.read(speakerProvider).say('Segure o botão enquanto fala.'),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      bottom: BigActionButton(
        key: const Key('reason-done'),
        label: 'Pronto',
        icon: Icons.check_circle,
        color: ZeloColors.ok,
        onPressed: _canFinish ? _finish : null,
      ),
    );
  }
}

class _MediaButton extends StatelessWidget {
  const _MediaButton({required this.icon, required this.done, required this.label, required this.onTap, this.recording = false});

  final IconData icon;
  final bool done;
  final bool recording;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: recording ? const Color(0xFFFFCDD2) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: recording ? ZeloColors.overdue : Colors.black26, width: 3),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: SizedBox(
            height: 88,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(icon, size: 56, color: recording ? ZeloColors.overdue : ZeloColors.ink),
                if (done)
                  const Positioned(right: 8, top: 8, child: Icon(Icons.check_circle, color: ZeloColors.ok, size: 32)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
