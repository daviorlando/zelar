# Escopo do aplicativo de manutenção da Eco Gesso

Versão 0.5 • 26 de outubro de 2026 • Escopo orientado à produção: análise de soluções existentes, decisões técnicas, modelo de dados, backlog e plano de entrega

## 0 O que mudou da v0.4 para a v0.5

| Tema | v0.4 | v0.5 |
| --- | --- | --- |
| Equipe de desenvolvimento | 2 pessoas (Android + backend/web) | **[decisão]** 1 desenvolvedor, com apoio de IA; plano e prazos recalculados (seção 14) |
| Stack | Kotlin/Compose + Python/FastAPI + React em VPS | **[decisão]** Flutter (app de campo) + Next.js full-stack (painel e API) na Vercel via GitHub + Supabase (Postgres, Storage, Auth) (seção 11) |
| Geração de ocorrências | Função determinística duplicada no servidor e no app | **[decisão]** Somente no servidor, com janela de 60 dias baixada pelo app; uma única implementação (seções 7 e 8) |
| Atribuição de tarefas | Não modelada | **[decisão]** Por setor e equipamento fixos por trabalhador; o gestor pode reatribuir uma ordem (seções 4 e 12) |
| Upload de mídia | `PUT /media` com `Content-Range` no próprio servidor | Direto ao Supabase Storage via TUS, sem passar pela Vercel (seção 8.2) |
| Planilha | Contagens conferidas | Conferidas de novo pelo script com a planilha real; novas divergências de tag listadas; regra de normalização de tag (seção 3) |
| Incoerências | Android 8 × Android 10; turno indefinido × turno único; indicador de validações invertido; estado `cancelled` sem destino | Corrigidas (seções 7, 9, 11, 15 e 16) |
| LGPD | Item não bloqueante | Seção 19 nova |
| Voz sintética | Fallback sem verificação | Verificação de voz pt-BR offline na ativação (seção 5) |

Decisões desta revisão confirmadas pelo solicitante em 26 de outubro de 2026.

### Histórico: o que mudou da v0.3 para a v0.4

| Tema | v0.3 | v0.4 |
| --- | --- | --- |
| Soluções existentes | Não avaliadas | Seção 2: oito soluções comparadas (Brasil, internacionais e código aberto) e recomendação comprar × construir |
| Tecnologias | Adiadas | Seção 11: stack proposta, com critérios de escolha e alternativas |
| Sincronização | Princípios | Seção 8: protocolo concreto (outbox, chaves estáveis, idempotência, mídia resumível, reconciliação) |
| Modelo de dados | Lista de entidades | Seção 12: tabelas com campos, chaves e índices |
| Backlog | Inexistente | Seção 13: épicos, histórias e prioridade MoSCoW, prontos para um gerenciador de tarefas |
| Cronograma e custo | "A estimar" | Seção 14: plano em sprints com premissas e faixas de esforço |
| Conteúdo | "Frente própria" | Seção 10: pipeline de fotos, QR e áudios dimensionado pela planilha (≈50 tipos de instrução, não 870) |
| Decisões pendentes | Oito temas abertos | Seção 16: reduzidas a sete decisões bloqueantes para o Sprint 0, com proposta padrão para cada uma |

Tudo o que foi confirmado pelo solicitante nas revisões de 21 e 26 de outubro é mantido: Android; um celular por trabalhador; perfis executante, técnico opcional e gestor; equipe estimada em quatro pessoas, ajustável; turnos indefinidos; desconexões habituais de algumas horas; regra diária variável por equipamento; acessibilidade para pessoas que não leem; seis frequências; operação offline com sincronização; relatórios; Kanban.

Itens marcados como **[proposta]** ainda precisam de validação do solicitante. Itens marcados como **[decisão]** já foram confirmados.

## 1 Objetivo

Criar um aplicativo para que trabalhadores, inclusive pessoas que não leem, registrem inspeções e manutenções no celular, sem internet, com envio automático quando houver conexão. Os gestores acompanham execução, pendências e problemas em um painel web com relatórios e quadro Kanban.

O resultado esperado é um histórico rastreável por equipamento e componente: o que estava previsto, quem executou, quando, com qual resultado e com quais evidências. As tarefas principais devem ser realizáveis sem ler nem digitar.

## 2 Soluções existentes: comprar, adaptar ou construir

Levantamento feito em 26 de outubro de 2026 com base em páginas públicas dos fornecedores e em comparativos de terceiros. Preços mudam e vários fornecedores só informam valores sob consulta; os números abaixo são referência de ordem de grandeza, não cotação.

| Solução | Origem | Offline no celular | Fotos / áudio | Preço de referência | Observações para o caso Eco Gesso |
| --- | --- | --- | --- | --- | --- |
| Leankeep | Brasil (PR) | Sim: ordens, checklists e registros sincronizam ao reconectar | Fotos; áudio não documentado | A partir de R$ 297/mês para 3 usuários, sem fidelidade | Mais barato e mais próximo do porte da equipe; abertura de corretiva por QR Code sem login; PDF/Excel automáticos |
| Produttivo | Brasil | Sim | Fotos; preenchimento por voz com IA ("Manu IA") | Mensal por usuário, valor sob consulta; teste grátis | Forte em equipes externas e ordens de serviço; planos de manutenção recorrente; a voz é para preencher formulário, não para instruir quem não lê |
| Checklist Fácil | Brasil | Sim, nos planos Basic e Professional | Mídias em todos os planos; áudio não documentado | Sob consulta; há plano gratuito | Foco em inspeção e auditoria por checklist, não em CMMS completo |
| TRACTIAN (TracOS) | Brasil | Sim ("mesmo offline") | Não documentado na página do app | Por ativo, conforme risco operacional, proposta personalizada | Orientado a sensores e indústria de maior porte; tende a exceder o orçamento de uma equipe de quatro pessoas |
| Fracttal One | Chile / LatAm, operação no Brasil | Não documentado publicamente | Não documentado | SaaS anual, planos no site, sob consulta | CMMS completo em português; precisa de demonstração para confirmar offline e preço |
| MaintainX | EUA | Não confirmado nas fontes consultadas | Fotos | Grátis (limitado a 2 OS recorrentes); Essential US$ 20–25/usuário/mês; Premium US$ 65–75 | Interface simples e mobile-first; cobrança em dólar |
| Limble / UpKeep | EUA | Só em planos superiores (Limble Premium+ ≈ US$ 69/usuário/mês; UpKeep só no Professional, sob consulta) | Fotos | Limble Standard ≈ US$ 28; UpKeep Essential ≈ US$ 24 por usuário/mês | Offline é recurso de plano caro: para 4 usuários, ≈ US$ 276/mês no Limble Premium+ |
| Atlas CMMS (Grashjs/cmms) | Código aberto, AGPLv3 + licença comercial | Não documentado | Fotos | Gratuito para auto-hospedar (Docker) | Java Spring Boot + React + React Native; tradução pt-BR; ≈ 760 estrelas; útil como referência de modelo de dados e de telas, não como base pronta para o app acessível |

**O que nenhuma delas resolve:** uma interface operável por quem não lê. Todas assumem leitura de texto nas listas de tarefas e nas instruções; a voz, quando existe, serve para o técnico ditar, não para o sistema instruir. Também não há, nas fontes consultadas, instrução por áudio gravado, identificação por foto do equipamento como caminho principal, nem fluxo de resposta por três botões (certo / problema / não consegui).

