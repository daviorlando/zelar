import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../data/workers_repo.dart';

/// Uma operação esperando envio (escopo, seção 8.2). Gravada em arquivo antes de
/// qualquer tentativa: fechar o app, reiniciar o celular ou ficar sem internet não perde nada.
class OutboxOp {
  OutboxOp({
    required this.opId,
    required this.workerId,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.dependsOn,
    this.rejected = false,
    this.reason,
    this.rejectedAt,
  });

  /// Gerado no celular; o servidor usa para não aplicar duas vezes.
  final String opId;
  final String workerId;

  /// answer, clear, finish ou media.
  final String type;
  final Map<String, dynamic> payload;
  final DateTime createdAt;

  /// Mídia só sobe depois de a resposta dela ter sido aceita.
  final String? dependsOn;
  bool rejected;
  String? reason;

  /// Quando foi recusada: passado [OutboxNotifier.dropRejectedAfter], sai da fila sozinha.
  DateTime? rejectedAt;

  bool get isMedia => type == 'media';

  Map<String, dynamic> toJson() => {
        'opId': opId,
        'workerId': workerId,
        'type': type,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
        'dependsOn': dependsOn,
        'rejected': rejected,
        'reason': reason,
        'rejectedAt': rejectedAt?.toIso8601String(),
      };

  factory OutboxOp.fromJson(Map<String, dynamic> j) => OutboxOp(
        opId: j['opId'] as String,
        workerId: j['workerId'] as String,
        type: j['type'] as String,
        payload: (j['payload'] as Map).cast<String, dynamic>(),
        createdAt: DateTime.parse(j['createdAt'] as String),
        dependsOn: j['dependsOn'] as String?,
        rejected: j['rejected'] as bool? ?? false,
        reason: j['reason'] as String?,
        rejectedAt: j['rejectedAt'] == null ? null : DateTime.parse(j['rejectedAt'] as String),
      );

  /// O que vai no lote de `POST /api/mobile/sync`.
  Map<String, dynamic> toWire() => {'opId': opId, 'type': type, ...payload};
}

final _random = Random.secure();

