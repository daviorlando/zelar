import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../data/workers_repo.dart';
import '../domain/models.dart';
import 'outbox.dart';

/// Bloqueio do PIN após cinco erros (critério de aceite 19). Por funcionário: errar o PIN de
/// um não tranca os colegas no mesmo celular.
const maxPinAttempts = 5;

/// O crachá continua entrando durante o bloqueio.
const pinLockFor = Duration(minutes: 15);

class SessionState {
  const SessionState({
    this.worker,
    this.pinFails = const {},
    this.lockedUntil = const {},
    this.answers = const {},
    this.finished = const {},
    this.changed = const {},
    this.sync = SyncState.savedLocal,
  });

  final Worker? worker;

  /// Erros seguidos e fim do bloqueio, por funcionário. Sobrevivem a sair e a reiniciar o app.
  final Map<String, int> pinFails;
  final Map<String, DateTime> lockedUntil;

  /// orderId -> itemId -> resposta.
  final Map<String, Map<String, Answer>> answers;
  final Set<String> finished;

  /// Ordens com alguma resposta mudada desde a última conclusão. Só se devolve o que foi
  /// concluído, então numa ordem devolvida isto diz se o funcionário corrigiu algo.
  /// Não sobrevive a reiniciar o app: no pior caso a confirmação ao concluir aparece à toa.
  final Set<String> changed;
  final SyncState sync;

  bool lockedFor(String workerId) => lockedUntil[workerId]?.isAfter(DateTime.now()) ?? false;

  Map<String, Answer> answersFor(String orderId) => answers[orderId] ?? const {};

  SessionState copyWith({
    Worker? worker,
    bool clearWorker = false,
    Map<String, int>? pinFails,
    Map<String, DateTime>? lockedUntil,
    Map<String, Map<String, Answer>>? answers,
    Set<String>? finished,
    Set<String>? changed,
    SyncState? sync,
  }) {
    return SessionState(
      worker: clearWorker ? null : (worker ?? this.worker),
      pinFails: pinFails ?? this.pinFails,
      lockedUntil: lockedUntil ?? this.lockedUntil,
      answers: answers ?? this.answers,
      finished: finished ?? this.finished,
      changed: changed ?? this.changed,
      sync: sync ?? this.sync,
    );
  }
}

