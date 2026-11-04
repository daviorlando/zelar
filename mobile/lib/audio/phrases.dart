import '../domain/models.dart';

// Falas de interface (escopo, seção 10: ≈ 40 áudios de interface). Ficam juntas
// para serem trocadas pelas gravações aprovadas sem mexer nas telas.
// Os nomes das cores acompanham ZeloColors: ok verde, problem amarelo,
// blocked azul, scan e photo roxo, mic laranja.

abstract final class Phrases {
  // Botões: o que cada um faz, falado ao segurar.
  static const okButton = 'Botão verde: está tudo certo.';
  static const problemButton = 'Botão amarelo: encontrei um problema. Depois você mostra qual.';
  static const blockedButton = 'Botão azul: não consegui fazer. Depois você mostra o motivo.';
  static const doneButton = 'Botão verde: já fiz o serviço.';
  static const confirmButton = 'Botão verde: confirmar o número digitado.';
  static const helpButton = 'Botão azul: não consegui medir, preciso de ajuda.';
  static const hereButton = 'Botão verde: estou no equipamento, quero começar.';
  static const qrButton = 'Botão roxo: ler a etiqueta com a câmera, para conferir o equipamento.';
  static const readyButton = 'Botão verde: pronto, terminei de mostrar.';
  static const concludeButton = 'Botão verde: concluir este equipamento.';
  static const undoButton = 'Desfazer: volta para a resposta anterior.';
  static const photoButton = 'Botão roxo, com a câmera: toque para tirar uma foto.';
  static const micButton = 'Botão laranja, com o microfone: segure enquanto fala. Solte para terminar.';
  static const eraseFigure = 'Seta: apaga a última figura.';

  // Botões desativados: por que ainda não funcionam.
  static const chooseFigureFirst = 'Primeiro toque numa figura.';
  static const recordOtherFirst = 'Segure o botão laranja e conte o que aconteceu.';
  static const typeNumberFirst = 'Primeiro digite o número nas teclas.';
  static String answerMissing(int missing) =>
      'Ainda ${missing == 1 ? 'falta 1 item' : 'faltam $missing itens'}. Toque no ponto de interrogação.';

  // Telas.
  static const entry = 'Para entrar, toque no botão roxo e mostre o seu crachá para a câmera. '
      'Se não estiver com o crachá, toque na sua foto.';
  static String pinFor(String name) =>
      '$name. Agora toque suas quatro figuras, uma de cada vez. Se errar, toque na seta embaixo para apagar.';
  static const pinWrong = 'Figuras erradas. Tente de novo.';
  static const locked = 'Figuras bloqueadas. Entre com o crachá, no botão roxo, ou chame o gestor.';
  static const badgeButton = 'Botão roxo: ler o seu crachá com a câmera.';
  static const badgeUnknown = 'Crachá não reconhecido. Chame o gestor.';
  static const otherPerson = 'Voltar: escolher outra foto.';
  static const noWorkers = 'A lista de funcionários ainda não foi baixada. Chame o gestor.';
  static const allDone = 'Tudo feito por hoje. Obrigado.';
  static const loadFailed = 'Não consegui baixar as suas atividades. Puxe a tela para baixo para tentar de novo. Se continuar, chame o gestor.';

  /// Só a quantidade: a lista pode ser longa. Cada atividade fala ao segurar o cartão.
  /// Devolvida é a exceção: o gestor está esperando, então a voz avisa que existe.
  static String today(String worker, {required int pending, int returned = 0, int released = 0}) {
    final hello = 'Olá, ${worker.split(' ').first}.';
    if (pending == 0) return '$hello $allDone';
    final total = pending == 1 ? 'Você tem 1 atividade pendente.' : 'Você tem $pending atividades pendentes.';
    final back = switch (returned) {
      0 => '',
      1 => ' 1 foi devolvida pelo gestor.',
      _ => ' $returned foram devolvidas pelo gestor.',
    };
    final free = switch (released) {
      0 => '',
      1 => ' 1 foi liberada pelo gestor.',
      _ => ' $released foram liberadas pelo gestor.',
    };
    return '$hello $total$back$free Para ouvir uma atividade, segure o botão dela. Para começar, toque nele.';
  }