**O que elas resolvem bem e podemos aproveitar:** modelo de ativos com hierarquia e tag, planos recorrentes, ordem de serviço, QR Code, Kanban, relatórios PDF/Excel e sincronização offline. Não há mérito em reinventar essa parte: o modelo de dados da seção 12 segue o padrão de CMMS.

**Recomendação [decisão para seguir com o plano; o teste de 30 dias continua opcional]:** construir o aplicativo de campo e o serviço central, porque a acessibilidade para quem não lê é o requisito central e não existe no mercado. Para reduzir risco e custo:

1. Antes de escrever código, contratar um teste de 30 dias no Leankeep ou no Produttivo com o gestor e um trabalhador alfabetizado, usando um setor real. Objetivo: validar os planos de manutenção, as regras de recorrência e o volume de validação do gestor em um produto pronto, por menos de R$ 500. O que se aprender ali entra no backlog como requisito confirmado.
2. Se a empresa concluir que a acessibilidade não é indispensável (por exemplo, se os trabalhadores analfabetos forem sempre acompanhados por alguém que lê), a opção mais barata é ficar na solução pronta. Esse cenário precisa ser descartado explicitamente antes do desenvolvimento.
3. Usar o Atlas CMMS apenas como referência de estrutura e de telas. Nenhum código dele é copiado, para não trazer a licença AGPL para o projeto.

## 3 Base fornecida e preparação dos dados

A fonte analisada é o arquivo "Calendário de Manutenção - Eco Gesso.xlsx", com seis abas de manutenção (Setor A a Setor F, rotuladas 2024) e uma lista de equipamentos por setor. Na v0.5 as contagens foram conferidas de novo por script sobre a planilha real e o total de 870 linhas se confirmou:

| Setor | Diária | Semanal | Mensal | Trimestral | Semestral | Anual | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 19 | 12 | 41 | 23 | 23 | 14 | 132 |
| B | 16 | 15 | 29 | 18 | 20 | 23 | 121 |
| C | 14 | 10 | 30 | 14 | 19 | 23 | 110 |
| D | 6 | 5 | 13 | 5 | 8 | 9 | 46 |
| E | 42 | 22 | 69 | 38 | 44 | 50 | 265 |
| F | 25 | 15 | 52 | 27 | 34 | 43 | 196 |
| Total | 122 | 79 | 234 | 125 | 148 | 162 | 870 |

Os números são linhas com atividade na coluna D dentro de cada bloco de periodicidade; não são equipamentos, procedimentos únicos nem execuções.

**Achado novo desta revisão, importante para o dimensionamento:** as 870 linhas se concentram em 17 equipamentos principais (britador de mandíbula, britador de martelo, esteiras, elevadores de canecas, roscas transportadoras, silos, forno, moinho, balança, tremonha, redutor) e usam cerca de 50 tipos de instrução. Os dez mais frequentes cobrem mais de 60% das linhas: inspeção visual (136), limpeza (80), lubrificação (69), alinhamento (46), análise de vibração (44), análise de óleo (38), monitoramento de vibração (37), troca de lubrificante (36), inspeção técnica (36) e verificação de tensão/corrente (44, somando as duas grafias). A consequência é que o conteúdo acessível (áudio e foto do ponto a verificar) é produzido por tipo de instrução e por componente, não por linha: a estimativa realista é de 60 a 90 áudios e uma foto por componente cadastrado, em vez de 870 de cada.

O cadastro tem 157 registros com sigla (equipamentos e componentes) nos setores A a H. Empilhadeira e compressor (setores G e H) não têm aba de manutenção: decidir se entram no piloto e obter seus planos.

**Divergências a conferir (não corrigir automaticamente):**

| Divergência | Onde | Observação |
| --- | --- | --- |
| Tag "C - RT - ME" (prefixo do Setor C) | Aba Setor D, 13 atividades em todos os blocos de frequência (a partir das linhas 4, 14, 22, 40, 49 e 61) | Provável "D - RT - ME"; confirmar antes de importar |
| Tag "D - RT - RD" (prefixo do Setor D) | Aba Setor E, 7 atividades (a partir das linhas 47, 152, 255 e 315) | Provável "E - RT - RD" ou "E - RT2 - RD" |
| Tags "E - RT1 - CT1" e "E - RT1 - CT2" | Aba Setor E, 6 atividades | Não existem no cadastro de equipamentos |
| Atividades sem tag | Aba Setor F, linhas 69 a 71 (mensal, motor do elevador de canecas) | Provável "F - ELE - ME" |
| Motor "E - FN - ME1" | Aba Setor E: 25 CV / 1750 RPM; cadastro (linha 82): 30 CV / 1765 RPM | O cadastro prevalece até confirmação |
| Motor "C - RT - ME" | Aba Setor C: 1740 RPM; cadastro (linha 60): 1730 RPM | Idem |
| Motovibrador "D - SIL - MT" | Aba Setor D: 2 CV; cadastro (linha 79): 0,28 CV / 3600 RPM | Idem |
| Tags com espaçamento fora do padrão | Aba Setor B: "B- EST - ME" (com quebra de linha) e sete tags "B - BMAT- …" | Resolvidas pela normalização abaixo; registradas no relatório |
| Nomes do mesmo equipamento com grafias diferentes | Várias abas ("BRITADOR MANDÍBULA" × "Britador de Mandibula") | A importação unifica por tag, nunca por nome |

Resultado do importador em modo simulação (26/10/2026): 870 atividades lidas, idênticas à tabela acima; 157 tags no cadastro; 48 tipos de instrução após padronizar plural e "(se aplicável)"; 29 atividades com pendência de tag; 37 textos com mais de uma ação para o responsável técnico decidir; tipo de resposta sugerido: 292 inspeções, 371 ações e 207 medições (a confirmar). O relatório de conferência fica em `backend/tools/importer/out/relatorio-conferencia.xlsx`.

**Normalização de tag [decisão]:** antes de usar a tag como chave, o importador remove espaços e quebras de linha nas pontas, converte para caixa alta e padroniza o separador como " - " (espaço, hífen, espaço). A tag original e a normalizada ficam no relatório de conferência. A normalização nunca troca o prefixo de setor; esses casos vão para a lista de pendências.

**Regras de importação [proposta]:**

- A importação é feita por um script revisável, com saída em planilha de conferência antes de gravar no sistema. Cada linha importada guarda arquivo, aba, linha e texto original.
- Células mescladas são desfeitas propagando equipamento e componente para baixo até a próxima mudança.
- A tag normalizada é a chave de identidade. Linhas com tag inconsistente vão para uma lista de pendências; o importador não "adivinha" o setor.
- Cada linha vira um ou mais itens de plano. Linhas com várias ações no mesmo texto (por exemplo, "Limpeza: remover poeira; verificar fixação") são marcadas para o responsável técnico decidir se viram um ou dois itens.
- O tipo de resposta (inspeção, ação, medição) é sugerido pela palavra inicial da atividade e confirmado manualmente; medições só são publicadas com unidade e limites preenchidos.
- As 40 colunas de calendário das abas (dias/semanas numerados) não são importadas como histórico. Células vazias não significam omissão.

## 4 Pessoas e responsabilidades