/// 128 bits aleatórios em hexadecimal: único sem depender de relógio nem de servidor.
String newOpId() => List.generate(16, (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();

class OutboxNotifier extends Notifier<List<OutboxOp>> {
  /// Trocáveis nos testes (sem plugins de plataforma).
  static Future<Directory> Function() directory = () async {
    final dir = Directory('${(await getApplicationDocumentsDirectory()).path}/envio');
    await dir.create(recursive: true);
    return dir;
  };
  static http.Client Function() client = http.Client.new;

  static const batchSize = 50;

  /// Pendência mais velha que isto vira "Precisa de atenção".
  static const attentionAfter = Duration(hours: 24);

  /// Recusada não é enviada de novo e o painel guarda a recusa (sync_op): o gestor já tem
  /// o registro. Depois deste prazo ela sai da fila com a foto e o áudio, e o aviso
  /// "Chame o gestor" apaga. Sem isso o aviso e os arquivos ficavam para sempre, porque
  /// "Descartar recusadas" só existe na tela do facilitador, que não abre em produção.
  static const dropRejectedAfter = Duration(days: 7);

  String? lastError;
  DateTime? lastSent;
  var _flushing = false;
  var _flushAgain = false;
  Future<void> _writing = Future.value();

  /// Mídias cuja cópia para a pasta da fila ainda não terminou: não sobem pela metade.
  final _copying = <String>{};

  /// Sobe a cada lote que o servidor respondeu. Quem baixa as ordens confere este
  /// número: um download iniciado antes do envio não traz a resposta recém-enviada.
  int delivered = 0;

  @override
  List<OutboxOp> build() => const [];

  bool get needsAttention =>
      state.any((o) => o.rejected) || state.any((o) => DateTime.now().difference(o.createdAt) > attentionAfter);

  int get pending => state.where((o) => !o.rejected).length;

  /// Pasta da fila, guardada na primeira leitura ([load], ao abrir o app): depois disso,
  /// responder não espera o sistema de arquivos para a resposta entrar na fila.
  String? _dir;
  Future<String> _folder() async => _dir ??= (await directory()).path;

  Future<File> _file() async => File('${await _folder()}/fila.json');

  Future<void> load() async {
    try {
      final file = await _file();
      if (!await file.exists()) return;
      final list = jsonDecode(await file.readAsString()) as List;
      state = [for (final j in list) OutboxOp.fromJson((j as Map).cast<String, dynamic>())];
    } catch (e) {
      debugPrint('fila de envio ilegível: $e');
    }
  }

  /// Grava em arquivo temporário e troca: um corte de energia não deixa o arquivo pela metade.
  /// Uma gravação por vez, na ordem. A que falhar (disco cheio) devolve o erro a quem a
  /// espera, mas não derruba as seguintes: cada uma leva a fila inteira e tenta de novo.
  Future<void> _save() {
    final snapshot = jsonEncode([for (final o in state) o.toJson()]);
    final write = _writing.then((_) async {
      final file = await _file();
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(snapshot, flush: true);
      await tmp.rename(file.path);
    });
    _writing = write.then((_) {}, onError: (_) {});
    return write;
  }

  Future<void> add(OutboxOp op) async {
    state = [...state, op];
    await _save();
  }

  /// Resposta de um item, com foto e áudio (copiados para a pasta da fila).
  Future<void> addAnswer({
    required String workerId,
    required String orderId,
    required String itemId,
    required String result,
    double? value,
    String? reason,
    required DateTime at,
    String? photoPath,
    String? audioPath,
  }) async {
    final opId = newOpId();
    final dir = '${_dir ?? await _folder()}/midia';
    // Resposta e mídias entram na fila juntas, numa gravação só, com o destino da cópia
    // já escolhido: o app morrer no meio não deixa a resposta subir sem a foto. Se a
    // cópia não chegar a terminar, o envio acha o arquivo faltando e pede atenção.
    // A cópia vem depois: uma atualização das ordens no meio dela já vê esta resposta.
    final media = <(OutboxOp, String)>[
      for (final (kind, path) in [('photo', photoPath), ('audio', audioPath)])
        if (path != null && File(path).existsSync())
          (
            OutboxOp(
              opId: newOpId(),
              workerId: workerId,
              type: 'media',
              payload: {'itemId': itemId, 'kind': kind, 'path': '$dir/${newOpId()}${path.contains('.') ? path.substring(path.lastIndexOf('.')) : ''}'},
              createdAt: DateTime.now(),
              dependsOn: opId,
            ),
            path,
          ),
    ];
    state = [
      ...state,
      OutboxOp(
        opId: opId,
        workerId: workerId,
        type: 'answer',
        payload: {
          'orderId': orderId,
          'itemId': itemId,
          'result': result,
          'value': value,
          'reason': reason,
          'deviceTime': at.toUtc().toIso8601String(),
        },
        createdAt: DateTime.now(),
      ),
      for (final (op, _) in media) op,
    ];
    _copying.addAll([for (final (op, _) in media) op.opId]);
    try {
      await _save();
      for (final (op, source) in media) {
        await _keep(source, op.payload['path'] as String);
      }
    } finally {
      _copying.removeAll([for (final (op, _) in media) op.opId]);
    }
  }

  /// Foto e áudio ficam no cache, que o Android pode limpar: copia para a pasta da fila e
  /// apaga a origem. Copia com outro nome e troca: arquivo pela metade nunca sobe.
  Future<void> _keep(String source, String target) async {
    try {
      await Directory(File(target).parent.path).create(recursive: true);
      await File(source).copy('$target.tmp');
      await File('$target.tmp').rename(target);
      await File(source).delete();
    } catch (e) {
      debugPrint('não guardou a mídia: $e');
    }
  }

  /// Desfazer: a foto e o áudio ainda não enviados daquele item saem da fila. Senão o
  /// painel mostraria o item sem resposta (ou "ok", depois) com a foto do problema.
  Future<void> addClear({required String workerId, required String orderId, required String itemId}) async {
    final media = state.where((o) => o.isMedia && o.payload['itemId'] == itemId && !_copying.contains(o.opId)).toList();
    state = [
      for (final o in state)
        if (!media.contains(o)) o,
      OutboxOp(
        opId: newOpId(),
        workerId: workerId,
        type: 'clear',
        payload: {'orderId': orderId, 'itemId': itemId},
        createdAt: DateTime.now(),
      ),
    ];
    await _save();
    _deleteFiles(media);
  }

  void _deleteFiles(Iterable<OutboxOp> ops) {
    for (final o in ops.where((o) => o.isMedia)) {
      File(o.payload['path'] as String).delete().ignore();
    }
  }

  /// Envia o que der. Aceita ou repetida sai da fila; recusada fica marcada (atenção);
  /// falha de rede para tudo e tenta de novo na próxima vez.
  Future<void> flush() async {
    if (!WorkersRepo.configured || state.isEmpty) return;
    if (_flushing) {
      // Resposta dada no meio de um envio: sai logo depois dele, sem esperar o próximo ciclo.
      _flushAgain = true;
      return;
    }
    _flushing = true;
    final c = client();
    try {
      do {
        _flushAgain = false;
        await _sendOps(c);
        await _sendMedia(c);
      } while (_flushAgain);
      lastError = null;
      lastSent = DateTime.now();
    } catch (e) {
      lastError = '$e';
      debugPrint('envio interrompido: $e');
    } finally {
      c.close();
      _flushing = false;
      final now = DateTime.now();
      final old = state.where((o) => o.rejected && now.difference(o.rejectedAt ?? o.createdAt) > dropRejectedAfter).toList();
      state = state.where((o) => !old.contains(o)).toList();
      // Só confirma o que saiu da fila; se falhar, a próxima gravação leva tudo de novo.
      // Não pode impedir quem chamou de baixar as ordens.
      try {
        await _save();
        _deleteFiles(old);
      } catch (e) {
        debugPrint('fila de envio não gravada: $e');
      }
    }
  }

  Future<void> _sendOps(http.Client c) async {
    while (true) {
      final next = state.where((o) => !o.rejected && !o.isMedia).toList();
      if (next.isEmpty) return;
      // Um lote por funcionário: o servidor confere os setores de quem respondeu.
      // Só a sequência seguida dele: pular a vez de outro no mesmo celular mudaria a ordem
      // (o "concluir" de um chegaria antes da resposta do colega, recusada como finalizada).
      final worker = next.first.workerId;
      final batch = next.takeWhile((o) => o.workerId == worker).take(batchSize).toList();
      final res = await c
          .post(
            Uri.parse('${WorkersRepo.api}/api/mobile/sync'),
            headers: {...WorkersRepo.headers, 'content-type': 'application/json'},
            body: jsonEncode({'workerId': worker, 'ops': [for (final o in batch) o.toWire()]}),
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode == 403) {
        // Funcionário de outra empresa ou apagado: nada do lote entra. Fica para o gestor resolver.
        // (Desativado vem como 200, cada operação recusada e guardada no painel.)
        _reject(batch.map((o) => o.opId).toSet(), 'funcionário desativado');
        continue;
      }
      if (res.statusCode != 200) throw HttpException('painel respondeu ${res.statusCode}');
      final results = ((jsonDecode(res.body) as Map)['results'] as List).cast<Map<String, dynamic>>();
      final done = <String>{};
      final refused = <String, String?>{};
      for (final r in results) {
        if (r['status'] == 'rejected') {
          refused[r['opId'] as String] = r['reason'] as String?;
        } else {
          done.add(r['opId'] as String);
        }
      }
      delivered++;
      state = state.where((o) => !done.contains(o.opId)).toList();
      for (final MapEntry(key: id, value: why) in refused.entries) {
        _reject({id}, why);
      }
      if (done.isEmpty && refused.isEmpty) throw const HttpException('resposta sem resultados');
    }
  }

  /// Recusa a operação e as mídias que dependiam dela.
  void _reject(Set<String> ids, String? why) {
    state = [
      for (final o in state)
        if (ids.contains(o.opId) || ids.contains(o.dependsOn))
          (o
            ..rejected = true
            ..reason = why
            ..rejectedAt = DateTime.now())
        else
          o,
    ];
  }

  Future<void> _sendMedia(http.Client c) async {
    final waiting = state.where((o) => !o.rejected && !o.isMedia).map((o) => o.opId).toSet();
    final ready = state.where((o) => o.isMedia && !o.rejected && !waiting.contains(o.dependsOn) && !_copying.contains(o.opId));
    for (final op in ready.toList()) {
      final file = File(op.payload['path'] as String);
      if (!await file.exists()) {
        _reject({op.opId}, 'arquivo sumiu do celular');
        continue;
      }
      final req = http.MultipartRequest('POST', Uri.parse('${WorkersRepo.api}/api/mobile/media'))
        ..headers.addAll(WorkersRepo.headers)
        ..fields['workerId'] = op.workerId
        ..fields['itemId'] = op.payload['itemId'] as String
        ..fields['kind'] = op.payload['kind'] as String
        ..files.add(await http.MultipartFile.fromPath('file', file.path));
      final res = await http.Response.fromStream(await c.send(req).timeout(const Duration(seconds: 60)));
      if (res.statusCode == 200) {
        state = state.where((o) => o.opId != op.opId).toList();
        await file.delete().catchError((_) => file);
      } else if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode != 401) {
        _reject({op.opId}, 'mídia recusada (${res.statusCode})');
      } else {
        throw HttpException('mídia: painel respondeu ${res.statusCode}');
      }
    }
  }

  /// Facilitador: tira da fila o que o servidor recusou (depois de anotar com o gestor).
  Future<void> discardRejected() async {
    final rejected = state.where((o) => o.rejected).toList();
    state = state.where((o) => !o.rejected).toList();
    await _save();
    _deleteFiles(rejected);
  }
}

final outboxProvider = NotifierProvider<OutboxNotifier, List<OutboxOp>>(OutboxNotifier.new);
