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
O `Dockerfile` não mudou, mas o caminho sim — `docs/MONOREPO.md` §3.

⚠️ **Padrão de `.gitignore` para conteúdo sensível nunca é ancorado na raiz.** Ao mover
o app para `apps/barbearia/`, `data/**/*.db` parou de casar e o git tentou versionar o
banco com os dados reais dos clientes. Use `**/data/...` — `docs/MONOREPO.md` §6.

## Onde o código está

Na branch **`monorepo`**, os sete passos de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9 estão
aplicados: Postgres, a tabela `tenants` com `tenant_id` nas tabelas de dados, RLS, a sessão e
o endereço decidindo a barbearia, o login por telefone e — desde 12/10/2026 — o banco
recusando dois agendamentos do mesmo barbeiro no mesmo horário. O estado de cada passo:
`docs/ESTADO-ATUAL.md` §4.

⚠️ **A `main` recebeu a `monorepo` em 09/10/2026** (PR #1), e desde 10/10 o app novo roda
dela no EasyPanel — com o banco vazio. **O site do Bayron, não:** o serviço dele constrói de
outro repositório, o `Alexandfdes/Barbearia-Bayron` (a `main` de lá parou em `e50926a`, de
10/07), em SQLite e Astro 6, até o `docs/ROTEIRO-MIGRACAO-PRODUCAO.md` ser executado — e o
`docs/ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2 diz o que mudou com o app já no ar.

⚠️ **Os dois repositórios estão públicos**, este e o `Barbearia-Bayron` (conferido em
10/10/2026: o clone sem credencial funciona). Enquanto estiverem, nada de credencial, endereço
de servidor, usuário de banco ou configuração de produção em `docs/` — isso mora no projeto do
claude.ai, em `claude/ESTADO-EASYPANEL-FADELINE.md`.

*`migracao-postgres/` e `migracao-tenants/`, as entregas dos passos 2 a 4, saíram da raiz em
12/10/2026 — já estavam aplicadas em `apps/barbearia/`, e a `0001` de lá divergia da de
`drizzle/` (`docs/PENDENCIAS-ABERTAS.md` §4.6). Continuam no histórico do git.*

## Skills do projeto

`.claude/skills/` tem três skills versionadas — elas chegam junto com o clone, para
qualquer pessoa que abrir este repositório:

| Skill | Quando vale |
|---|---|
| `barbearia-multi-tenant` | qualquer código: migration, rota, consulta ao banco, tela |
| `barbearia-paleta` | cor, tema, botão, texto sobre fundo colorido |
| `barbearia-docs` | criar ou editar arquivo em `docs/` |

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
| Como fica em produção com N barbearias | `ARQUITETURA-PRODUCAO.md` |
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
- **Tela do painel não chama rota do site** (`/api/services`, `/api/slots`…): elas acham a
  barbearia pelo endereço, e o painel é central — dá 404. Use a de `/api/admin/`, pela sessão
  (`tests/vagas-do-painel.test.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.38).
- **Migrations:** `apps/barbearia/drizzle/NNNN_nome.sql`, escritas à mão e aplicadas por
  `scripts/startup.mjs`, que confere o hash de cada uma — e que o `npm run dev` roda antes de
  subir (`predev`). Não há journal do Drizzle, e `db:push` e `db:generate` recusam de propósito.
- **CI:** `.github/workflows/testes.yml` roda a suíte com banco a cada push na `main` e na
  `monorepo` — e teste pulado reprova. Ele só manda no deploy depois do que o
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
- **O app não precisa de superusuário no banco:** `scripts/usuario-do-app.mjs` faz a troca, e
  migration nova não pode pedir superusuário. **Restaurou um backup?** `scripts/permissoes-do-app.mjs`
  — o boot recusa subir se o papel do app não ler as tabelas (`docs/PENDENCIAS-ABERTAS.md` §3.10 e `docs/PENDENCIAS-ABERTAS.md` §3.11).
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