| Perfil | Responsabilidades | Limites |
| --- | --- | --- |
| Executante | Ver tarefas do dia, ouvir instruções, responder itens, relatar problemas, anexar foto e áudio | Só setores e atividades autorizados; não altera planos; não aprova o próprio trabalho quando há revisão obrigatória |
| Técnico (opcional) | Tudo do executante, mais medições, diagnóstico e ordens corretivas, quando houver profissional cadastrado | Atua nas atividades compatíveis com a qualificação cadastrada; o sistema funciona sem nenhum técnico |
| Gestor | Cadastra usuários, setores, equipamentos e planos; configura permissões; distribui tarefas; valida ou devolve registros; prioriza problemas; acompanha Kanban e relatórios | Atua nas unidades permitidas; tudo auditado; o perfil não qualifica para executar manutenção especializada |

**[decisão]** Apenas esses três perfis. Uma pessoa pode acumular perfis. O perfil técnico é habilitado por unidade; desativá-lo preserva o histórico e devolve atribuições pendentes ao gestor. Sem técnico, o gestor recebe os problemas e organiza o atendimento, podendo registrar prestador externo sem criar perfil de acesso.

**[decisão]** Equipe estimada em quatro trabalhadores, ajustável. O cadastro não fixa quantidade. Desativar um trabalhador não apaga suas execuções.

**[decisão] Atribuição por setor e equipamento fixos.** O gestor associa cada trabalhador a setores inteiros (`user_sector`) ou a equipamentos específicos (`user_equipment`). O aplicativo mostra as ordens que vencem nesses setores e equipamentos. O gestor pode reatribuir uma ordem a outra pessoa (`work_order.assigned_user_id`); a reatribuição prevalece sobre a regra fixa e chega ao aparelho na próxima sincronização. Quando dois trabalhadores cobrem o mesmo setor, os dois veem as mesmas ordens; se ambos executarem o mesmo item offline, as duas execuções são preservadas como conflito (seção 8.2). O piloto mede a frequência desses conflitos para decidir se vale dividir os setores por equipamento.

**[decisão]** Um celular por trabalhador. **[proposta]** Ativação inicial assistida e conectada pelo gestor (o gestor gera um QR de ativação no painel; o trabalhador aponta o celular); depois disso o aparelho fica vinculado ao trabalhador. Para retomar a sessão offline, o aplicativo usa um **PIN visual**: uma sequência de quatro figuras escolhidas em uma grade de nove (equivalente a um PIN numérico de quatro dígitos, sem exigir leitura). O gestor pode redefinir o PIN pelo painel; a redefinição chega na próxima sincronização. A foto do trabalhador identifica quem está registrando, mas não autentica.

Atividades como medições elétricas, ajustes e intervenções ficam restritas aos profissionais definidos pela empresa. A simplificação da linguagem não pode alterar o procedimento aprovado pelo responsável técnico.

## 5 Experiência no celular e acessibilidade

Fluxo principal: identificar-se (PIN visual) → ver as tarefas de hoje → reconhecer o equipamento → ouvir a instrução → responder → finalizar. O trabalhador nunca escolhe a frequência: o aplicativo mostra o que vence para aquela pessoa, data e turno.

**Telas do aplicativo [proposta]:**

| Tela | Conteúdo | Observações de acessibilidade |
| --- | --- | --- |
| Entrada | Foto do trabalhador e grade do PIN visual | Áudio: "Toque suas quatro figuras" |
| Hoje | Lista de cartões, um por equipamento com tarefas vencendo; foto grande, nome curto, contador de itens e anel de progresso; atrasados primeiro, com faixa distinta | Cada cartão lê o nome do equipamento ao toque longo |
| Reconhecer | Foto do equipamento em tela cheia e botão "Ler etiqueta" (QR) | O QR confirma; a foto é o caminho principal |
| Item | Foto do ponto a verificar, botão de áudio grande, três botões de resposta (Tudo certo / Encontrei problema / Não consegui) | Ordem, cor, forma e áudio fixos em todas as telas |
| Problema | Grade de motivos ilustrados + botão "Tirar foto" + botão "Gravar áudio" (segurar para falar) | Nenhum campo de texto obrigatório |
| Medição | Teclado numérico grande, unidade exibida como símbolo e áudio, faixa esperada como barra verde/amarela/vermelha, botão "Preciso de ajuda" | Valor fora da faixa gera aviso falado, não bloqueio |
| Finalizar | Resumo falado ("Você respondeu 6 itens, 1 problema"), botão "Concluir" | Confirmação em áudio antes do envio |
| Estado | Ícone persistente no topo: salvo no celular / enviando / recebido / precisa de atenção | Toque no ícone reproduz a explicação em áudio |

**Requisitos de interface [decisão para o MVP]:**

- Uma instrução por etapa, com foto ou ilustração do ponto a verificar.
- Botão de áudio visível com repetição; os áudios das tarefas atribuídas ficam no aparelho.
- Áreas de toque mínimas de 48 × 48 dp; meta de 64 × 64 dp nos três botões de resposta, a validar com luvas.
- Cor como reforço; forma, posição e áudio também carregam o significado.
- Texto ampliável, contraste mínimo 4,5:1, rótulos para TalkBack.
- Salvamento a cada resposta; o aplicativo reabre na mesma etapa.
- Desfazer o último toque na própria tela; após finalizar, qualquer correção gera nova revisão com autor e motivo.
- Botão "Chamar gestor" que exibe a orientação local (sem prometer alerta remoto quando offline).

**Áudio:** gravação humana aprovada por instrução, armazenada no aparelho. **[proposta]** Usar o TTS pt-BR do Android como fallback automático apenas para conteúdo sem gravação, marcado visualmente como provisório; a voz sintética nunca substitui a gravação em produção. Como aparelhos de entrada nem sempre trazem a voz pt-BR instalada para uso offline, a ativação verifica a voz; se faltar, o aplicativo mostra uma pendência de prontidão para o gestor resolver com o aparelho conectado. Gravar relato de voz funciona offline. Transcrição e comandos por voz ficam para depois.

**Teste com usuários:** o desenho das figuras, dos motivos de impedimento e do PIN visual é validado com os próprios trabalhadores antes de codificar as telas finais (seção 14, Sprint 1). Ruído, poeira, luvas e restrição a fones orientam os testes. As orientações de [1] apoiam o projeto, sem equiparar analfabetismo a deficiência cognitiva.

## 6 Checklist e resultado de cada atividade

O modelo distingue inspeção, ação de manutenção e medição. Marcar uma inspeção como executada não significa que o equipamento está bom; registrar um defeito não significa que foi corrigido.

| Tipo | Respostas / campos | Tratamento |
| --- | --- | --- |
| Inspeção | Tudo certo / Encontrei problema / Não consegui, com foto e áudio opcionais ou obrigatórios conforme o plano | Problema abre ocorrência vinculada; "não consegui" deixa a verificação pendente com motivo |
| Ação de manutenção | Fiz / Não consegui; verificação de resultado quando o plano exigir | Só conta como executada quando confirmada; impedimento exige motivo |
| Medição | Valor numérico, unidade e parâmetro; "Preciso de ajuda" | Sem valor, fica pendente; valor fora da faixa gera ocorrência automática de prioridade definida no plano |
| Não aplicável | Motivo estruturado; confirmação do gestor conforme regra | Contabilizado à parte; não vira execução |

