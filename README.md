# Barbearia no Ar

Monorepo do produto. Dois aplicativos, um repositório.

| Pasta | O que é | Porta local |
|---|---|---|
| `apps/barbearia/` | O que cada barbearia recebe: site público, agendamento e painel | 4321 |
| `apps/vendas/` | O site de vendas: landing, `/onboarding`, caixa de entrada `/envios` | 4322 |

As portas são **diferentes de propósito**: antes os dois usavam 4321 e um 404 em
`/admin` normalmente significava que o servidor no ar era o outro projeto.

## Começar

```bash
npm run instalar     # instala as dependências dos dois
npm run dev          # sobe a barbearia em http://localhost:4321
npm run dev:vendas   # sobe o site de vendas em http://localhost:4322
npm test             # testes da barbearia
```

Cada app também funciona sozinho: `cd apps/barbearia && npm run dev`.

## Onde está o resto

| Preciso de | Onde |
|---|---|
| Orientação para trabalhar no projeto | `CLAUDE.md` |
| Decisões de produto e arquitetura | `docs/` |
| Por que o monorepo é assim | `docs/MONOREPO.md` |
| Migração para Postgres (pronta, não aplicada) | `migracao-postgres/` |

## Deploy

O `Dockerfile` vive em `apps/barbearia/` e continua igual ao de antes — mas o
build precisa ter **`apps/barbearia` como contexto**, não a raiz do repositório.
Ver `docs/MONOREPO.md` §3.
