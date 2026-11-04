import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../domain/models.dart';
import 'fixtures.dart';

/// Funcionários cadastrados no painel do gestor. A lista e as fotos ficam no celular
/// para entrar sem internet; atualiza ao abrir o app quando houver conexão.
///
/// Endereço e chave vêm do build:
/// `flutter run --dart-define=ZELO_API=http://192.168.0.10:3000 --dart-define=ZELO_DEVICE_KEY=...`
/// Sem endereço, usa o trabalhador de teste.
class WorkersRepo {
  static const _api = String.fromEnvironment('ZELO_API');
  static const _deviceKey = String.fromEnvironment('ZELO_DEVICE_KEY');

  /// Testes da fila de envio apontam para um painel falso.
  @visibleForTesting
  static ({String api, String key})? override;

  static String get api => override?.api ?? _api;
  static String get deviceKey => override?.key ?? _deviceKey;
  static bool get configured => api.isNotEmpty;

  Future<Directory> _dir() async {
    final dir = Directory('${(await getApplicationDocumentsDirectory()).path}/funcionarios');
    await dir.create(recursive: true);
    return dir;
  }

  Future<List<Worker>> loadCached() async {
    final file = File('${(await _dir()).path}/lista.json');
    if (!await file.exists()) return const [];
    final list = jsonDecode(await file.readAsString()) as List;
    return [for (final j in list) Worker.fromJson(j as Map<String, dynamic>)];
  }

  Future<List<Worker>> download() async {
    final res = await http
        .get(Uri.parse('$api/api/mobile/workers'), headers: {'x-device-key': deviceKey})
        .timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) throw HttpException('painel respondeu ${res.statusCode}');
    final dir = await _dir();
    final raw = (jsonDecode(res.body) as Map<String, dynamic>)['workers'] as List;

    final saved = <Map<String, dynamic>>[];
    for (final item in raw.cast<Map<String, dynamic>>()) {
      final photoPath = item['photoPath'] as String?;
      final photoUrl = item['photoUrl'] as String?;
      String? local;
      if (photoPath != null && photoUrl != null) {
        // O caminho muda a cada troca de foto no painel: nome do arquivo pelo hash dele.
        final name = sha256.convert(utf8.encode(photoPath)).toString().substring(0, 16);
        final file = File('${dir.path}/$name.jpg');
        if (!await file.exists()) {
          final photo = await http.get(Uri.parse(photoUrl)).timeout(const Duration(seconds: 30));
          if (photo.statusCode == 200) await file.writeAsBytes(photo.bodyBytes);
        }
        if (await file.exists()) local = file.path;
      }
      saved.add({...item, 'localPhoto': local}..remove('photoUrl'));
    }
    await File('${dir.path}/lista.json').writeAsString(jsonEncode(saved));
    return [for (final j in saved) Worker.fromJson(j)];
  }
}

/// Hash do crachá lido. Aceita só QR do Zelo (`zelo:cracha:<código>`).
String? badgeHashOf(String qr) {
  const prefix = 'zelo:cracha:';
  final text = qr.trim();
  if (!text.startsWith(prefix) || text.length == prefix.length) return null;
  return sha256.convert(utf8.encode(text.substring(prefix.length))).toString();
}

class WorkersNotifier extends Notifier<List<Worker>> {
  final _repo = WorkersRepo();

  /// Último erro ao atualizar (mostrado só na tela do facilitador).
  String? lastError;

  @override
  List<Worker> build() => WorkersRepo.configured ? const [] : const [demoWorker];

  Future<void> load() async {
    if (!WorkersRepo.configured) return;
    try {
      final cached = await _repo.loadCached();
      if (cached.isNotEmpty) state = cached;
    } catch (e) {
      debugPrint('lista de funcionários ilegível: $e');
    }
    await refresh();
  }

  /// Sem internet, continua com a lista guardada.
  Future<void> refresh() async {
    if (!WorkersRepo.configured) return;
    try {
      state = await _repo.download();
      lastError = null;
    } catch (e) {
      lastError = '$e';
      debugPrint('sem atualização de funcionários: $e');
    }
  }
}

final workersProvider = NotifierProvider<WorkersNotifier, List<Worker>>(WorkersNotifier.new);
