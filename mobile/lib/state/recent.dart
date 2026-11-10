import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../data/workers_repo.dart';

/// Quantas fotos a entrada mostra de quem já usou este celular.
const recentWorkersMax = 6;

/// Quem já entrou neste celular, o mais recente primeiro. Vários funcionários se revezam no
/// mesmo aparelho: a foto deles fica na entrada, e quem volta toca nela e digita os números.
/// Guarda só os ids; nome e foto vêm da lista de funcionários, então desativado some sozinho.
class RecentWorkersNotifier extends Notifier<List<String>> {
  /// Testes não têm essa pasta: sem arquivo, vale só na memória.
  static Future<Directory> Function() directory = getApplicationDocumentsDirectory;

  @override
  List<String> build() => const [];

  Future<File> _file() async => File('${(await directory()).path}/quem_usa_este_celular.json');

  Future<void> load() async {
    if (!WorkersRepo.configured) return;
    try {
      final file = await _file();
      if (!await file.exists()) return;
      state = (jsonDecode(await file.readAsString()) as List<dynamic>).cast<String>();
    } catch (e) {
      debugPrint('lista de quem usa o celular ilegível: $e');
    }
  }

  /// Quem entrou vai para o começo da lista.
  void touch(String workerId) {
    state = [workerId, ...state.where((id) => id != workerId)].take(recentWorkersMax).toList();
    unawaited(_save());
  }

  Future<void> _save() async {
    if (!WorkersRepo.configured) return;
    try {
      await (await _file()).writeAsString(jsonEncode(state));
    } catch (e) {
      debugPrint('não guardou quem usa o celular: $e');
    }
  }
}

final recentWorkersProvider = NotifierProvider<RecentWorkersNotifier, List<String>>(RecentWorkersNotifier.new);
