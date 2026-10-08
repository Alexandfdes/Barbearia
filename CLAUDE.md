# Barbearia no Ar — contexto para o Claude

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

Na branch **`monorepo`**, os passos 1 a 6 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9
estão aplicados: Postgres, a tabela `tenants` com `tenant_id` nas tabelas de dados, RLS, e
a sessão e o endereço decidindo a barbearia. Falta a exclusion constraint do passo 7. O
estado de cada passo: `docs/ESTADO-ATUAL.md` §4.

⚠️ **A produção não tem nada disso.** O site do Bayron roda a `main` — último commit em
10/07/2026, anterior ao monorepo e ainda em SQLite. A `monorepo` tem tudo dela e mais, e
nada foi mesclado (conferido em 27/09/2026). O caminho para o ar é
`docs/ROTEIRO-MIGRACAO-PRODUCAO.md`, ainda não executado.

⚠️ **`migracao-postgres/` e `migracao-tenants/`, na raiz, são entregas antigas** — o
conteúdo já está aplicado em `apps/barbearia/`, e a `0001` de lá diverge da de `drizzle/`
(`docs/PENDENCIAS-ABERTAS.md` §4.6). Não aplique nada de lá.

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
| O que ainda não está decidido, e a ordem do trabalho (§6) | `PENDENCIAS-ABERTAS.md` |
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
é `JORNADA-DO-BARBEIRO.md`. O nome no código ainda é Barbearia no Ar; em 08/10 o dono
escolheu **Fadeline** como nome provisório, e a troca no código não foi feita
(`PENDENCIAS-ABERTAS.md` §0.1).

## Regras que não se negociam

1. **Multi-tenant é decisão tomada.** Ver a skill `barbearia-multi-tenant`. Não reabrir a
   premissa com "instância por cliente seria mais simples" nem com custo.
2. **Nunca assuma barbearia única** em código novo. Nada de `settings.id = 1`, marca em
   constante, caminho de upload montado à mão.
3. **As duas paletas são invertidas.** Ver a skill `barbearia-paleta`. Copiar a regra de
   um site para o outro produz botão ilegível — já aconteceu.
4. **Documento que mente é pior que documento nenhum.** Ver a skill `barbearia-docs`.
5. **Fuso nunca é conta.** Hora local vira instante por `fromZonedTime` com o fuso de
   `apps/barbearia/src/lib/timezone.ts`, inclusive no navegador — o fuso desce pelos dados
   da página. `tests/timezone-unico.test.ts` reprova a zona cravada e a conta de offset.

## Como trabalhar aqui

- **Testes:** vitest em `apps/barbearia/tests/`; com banco, `npm run test:db`. Sem
  `DATABASE_URL`, os testes de banco **pulam em silêncio** — o número certo é o da linha
  mais recente do `docs/ESTADO-ATUAL.md` §8. Teste de escopo se escreve junto com a rota,
  nunca depois.
- **Migrations:** `apps/barbearia/drizzle/NNNN_nome.sql`, escritas à mão e aplicadas por
  `scripts/startup.mjs`, que confere o hash de cada uma. Não há journal do Drizzle, e
  `db:push` e `db:generate` recusam de propósito.
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
