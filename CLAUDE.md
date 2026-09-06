# Barbearia no Ar — contexto para o Claude

> Este arquivo é lido em toda sessão. Cada linha custa contexto: aponte para os
> documentos, não os duplique. Estado que muda toda semana mora em
> `docs/PENDENCIAS-ABERTAS.md`, não aqui.

## O que é

SaaS para barbearias, vendido como **site próprio + agendamento + faturamento** por
mensalidade, com a montagem do site inclusa. Nasceu sob medida para a Barbearia Bayron,
que não fechou; virou produto.

## Dois repositórios, e eles se confundem

| Pasta | O que é | Porta |
|---|---|---|
| `C:\DEV\barbearia` | O que cada barbearia recebe: site público, agendamento e painel | 4321 |
| `C:\DEV\produto` | O site de vendas: landing, `/onboarding`, caixa de entrada `/envios` | 4321 ⚠️ |

⚠️ **Os dois usam a porta 4321.** Um 404 em `/admin/...` quase sempre significa que o
servidor no ar é o do *produto*, não o da barbearia.

⚠️ **`C:\DEV\produto` não é repositório git** — sem histórico, um apagão errado perde tudo.

## Onde procurar o quê

Fonte de verdade em `docs/` (repo da barbearia):

| Preciso saber | Documento |
|---|---|
| **O que ainda não está decidido** — comece por aqui | `PENDENCIAS-ABERTAS.md` |
| Por que o produto existe, para quem se vende, o que é agência | `PLANO-PRODUTIZACAO.md` |
| Preço, margem, concorrentes verificados | `PRECIFICACAO.md` |
| Arquitetura alvo: multi-tenant, Postgres, RLS, três apps | `ARQUITETURA-MULTI-TENANT-V1.md` |
| Fases da produtização e as decisões D1–D7 | `ARQUITETURA-PRODUTO-V1.md` |
| Cobrança, Asaas, onboarding, estados do tenant | `ARQUITETURA-COBRANCA-V1.md` |
| Como fica em produção com N barbearias | `ARQUITETURA-PRODUCAO.md` |
| O modelo em português claro, sem termo técnico | `COMO-FUNCIONA.md` |

⚠️ `COMO-FUNCIONA.md` e `FLUXO-COMPLETO.md` são de 30/08 e estão **desatualizados sobre
o nome do produto** (dizem que não foi decidido; foi: Barbearia no Ar).
O `README.md` é de maio e descreve o projeto como landing page — ignore.

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

Passo 1 de `ARQUITETURA-MULTI-TENANT-V1.md` §9 feito: `src/lib/tenant.ts` é o único
resolvedor de tenant, `src/lib/settings.ts` centraliza toda leitura e escrita da tabela
`settings`, e `pastaDeMidia()`/`urlDeMidia()` são os únicos lugares que montam caminho de
mídia. Ainda em SQLite, ainda uma barbearia.

Passo 2 é portar para Postgres. Os passos seguintes estão no §9 daquele documento.