  static String recognize(String equipment) =>
      'Vá até $equipment. Quando chegar, toque no botão verde, Estou aqui. '
      'Se quiser conferir a etiqueta, toque no botão roxo e aponte a câmera.';

  static String item(PlanItem item) => switch (item.type) {
        ItemType.inspection => '${item.spokenText} '
            'Se estiver tudo certo, toque no botão verde. '
            'Se encontrou problema, toque no botão amarelo. '
            'Se não conseguiu fazer, toque no botão azul.',
        ItemType.action => '${item.spokenText} '
            'Quando terminar, toque no botão verde. Se não conseguiu, toque no botão azul.',
        ItemType.measurement => '${item.spokenText} '
            'Digite o número nas teclas. A vírgula fica embaixo à esquerda; a seta de apagar, embaixo à direita. '
            'Depois toque no botão verde, Confirmar. Se não conseguiu medir, toque no botão azul, Preciso de ajuda.',
      };

  static String problem(String component) =>
      '$component. Qual problema você encontrou? '
      'Cada figura é um problema: toque nela e você vai ouvir qual é. Escolha a que você viu. '
      'Se puder, toque no botão roxo, com a câmera, para tirar foto. '
      'Para contar com a sua voz, segure o botão laranja, com o microfone, e fale. Solte para terminar. '
      'No fim, toque no botão verde, Pronto.';

  static const blocked = 'Por que você não conseguiu? '
      'Cada figura é um motivo: toque nela e você vai ouvir qual é. Escolha o seu. '
      'Se quiser explicar, segure o botão laranja, com o microfone, e fale. '
      'No fim, toque no botão verde, Pronto.';

  /// Depois de tocar numa figura: o que ela quer dizer e como seguir.
  static String chosen(String spoken) => '$spoken Se for isso, toque no botão verde, Pronto. Se não, toque em outra figura.';
  static String chosenOther(String spoken) => '$spoken Depois toque no botão verde, Pronto.';

  static String finish(String summary) => '$summary Para corrigir um item, toque nele na lista.';
  static const concluded = 'Pronto. Equipamento concluído.';

  // Ordem devolvida pelo gestor. O motivo é o texto que ele digitou no painel.
  static String returned(String reason) =>
      'O gestor devolveu este equipamento. Ele disse: $reason. Suas respostas continuam guardadas. Corrija só o que ele pediu.';
  static String released(String note) => 'O gestor resolveu o que impedia. Ele disse: $note. Agora você já pode fazer o que faltou.';

  /// O aviso do gestor nesta ordem, se houver. Liberação é o mais recente: vem primeiro.
  static String? orderNote(WorkOrder order) => order.released
      ? released(order.releasedNote!)
      : order.returned
          ? returned(order.returnedReason!)
          : null;

  static String waitingManager(int blocked) => 'Ainda não dá para concluir: '
      '${blocked == 1 ? '1 item espera' : '$blocked itens esperam'} o gestor. Se você resolveu, toque no item e responda de novo.';
  static String concludeUnchanged(String reason) =>
      'Você não mudou nenhuma resposta depois que o gestor devolveu. Ele disse: $reason. '
      'Para corrigir, toque no botão azul. Se já está certo, toque no botão verde, Concluir assim mesmo.';
  static const fixButton = 'Botão azul: voltar para a lista e corrigir uma resposta.';
  static const concludeAnywayButton = 'Botão verde: concluir sem mudar nenhuma resposta.';

  // Medição.
  static String number(String typed, String unit) => '${typed.replaceAll(',', ' vírgula ')} $unit';
  static const noted = 'Anotado.';
  static const inRange = 'Normal.';
  static const nearLimit = 'Perto do limite.';
  static const outOfRange = 'Valor fora do normal. Confira. Se estiver certo, toque de novo em confirmar.';
}
