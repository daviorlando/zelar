import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/fixtures.dart';
import '../domain/models.dart';

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

  /// Confere o PIN visual. Devolve true quando entra.
  bool tryPin(List<int> pin) {
    if (state.locked) return false;
    final ok = pin.length == demoWorker.pin.length &&
        List.generate(pin.length, (i) => pin[i] == demoWorker.pin[i]).every((m) => m);
    state = ok
        ? state.copyWith(worker: demoWorker, failedAttempts: 0)
        : state.copyWith(failedAttempts: state.failedAttempts + 1);
    return ok;
  }

  void logout() => state = state.copyWith(clearWorker: true);

  void answer(String orderId, Answer answer) {
    final order = {...state.answersFor(orderId), answer.itemId: answer};
    state = state.copyWith(answers: {...state.answers, orderId: order}, sync: SyncState.savedLocal);
  }

  void undo(String orderId, String itemId) {
    final order = {...state.answersFor(orderId)}..remove(itemId);
    state = state.copyWith(
      answers: {...state.answers, orderId: order},
      finished: {...state.finished}..remove(orderId),
    );
  }

  void finish(String orderId) => state = state.copyWith(finished: {...state.finished, orderId});

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
