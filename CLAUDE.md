# Fadeline — contexto para o Claude

> Este arquivo é lido em toda sessão. Cada linha custa contexto: aponte para os
> documentos, não os duplique. Estado que muda toda semana mora em
> `docs/PENDENCIAS-ABERTAS.md` e `docs/ESTADO-ATUAL.md`, não aqui.
>
> Revisado em 27/09/2026: até então este arquivo dizia que o código ainda era SQLite e
> que o porte não tinha sido aplicado — o estado de 06/09 de manhã.

## O que é

SaaS para barbearias: **site próprio + agendamento + faturamento**, por mensalidade.
Nasceu sob medida para a Barbearia Bayron, que não fechou; virou produto. Desde 24/09/2026
é **autoatendimento**: o dono se cadastra sozinho, com 7 dias grátis
(`docs/PLANO-PRODUTIZACAO.md` §13).

## Um repositório, dois aplicativos

Tudo vive em `C:\DEV\barbearia`. Os dois projetos foram unificados em 06/09/2026 —
`C:\DEV\produto` não é mais usado.

| Pasta | O que é | Porta |
|---|---|---|
| `apps/barbearia/` | O que cada barbearia recebe: site público, agendamento e painel | 4321 |
| `apps/vendas/` | O site de vendas: landing, `/onboarding`, caixa de entrada `/envios` | 4322 |

Por que num repositório só, e o que foi rejeitado: `docs/MONOREPO.md`.

⚠️ **O build do Docker precisa de `apps/barbearia` como contexto**, não da raiz.
O caminho mudou (`docs/MONOREPO.md` §3), e o `Dockerfile` também, desde então: o estágio só com as
dependências de produção, o backup antes das migrations e a saúde (`HEALTHCHECK`).

⚠️ **Padrão de `.gitignore` para conteúdo sensível nunca é ancorado na raiz.** Ao mover
o app para `apps/barbearia/`, `data/**/*.db` parou de casar e o git tentou versionar o
banco com os dados reais dos clientes. Use `**/data/...` — `docs/MONOREPO.md` §6.

## Onde o código está

Na branch **`monorepo`**, os sete passos de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9 estão
aplicados: Postgres, a tabela `tenants` com `tenant_id` nas tabelas de dados, RLS, a sessão e
o endereço decidindo a barbearia, o login por telefone e — desde 12/10/2026 — o banco
recusando dois agendamentos do mesmo barbeiro no mesmo horário. O passo 6 ("separar os apps")
é por endereço: site e painel continuam **num app e num processo só**. O estado de cada passo:
`docs/ESTADO-ATUAL.md` §4.

