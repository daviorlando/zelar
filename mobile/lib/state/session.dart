import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/workers_repo.dart';
import '../domain/models.dart';
import 'outbox.dart';

/// Bloqueio do PIN visual após cinco erros (critério de aceite 19).
const maxPinAttempts = 5;

class SessionState {
  const SessionState({
    this.worker,
    this.failedAttempts = 0,
    this.answers = const {},
    this.finished = const {},
    this.sync = SyncState.savedLocal,
  });

  final Worker? worker;
  final int failedAttempts;

  /// orderId -> itemId -> resposta.
  final Map<String, Map<String, Answer>> answers;
  final Set<String> finished;
  final SyncState sync;

  bool get locked => failedAttempts >= maxPinAttempts;

  Map<String, Answer> answersFor(String orderId) => answers[orderId] ?? const {};

  SessionState copyWith({
    Worker? worker,
    bool clearWorker = false,
    int? failedAttempts,
    Map<String, Map<String, Answer>>? answers,
    Set<String>? finished,
    SyncState? sync,
  }) {
    return SessionState(
      worker: clearWorker ? null : (worker ?? this.worker),
      failedAttempts: failedAttempts ?? this.failedAttempts,
      answers: answers ?? this.answers,
      finished: finished ?? this.finished,
      sync: sync ?? this.sync,
    );
  }
}

class SessionNotifier extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState();

  /// Confere as figuras de quem tocou a própria foto. Devolve true quando entra.
  bool tryPin(Worker worker, List<int> pin) {
    if (state.locked || !worker.active) return false;
    final ok = pin.length == worker.pin.length && List.generate(pin.length, (i) => pin[i] == worker.pin[i]).every((m) => m);
    state = ok
        ? state.copyWith(worker: worker, failedAttempts: 0)
        : state.copyWith(failedAttempts: state.failedAttempts + 1);
    return ok;
  }

  /// Crachá entra direto (decisão do solicitante). Código aleatório de 256 bits não se
  /// adivinha, então crachá errado não conta para o bloqueio das figuras.
  /// Crachá antigo (trocado no painel) ou de funcionário desativado não entra.
  Worker? tryBadge(String qr) {
    final hash = badgeHashOf(qr);
    if (hash == null) return null;
    final worker = ref.read(workersProvider).where((w) => w.active && w.badgeHash == hash).firstOrNull;
    if (worker != null) state = state.copyWith(worker: worker);
    return worker;
  }

  void logout() => state = state.copyWith(clearWorker: true);

  /// Com painel configurado, cada mudança vira operação na fila de envio.
  OutboxNotifier? get _outbox => WorkersRepo.configured && state.worker != null ? ref.read(outboxProvider.notifier) : null;

  void answer(String orderId, Answer answer) {
    final order = {...state.answersFor(orderId), answer.itemId: answer};
    state = state.copyWith(answers: {...state.answers, orderId: order}, sync: SyncState.savedLocal);
    final help = answer.outcome == Outcome.help;
    unawaited(_outbox?.addAnswer(
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
    );
    unawaited(_outbox?.add(OutboxOp(
      opId: newOpId(),
      workerId: state.worker!.id,
      type: 'clear',
      payload: {'orderId': orderId, 'itemId': itemId},
      createdAt: DateTime.now(),
    )));
  }

  void finish(String orderId) {
    state = state.copyWith(finished: {...state.finished, orderId});
    unawaited(_outbox?.add(OutboxOp(
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
  void reset() => state = const SessionState();
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
