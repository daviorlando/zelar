import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../domain/models.dart';
import '../state/device.dart';
import 'fixtures.dart';

/// Funcionários cadastrados no painel do gestor. A lista e as fotos ficam no celular
/// para entrar sem internet; atualiza ao abrir o app quando houver conexão.
///
/// O endereço vem do build: `flutter run --dart-define=ZELO_API=http://192.168.0.10:3000`.
/// O token vem da ativação, por aparelho (state/device.dart). ZELO_DEVICE_KEY é a chave
/// única antiga, ainda aceita pelo painel. Sem endereço, usa o trabalhador de teste,
/// e o build de produção se recusa a abrir (app.dart).
class WorkersRepo {
  static const _api = String.fromEnvironment('ZELO_API');
  static const _deviceKey = String.fromEnvironment('ZELO_DEVICE_KEY');

  /// Testes da fila de envio apontam para um painel falso.
  @visibleForTesting
  static ({String api, String key})? override;

  static String get api => override?.api ?? _api;
  static String get deviceKey => override?.key ?? _deviceKey;

  /// Token deste aparelho, depois de ativado.
  static String? deviceToken;

  static Map<String, String> get headers => deviceToken != null ? {'x-device-token': deviceToken!} : {'x-device-key': deviceKey};
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

  /// Grava a lista antes de buscar as fotos: foto lenta ou que falhou não pode impedir
  /// o funcionário novo de aparecer. Quem ainda não tem foto baixada fica com a inicial.
  Future<({List<Worker> workers, List<Map<String, dynamic>> raw})> download() async {
    final res = await http.get(Uri.parse('$api/api/mobile/workers'), headers: headers).timeout(const Duration(seconds: 15));
    if (res.statusCode == 401 && deviceToken != null) throw const DeviceRefused();
    if (res.statusCode != 200) throw HttpException('painel respondeu ${res.statusCode}');
    final dir = await _dir();
    final raw = ((jsonDecode(res.body) as Map<String, dynamic>)['workers'] as List).cast<Map<String, dynamic>>();

    final saved = <Map<String, dynamic>>[];
    for (final item in raw) {
      final file = _photoFile(dir, item['photoPath'] as String?);
      saved.add({...item, 'localPhoto': file != null && await file.exists() ? file.path : null}..remove('photoUrl'));
    }
    await _save(dir, saved);
    return (workers: [for (final j in saved) Worker.fromJson(j)], raw: raw);
  }

  /// Baixa as fotos que faltam, uma falha não atrapalha as outras, e apaga as que saíram da lista.
  Future<List<Worker>> fetchPhotos(List<Map<String, dynamic>> raw) async {
    final dir = await _dir();
    final saved = <Map<String, dynamic>>[];
    final used = <String>{};
    for (final item in raw) {
      final file = _photoFile(dir, item['photoPath'] as String?);
      final url = item['photoUrl'] as String?;
      if (file != null) {
        used.add(file.path);
        if (url != null && !await file.exists()) {
          try {
            final photo = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 30));
            if (photo.statusCode == 200) await file.writeAsBytes(photo.bodyBytes);
          } catch (e) {
            debugPrint('foto não baixada: $e');
          }
        }
      }
      saved.add({...item, 'localPhoto': file != null && await file.exists() ? file.path : null}..remove('photoUrl'));
    }
    await _save(dir, saved);
    await for (final f in dir.list()) {
      if (f is File && f.path.endsWith('.jpg') && !used.contains(f.path)) await f.delete().catchError((_) => f);
    }
    return [for (final j in saved) Worker.fromJson(j)];
  }

  /// O caminho muda a cada troca de foto no painel: nome do arquivo pelo hash dele.
  File? _photoFile(Directory dir, String? photoPath) =>
      photoPath == null ? null : File('${dir.path}/${sha256.convert(utf8.encode(photoPath)).toString().substring(0, 16)}.jpg');

  Future<void> _save(Directory dir, List<Map<String, dynamic>> saved) async {
    final file = File('${dir.path}/lista.json');
    final tmp = File('${file.path}.tmp');
    await tmp.writeAsString(jsonEncode(saved));
    await tmp.rename(file.path);
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
  var _refreshing = false;

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
    if (!WorkersRepo.configured || _refreshing) return;
    _refreshing = true;
    try {
      final list = await _repo.download();
      state = list.workers;
      lastError = null;
      state = await _repo.fetchPhotos(list.raw);
    } on DeviceRefused {
      ref.read(deviceProvider.notifier).refused();
    } catch (e) {
      lastError = '$e';
      debugPrint('sem atualização de funcionários: $e');
    } finally {
      _refreshing = false;
    }
  }
}

final workersProvider = NotifierProvider<WorkersNotifier, List<Worker>>(WorkersNotifier.new);
