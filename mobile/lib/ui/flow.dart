import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../domain/models.dart';

/// Rotas do fluxo de uma ordem. `undoItemId` habilita "Desfazer" na tela seguinte.
abstract final class OrderFlow {
  static String item(String orderId, int index) => '/ordem/$orderId/item/$index';

  static void goNext(BuildContext context, WorkOrder order, int index) {
    final undo = order.items[index].id;
    if (index + 1 < order.items.length) {
      context.go(item(order.id, index + 1), extra: undo);
    } else {
      context.go('/ordem/${order.id}/finalizar', extra: undo);
    }
  }

  /// Primeiro item sem resposta, ou a tela de finalizar quando todos foram respondidos.
  static void goFirstPending(BuildContext context, WorkOrder order, Map<String, Answer> answers) {
    final index = order.items.indexWhere((i) => !answers.containsKey(i.id));
    context.go(index < 0 ? '/ordem/${order.id}/finalizar' : item(order.id, index));
  }
}
