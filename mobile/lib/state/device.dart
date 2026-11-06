import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../data/workers_repo.dart';

/// Onde o token do aparelho fica guardado. Testes trocam por uma versão em memória.
abstract class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
}

class SecureTokenStore implements TokenStore {
  static const _key = 'zelo_device_token';
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read() => _storage.read(key: _key);

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);
}

/// O painel recusou o token: celular revogado ou empresa desativada.
class DeviceRefused implements Exception {
  const DeviceRefused();
}

/// Resultado de digitar o código: null deu certo; senão, a fala do erro.
enum ActivationError { invalid, offline }

/// True quando o celular precisa de código: ainda sem token, ou com o token recusado.
/// A fila de envio não é tocada: o que estava guardado sai quando ele voltar a ter acesso.
class DeviceNotifier extends Notifier<bool> {
  static TokenStore store = SecureTokenStore();

  @override
  bool build() => false;

  /// O build antigo tem a chave compilada e não precisa de código.
  Future<void> load() async {
    if (!WorkersRepo.configured) return;
    try {
      WorkersRepo.deviceToken = await store.read();
    } catch (e) {
      debugPrint('não leu o token do aparelho: $e');
    }
    state = WorkersRepo.deviceToken == null && WorkersRepo.deviceKey.isEmpty;
  }

  void refused() => state = true;

  Future<ActivationError?> activate(String code, {http.Client? client}) async {
    final c = client ?? http.Client();
    try {
      final res = await c
          .post(Uri.parse('${WorkersRepo.api}/api/mobile/activate'), headers: {'content-type': 'application/json'}, body: jsonEncode({'code': code}))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return ActivationError.invalid;
      final token = (jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>)['token'] as String;
      await store.write(token);
      WorkersRepo.deviceToken = token;
      state = false;
      return null;
    } on SocketException {
      return ActivationError.offline;
    } on http.ClientException {
      return ActivationError.offline;
    } catch (e) {
      debugPrint('ativação falhou: $e');
      return ActivationError.offline;
    } finally {
      if (client == null) c.close();
    }
  }
}

final deviceProvider = NotifierProvider<DeviceNotifier, bool>(DeviceNotifier.new);
