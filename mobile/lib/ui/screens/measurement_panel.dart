import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../audio/phrases.dart';
import '../../audio/speaker.dart';
import '../../domain/models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Medição: teclado numérico grande, unidade em símbolo e áudio, faixa verde/amarela/vermelha
/// (só quando o plano tem limites).
/// Valor fora da faixa gera aviso falado, nunca bloqueio (escopo, seção 5).
class MeasurementPanel extends ConsumerStatefulWidget {
  const MeasurementPanel({super.key, required this.measurement, required this.onConfirm, required this.onHelp, required this.onSkip});

  final Measurement measurement;
  final void Function(double value, bool outOfRange) onConfirm;
  final VoidCallback onHelp;
  final VoidCallback onSkip;

  @override
  ConsumerState<MeasurementPanel> createState() => _MeasurementPanelState();
}

class _MeasurementPanelState extends ConsumerState<MeasurementPanel> {
  var _text = '';
  var _warned = false;

  double? get _value => double.tryParse(_text.replaceAll(',', '.'));

  void _key(String k) {
    setState(() {
      _warned = false;
      if (k == '⌫') {
        if (_text.isNotEmpty) _text = _text.substring(0, _text.length - 1);
      } else if (k == ',') {
        if (!_text.contains(',')) _text = _text.isEmpty ? '0,' : '$_text,';
      } else if (_text.length < 6) {
        _text += k;
      }
    });
  }

  void _confirm() {
    final value = _value;
    if (value == null) return;
    final m = widget.measurement;
    final level = m.classify(value);
    final spoken = Phrases.number(_text, m.spokenUnit);
    final speaker = ref.read(speakerProvider);
    // Primeiro toque fora da faixa só avisa; o segundo registra (sem bloquear).
    if (level == 2 && !_warned) {
      setState(() => _warned = true);
      speaker.say('$spoken. ${Phrases.outOfRange}');
      return;
    }
    if (level < 2) speaker.say('$spoken. ${!m.hasRange ? Phrases.noted : level == 0 ? Phrases.inRange : Phrases.nearLimit}');
    widget.onConfirm(value, level == 2);
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.measurement;
    final value = _value;
    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          GestureDetector(
            onTap: () => ref.read(speakerProvider).say(_text.isEmpty ? Phrases.typeNumberFirst : Phrases.number(_text, m.spokenUnit)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: _warned ? ZelarColors.overdue : Colors.black26, width: 3),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _text.isEmpty ? '—' : _text,
                      key: const Key('measure-value'),
                      style: const TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text(m.symbol, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
          // Sem limites do responsável técnico não há faixa: o app só anota o número.
          if (m.hasRange) ...[const SizedBox(height: 8), RangeBar(measurement: m, value: value)],
          const SizedBox(height: 8),
          Expanded(
            child: Column(
              children: [
                for (final row in const [
                  ['1', '2', '3'],
                  ['4', '5', '6'],
                  ['7', '8', '9'],
                  [',', '0', '⌫'],
                ])
                  Expanded(
                    child: Row(
                      // Tecla da altura da linha: sem vão morto para quem usa luva.
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (final k in row)
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.all(3),
                              child: FilledButton.tonal(
                                key: Key('key-$k'),
                                style: FilledButton.styleFrom(
                                minimumSize: Size.zero,
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                  padding: EdgeInsets.zero,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  textStyle: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700),
                                ),
                                onPressed: () => _key(k),
                                child: k == '⌫' ? const Icon(Icons.backspace, size: 32) : Text(k),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Três na mesma linha: uma linha a mais tiraria as teclas de um celular pequeno.
          Row(
            children: [
              Expanded(
                flex: 4,
                child: BigActionButton(
                  key: const Key('measure-help'),
                  label: 'Preciso de ajuda',
                  icon: Icons.support_agent,
                  stacked: true,
                  color: ZelarColors.blocked,
                  spokenHelp: Phrases.helpButton,
                  onPressed: widget.onHelp,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                flex: 4,
                child: BigActionButton(
                  key: const Key('answer-skip'),
                  label: 'Não sei',
                  icon: Icons.help,
                  stacked: true,
                  color: ZelarColors.skip,
                  spokenHelp: Phrases.skipButton,
                  onPressed: widget.onSkip,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                flex: 8,
                child: BigActionButton(
                  key: const Key('measure-confirm'),
                  label: 'Confirmar',
                  icon: Icons.check_circle,
                  compact: true,
                  oneLine: true,
                  color: ZelarColors.ok,
                  spokenHelp: Phrases.confirmButton,
                  disabledHint: Phrases.typeNumberFirst,
                  onPressed: value == null ? null : _confirm,
                ),
              ),
            ],
          ),
        ],
    );
  }
}

/// Faixa esperada: amarelo / verde / amarelo entre zonas vermelhas, com marcador do valor.
class RangeBar extends StatelessWidget {
  const RangeBar({super.key, required this.measurement, required this.value});

  final Measurement measurement;
  final double? value;

  @override
  Widget build(BuildContext context) {
    final m = measurement;
    // Só desenhada quando há limites (MeasurementPanel confere `hasRange`).
    final min = m.min!, max = m.max!;
    final lo = min - m.margin * 3;
    final hi = max + m.margin * 3;
    double pos(double v) => ((v - lo) / (hi - lo)).clamp(0.0, 1.0);

    return SizedBox(
      height: 32,
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth;
          Widget zone(double from, double to, Color c) => Positioned(
            left: pos(from) * w,
            width: (pos(to) - pos(from)) * w,
            top: 6,
            height: 20,
            child: ColoredBox(color: c),
          );
          return Stack(
            children: [
              zone(lo, hi, const Color(0xFFC62828)),
              zone(min - m.margin, max + m.margin, ZelarColors.problem),
              zone(min, max, const Color(0xFF2E7D32)),
              if (value != null)
                Positioned(
                  left: (pos(value!) * w - 6).clamp(0.0, w - 12),
                  top: 0,
                  width: 12,
                  height: 32,
                  child: const ColoredBox(color: ZelarColors.ink),
                ),
            ],
          );
        },
      ),
    );
  }
}