Motivos de impedimento padrão (ilustrados e falados): falta de ferramenta, equipamento em operação, equipamento parado para outro serviço, falta de material, preciso de apoio técnico, condição insegura, outro (com áudio).

Cada item de plano informa: equipamento ou componente; instrução técnica original; instrução acessível (texto curto + áudio + foto); tipo de resposta; periodicidade; qualificação exigida; evidências obrigatórias; necessidade de validação; para medições, unidade, limites e procedimento. O sistema não inventa limites.

Cada execução registra: autor efetivo; responsável designado; dispositivo; item e versão do plano; horário do aparelho e horário de recebimento; resultado; medições; evidências; revisões.

Fotos obrigatórias apenas onde o plano definir. O aplicativo comprime fotos para no máximo 1600 px no lado maior e ≈ 300 KB, preservando o original apenas se o plano exigir. Áudios em AAC mono, 32 kbps, limite de 2 minutos por gravação. Esses limites são **[proposta]** para caber no cenário de horas offline e nos planos de dados móveis.

## 7 Agenda e regras de recorrência

Seis frequências: diária, semanal, mensal, trimestral, semestral e anual. Cada recorrência tem data inicial, regra de vencimento e janela.

| Frequência | Configuração |
| --- | --- |
| Diária | Por equipamento e atividade: uma vez por dia de operação ou uma vez por turno; dias de operação; horário limite |
| Semanal | Dia da semana ou janela; tratamento de feriados |
| Mensal | Dia fixo ou janela; último dia válido em meses curtos |
| Trimestral / Semestral / Anual | Data de referência e repetição; mesmo tratamento de fim de mês |

**[decisão]** Regra diária por equipamento. **[decisão]** Turnos indefinidos: até que os turnos sejam configurados, a operação é por dia de operação. O cadastro de turnos é opcional para rotinas por dia; rotinas por turno só publicam após configurar turnos e aparecem como pendência de configuração até lá.

**[proposta] Modelo de regra:** cada item de plano tem um objeto `recurrence` com `freq` (daily/weekly/monthly/quarterly/semiannual/annual), `interval`, `anchor_date`, `by_weekday`, `by_monthday`, `per_shift` (booleano), `operating_days`, `window_hours` e `basis` (calendário fixo ou a partir da última execução).

**[decisão] Geração só no servidor.** A geração de ocorrências é uma função determinística que existe **apenas no servidor**. Um agendamento diário (Vercel Cron) gera, com upsert idempotente pela chave estável, as ocorrências dos próximos **60 dias**. Publicar, alterar ou suspender um plano também regenera a janela daquele plano. O aplicativo não calcula recorrência: recebe pelo pull as ocorrências da janela e as atrasadas. Por isso funciona offline até o fim da janela baixada, muito acima das desconexões de algumas horas confirmadas. Se a janela local estiver a menos de 7 dias do fim, o ícone de estado avisa que é preciso sincronizar.

**Chave estável da ocorrência:** `plan_item_id + equipment_id + period_start + shift_id` (shift_id vazio quando não há turno). Um celular por trabalhador não multiplica ocorrências; execuções concorrentes são preservadas e sinalizadas.

**[proposta] Regra inicial:** calendário fixo; atraso não apaga a ocorrência quando o período seguinte começa; planos "a partir da última execução" usam `basis` específico. O sistema registra qual regra gerou cada ocorrência e trata fim de mês e ano bissexto de forma explícita. Reagendamento, cancelamento e suspensão exigem autor e motivo.

O aplicativo mostra tarefas atrasadas separadas das futuras. Rotinas são agrupadas por equipamento e período em uma ordem, mantendo o resultado individual por item.

**Capacidade:** 122 linhas diárias, divididas em etapas acessíveis, podem passar de 200 toques por dia para quatro pessoas. O piloto mede o tempo real por item antes de ligar todos os setores.

Planos são versionados; uma execução iniciada mantém a versão recebida. Datas usam o fuso da unidade; o servidor guarda UTC e o fuso.

## 8 Operação offline e sincronização

### 8.1 Princípios

Após a ativação conectada, o aplicativo funciona sem internet, até o fim da janela de ocorrências baixada (60 dias), para: identificar o usuário, consultar equipamentos e instruções baixados, ver as ocorrências baixadas, responder itens, medir e capturar fotos e áudios. Cadastro administrativo e consolidação da empresa dependem do serviço central. O aplicativo informa se está pronto para offline e quais conteúdos faltam baixar.

### 8.2 Protocolo [proposta]

- **Identificadores:** todos os registros criados no aparelho usam ULID gerados localmente. O servidor nunca reatribui IDs.
- **Outbox transacional:** cada escrita local grava, na mesma transação SQLite, o registro e uma linha na tabela `outbox` (`op_id`, `entity`, `entity_id`, `payload`, `depends_on`, `attempts`, `state`). "Salvo no celular" só aparece depois do commit.
- **Push:** o aplicativo envia o outbox em lotes de até 50 operações para `POST /api/sync/push`, com `Idempotency-Key = op_id`. O servidor responde por operação: `accepted`, `duplicate` (já processada; tratada como sucesso), `conflict` (preservada e marcada) ou `rejected` (com motivo). Repetir o envio é sempre seguro.
- **Pull:** `GET /api/sync/pull?since=<cursor>` devolve mudanças de usuários, planos, equipamentos, ordens, ocorrências da janela e devoluções do gestor, filtradas pelos setores e equipamentos atribuídos ao usuário, com um cursor monotônico por unidade (sequência de uma tabela `change_log` alimentada por triggers). O aplicativo aplica as mudanças e guarda o novo cursor.
- **Mídia:** fotos e áudios ficam em fila própria (`media_queue`) com SHA-256 e tamanho. O aplicativo registra os metadados em `POST /api/media/register` e envia o arquivo **direto ao Supabase Storage pelo protocolo TUS** (upload resumível), nunca através das funções da Vercel, que limitam o corpo da requisição a 4,5 MB. A ativação e a renovação do token entregam ao aparelho um JWT de storage de curta duração, e a política RLS do bucket só permite gravar em `media/{unit_id}/{device_id}/`. O servidor confere tamanho e SHA-256 antes de marcar o arquivo como recebido. O registro-pai é aceito antes da mídia; o painel mostra "evidências pendentes" até a confirmação de cada arquivo. Formatos aceitos: AAC (celular) e Opus/WebM (estúdio no navegador).
- **Gatilhos:** ao detectar rede utilizável, ao voltar ao primeiro plano, por toque manual e por tarefa periódica (`workmanager`, sobre o WorkManager do Android) (mínimo de 15 minutos, com restrição de rede). O aplicativo não promete envio imediato se estiver encerrado ou restrito pelo Android.
- **Conflito de execução:** duas execuções com a mesma chave estável são ambas preservadas; a ordem fica em "precisa de atenção" para o gestor decidir qual vale ou se valem as duas.
- **Mudança administrativa em aparelho desconectado:** troca de responsável, revogação e nova versão de plano chegam no próximo pull. Registros feitos com permissão ou versão desatualizada são aceitos e marcados para análise, nunca descartados.
- **Acesso offline:** o token do dispositivo tem validade local configurável (padrão **[proposta]** de 30 dias sem contato); vencido, o aplicativo continua guardando registros e bloqueia apenas novas sessões até reconectar. Dispositivo perdido é revogado no painel; a revogação vale na próxima tentativa de sincronização e os dados locais são apagados após o push dos pendentes, se o aparelho voltar a conectar.