⚠️ **A `main` recebeu a `monorepo` em 09/10/2026** (PR #1), e desde 10/10 o app novo roda
dela no EasyPanel — com o banco vazio. **O site do Bayron, não:** o serviço dele constrói de
outro repositório, o `Alexandfdes/Barbearia-Bayron` (a `main` de lá parou em `e50926a`, de
10/07), em SQLite e Astro 6, até o `docs/ROTEIRO-MIGRACAO-PRODUCAO.md` ser executado — e o
`docs/ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2 diz o que mudou com o app já no ar.

⚠️ **A `main` parou em `0d86871` (10/10/2026), e é dela que o EasyPanel constrói:** o que entrou
na `monorepo` depois — oito migrations, `0010` a `0017`, e o `Dockerfile` novo — não está em
produção. Antes de juntar, o `docs/PENDENCIAS-ABERTAS.md` §3.2.

⚠️ **Os dois repositórios estão públicos**, este e o `Barbearia-Bayron` (conferido em
10/10/2026: o clone sem credencial funciona). Enquanto estiverem, nada de credencial, endereço
de servidor, usuário de banco ou configuração de produção em `docs/` — isso mora no projeto do
claude.ai, em `claude/ESTADO-EASYPANEL-FADELINE.md`.

*`migracao-postgres/` e `migracao-tenants/`, as entregas dos passos 2 a 4, saíram da raiz em
12/10/2026 — já estavam aplicadas em `apps/barbearia/`, e a `0001` de lá divergia da de
`drizzle/` (`docs/PENDENCIAS-ABERTAS.md` §4.6). Continuam no histórico do git.*

## Skills do projeto

`.claude/skills/` tem quatro skills versionadas — elas chegam junto com o clone, para
qualquer pessoa que abrir este repositório:

| Skill | Quando vale |
|---|---|
| `barbearia-multi-tenant` | qualquer código: migration, rota, consulta ao banco, tela |
| `barbearia-paleta` | cor, tema, botão, texto sobre fundo colorido |
| `barbearia-docs` | criar ou editar arquivo em `docs/` |
| `barbearia-cobranca` | a cobrança pela Asaas: o webhook, os eventos, o cancelar, o que o operador vê |

São regras que já custaram erro neste projeto. Leia antes de mexer na área de cada uma.

## Onde procurar o quê

Fonte de verdade em `docs/`, na raiz do monorepo:

| Preciso saber | Documento |
|---|---|
| **Onde o código está agora** — comece por aqui | `ESTADO-ATUAL.md` |
| O que ainda não está decidido, e a ordem do trabalho (`PENDENCIAS-ABERTAS.md` §6) | `PENDENCIAS-ABERTAS.md` |
| O caminho do dono, da landing ao site no ar — o roteiro do autoatendimento | `JORNADA-DO-BARBEIRO.md` |
| Por que o produto existe, para quem se vende, o que é agência | `PLANO-PRODUTIZACAO.md` |
| Preço, margem, concorrentes verificados | `PRECIFICACAO.md` |
| Arquitetura alvo: multi-tenant, Postgres, RLS, três apps | `ARQUITETURA-MULTI-TENANT-V1.md` |
| Fases da produtização e as decisões D1–D7 | `ARQUITETURA-PRODUTO-V1.md` |
| Cobrança, Asaas, estados do tenant | `ARQUITETURA-COBRANCA-V1.md` |
| Produção: o servidor, o deploy, o backup e a fila do webhook | `ARQUITETURA-PRODUCAO.md` |
| Como pôr a `monorepo` no ar para o Bayron | `ROTEIRO-MIGRACAO-PRODUCAO.md` |
| Por que os dois projetos viraram um repositório | `MONOREPO.md` |
| O modelo em português claro, sem termo técnico | `COMO-FUNCIONA.md` |

⚠️ `FLUXO-COMPLETO.md` é o caminho antigo, com montagem assistida — o do autoatendimento
é `JORNADA-DO-BARBEIRO.md`. O nome do produto é **Fadeline**, provisório desde 08/10
(antes, Barbearia no Ar): o `NOME_PRODUTO` de `apps/vendas/src/config.ts` e o de
`apps/barbearia/src/lib/produto.ts`, que um teste mantém iguais (`PENDENCIAS-ABERTAS.md` §0.1).

## Regras que não se negociam

1. **Multi-tenant é decisão tomada.** Ver a skill `barbearia-multi-tenant`. Não reabrir a
   premissa com "instância por cliente seria mais simples" nem com custo.
2. **Nunca assuma barbearia única** em código novo. Nada de `settings.id = 1`, marca em
   constante, caminho de upload montado à mão.
3. **As duas paletas são invertidas.** Ver a skill `barbearia-paleta`. Copiar a regra de
   um site para o outro produz botão ilegível — já aconteceu.
4. **Documento que mente é pior que documento nenhum.** Ver a skill `barbearia-docs`.
5. **Fuso nunca é conta, e é o da barbearia.** Hora local vira instante por `fromZonedTime`
   com o fuso dela — `fusoDe(barbearia)`, de `apps/barbearia/src/lib/timezone.ts`, que lê
   `tenants.timezone` (desde 12/10/2026) —, inclusive no navegador: o fuso desce pelos dados da
   página. `TZ_PADRAO` só onde não há barbearia. `tests/timezone-unico.test.ts` reprova a zona
   cravada, o fuso do ambiente, a conta de offset e o `getDay()` — o dia da semana sai de
   `diaDaSemana` (`apps/barbearia/src/lib/calendario.ts`).

## Como trabalhar aqui

- **Testes:** vitest em `apps/barbearia/tests/`; com banco, `npm run test:db`. Sem
  `DATABASE_URL`, os testes de banco **pulam em silêncio** — o número certo é o da linha
  mais recente do `docs/ESTADO-ATUAL.md` §8. Teste de escopo se escreve junto com a rota,
  nunca depois.
- **Conferidor de tipos:** `npm run check` (o `astro check`) tem de dar **zero erro**, nos dois
  apps — zerado em 12/10/2026 (o site de vendas, em 13/10), e o CI reprova o primeiro que
  aparecer (`docs/PENDENCIAS-ABERTAS.md` §2.29). ⚠️ Comentário HTML dentro de `{cond && (...)}`
  faz o conferidor ler o resto como texto — dezenas de erros falsos: ponha o comentário fora.
- **Variável de ambiente nova entra no `apps/barbearia/.env.example`**, explicada — é a lista de
  configurar o EasyPanel; o `tests/env-exemplo.test.ts` reprova a que o código ler e ele não contar.
- **Tela do painel não abre `<main>`:** o `AdminLayout` e o `OperadorLayout` já trazem a área principal —
  a única que o leitor de tela anuncia. Tela sem esses layouts traz a sua, uma só
  (`tests/area-principal.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.39). No site, o que fica fora
  da `<main>` vai num `<header>`, `<footer>`, `<nav>` ou `<aside>` (`tests/site-em-areas.test.ts`;
  `docs/PENDENCIAS-ABERTAS.md` §2.40). ⚠️ O Tailwind lê também os testes: classe dele escrita num
  teste entra no CSS do site. O que some da vista some também do teclado (`inert`), e carrossel que
  anda sozinho para com "reduzir movimento" (`tests/site-teclado-e-movimento.test.ts`).
