import '../domain/models.dart';

// Falas de interface (escopo, seção 10: ≈ 40 áudios de interface). Ficam juntas
// para serem trocadas pelas gravações aprovadas sem mexer nas telas.
// Os nomes das cores acompanham ZelarColors: ok verde, problem amarelo,
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
  static const eraseDigit = 'Seta: apaga o último número.';
  static const skipButton = 'Botão cinza: não sei responder. Pula este item, e o gestor fica sabendo.';

  // Botões desativados: por que ainda não funcionam.
  static const chooseFigureFirst = 'Primeiro toque numa figura.';
  static const recordOtherFirst = 'Segure o botão laranja e conte o que aconteceu.';

  // Microfone.
  static const micAllowed = 'Microfone liberado. Agora segure o botão laranja enquanto fala.';
  static const micDenied = 'O celular não deixou o Zelar usar o microfone. Peça ajuda ao gestor. '
      'Por agora, siga sem áudio: escolha a figura e toque no botão verde, Pronto.';
  static const typeNumberFirst = 'Primeiro digite o número nas teclas.';
  static String answerMissing(int missing) =>
      'Ainda ${missing == 1 ? 'falta 1 item' : 'faltam $missing itens'}. Toque no ponto de interrogação.';

  // Telas.
  static const entry = 'Para entrar, toque no botão roxo e mostre o seu crachá para a câmera. '
      'Ou digite os seus quatro números. Se não lembrar, toque em Escolher pela foto.';
  static const pinChoose = 'Mais de uma pessoa tem esse número. Toque na sua foto.';
  static const choosePhotoButton = 'Escolher pela foto: tocar na sua foto e depois digitar os seus números.';
  static const entryAfterSwitch = 'Pronto. Agora a próxima pessoa entra com o crachá ou com os números. '
      'Se tocou sem querer, toque no botão verde, Voltar.';
  static String backButton(String name) => 'Botão verde: voltar para $name, sem digitar os números.';
  static String pinFor(String name) =>
      '$name. Agora digite os seus quatro números, um de cada vez. Se errar, toque na seta embaixo para apagar.';
  static const pinWrong = 'Número errado. Tente de novo.';
  static const locked = 'Número bloqueado por alguns minutos. Entre com o crachá, no botão roxo, ou chame o gestor.';
  static const badgeButton = 'Botão roxo: ler o seu crachá com a câmera.';
  static const badgeUnknown = 'Crachá não reconhecido. Chame o gestor.';
  static const otherPerson = 'Voltar: escolher outra foto.';
  static const activation = 'Para ligar este celular à empresa, o gestor entra uma vez com o email e a senha do painel. '
      'Depois toque no botão verde, Ligar.';
  static const activationCode = 'Digite o código que o gestor gerou no painel, em Celulares. Depois toque no botão verde, Ligar.';
  static const activationButton = 'Botão verde: ligar este celular à empresa.';
  static const activationInvalid = 'Código errado ou vencido. Peça um novo ao gestor.';
  static const activationWrongLogin = 'Email ou senha errados. Confira e tente de novo.';
  static const activationNotManager = 'Esta conta não é de gestor. Entre com a conta do gestor da empresa.';
  static const activationWait = 'Muitas tentativas. Espere um minuto e tente de novo.';
  static const activationOffline = 'Sem internet. Conecte o celular e tente de novo.';
  static const noWorkers = 'A lista de funcionários ainda não foi baixada. Chame o gestor.';
  static const allDone = 'Tudo feito por hoje. Obrigado.';

  // Primeira inicialização.
  static const setupVoiceReady = 'Bem-vindo ao Zelar. A voz em português já está pronta. Toque no botão verde, Próximo.';
  static const setupVoiceMissing = 'Bem-vindo ao Zelar. Este celular ainda não tem a voz em português para usar sem internet. '
      'Toque no botão azul, Abrir configurações. Toque na engrenagem do serviço de voz, depois em Instalar dados de voz, e baixe Português do Brasil. Depois, volte para o Zelar.';
  static const setupHowItWorks = 'Veja como funciona. Para entrar, leia o crachá ou digite os seus quatro números. '
      'O botão verde quer dizer que está tudo certo. O amarelo, que você encontrou um problema. O azul, que não conseguiu fazer. '
      'O cinza, que você não sabe responder. '
      'Se tiver dúvida, segure um botão para ouvir o que ele faz. Toque no botão verde, Próximo.';
  static const setupDone = 'Tudo pronto. Toque no botão verde, Começar.';
  static const setupDoneActivate = 'Tudo pronto. Agora o gestor liga este celular à empresa. Toque no botão verde, Começar.';
  static const setupNextButton = 'Botão verde: ir para o próximo passo.';
  static const setupOpenButton = 'Botão azul: abrir as configurações de voz do celular.';
  static const setupStartButton = 'Botão verde: começar a usar o Zelar.';

  // Sair.
  static const logoutButton = 'Trocar de pessoa: para outra pessoa entrar neste celular. O que você fez continua guardado.';
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
            'Se não conseguiu fazer, toque no botão azul. '
            'Se não souber responder, toque no botão cinza, Não sei.',
        ItemType.action => '${item.spokenText} '
            'Quando terminar, toque no botão verde. Se não conseguiu, toque no botão azul. '
            'Se não souber responder, toque no botão cinza, Não sei.',
        ItemType.measurement => '${item.spokenText} '
            'Digite o número nas teclas. A vírgula fica embaixo à esquerda; a seta de apagar, embaixo à direita. '
            'Depois toque no botão verde, Confirmar. Se não conseguiu medir, toque no botão azul, Preciso de ajuda. '
            'Se não souber responder, toque no botão cinza, Não sei.',
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
