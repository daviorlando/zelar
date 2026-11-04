import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';

/// Rotas do fluxo de uma ordem. `undoItemId` habilita "Desfazer" na tela seguinte.
abstract final class OrderFlow {
  static String item(String orderId, int index) => '/ordem/$orderId/item/$index';

  /// Próximo item sem resposta: quem corrige uma ordem devolvida ou liberada não refaz
  /// o que já respondeu. Procura depois do atual e, se não houver, nos anteriores.
  static void goNext(BuildContext context, WorkOrder order, int index, Map<String, Answer> answers) {
    final undo = order.items[index].id;
    bool pending(int i) => !answers.containsKey(order.items[i].id);
    final count = order.items.length;
    final next = [for (var step = 1; step < count; step++) (index + step) % count].where(pending).firstOrNull;
    context.go(next == null ? '/ordem/${order.id}/finalizar' : item(order.id, next), extra: undo);
  }

  /// Primeiro item sem resposta, ou a tela de finalizar quando todos foram respondidos.
  static void goFirstPending(BuildContext context, WorkOrder order, Map<String, Answer> answers) {
    final index = order.items.indexWhere((i) => !answers.containsKey(i.id));
    context.go(index < 0 ? '/ordem/${order.id}/finalizar' : item(order.id, index));
  }
}
