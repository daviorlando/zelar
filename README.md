# Zelar — manutenção preventiva para equipes de campo

Aplicativo de campo que funciona sem internet e pode ser usado por quem não lê: figuras, áudios, botões grandes e PIN numérico.
O painel web do gestor cadastra equipes e equipamentos, gera as ordens pela frequência de cada atividade e mostra o que foi feito.

## Baixar o app

[![Última versão](https://img.shields.io/github/v/release/daviorlando/zelar?label=%C3%BAltima%20vers%C3%A3o)](https://github.com/daviorlando/zelar/releases/latest)

- **Pelo celular:** abra https://zelar-vert.vercel.app/baixar e toque em baixar.
- **Direto do GitHub:** https://github.com/daviorlando/zelar/releases/latest (`zelar-<versão>-arm64.apk` serve para quase todos os aparelhos atuais; `arm32` para os antigos; `SHA256SUMS.txt` confere o arquivo).

Android 10 ou mais novo. Na primeira abertura, o gestor gera um código em **Celulares** no painel (vale 15 minutos, uso único) e a pessoa o digita no app.

## Pastas

| Pasta | Conteúdo | Stack |
| --- | --- | --- |
| `frontend/` | Painel do gestor e API (`/api/*`); Root Directory na Vercel | Next.js + TypeScript |
| `backend/` | Migrações do Supabase, importador da planilha, ferramentas de banco | Supabase, TypeScript |
| `mobile/` | Aplicativo de campo | Flutter (Android) |
| `docs/` | [Guia de implantação](docs/implantar.md) e roteiro do teste de uso | Markdown |
| `exemplos/ecogesso/` | Eco Gesso, o primeiro cliente, como exemplo completo e planilha-modelo | Markdown, XLSX |

## Colocar para rodar

Para usar a sua própria instância (Supabase, Vercel, e-mail, celulares), siga [docs/implantar.md](docs/implantar.md).
Para ver como uma empresa real foi implantada, veja [exemplos/ecogesso/](exemplos/ecogesso/README.md).

## Desenvolvimento local

Precisa de Node 20+, Docker (para o Supabase local) e Flutter.

```bash
cd backend
npm install
npx supabase start
npx supabase db reset        # aplica as migrações e o seed.sql (empresa de demonstração)

cd ../frontend
npm install
cp .env.example .env.local   # chaves que o `supabase start` mostrou; vale por cima do .env
npm run dev                  # painel em http://localhost:3000
```

Contas do seed, só para uso local (senha `senha-de-teste-123`): `superadmin@teste.local` (super-admin) e `gestor@teste.local` (gestor da "Empresa Demonstração"). Funcionária de teste: Ana, PIN `1234`.

App no celular ou emulador:

```bash
cd mobile
flutter run --dart-define=ZELAR_API=http://IP-DO-COMPUTADOR:3000
```

Não passe `ZELAR_DEVICE_KEY` no build: com ela o app pula o pareamento e usa a chave antiga de um aparelho só. Sem `ZELAR_API`, o app abre com um trabalhador de teste.

## Testes

```bash
cd backend && npm run typecheck && npm test   # regras do importador
cd backend && npm run test:db                 # isolamento entre empresas (precisa do Supabase local)
cd frontend && npm run lint && npm run build
cd mobile && flutter test
```

## Como funciona a operação

Nada gera ordem até o setor ser iniciado. No painel:

1. **Equipamentos:** cadastre setores, equipamentos, componentes e atividades, ou importe a planilha.
2. **Funcionários:** vincule ao menos um responsável ativo ao setor.
3. **Implantação:** em **Iniciar setor**, escolha a data e confira a prévia.

Primeiro vencimento: diária no próprio dia; semanal, mensal e trimestral seguem o calendário, e o período em andamento só conta se restar pelo menos metade dele; semestral e anual vencem um ciclo inteiro depois do início (e seguem contando a partir dessa data).

**Gestores:** em **Gestores**, **Novo gestor** pede nome e e-mail e envia o convite. Dali também se gera nova senha e se desativa uma conta. Depende de `SUPABASE_SECRET_KEY` no servidor.

## Importador da planilha

Lê o calendário de manutenção (uma aba por setor, mais a lista de equipamentos) e cadastra tudo de uma vez. O layout está em [exemplos/ecogesso/README.md](exemplos/ecogesso/README.md); a planilha-modelo, em [exemplos/ecogesso/modelo-planilha.xlsx](exemplos/ecogesso/modelo-planilha.xlsx).

```bash
cd backend
npm run import:dry -- ../exemplos/ecogesso/modelo-planilha.xlsx   # simulação: nada é gravado
```

A simulação gera `backend/tools/importer/out/relatorio-conferencia.xlsx` (resumo, linhas rastreadas, pendências, tipos de instrução, cadastro). Planilhas e saídas ficam fora do git.

A carga (`npm run import:load -- <planilha.xlsx> --company=<id>`) reconhece cada atividade pelo conteúdo (setor, frequência, tag e texto): inserir linhas ou renomear a aba não duplica nem reescreve o histórico. Se faltar a aba de um setor que já tem atividades em uso, a carga para sem gravar nada. Para banco remoto, veja [docs/implantar.md](docs/implantar.md).
