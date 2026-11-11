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
  static const _key = 'zelar_device_token';
  /// Onde o token ficava antes da troca de nome. Celulares já ativados não pedem código de novo.
  static const _oldKey = 'zelo_device_token';
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read() async {
    final token = await _storage.read(key: _key);
    if (token != null) return token;
    final old = await _storage.read(key: _oldKey);
    if (old != null) {
      await _storage.write(key: _key, value: old);
      await _storage.delete(key: _oldKey);
    }
    return old;
  }

  @override
  Future<void> write(String token) => _storage.write(key: _key, value: token);
}

/// O painel recusou o token: celular revogado ou empresa desativada.
class DeviceRefused implements Exception {
  const DeviceRefused();
}

/// Por que a ligação não deu certo. Null quando deu.
/// invalid: código errado ou vencido; wrongLogin: email ou senha do gestor errados;
/// notManager: a conta não é de gestor de empresa ativa; tooMany: o painel pediu para esperar.
enum ActivationError { invalid, wrongLogin, notManager, tooMany, offline }

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

  /// Liga o celular pelo login do gestor (email e senha do painel) ou por um código do painel.
  Future<ActivationError?> activate({String? code, String? email, String? password, http.Client? client}) async {
    final c = client ?? http.Client();
    final byLogin = email != null;
    try {
      final body = byLogin ? {'email': email.trim(), 'password': password ?? ''} : {'code': code ?? ''};
      final res = await c
          .post(Uri.parse('${WorkersRepo.api}/api/mobile/activate'), headers: {'content-type': 'application/json'}, body: jsonEncode(body))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode == 429) return ActivationError.tooMany;
      if (res.statusCode != 200) {
        if (!byLogin) return ActivationError.invalid;
        final message = _errorOf(res);
        return message.contains('gestor') || message.contains('desativada') ? ActivationError.notManager : ActivationError.wrongLogin;
      }
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

  static String _errorOf(http.Response res) {
    try {
      return ((jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>)['error'] as String?) ?? '';
    } catch (_) {
      return '';
    }
  }
}

final deviceProvider = NotifierProvider<DeviceNotifier, bool>(DeviceNotifier.new);