### 8.3 O que o trabalhador vê

| Estado | Significado |
| --- | --- |
| Salvo no celular | Registro gravado no aparelho, aguardando envio |
| Enviando | Tentativa de entrega em curso |
| Recebido | Servidor confirmou dados e evidências exigidas |
| Precisa de atenção | Rejeição, conflito ou falha que exige apoio |

Cada estado tem ícone fixo e áudio. O painel mostra a última comunicação de cada dispositivo e a idade dos dados; nunca afirma que uma tarefa foi omitida enquanto um dispositivo puder ter registros não enviados.

**[decisão]** Cenário de teste: desconexões de algumas horas, com respostas, fotos, áudios, reinício do aplicativo e do aparelho, rede instável e envio completo posterior; também virada de data offline e reconexão após interrupção longa. A duração exata entra como parâmetro do plano de testes, sem servir de prazo para descartar pendências.

Desinstalar, limpar dados ou perder o aparelho pode eliminar registros não enviados; o aplicativo alerta sobre pendências antes de qualquer ação própria. Backup central protege o que já chegou.

## 9 Painel do gestor e Kanban

Visão por unidade, setor, equipamento, responsável, periodicidade, prazo e prioridade. Um cartão por ordem (equipamento × período), com progresso dos itens.

| Coluna | Entrada / saída |
| --- | --- |
| A fazer | Ordem gerada, com prazo e responsável ou equipe |
| Em execução | Pelo menos um item iniciado |
| Impedida | Item com impedimento registrado e ação necessária |
| Aguardando validação | Executante finalizou; revisão pendente |
| Concluída | Execução e validação exigidas atendidas |

Ordens canceladas saem do quadro: ficam acessíveis por um filtro próprio e aparecem com total separado nos relatórios. Cancelar exige autor e motivo.

"Atrasada", "com problema", "evidências pendentes" e "conflito" são indicadores sobre o cartão, não colunas. Sincronização é acompanhada à parte. Mover um cartão não dispensa respostas, medições ou validações; toda mudança é auditada. O gestor devolve a ordem para complementação e o executante vê os itens devolvidos após sincronizar.

Um defeito abre uma ocorrência vinculada ao equipamento e ao item; o gestor classifica a prioridade e cria ou vincula uma ordem corretiva no mesmo quadro, encaminhando ao técnico se houver. Concluir a inspeção não encerra a corretiva.

**[proposta] Piloto:** toda ordem passa por validação do gestor. Após quatro semanas, medir a fila e definir quais rotinas encerram automaticamente (por exemplo, inspeções diárias com "tudo certo" e sem evidência obrigatória) e quais mantêm revisão.

## 10 Conteúdo acessível: pipeline de produção

Esta frente anda em paralelo ao software e é o maior risco de prazo. Dimensionamento pela planilha:

| Item | Quantidade estimada | Como produzir |
| --- | --- | --- |
| Fotos de equipamentos principais | 17 a 20 | Uma foto de contexto (mostra a localização) e uma de identificação por equipamento |
| Fotos de componentes | ≈ 157 (um por registro do cadastro) | Foto do ponto a verificar; componentes idênticos em posições diferentes precisam de foto que mostre a posição |
| Etiquetas QR | ≈ 157 + 20 | Etiqueta em vinil ou alumínio com a tag impressa; o QR codifica apenas a tag |
| Áudios de instrução | 60 a 90 | Um por tipo de instrução × variação relevante (por exemplo, "inspeção visual do rolamento" ≠ "inspeção visual do motor"); gravados por pessoa da empresa, em vocabulário local, aprovados pelo responsável técnico |
| Áudios de interface | ≈ 40 | Botões, estados, motivos de impedimento, confirmações |
| Figuras do PIN visual e dos motivos | ≈ 20 | Ilustrações simples, testadas com os trabalhadores |

Regra de publicação: nenhum item de plano é publicado para um executante sem foto do componente e áudio da instrução. O painel mostra o percentual de cobertura de conteúdo por setor, e o piloto só liga um setor quando a cobertura chega a 100%.

Um "estúdio" simples no painel permite ao gestor gravar e regravar áudios pelo navegador e anexar fotos a componentes, sem depender da equipe de desenvolvimento.

## 11 Decisões técnicas [decisão]

Critérios: Android como plataforma de campo; **um único desenvolvedor**; necessidade de SQLite robusto, câmera, áudio e trabalho em segundo plano; hospedagem na Vercel com deploy via GitHub; o mínimo possível de servidores para operar.

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Aplicativo de campo | Flutter (Dart) com Drift (SQLite) + SQLCipher; Riverpod; go_router; workmanager; camera; record (AAC); just_audio; mobile_scanner (ML Kit, QR offline); flutter_tts (fallback); flutter_secure_storage (Android Keystore); cliente TUS para upload resumível | Plugins maduros para tudo o que o offline-first exige; um código só, com iOS possível no futuro |
| Versão mínima do Android | Android 10 (API 29) | Alinhado com a decisão 2 (seção 16); restrições de segundo plano mais previsíveis |
| Painel web e API | Next.js (App Router) + TypeScript na Vercel; API em Route Handlers (`/api/*`); Drizzle ORM; validação com zod; componentes shadcn/ui (Radix); Kanban com dnd-kit; tabelas com TanStack Table; meta WCAG 2.2 AA [3] | Painel e API no mesmo projeto e na mesma linguagem; deploy automático a cada push no GitHub |
| Banco e arquivos | Supabase: PostgreSQL, Storage (bucket privado, upload resumível TUS), região São Paulo (`sa-east-1`) | Postgres padrão (sem aprisionamento no modelo de dados); Storage resolve o upload resumível que a Vercel não suporta |
| Geração de ocorrências | Função em TypeScript executada pelo Vercel Cron (diária) e na publicação de planos | Implementação única, sem duplicar a regra no aplicativo (seção 7) |
| Relatórios | PDF com @react-pdf/renderer e XLSX com exceljs, gerados na API | Mesma linguagem do painel; arquivos grandes vão para o Storage e são baixados por URL assinada |
| Autenticação | Painel: Supabase Auth (e-mail e senha + TOTP opcional). Aparelho: token de dispositivo emitido na ativação por QR, validado pela API, mais JWT de storage de curta duração; PIN visual local com hash | Sem digitação no campo; revogação centralizada |
| Contrato | Schemas zod compartilhados em `backend/packages/contract`, com OpenAPI gerado; modelos Dart gerados a partir do OpenAPI | O app e a API não divergem |
| Importador | Script TypeScript (exceljs) com modo simulação e relatório de conferência | Mesma linguagem e mesmo ORM da API |
| Observabilidade | Logs da Vercel, tabela de métricas de sincronização por dispositivo, alerta de dispositivo sem contato por N horas no painel | O gestor precisa saber a idade dos dados |
| Distribuição do app | APK assinado gerado no GitHub Actions; Google Play em teste fechado | Quatro aparelhos; atualização controlada |

**Custo recorrente de referência:** Vercel Pro (≈ US$ 20/mês; o plano Hobby proíbe uso comercial) e Supabase Pro (≈ US$ 25/mês; o plano gratuito pausa projetos inativos e não tem backup). Total ≈ US$ 45/mês, mais aparelhos.