- **O JSON-LD só diz o que a barbearia mostra** — nada escrito à mão: o horário fixo mentia para o
  Google, e a nota copiada dele ia contra a regra dele (`tests/horario-dos-buscadores.test.ts`;
  `docs/PENDENCIAS-ABERTAS.md` §2.41 e `docs/PENDENCIAS-ABERTAS.md` §4.11).
- **Quanto vale um atendimento, e a receita, saem de `apps/barbearia/src/lib/valorDoAtendimento.ts`**
  (no banco, `apps/barbearia/src/lib/receita.ts`): o concluído soma os itens da comanda. Tela nova
  que mostre um ou outro usa a regra, não a sua conta — cada tela fazia a sua, e a linha da agenda
  dizia R$ 50 onde a receita contava R$ 80. Para o cliente, `totalParaOCliente`: o combo conta
  desde o agendamento (`tests/valor-do-atendimento.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.43).
- **Configurações é em abas:** campo novo entra num bloco de `secoes` (com `aba` e `ancora`) de
  `apps/barbearia/src/pages/admin/configuracoes.astro`, e link para ele usa
  `/admin/configuracoes#<ancora>` — a tela abre a aba certa (`tests/configuracoes-em-abas.test.ts`;
  `docs/PENDENCIAS-ABERTAS.md` §2.45).
- **A lateral do painel fica presa na tela** no computador (`AdminLayout` e `OperadorLayout`, iguais):
  janela nova de tela (`fixed inset-0`) leva `z-index` acima de 40, para escurecer a lateral junto;
  barra fixa de ponta a ponta, abaixo de 40, para não cobrir o Sair (`tests/barra-lateral-presa.test.ts`;
  `docs/PENDENCIAS-ABERTAS.md` §2.46).
- **Data com nome de mês ou de dia da semana leva `{ locale: ptBR }`** — sem ele, o `date-fns`
  escreve "20 de Oct · Tue" (`tests/datas-em-portugues.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.44).
- **Tela do painel não chama rota do site** (`/api/services`, `/api/slots`…): elas acham a
  barbearia pelo endereço, e o painel é central — dá 404. Use a de `/api/admin/`, pela sessão
  (`tests/vagas-do-painel.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.38).
