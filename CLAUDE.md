# Barbearia no Ar — contexto para o Claude

> Este arquivo é lido em toda sessão. Cada linha custa contexto: aponte para os
> documentos, não os duplique. Estado que muda toda semana mora em
> `docs/PENDENCIAS-ABERTAS.md`, não aqui.

## O que é

SaaS para barbearias, vendido como **site próprio + agendamento + faturamento** por
mensalidade, com a montagem do site inclusa. Nasceu sob medida para a Barbearia Bayron,
que não fechou; virou produto.

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
| O que ainda não está decidido | `PENDENCIAS-ABERTAS.md` |
| Por que o produto existe, para quem se vende, o que é agência | `PLANO-PRODUTIZACAO.md` |
| Preço, margem, concorrentes verificados | `PRECIFICACAO.md` |
| Arquitetura alvo: multi-tenant, Postgres, RLS, três apps | `ARQUITETURA-MULTI-TENANT-V1.md` |
| Fases da produtização e as decisões D1–D7 | `ARQUITETURA-PRODUTO-V1.md` |
| Cobrança, Asaas, onboarding, estados do tenant | `ARQUITETURA-COBRANCA-V1.md` |
| Como fica em produção com N barbearias | `ARQUITETURA-PRODUCAO.md` |
| Por que os dois projetos viraram um repositório | `MONOREPO.md` |
| O modelo em português claro, sem termo técnico | `COMO-FUNCIONA.md` |

⚠️ `COMO-FUNCIONA.md` e `FLUXO-COMPLETO.md` são de 30/08 e estão **desatualizados sobre
o nome do produto** (dizem que não foi decidido; foi: Barbearia no Ar).
O `README.md` da raiz foi reescrito em 06/09 e descreve o monorepo.

## Regras que não se negociam

1. **Multi-tenant é decisão tomada.** Ver a skill `barbearia-multi-tenant`. Não reabrir a
   premissa com "instância por cliente seria mais simples" nem com custo.
2. **Nunca assuma barbearia única** em código novo. Nada de `settings.id = 1`, marca em
   constante, caminho de upload montado à mão.
3. **As duas paletas são invertidas.** Ver a skill `barbearia-paleta`. Copiar a regra de
   um site para o outro produz botão ilegível — já aconteceu.
4. **Documento que mente é pior que documento nenhum.** Ver a skill `barbearia-docs`.

## Como trabalhar aqui

- **O shell da máquina do usuário costuma estar fora** ("Workspace unavailable"). Nesse
  caso: `device_stage_files` → editar no container → `device_commit_files`, sempre com
  `expectedMtimeMs` para não sobrescrever edição do usuário.
- **`cp` pode falhar em silêncio** no container (arquivos anteriores ficam somente-leitura).
  Conferir depois de copiar; "não deu erro" não é o mesmo que "funcionou".
- **Testes:** vitest em `tests/*.test.ts`. Hoje são **10 arquivos para 49 rotas** — não
  existe rede de segurança. Teste de escopo se escreve junto com a rota, nunca depois.
- **Migrations:** `drizzle/NNNN_nome.sql` mais `meta/_journal.json`. A última é a `0009`.
- **Verificar antes de afirmar.** Rodar, renderizar, medir contraste, contar. Este projeto
  já teve documento afirmando que algo estava pronto quando não estava.

## Onde o código está na migração

Todo caminho abaixo é a partir de `apps/barbearia/`.

**Passo 1 de `ARQUITETURA-MULTI-TENANT-V1.md` §9 — feito.** `src/lib/tenant.ts` é o único
resolvedor de tenant, `src/lib/settings.ts` centraliza toda leitura e escrita da tabela
`settings`, e `pastaDeMidia()`/`urlDeMidia()` são os únicos lugares que montam caminho de
mídia.

**Passo 2 (Postgres) — escrito e testado, NÃO aplicado.** O porte inteiro está em
`migracao-postgres/porte-postgres.patch`, verificado contra um PostgreSQL 16 real. O
código em `apps/barbearia/src/` continua em SQLite até o patch ser aplicado. Como aplicar
e as três armadilhas de runtime: `migracao-postgres/LEIA-ME.md`.

Os passos 3 a 7 estão em `ARQUITETURA-MULTI-TENANT-V1.md` §9.