**Limites da plataforma que orientam o desenho:** o corpo das requisições às funções da Vercel é limitado a 4,5 MB, e a duração de cada execução é limitada. Por isso a mídia vai direto ao Storage e o push processa lotes de até 50 operações.

Requisitos transversais: permissões verificadas na API e por RLS no Postgres; banco local cifrado (SQLCipher) e credenciais no Android Keystore; HTTPS obrigatório; URLs de mídia assinadas e de curta duração; migrações SQL versionadas no repositório; backup do Supabase (diário, com recuperação a um ponto no tempo se contratada) mais dump semanal externo, com teste de restauração mensal; migração de esquema do app compatível com fila pendente.

## 12 Modelo de dados

Campos principais; todas as tabelas têm `id` (ULID), `created_at`, `updated_at`, `deleted_at` (exclusão lógica) e `unit_id`.

| Tabela | Campos principais | Chaves e índices |
| --- | --- | --- |
| unit | name, timezone, operating_days, technician_role_enabled | — |
| shift | unit_id, name, start_time, end_time, active | único (unit_id, name) |
| sector | unit_id, code (A–H), name | único (unit_id, code) |
| equipment | sector_id, parent_id (nulo para principal), tag, short_name, full_name, brand, model, power_cv, rpm, lubricant, photo_media_id, qr_payload, status (active/suspended), suspension_reason | único (unit_id, tag); índice parent_id |
| user | name, photo_media_id, roles (array: executor/technician/manager), qualifications, active, auth_user_id (só gestores do painel) | — |
| user_sector | user_id, sector_id | único (user_id, sector_id) |
| user_equipment | user_id, equipment_id | único (user_id, equipment_id) |
| device | user_id, android_id, model, os_version, enrolled_at, token_hash, offline_valid_until, storage_jwt_expires_at, tts_ptbr_offline (booleano), revoked_at, last_seen_at, last_cursor | índice user_id |
| plan | equipment_id, name, version, status (draft/published/retired), published_at, effective_from | único (equipment_id, version) |
| plan_item | plan_id, equipment_id (componente), item_type (inspection/action/measurement), original_text, accessible_text, audio_media_id, photo_media_id, recurrence (JSON), required_qualification, evidence_rules (JSON), requires_validation, measurement (unit, min, max, procedure), source (file, sheet, row) | índice plan_id |
| work_order | equipment_id, period_start, period_end, shift_id, due_at, assigned_user_id, state (todo/in_progress/blocked/awaiting_validation/done/cancelled), priority, origin (scheduled/corrective), parent_issue_id | índice (equipment_id, period_start) |
| occurrence | work_order_id, plan_item_id, plan_version, stable_key, due_at, state | único stable_key; índice due_at |
| execution | occurrence_id, executed_by_user_id, device_id, device_time, server_time, result (ok/problem/blocked/done/not_done/na), block_reason, measurement_value, revision_of (nulo na primeira), revision_reason, validation_state, validated_by, validated_at | índice occurrence_id; somente inserção (correções viram nova linha com revision_of) |
| evidence | execution_id, kind (photo/audio), media_id, required, sha256, size_bytes, upload_state | índice execution_id |
| issue | equipment_id, execution_id, description_audio_media_id, photo_media_id, priority, state (open/triaged/in_corrective/closed), corrective_work_order_id | índice (equipment_id, state) |
| media | kind, mime, size_bytes, sha256, storage_key, uploaded_at | único sha256 por unidade |
| audit_event | actor_user_id, action, entity, entity_id, before (JSON), after (JSON), reason, at | índice (entity, entity_id) |
| sync_op | device_id, op_id, entity, entity_id, payload, result, received_at, error | único op_id |
| change_log | unit_id, seq (bigserial), entity, entity_id, op (upsert/delete), at | índice (unit_id, seq); alimentada por triggers; base do cursor do pull |

No aplicativo, as tabelas espelham as do servidor, restritas aos setores e equipamentos atribuídos e à janela de ocorrências (exceto `sync_op` e `change_log`, substituídas por `outbox` e `media_queue`), e guardam `synced_at` por linha. A fonte da verdade do esquema são as migrações SQL versionadas no repositório.

## 13 Backlog por épicos

Prioridade MoSCoW: **M** = obrigatório no MVP; **S** = desejável no MVP; **C** = pode ficar para depois; **W** = fora desta fase.

**E1 Cadastro e importação**
- M Importar a planilha com relatório de conferência e rastreabilidade por linha
- M Cadastrar unidade, setores, turnos (opcional), equipamentos e componentes com foto e tag
- M Gerar e imprimir etiquetas QR por tag
- M Cadastrar usuários, perfis, qualificações e atribuição fixa por setor e equipamento
- S Estúdio de áudio e fotos no painel
- C Importação incremental de novas planilhas

**E2 Planos e recorrência**
- M Criar itens de plano com tipo, instrução original e acessível, mídia, evidências e validação
- M Configurar recorrência nas seis frequências, com regra diária por equipamento e por turno
- M Versionar e publicar planos; bloquear publicação sem conteúdo acessível completo
- M Função determinística de geração de ocorrências no servidor (Vercel Cron e publicação de plano), janela de 60 dias, upsert por chave estável e testes de fim de mês, bissexto, turno
- S Simulação de datas para validar rotinas longas
- C Recorrência "a partir da última execução"

**E3 Aplicativo de campo**
- M Ativação por QR e PIN visual; retomada offline
- M Tela Hoje com atrasadas e futuras
- M Reconhecer equipamento por foto e por QR
- M Responder inspeção, ação e medição; motivos de impedimento ilustrados
- M Foto e áudio offline com compressão e fila
- M Desfazer, revisão pós-finalização, resumo falado
- M Indicador de estado de sincronização com áudio
- S Fallback TTS para conteúdo sem gravação
- C Modo de alto contraste e tamanho de fonte extra
- W Transcrição e comandos de voz

**E4 Sincronização**
- M Outbox transacional, push idempotente, pull por cursor
- M Upload resumível de mídia direto ao Storage (TUS) com verificação de integridade
- M Reconciliação de ocorrências por chave estável; preservação de execuções concorrentes
- M Tratamento de revogação, troca de responsável e nova versão de plano em aparelho desconectado
- M Validade local do acesso e dispositivo perdido
- S Sincronização em segundo plano (workmanager)
- C Compressão do pull para bases grandes

**E5 Painel e Kanban**
- M Kanban por ordem com cinco colunas e indicadores
- M Validar, devolver e cancelar ordens com motivo
- M Ocorrências de problema, triagem e ordem corretiva
- M Visão de dispositivos: última comunicação e pendências
- S Filtros salvos por gestor
- C Encerramento automático configurável por tipo de rotina

**E6 Relatórios e auditoria**
- M Relatório detalhado com filtros e exportação PDF/XLSX
- M Sete indicadores da seção 15 com fórmula visível e cobertura de sincronização
- M Trilha de auditoria consultável
- C Agendamento de relatório por e-mail

**E7 Operação e segurança**
- M Projetos Vercel e Supabase de produção, deploy pelo GitHub, migrações versionadas, backup e restauração testada
- M Cifra do banco local, Keystore, URLs assinadas
- M Pipeline de build do APK assinado e distribuição interna
- S Alertas de dispositivo sem contato
- W Integrações com ERP, sensores, estoque, custos

## 14 Plano de entrega [proposta]