- **Migrations:** `apps/barbearia/drizzle/NNNN_nome.sql`, escritas à mão e aplicadas por
  `scripts/startup.mjs`, que confere o hash de cada uma — e que o `npm run dev` roda antes de
  subir (`predev`). Não há journal do Drizzle, e `db:push` e `db:generate` recusam de propósito.
  ⚠️ O `predev` roda só quando o servidor liga: entrega com migration nova pede reiniciar o
  `npm run dev` da máquina do dono — senão a tela diz "O banco está atrás do código"
  (`src/lib/bancoAtrasado.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.42).
- **Migration nova em produção tem backup antes:** com `NODE_ENV=production`, o `startup.mjs` tira
  um dump do banco antes de aplicar a primeira pendente, e não aplica nada se o dump falhar.
  `MIGRAR_SEM_BACKUP=1` pula, de propósito (`tests/backup-antes-das-migrations.test.ts`;
  `docs/PENDENCIAS-ABERTAS.md` §3.2).
- **Commit sem as linhas `Co-Authored-By` e `Claude-Session`** — decisão do dono em 16/10/2026.
  Os commits anteriores ficam como estão.
- **CI:** `.github/workflows/testes.yml` roda a suíte com banco a cada push na `main` e na
  `monorepo` — e teste pulado reprova. Desde 17/10/2026, o job `imagem` constrói o Dockerfile e o
  sobe sobre um banco na 0009, como o de produção: mexeu no Dockerfile, no CMD ou no boot, ele diz. Ele só manda no deploy depois do que o
  `docs/PENDENCIAS-ABERTAS.md` §3.8 pede.
- **Cobrança:** `apps/barbearia/src/lib/cobranca.ts`. Sem `ASAAS_API_KEY`, desligada; sem
  `ASAAS_AMBIENTE=producao`, sandbox. Tela ou rota de barbearia não chega a ela, nem por um
  arquivo do meio — só a assinatura e o webhook; o `tests/cobranca-isolada.test.ts` reprova
  (`docs/ARQUITETURA-COBRANCA-V1.md` §2). ⚠️ **Data em SQL cru vai como texto ISO e volta como
  texto:** o Drizzle desliga a conversão de data do driver na conexão inteira — parâmetro `Date`
  estoura, e `timestamptz` chega como string (`comoData`, no mesmo arquivo).
- **A fase da barbearia sai de `situacaoDe`** (`apps/barbearia/src/lib/situacao.ts`). Quem lê
  `past_due_since` para decidir a fase lê também `carencia_ate`, a carência estendida pelo
  operador — senão tira do ar quem ganhou prazo; o `tests/carencia-estendida.test.ts` reprova
  (`docs/PENDENCIAS-ABERTAS.md` §3.9).
- **Horário de agendamento é o texto do `toISOString()`** (`'2026-10-12T13:00:00.000Z'`): o
  banco recusa outro formato e dois agendamentos do mesmo barbeiro que se cruzam (migration
  0015). Caminho novo que grava horário traduz a recusa com `violouExclusao`, como
  `apps/barbearia/src/lib/bookAppointment.ts` — sem isso, o cliente recebe 500
  (`docs/PENDENCIAS-ABERTAS.md` §2.37).
- **JSON em SQL cru vai como `${JSON.stringify(x)}::text::jsonb`**, nunca só `::jsonb`: antes de o
  Drizzle tocar a conexão, o driver serializa de novo e o banco grava uma string — o
  `tests/jsonb-parametro.test.ts` reprova (`docs/PENDENCIAS-ABERTAS.md` §2.36).
- **No `npm run dev`, a tela final do cadastro diz sempre "quase no ar":** o servidor de
  desenvolvimento do Astro recusa a imagem que ela pede ao endereço novo. Não é defeito — no build
  e em produção ela confere de verdade (`apps/barbearia/src/lib/noAr.ts`).
- **E-mail no desenvolvimento** vai para `apps/barbearia/data/emails/`, um `.txt` por e-mail —
  é ali que estão o link da senha nova e o aviso de cada agendamento feito pelo site. Com
  `SMTP_URL`, sai de verdade (`src/lib/email.ts`).
- **Dependências:** o npm 10 quebra ao mexer nelas (`edgesOut`). Gere o lock com
  `npx npm@11 install` e regrave com o npm 10 (`npm install`), que é o do Docker; o `npm ci`
  dos dois tem que passar (`docs/PENDENCIAS-ABERTAS.md` §2.29).
- **Painel do operador:** `/operador` e as telas em `apps/barbearia/src/pages/operador/`, só no
  endereço do painel e só com `OPERADOR_SENHA_HASH` (gere com `npm run operador:senha`); sem ela,
  404. Com `OPERADOR_SEGUNDO_FATOR` (`npm run operador:segundo-fator`), pede também o código de 6
  dígitos do celular; essa variável fora do formato desliga o painel. Roda como dono do banco: o
  que ele pode mostrar está em `apps/barbearia/src/lib/operadorBarbearias.ts`
  (`docs/PENDENCIAS-ABERTAS.md` §3.9). **Tela nova
  abre com `exigirOperador`, antes de qualquer consulta:** o middleware deixa `/operador/` inteiro
  passar sem barbearia, e o `tests/operador-telas.test.ts` reprova a que não abrir.
- **Dois pools de conexão, de propósito** (`src/db/index.ts`): as reservadas por requisição e as do dono
  (`sqlConn`/`dbDono`). Num pool só, a requisição que segura a sua e pede outra trava o app inteiro
  quando ele enche — aconteceu (`tests/pool-sem-trava.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.56).
- **Mudança de situação de agendamento leva a condição no próprio UPDATE** (`WHERE status = 'confirmed'`
  … `RETURNING`), não só na leitura antes: dois pedidos ao mesmo tempo passavam os dois
  (`lib/fecharAtendimento.ts`).
