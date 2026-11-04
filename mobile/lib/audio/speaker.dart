import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_tts/flutter_tts.dart';

/// Voz do aplicativo. No protótipo tudo é voz sintética pt-BR (provisória);
/// em produção as instruções usam gravação humana aprovada (escopo, seção 5).
class Speaker {
  Speaker() {
    _ready = _init();
  }

  final _tts = FlutterTts();
  late final Future<void> _ready;

  Future<void> _init() async {
    try {
      await _tts.setLanguage('pt-BR');
      await _tts.setSpeechRate(0.45);
      await _tts.awaitSpeakCompletion(false);
    } catch (e) {
      debugPrint('TTS indisponível: $e');
    }
  }

  Future<void> say(String text) async {
    await _ready;
    try {
      await _tts.stop();
      await _tts.speak(text);
    } catch (e) {
      debugPrint('TTS falhou: $e');
    }
  }

  Future<void> stop() async {
    try {
      await _tts.stop();
    } catch (_) {}
  }

  /// Verificação de prontidão: a voz pt-BR precisa estar instalada para uso offline.
  Future<bool?> ptBrInstalled() async {
    await _ready;
    try {
      final installed = await _tts.isLanguageInstalled('pt-BR');
      if (installed == true) return true;
      // O plugin compara o idioma exato, e o Samsung TTS informa "por-x-lvariant-f00":
      // a voz instalada parecia faltar. Por isso também se olha a lista de vozes.
      final voices = await _tts.getVoices;
      if (voices is List && temVozPtBrOffline(voices)) return true;
      return installed is bool ? installed : null;
    } catch (_) {
      return null;
    }
  }
}

/// Há voz pt-BR que funciona sem internet e não está marcada como "não instalada"?
/// O idioma vem no nome ou no campo locale, conforme o mecanismo de voz do aparelho.
bool temVozPtBrOffline(List<dynamic> vozes) {
  bool ptBr(Object? texto) => '$texto'.toLowerCase().replaceAll('_', '-').startsWith('pt-br');
  for (final voz in vozes) {
    if (voz is! Map) continue;
    if (!ptBr(voz['name']) && !ptBr(voz['locale'])) continue;
    if ('${voz['network_required']}' != '0') continue;
    if ('${voz['features']}'.contains('notInstalled')) continue;
    return true;
  }
  return false;
}

final speakerProvider = Provider<Speaker>((ref) => Speaker());