Premissas: **um desenvolvedor** com apoio de IA, mais um responsável de conteúdo da Eco Gesso em meio período; sprints de duas semanas; o solicitante responde às decisões da seção 16 antes do Sprint 1. As faixas de esforço são estimativas iniciais, a revisar ao fim do Sprint 2.

**Estrutura do repositório (monorepo no GitHub):** `frontend/` (Next.js: painel e API; Root Directory do projeto na Vercel), `backend/` (migrações e políticas do Supabase, importador, contrato zod/OpenAPI), `mobile/` (Flutter), `docs/` e `.github/workflows/`.

| Sprint | Entrega | Critério para avançar |
| --- | --- | --- |
| 0 (1 semana) | Decisões da seção 16 fechadas; repositório, Vercel, Supabase e CI configurados; importador em modo simulação sobre a planilha real | Relatório de conferência com as 870 linhas rastreadas e as divergências da seção 3 |
| 1 | Protótipo Flutter navegável sem backend (Entrada/PIN, Hoje, Reconhecer, Item, Problema, Medição, Finalizar) com dados falsos e áudios provisórios; teste com 3 a 5 trabalhadores; figuras, motivos e PIN validados | 4 de 5 participantes completam o fluxo; lista de ajustes documentada |
| 2 | Migrações e RLS; motor de recorrência com testes; Vercel Cron; importador gravando no banco | Cenários 7, 13, 17 e 20 passam |
| 3 | Painel: autenticação, cadastros (setores, equipamentos, usuários e atribuição), planos versionados, estúdio de conteúdo, etiquetas QR em PDF, QR de ativação | Cenário 18 passa; plano só publica com conteúdo completo |
| 4 | App: ativação, PIN visual, Hoje, Reconhecer, respostas, foto e áudio offline, outbox cifrado | Cenários 1, 2 e 19 passam em aparelho real em modo avião |
| 5 | Sincronização completa: push/pull, upload TUS resumível, conflitos, revogação, troca de responsável, sincronização em segundo plano | Cenários 3, 4, 5, 6, 11 e 16 passam com dois aparelhos |
| 6 | Kanban, validação e devolução, ocorrências e corretivas, visão de dispositivos | Cenários 8, 9 e 14 passam |
| 7 | Relatórios PDF/XLSX, sete indicadores, auditoria consultável | PDF e XLSX conferidos contra consultas SQL de referência |
| 8 | Hardening: backup e restauração testados, atualização do app com fila pendente, acessibilidade do painel, documentação de operação, release do APK | Cenários 12 e 15 passam; checklist WCAG AA revisado |
| Piloto (4 semanas) | Setor D para a prova técnica, depois um setor operacional (A ou B) com conteúdo 100% coberto, 4 aparelhos, gestor validando tudo | Indicadores estáveis; fila de validação e conflitos medidos; decisão sobre encerramento automático |
| Expansão | Demais setores, um por vez, conforme cobertura de conteúdo | Cada setor liga com conteúdo completo |

Esforço de referência: cerca de 17 semanas de desenvolvimento para uma pessoa, mais 4 semanas de piloto com suporte parcial. Conteúdo: 2 a 3 dias de fotografia e etiquetagem para 157 componentes, 2 dias de gravação de 60 a 90 áudios, mais a revisão técnica das 870 linhas, que é o item de prazo menos previsível. Custo recorrente: ≈ US$ 45/mês de plataforma (seção 11), mais aparelhos, se fornecidos pela empresa.

O que **não** está no plano: estoque, compras, custos, planejamento de recursos, ERP, sensores, MTBF/MTTR, notificações externas, transcrição de voz e recursos de IA.

## 15 Relatórios e indicadores

O relatório detalhado reúne período, setor, equipamento e componente, item e versão do plano, responsável previsto, executante, prazo, horários de execução e recebimento, respostas, medições, evidências, impedimentos, revisões e corretivas relacionadas. Exportação em PDF (com data de geração e cobertura de sincronização) e XLSX. Fotos vão como anexo; áudios como referência com acesso controlado.

| Indicador | Definição |
| --- | --- |
| Cumprimento da programação | Itens previstos e executados ÷ itens previstos elegíveis |
| Execução no prazo | Itens executados até o vencimento ÷ itens previstos elegíveis |
| Pendências vencidas | Itens com prazo encerrado e sem execução válida recebida |
| Conformidade das inspeções | Inspeções "tudo certo" ÷ inspeções com resultado conclusivo |
| Validações pendentes | Ordens finalizadas que exigem revisão e ainda não foram validadas |
| Qualidade documental | Execuções com todos os campos e evidências obrigatórios confirmados |
| Problemas em aberto | Ocorrências sem tratamento encerrado, por prioridade e equipamento |

O denominador respeita calendário de operação, vigência e suspensões aprovadas. Cancelamentos (ordens fora do Kanban) e "não aplicável" têm totais próprios. Execuções com relógio do aparelho divergente do servidor em mais de 10 minutos **[proposta]** são sinalizadas. Uma inspeção com defeito conta como execução, não como conformidade. O painel nunca marca omissão enquanto houver dispositivo com pendência de envio possível.

## 16 Decisões bloqueantes para o Sprint 0

Cada linha traz a proposta padrão; se o solicitante não responder, a proposta padrão é adotada e registrada como tal.

| # | Decisão | Situação | Impacto se mudar |
| --- | --- | --- | --- |
| 1 | Construir ou usar solução pronta (seção 2) | **[decisão]** Construir; teste de 30 dias em solução pronta continua opcional | Define se o projeto existe |
| 2 | Aparelhos: modelos, Android mínimo, próprios ou da empresa | **[proposta]** Fornecidos pela empresa, Android 10+, 64 GB, câmera traseira ≥ 12 MP, capa resistente | Versão mínima, MDM, política de perda |
| 3 | Setor piloto | **[proposta]** Setor D (46 linhas) para a prova técnica, depois de resolvida a tag "C - RT - ME"; Setor A ou B para o piloto operacional | Volume de conteúdo inicial |
| 4 | Turnos: existem? quais horários? | **[decisão]** Indefinidos; operação por dia até configurar; rotinas por turno ficam como pendência de configuração | Geração de ocorrências e capacidade |
| 5 | Regra diária por equipamento | **[proposta]** Preencher a tabela de equipamentos com "por dia" como padrão e exceções marcadas | Capacidade e agenda |
| 6 | Empilhadeira e compressor (setores G e H) | **[proposta]** Fora do piloto até receber os planos | Cadastro |
| 7 | Hospedagem e titular dos dados | **[decisão]** Vercel (deploy via GitHub) e Supabase em São Paulo; **[proposta]** contas em nome da Eco Gesso, administradas pelo desenvolvedor | Contrato, LGPD, continuidade |
| 8 | Atribuição das tarefas | **[decisão]** Setores e equipamentos fixos por trabalhador, com reatribuição pelo gestor | Pull, conflitos, Kanban |
| 9 | Divergências de tag da seção 3 | **[proposta]** O responsável técnico confirma cada tag antes da importação do setor | Importação e piloto |

Informações necessárias mas não bloqueantes: vocabulário local da equipe; critérios das medições; processo presencial para urgências; distribuição dos quatro trabalhadores entre perfis e setores.

## 17 Critérios de aceite do MVP

