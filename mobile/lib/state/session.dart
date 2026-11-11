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

/// Chave do bloqueio do PIN digitado sem escolher a foto. Não se sabe quem está tentando,
/// então ele conta para o celular todo; a foto e o crachá continuam entrando.
const directPinKey = '*';

/// Depois de "Trocar de pessoa", quanto tempo dá para voltar sem digitar o PIN de novo.
const switchBackFor = Duration(seconds: 30);

/// Resultado de digitar o PIN sem escolher a foto.
sealed class DirectPin {
  const DirectPin();
}

class PinEntered extends DirectPin {
  const PinEntered(this.worker);
  final Worker worker;
}

/// Mais de um funcionário tem este PIN: a pessoa toca a própria foto entre eles.
class PinChoose extends DirectPin {
  const PinChoose(this.workers);
  final List<Worker> workers;
}

class PinWrong extends DirectPin {
  const PinWrong();
}

class PinLocked extends DirectPin {
  const PinLocked();
}

class SessionState {
  const SessionState({
    this.worker,
    this.pinFails = const {},
    this.lockedUntil = const {},
    this.answers = const {},
    this.finished = const {},
    this.changed = const {},
    this.previous,
    this.previousUntil,
  });

  final Worker? worker;

  /// Quem acabou de tocar em "Trocar de pessoa": pode voltar sem PIN até [previousUntil].
  final Worker? previous;
  final DateTime? previousUntil;

  Worker? get canGoBackTo => previousUntil != null && previousUntil!.isAfter(DateTime.now()) ? previous : null;

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
    bool clearPrevious = false,
  }) {
    return SessionState(
      worker: clearWorker ? null : (worker ?? this.worker),
      pinFails: pinFails ?? this.pinFails,
      lockedUntil: lockedUntil ?? this.lockedUntil,
      answers: answers ?? this.answers,
      finished: finished ?? this.finished,
      changed: changed ?? this.changed,
      previous: clearPrevious ? null : previous,
      previousUntil: clearPrevious ? null : previousUntil,
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
      state = state.copyWith(worker: worker, pinFails: fails, lockedUntil: until, clearPrevious: true);
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

  /// PIN digitado sem escolher a foto: confere contra todos os funcionários ativos.
  /// Quem está bloqueado não entra por aqui; erros contam no bloqueio do celular ([directPinKey]).
  DirectPin tryPinAny(List<int> pin) {
    if (state.lockedFor(directPinKey)) return const PinLocked();
    final matches = ref
        .read(workersProvider)
        .where((w) => w.active && !state.lockedFor(w.id) && pinHashOf(w.id, pin) == w.pinHash)
        .toList();
    final fails = {...state.pinFails};
    final until = {...state.lockedUntil};
    final DirectPin result;
    if (matches.isEmpty) {
      final count = (until.containsKey(directPinKey) ? 0 : fails[directPinKey] ?? 0) + 1;
      until.remove(directPinKey);
      fails[directPinKey] = count;
      if (count >= maxPinAttempts) {
        until[directPinKey] = DateTime.now().add(pinLockFor);
        fails.remove(directPinKey);
      }
      state = state.copyWith(pinFails: fails, lockedUntil: until);
      result = state.lockedFor(directPinKey) ? const PinLocked() : const PinWrong();
    } else {
      fails.remove(directPinKey);
      until.remove(directPinKey);
      if (matches.length == 1) {
        fails.remove(matches.single.id);
        state = state.copyWith(worker: matches.single, pinFails: fails, lockedUntil: until, clearPrevious: true);
        result = PinEntered(matches.single);
      } else {
        state = state.copyWith(pinFails: fails, lockedUntil: until);
        result = PinChoose(matches);
      }
    }
    unawaited(_saveLocks());
    return result;
  }

  /// Depois de [PinChoose]: o PIN já foi conferido para todos da lista.
  void enterChosen(Worker worker) => state = state.copyWith(worker: worker, clearPrevious: true);

  /// Desfaz "Trocar de pessoa" dentro de [switchBackFor].
  Worker? goBack() {
    final worker = state.canGoBackTo;
    if (worker != null) state = state.copyWith(worker: worker, clearPrevious: true);
    return worker;
  }

  /// Crachá entra direto (decisão do solicitante). Código aleatório de 256 bits não se
  /// adivinha, então crachá errado não conta para o bloqueio do PIN.
  /// Crachá antigo (trocado no painel) ou de funcionário desativado não entra.
  Worker? tryBadge(String qr) {
    final hash = badgeHashOf(qr);
    if (hash == null) return null;
    final worker = ref.read(workersProvider).where((w) => w.active && w.badgeHash == hash).firstOrNull;
    if (worker != null) state = state.copyWith(worker: worker, clearPrevious: true);
    return worker;
  }

  /// Sai e não deixa respostas na tela de quem entrar depois. O que ainda não foi
  /// enviado continua na fila do celular, em nome de quem respondeu.
  /// O bloqueio do PIN fica: sair e entrar de novo não dá mais tentativas.
  void logout() => state = SessionState(pinFails: state.pinFails, lockedUntil: state.lockedUntil);

  /// Como [logout], mas quem saiu pode voltar sem PIN por [switchBackFor]: um toque sem querer
  /// em "Trocar de pessoa" não custa nada.
  void switchPerson() => state = SessionState(
        pinFails: state.pinFails,
        lockedUntil: state.lockedUntil,
        previous: state.worker,
        previousUntil: DateTime.now().add(switchBackFor),
      );

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
    // Leva junto a foto e o áudio ainda não enviados deste item.
    _sendAfter(_outbox, _outbox?.addClear(workerId: state.worker!.id, orderId: orderId, itemId: itemId));
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
