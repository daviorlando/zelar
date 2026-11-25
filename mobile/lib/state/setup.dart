import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../data/workers_repo.dart';

/// O que o app pede ao Android. Só abre telas e lê o volume: nunca muda configuração.
class SystemSettings {
  static const _channel = MethodChannel('app.zelar.campo/sistema');

  Future<bool> openVoiceSettings() async {
    try {
      return await _channel.invokeMethod<bool>('abrirConfiguracoesDeVoz') ?? false;
    } catch (e) {
      debugPrint('não abriu as configurações de voz: $e');
      return false;
    }
  }

  /// Volume de mídia, que é o da voz do app. Nulo se não der para saber.
  Future<int?> mediaVolume() async {
    try {
      return await _channel.invokeMethod<int>('volumeDeMidia');
    } catch (_) {
      return null;
    }
  }
}

final systemSettingsProvider = Provider<SystemSettings>((ref) => SystemSettings());

/// Primeira inicialização: true enquanto o celular ainda não passou por ela.
class SetupNotifier extends Notifier<bool> {
  static Future<Directory> Function() directory = getApplicationDocumentsDirectory;

  @override
  bool build() => false;

  Future<File> _file() async => File('${(await directory()).path}/primeira_inicializacao_feita');

  /// Só com o painel configurado: a versão de demonstração vai direto para o teste de uso.
  Future<void> load() async {
    if (!WorkersRepo.configured) return;
    try {
      state = !await (await _file()).exists();
    } catch (e) {
      debugPrint('não leu a primeira inicialização: $e');
    }
  }

  Future<void> finish() async {
    state = false;
    try {
      await (await _file()).writeAsString(DateTime.now().toIso8601String());
    } catch (e) {
      debugPrint('não guardou a primeira inicialização: $e');
    }
  }
}

final setupProvider = NotifierProvider<SetupNotifier, bool>(SetupNotifier.new);

/// A primeira tela já foi decidida: a abertura pode sair, e a entrada pode falar.
class StartupNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void done() => state = true;
}

final startupProvider = NotifierProvider<StartupNotifier, bool>(StartupNotifier.new);