1. Após configuração, o executante abre suas tarefas em modo avião, ouve instruções, responde e anexa foto e áudio.
2. Fechar e reabrir o aplicativo e reiniciar o aparelho preservam respostas, mídias e etapa atual.
3. A reconexão entrega os dados ao servidor; repetir envios não duplica respostas, ordens ou evidências.
4. Dois aparelhos registram a mesma ocorrência offline; ambos os registros ficam preservados e o conflito aparece para revisão.
5. Envio parcial de mídia não produz indicação falsa de documentação completa; falta de espaço e falha de envio têm recuperação orientada.
6. Alterar plano ou responsável durante uma desconexão não apaga a execução anterior; a reconciliação mantém versão e auditoria.
7. A agenda trata virada de dia e turno, mudança de mês, ano bissexto, atraso, suspensão e reagendamento sem eliminar pendências.
8. Uma inspeção com defeito fica registrada como executada e mantém o problema e sua corretiva abertos.
9. O gestor valida, devolve e rastreia correções sem técnico cadastrado; o relatório coincide com os registros recebidos e mostra a cobertura de sincronização.
10. Usuários representativos reconhecem equipamento, entendem a instrução e registram sucesso, problema e impedimento sem ler; meta: 4 de 5 participantes concluem sem intervenção.
11. Um usuário não acessa setores não autorizados; o aparelho mantém vínculo e autoria após retomada offline e reinício; troca de vínculo trata pendências do usuário anterior.
12. Restaurar backup central e atualizar o aplicativo preservam dados recebidos e fila local.
13. Equipamentos com regras diárias distintas geram a quantidade correta de ocorrências por dia ou turno, sem multiplicar por trabalhador, inclusive offline.
14. A operação funciona com o perfil técnico desativado e ativado, sem exigir técnico inexistente.
15. Cadastrar e desativar trabalhadores funciona para equipes menores e maiores que quatro, sem apagar autoria anterior.
16. Registros e mídias de algumas horas offline chegam completos após a reconexão; rotinas diárias funcionam sem turno; rotinas por turno mostram pendência até configurar horários.
17. (novo) A importação da planilha produz relatório de conferência com todas as linhas rastreáveis e lista de divergências; nenhuma linha é descartada silenciosamente.
18. (novo) Um item de plano sem foto do componente ou sem áudio da instrução não pode ser publicado para executantes.
19. (novo) O PIN visual bloqueia após cinco tentativas erradas e só é redefinido pelo gestor.
20. (revisto na v0.5) Regenerar as ocorrências de qualquer regra e intervalo não duplica nem altera chaves estáveis existentes (teste automatizado com 1.000 regras aleatórias); o aplicativo apenas consome a janela baixada.
21. (novo) Um trabalhador vê só as ordens dos setores e equipamentos atribuídos a ele e as reatribuídas pelo gestor; uma reatribuição chega ao aparelho na próxima sincronização sem apagar execuções já feitas.
22. (novo) Uma mídia de 20 MB interrompida no meio retoma do ponto em que parou e só aparece como recebida depois da conferência de tamanho e SHA-256.

## 18 Riscos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Conteúdo acessível atrasa mais que o software | Alta | Alto | Pipeline da seção 10 começa no Sprint 1; setor liga só com 100% de cobertura |
| Figuras e áudios não são compreendidos | Média | Alto | Teste com trabalhadores no Sprint 1, antes de codificar telas finais |
| Dependência de um único desenvolvedor | Alta | Alto | Repositório e contas em nome da Eco Gesso; migrações, infraestrutura e runbooks versionados; documentação de operação no Sprint 8 |
| Fila de validação maior que a capacidade do gestor | Média | Médio | Medir no piloto; encerramento automático configurável |
| Aparelhos restringem segundo plano e matam a sincronização | Alta | Médio | Sincronização ao abrir o app e por toque manual como caminho principal; segundo plano como bônus |
| Revisão técnica das 870 linhas não acontece | Média | Alto | Começar pelo setor piloto; importação preserva o original e marca pendências |
| Dependência de fornecedor (Vercel, Supabase) | Baixa | Médio | Postgres padrão, SQL versionado e Storage compatível com S3; migrar para VPS com Docker é possível sem reescrever o app |
| Limites de plataforma (corpo de 4,5 MB, duração das funções) | Média | Médio | Mídia direto ao Storage; push em lotes; relatórios grandes gerados em partes |
| Conflitos frequentes entre trabalhadores do mesmo setor | Média | Baixo | Medir no piloto; dividir atribuição por equipamento se necessário |
| Rotatividade da equipe de campo | Média | Baixo | Ativação por QR em minutos; histórico preservado |

## 19 Proteção de dados (LGPD)

- **Controladora:** a Eco Gesso. O desenvolvedor atua como operador, com contrato que define finalidade, acesso e devolução dos dados ao fim do serviço.
- **Dados pessoais tratados:** nome, foto do trabalhador, gravações de voz, autoria e horário de registros, identificador do aparelho.
- **Base legal [proposta]:** execução do contrato de trabalho e cumprimento de obrigação de segurança e manutenção. Foto e voz do trabalhador exigem termo de ciência assinado na ativação, com explicação falada.
- **Retenção [proposta]:** registros de manutenção pelo prazo exigido pela empresa (padrão de 5 anos); áudios de relato de problema por 2 anos após o encerramento da ocorrência; foto de trabalhador desativado removida após 90 dias, preservando nome e autoria.
- **Localização:** banco e arquivos na região São Paulo (`sa-east-1`).
- **Acesso:** fotos e áudios só por URL assinada de curta duração; cada acesso de gestor a mídia fica na auditoria.
- **Direitos do titular:** o painel exporta os dados de um trabalhador e registra pedidos de correção.

## Referências

A fonte operacional é a planilha anexada pelo solicitante. As referências abaixo apoiam decisões de projeto; não substituem a validação dos procedimentos de manutenção nem os testes com os trabalhadores. Páginas de fornecedores consultadas em 26 de outubro de 2026; preços sujeitos a alteração.

[1] W3C. Making Content Usable for People with Cognitive and Learning Disabilities. https://www.w3.org/TR/coga-usable/

[2] Android Developers. Build an offline-first app. https://developer.android.com/topic/architecture/data-layer/offline-first

[3] W3C. Web Content Accessibility Guidelines 2.2. https://www.w3.org/TR/WCAG22/

[4] Leankeep. https://leankeep.com/

[5] Produttivo. Visão geral do produto. https://www.produttivo.com.br/ e https://www.produttivo.com.br/aplicativo-checklist/

[6] Checklist Fácil, perfil no GetApp. https://www.getapp.com/inspection-software/a/checklist-facil/

[7] TRACTIAN. Aplicativo móvel do CMMS. https://tractian.com/solucoes/cmms/aplicativo-movel e planos https://tractian.com/planos

[8] Fracttal. How is Fracttal One commercialized. https://help.fracttal.com/hc/en-us/articles/24985527638669

[9] Facilio. MaintainX pricing (comparativo de terceiro). https://facilio.com/blog/maintainx-pricing/

[10] Rework. UpKeep vs Limble em 2026 (comparativo de terceiro). https://resources.rework.com/pt/tools/asset-management/upkeep-vs-limble

[11] Grashjs/cmms (Atlas CMMS), repositório. https://github.com/Grashjs/cmms

[12] Infraspeak. 10 melhores softwares de manutenção preventiva (2026). https://infraspeak.com/en/blog/preventive-maintenance-software