class SessionNotifier extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState();

  /// Onde o bloqueio fica guardado. Testes não têm essa pasta: sem arquivo, vale só na memória.
  static Future<Directory> Function() directory = getApplicationDocumentsDirectory;

  Future<File> _locksFile() async => File('${(await directory()).path}/bloqueio_pin.json');

  /// Ao abrir o app. Reiniciar o celular não pode zerar as tentativas.
  Future<void> loadPinLocks() async {
    if (!WorkersRepo.configured) return;
    try {
      final file = await _locksFile();
      if (!await file.exists()) return;
      final saved = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      state = state.copyWith(
        pinFails: (saved['fails'] as Map<String, dynamic>).map((k, v) => MapEntry(k, v as int)),
        lockedUntil: (saved['until'] as Map<String, dynamic>).map((k, v) => MapEntry(k, DateTime.parse(v as String))),
      );
    } catch (e) {
      debugPrint('bloqueio do PIN ilegível: $e');
    }
  }

  Future<void> _saveLocks() async {
    if (!WorkersRepo.configured) return;
    try {
      await (await _locksFile()).writeAsString(jsonEncode({
        'fails': state.pinFails,
        'until': state.lockedUntil.map((k, v) => MapEntry(k, v.toIso8601String())),
      }));
    } catch (e) {
      debugPrint('não guardou o bloqueio do PIN: $e');
    }
  }

  /// Confere o PIN de quem tocou a própria foto. Devolve true quando entra.
  bool tryPin(Worker worker, List<int> pin) {
    if (state.lockedFor(worker.id) || !worker.active) return false;
    final ok = pinHashOf(worker.id, pin) == worker.pinHash;
    final fails = {...state.pinFails};
    final until = {...state.lockedUntil};
    if (ok) {
      fails.remove(worker.id);
      until.remove(worker.id);
      state = state.copyWith(worker: worker, pinFails: fails, lockedUntil: until);
    } else {
      // O bloqueio anterior já venceu (senão nem chegaria aqui): a contagem recomeça.
      final count = (until.containsKey(worker.id) ? 0 : fails[worker.id] ?? 0) + 1;
      until.remove(worker.id);
      fails[worker.id] = count;
      if (count >= maxPinAttempts) {
        until[worker.id] = DateTime.now().add(pinLockFor);
        fails.remove(worker.id);
      }
      state = state.copyWith(pinFails: fails, lockedUntil: until);
    }
    unawaited(_saveLocks());
    return ok;
  }

  /// Crachá entra direto (decisão do solicitante). Código aleatório de 256 bits não se
  /// adivinha, então crachá errado não conta para o bloqueio do PIN.
  /// Crachá antigo (trocado no painel) ou de funcionário desativado não entra.
  Worker? tryBadge(String qr) {
    final hash = badgeHashOf(qr);
    if (hash == null) return null;
    final worker = ref.read(workersProvider).where((w) => w.active && w.badgeHash == hash).firstOrNull;
    if (worker != null) state = state.copyWith(worker: worker);
    return worker;
  }

  /// Sai e não deixa respostas na tela de quem entrar depois. O que ainda não foi
  /// enviado continua na fila do celular, em nome de quem respondeu.
  /// O bloqueio do PIN fica: sair e entrar de novo não dá mais tentativas.
  void logout() => state = SessionState(pinFails: state.pinFails, lockedUntil: state.lockedUntil);

  /// Com painel configurado, cada mudança vira operação na fila de envio.
  OutboxNotifier? get _outbox => WorkersRepo.configured && state.worker != null ? ref.read(outboxProvider.notifier) : null;

  /// Depois de gravar na fila, já tenta enviar: o gestor vê a resposta na hora.
  /// Sem internet, a operação continua guardada e sai no próximo envio.
  void _sendAfter(OutboxNotifier? outbox, Future<void>? saved) {
    if (outbox != null && saved != null) unawaited(saved.then((_) => outbox.flush()));
  }

  void answer(String orderId, Answer answer) {
    final order = {...state.answersFor(orderId), answer.itemId: answer};
    state = state.copyWith(
      answers: {...state.answers, orderId: order},
      changed: {...state.changed, orderId},
      sync: SyncState.savedLocal,
    );
    final help = answer.outcome == Outcome.help;
    _sendAfter(_outbox, _outbox?.addAnswer(
      workerId: state.worker!.id,
      orderId: orderId,
      itemId: answer.itemId,
      result: help ? 'blocked' : answer.outcome.name,
      value: answer.value,
      reason: help ? 'need_help' : answer.reason,
      at: answer.at,
      photoPath: answer.photoPath,
      audioPath: answer.audioPath,
    ));
  }

  void undo(String orderId, String itemId) {
    final order = {...state.answersFor(orderId)}..remove(itemId);
    state = state.copyWith(
      answers: {...state.answers, orderId: order},
      finished: {...state.finished}..remove(orderId),
      changed: {...state.changed, orderId},
    );
    _sendAfter(_outbox, _outbox?.add(OutboxOp(
      opId: newOpId(),
      workerId: state.worker!.id,
      type: 'clear',
      payload: {'orderId': orderId, 'itemId': itemId},
      createdAt: DateTime.now(),
    )));
  }

  void finish(String orderId) {
    state = state.copyWith(finished: {...state.finished, orderId}, changed: {...state.changed}..remove(orderId));
    _sendAfter(_outbox, _outbox?.add(OutboxOp(
      opId: newOpId(),
      workerId: state.worker!.id,
      type: 'finish',
      payload: {'orderId': orderId, 'deviceTime': DateTime.now().toUtc().toIso8601String()},
      createdAt: DateTime.now(),
    )));
  }

  /// Ao baixar as ordens (ou abrir o app): o que o servidor já tem, mais o que ainda
  /// está na fila deste celular, na ordem em que foi feito.
  void restore(Map<String, Map<String, Answer>> server, List<OutboxOp> pending) {
    final answers = {for (final e in server.entries) e.key: {...e.value}};
    final finished = <String>{};
    for (final op in pending.where((o) => !o.rejected)) {
      final orderId = op.payload['orderId'] as String?;
      if (orderId == null) continue;
      final itemId = op.payload['itemId'] as String?;
      switch (op.type) {
        case 'answer':
          final result = op.payload['result'] as String;
          final reason = op.payload['reason'] as String?;
          (answers[orderId] ??= {})[itemId!] = Answer(
            itemId: itemId,
            outcome: result == 'blocked' && reason == 'need_help'
                ? Outcome.help
                : Outcome.values.firstWhere((o) => o.name == result, orElse: () => Outcome.blocked),
            at: DateTime.parse(op.payload['deviceTime'] as String).toLocal(),
            reason: reason == 'need_help' ? null : reason,
            value: (op.payload['value'] as num?)?.toDouble(),
          );
        case 'clear':
          answers[orderId]?.remove(itemId);
          finished.remove(orderId);
        case 'finish':
          finished.add(orderId);
      }
    }
    state = state.copyWith(answers: answers, finished: finished);
  }

  void setSync(SyncState sync) => state = state.copyWith(sync: sync);

  /// Facilitador: zera respostas e bloqueio para o próximo participante.
  void reset() {
    state = const SessionState();
    unawaited(_saveLocks());
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, SessionState>(SessionNotifier.new);

/// Registro do teste de uso: o facilitador vê tempos, erros e pedidos de ajuda.
class LogEvent {
  LogEvent(this.type, [this.detail = '']) : at = DateTime.now();

  final DateTime at;
  final String type;
  final String detail;
}

class EventLogNotifier extends Notifier<List<LogEvent>> {
  @override
  List<LogEvent> build() => const [];

  void add(String type, [String detail = '']) => state = [...state, LogEvent(type, detail)];

  void clear() => state = const [];
}

final eventLogProvider = NotifierProvider<EventLogNotifier, List<LogEvent>>(EventLogNotifier.new);