- **O app não precisa de superusuário no banco:** `scripts/usuario-do-app.mjs` faz a troca, e
  migration nova não pode pedir superusuário. **Restaurou um backup?** `scripts/permissoes-do-app.mjs`
  — o boot recusa subir se o papel do app não ler as tabelas (`docs/PENDENCIAS-ABERTAS.md` §3.10 e `docs/PENDENCIAS-ABERTAS.md` §3.11).
- **O painel só abre no endereço do painel** (`apps/barbearia/src/lib/painelCentral.ts`, no
  middleware): `/admin…` pedido no endereço de uma barbearia vai para o painel; `/api/admin/…` e
  `/api/auth/…`, 404. Link para o painel, de dentro do site, pode ser relativo — o desvio leva. Link
  para o site, de dentro do painel, sai de `urlDoSite`, nunca de `window.location`. E nenhuma
  resposta se deixa emoldurar (`docs/PENDENCIAS-ABERTAS.md` §2.49).
- **Senha mudou ou e-mail mudou, por qualquer caminho: `cancelarPedidosDeSenha`**
  (`apps/barbearia/src/lib/redefinicaoDeSenha.ts`) — senão o link de senha nova pedido antes continua
  abrindo. Senha nova de barbeiro, em qualquer tela, tem pelo menos `SENHA_MINIMA` (8, de `redefinicaoDeSenha.ts`) caracteres —
  a do operador tem outra, 12, em `operador.ts`
  (`docs/PENDENCIAS-ABERTAS.md` §2.50).
- **Cada barbearia é independente, mesmo com o mesmo dono** (decisão de 18/10/2026): nada que remove
  na Asaas age sobre "todas as do cliente" — o cancelar só remove a assinatura comprovadamente da
  barbearia (`docs/PENDENCIAS-ABERTAS.md` §2.55).
- **O telefone de login é único só entre os barbeiros ATIVOS** (migration 0017,
  `barbers_phone_ativo_uq`), e se edita na Equipe: busca por telefone filtra `active`. Desligar grava
  `senha_trocada_em` — as sessões abertas caem e não voltam ao reativar.
- **O cliente final:** a sessão de "Meus agendamentos" vale só na barbearia dela
  (`getCustomerSession(request, tenantId)`), e o link `/a/<token>` não desmarca nem remarca depois de o
  horário começar (`horarioJaComecou`, em `apps/barbearia/src/lib/linkDoCliente.ts`).
- **Desfecho novo do webhook que pede mão começa por um de `DESFECHOS_QUE_PEDEM_OLHO`**
  (`apps/barbearia/src/lib/operadorBarbearias.ts`) — é a lista que o Início e a Cobrança do operador
  leem; o `tests/cobranca.test.ts` reprova "tratar à mão" fora dela (`docs/PENDENCIAS-ABERTAS.md` §2.53).
- **Requisição que muda dado só passa vinda do próprio endereço:** o `src/middleware.ts`
  confere a `Origin` antes de qualquer rota (`src/lib/origem.ts`). Rota nova não faz nada;
  integração de fora, sem navegador, chega sem `Origin` e passa. Não afrouxe para aceitar
  subdomínio: os sites das barbearias são subdomínios do painel (`docs/PENDENCIAS-ABERTAS.md` §2.30).
- **O shell da máquina do usuário (`device_bash`) às vezes está fora.** Nesse caso:
  `device_stage_files` → editar no container → `device_commit_files`, sempre com
  `expectedMtimeMs` para não sobrescrever edição do usuário.
- **Quando está de pé, ele não apaga arquivo nenhum — e o git apaga trava o tempo todo.**
  Use `git --no-optional-locks status`; commite com
  `git -c core.createObject=rename -c gc.auto=0 -c maintenance.auto=false`; e mova para
  `_to_delete/` o `.git/HEAD.lock` que todo commit deixa. Trava esquecida quebra o git do
  Windows dele. Para gravar por cima de arquivo existente, `tar` precisa de `--overwrite`.
- **A suíte não roda nesse shell:** o `node_modules` é do Windows. Nunca `npm install` por
  lá — ela roda na nuvem, sobre arquivos conferidos por sha256 com os da máquina.
- **`cp` pode falhar em silêncio** no container (arquivos anteriores ficam somente-leitura).
  Conferir depois de copiar; "não deu erro" não é o mesmo que "funcionou".
- **Verificar antes de afirmar.** Rodar, renderizar, medir contraste, contar. Este projeto
  já teve documento afirmando que algo estava pronto quando não estava — este arquivo
  inclusive, por três semanas.
