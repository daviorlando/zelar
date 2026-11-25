# Eco Gesso: implantação de referência

A Eco Gesso, fábrica de gesso, foi o primeiro cliente do Zelar. Este documento mostra como a empresa foi implantada, para servir de exemplo a outras. O passo a passo genérico está em [docs/implantar.md](../../docs/implantar.md); o escopo original, em [escopo/](escopo/Escopo_App_Manutencao_Eco_Gesso_v0_5.md).

Nenhum dado real da empresa está no repositório. A planilha dela foi usada só localmente; [modelo-planilha.xlsx](modelo-planilha.xlsx) tem o mesmo layout com linhas fictícias.

## A empresa

A migração `backend/supabase/migrations/20261106000000_empresas.sql` cria a empresa **Eco Gesso** com id `e0000000-0000-4000-8000-000000000001`, mas só quando o banco já tinha dados (era o caso da produção). Em instalação nova, o banco começa vazio e as empresas nascem em `/admin/empresas`.

Esse id fixo é o valor de `ZELAR_LEGACY_COMPANY_ID`, que atende os celulares antigos (sem pareamento) enquanto eles existirem.

## A planilha "Calendário de Manutenção"

O plano de manutenção veio de uma planilha do Excel com:

- **Uma aba por setor**, chamada `Setor A`, `Setor B` e assim por diante (a letra identifica o setor).
- **Uma aba de catálogo**, chamada `Lista de Equipamentos por setor`.

Layout de cada aba de setor (lido por `backend/tools/importer/parse.ts`):

| Coluna | Conteúdo |
| --- | --- |
| A | Equipamento (célula mesclada na vertical cobre as linhas do equipamento) |
| B | Componente |
| C | Tag, como `A - BMAN - ME` (setor - equipamento - componente) |
| D | Atividade, no formato `Tipo: instrução` (ex.: `Lubrificação: aplicar graxa`) |

A frequência vem de uma linha de título só com a coluna A preenchida, que abre um bloco: `DIÁRIAS`, `SEMANAIS`, `MENSAIS`, `TRIMESTRAL`, `SEMESTRAL` ou `ANUAL`. Depois dela vem uma linha de cabeçalho com `Tag` na coluna C (ignorada) e as atividades. Uma linha em branco encerra o grupo. O que vem antes do primeiro bloco (endereço, título) é ignorado.

Aba de catálogo: linha 1 é cabeçalho. Uma linha com `SETOR A` (só na coluna A) abre cada setor. As demais linhas têm: A sigla (tag), B nome, C marca, D modelo, E potência em CV, F RPM, G temperatura de trabalho, H lubrificante. A tag com duas partes (`A - BMAN`) é equipamento; com três (`A - BMAN - ME`), componente dele.

A importação normaliza as tags (caixa alta, ` - ` como separador) e **nunca junta equipamentos pelo nome**, só pela tag. Tag de outro setor na aba, tag fora do catálogo e linha sem tag viram pendências no relatório, para o responsável técnico decidir; nada é corrigido sozinho.

## Importar

```sh
cd backend
npm run import:dry -- <planilha.xlsx>
```

Confira `tools/importer/out/relatorio-conferencia.xlsx` (resumo por setor e frequência, pendências, tipos de instrução). Com tudo decidido:

```sh
ZELAR_CONFIRMA_REMOTO=<host do banco> npm run import:load -- <planilha.xlsx> --company=e0000000-0000-4000-8000-000000000001
```

Em 26/10/2026, a simulação sobre a planilha real leu 870 atividades, 157 tags no cadastro e 48 tipos de instrução, com 29 atividades pendentes de tag. Os setores foram iniciados um a um em **Implantação → Iniciar setor**, depois de vincular um responsável a cada um.

## Celulares na versão 1.2.0

A 1.2.0 mudou o `applicationId` para `app.zelar.campo` e passou a ser assinada com uma chave própria. O Android trata isso como outro aplicativo, então cada celular seguiu estes passos:

1. Conferir que não havia nada pendente de envio (desinstalar apaga o que não foi enviado).
2. Desinstalar o app antigo e instalar o APK da versão 1.2.0.
3. No painel, em **Celulares**, o gestor gerou o código de pareamento (15 minutos, uso único) e a pessoa o digitou no app.
4. Teste com um funcionário: entrar com o PIN, responder um item e ver a ordem mudar no quadro.

### Troca do PIN de figuras para números

Antes, o PIN era uma sequência de figuras. Passou a ser numérico: a primeira figura virou 0, a segunda 1, e assim por diante. O gestor vê o número de cada funcionário no cadastro, e cada um precisou saber o seu antes da troca. Na mesma ocasião, foram avisados de que as revisões diárias saíram e de que existe o botão "Não sei".

## Histórico da implantação em produção

Situação em 10/11/2026, com atualizações até 11/11.

- [x] **Cadastro público fechado** (10/11). O provedor Email continua ligado: é o login do painel.
- [x] **Backup** (10/11): dump do banco, arquivo SQL e os 2 arquivos do Storage. As contagens conferiram com a produção. A pasta foi copiada para fora do computador.
- [x] **Migrações** aplicadas (10/11), com resultado igual ao do ensaio feito sobre uma cópia da produção.
  - Nenhuma ordem diária aberta tinha resposta: as 182 abertas saíram; a diária concluída e os 9 itens respondidos ficaram.
  - Comando: `ZELAR_CONFIRMA_REMOTO=<host do banco> npm run db:migrate`.
- [x] **Painel na Vercel** (10/11): variáveis só em Production, secretas marcadas como sensíveis. Em 11/11 o painel passou também para o endereço `zelar-vert.vercel.app`, e a Vercel passou a usar só os nomes `ZELAR_*` (as antigas `ZELO_*` foram apagadas; o código ainda as aceita como reserva).
- [x] **E-mail** (10/11): Site URL, Redirect URLs e os dois modelos configurados no Supabase. O envio saiu provisoriamente pelo SMTP do Gmail (porta 465, senha de app). Desde 11/11, os links dos e-mails usam o endereço `zelar-vert`.
- [x] **Super-admin** (10/11): conta do super-admin criada em 10/11, com senha temporária que o painel obriga a trocar no primeiro acesso.
- [ ] **Resend com domínio próprio**, no lugar do Gmail: verificar domínio, DKIM, SPF e DMARC; ligar o SMTP no Supabase; testar convite e "esqueci a senha" em caixa real.
- [ ] **Combinar a troca de PIN** com a equipe antes de atualizar os celulares.
- [ ] **Atualizar cada celular** (seção acima).
- [ ] **Desligar a chave antiga:** quando `device.last_seen_at` mostrar que todos os celulares usam a versão nova, remover `ZELAR_DEVICE_KEY` e `ZELAR_LEGACY_COMPANY_ID` da Vercel e, no código, a compatibilidade com os aparelhos antigos (a tolerância em `gerar_ordens` para quando existe uma só empresa e o campo `pin` de `/api/mobile/workers`).
