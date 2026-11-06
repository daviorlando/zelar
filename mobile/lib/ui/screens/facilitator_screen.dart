import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../audio/speaker.dart';
import '../../data/orders_repo.dart';
import '../../data/workers_repo.dart';
import '../../state/outbox.dart';
import '../../domain/models.dart';
import '../../state/session.dart';

/// Tela do facilitador do teste de uso (Sprint 1): tempos, erros, pedidos de ajuda.
/// Não faz parte do produto; é aberta segurando a foto na tela Hoje.
class FacilitatorScreen extends ConsumerStatefulWidget {
  const FacilitatorScreen({super.key});

  @override
  ConsumerState<FacilitatorScreen> createState() => _FacilitatorScreenState();
}

class _FacilitatorScreenState extends ConsumerState<FacilitatorScreen> {
  String _tts = 'não verificada';

  Future<void> _checkTts() async {
    final ok = await ref.read(speakerProvider).ptBrInstalled();
    setState(() => _tts = switch (ok) { true => 'instalada', false => 'NÃO instalada', null => 'desconhecida' });
  }

  String _report(List<LogEvent> log) {
    if (log.isEmpty) return '';
    final start = log.first.at;
    String rel(DateTime t) {
      final d = t.difference(start);
      return '${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
    }

    return log.map((e) => '${rel(e.at)}\t${e.type}\t${e.detail}').join('\n');
  }

  @override
  Widget build(BuildContext context) {
    final log = ref.watch(eventLogProvider);
    final session = ref.watch(sessionProvider);
    int count(String type) => log.where((e) => e.type == type).length;
    final total = log.length < 2 ? Duration.zero : log.last.at.difference(log.first.at);
    final help = session.answers.values.expand((m) => m.values).where((a) => a.outcome == Outcome.help).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Facilitador'),
        actions: [
          IconButton(
            tooltip: 'Copiar registro',
            icon: const Icon(Icons.copy),
            onPressed: () => Clipboard.setData(ClipboardData(text: _report(log))),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('PIN de teste: 0 1 2 5', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text('Duração: ${total.inMinutes} min ${total.inSeconds % 60} s'),
          Text('PIN errado: ${count('pin') - log.where((e) => e.type == 'pin' && e.detail == 'certo').length}'),
          Text('Desfazer usado: ${count('desfez')} | QR errado: ${count('qr errado')} | Pediu ajuda: $help'),
          Text('Ordens concluídas: ${session.finished.length}'),
          Text('Voz pt-BR offline: $_tts'),
          Text(WorkersRepo.configured
              ? 'Funcionários: ${ref.watch(workersProvider).length} (painel ${WorkersRepo.api})'
                  '${ref.read(workersProvider.notifier).lastError == null ? '' : ' — sem atualizar: ${ref.read(workersProvider.notifier).lastError}'}'
              : 'Funcionários: só o de teste (app sem ZELO_API)'),
          Builder(builder: (context) {
            final outbox = ref.watch(outboxProvider);
            final orders = ref.watch(ordersProvider);
            final o = ref.read(ordersProvider.notifier);
            final f = ref.read(outboxProvider.notifier);
            final rejected = outbox.where((x) => x.rejected).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ordens guardadas: ${orders.length} (${orders.where((x) => x.current).length} de hoje/período atual)'
                    '${o.lastUpdate == null ? '' : ' — atualizadas ${TimeOfDay.fromDateTime(o.lastUpdate!).format(context)}'}'
                    '${o.lastError == null ? '' : ' — sem atualizar: ${o.lastError}'}'),
                Text('Fila de envio: ${f.pending} pendentes, ${rejected.length} recusadas'
                    '${f.lastError == null ? '' : ' — ${f.lastError}'}'),
                for (final r in rejected) Text('  recusada (${r.type}): ${r.reason ?? '?'}', style: const TextStyle(color: Colors.red)),
              ],
            );
          }),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(onPressed: _checkTts, child: const Text('Verificar voz')),
              OutlinedButton(onPressed: () => context.go('/primeira-vez'), child: const Text('Rever primeira inicialização')),
              OutlinedButton(
                onPressed: () async {
                  await ref.read(workersProvider.notifier).refresh();
                  setState(() {});
                },
                child: const Text('Atualizar funcionários'),
              ),
              OutlinedButton(
                onPressed: () async {
                  await ref.read(ordersProvider.notifier).sync();
                  setState(() {});
                },
                child: const Text('Enviar e atualizar agora'),
              ),
              OutlinedButton(
                onPressed: () => ref.read(outboxProvider.notifier).discardRejected(),
                child: const Text('Descartar recusadas'),
              ),
              for (final s in SyncState.values)
                OutlinedButton(
                  onPressed: () => ref.read(sessionProvider.notifier).setSync(s),
                  child: Text('Estado: ${s.name}'),
                ),
              FilledButton(
                onPressed: () {
                  ref.read(sessionProvider.notifier).reset();
                  ref.read(eventLogProvider.notifier).clear();
                  context.go('/');
                },
                child: const Text('Novo participante (zerar)'),
              ),
            ],
          ),
          const Divider(height: 32),
          SelectableText(_report(log), style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
        ],
      ),
    );
  }
}
