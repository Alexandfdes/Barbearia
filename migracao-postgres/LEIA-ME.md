# Passo 2 — porte para Postgres (fundação pronta, não aplicada)

> Data: 2026-09-06. Passo 2 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9.
> **Estes arquivos ainda NÃO estão no lugar de destino.** Colocá-los sozinhos
> quebra o build — ver §3.

## 1. O que tem aqui

| Arquivo | Destino |
|---|---|
| `schema.ts` | `src/db/schema.ts` |
| `db-index.ts` | `src/db/index.ts` |
| `drizzle.config.ts` | raiz do repositório |
| `0000_init_postgres.sql` | `drizzle/` (substitui as 9 migrations de SQLite) |

## 2. O que foi verificado, contra um Postgres de verdade

Não é revisão de código: a migration foi aplicada e as consultas rodaram.

| Verificação | Resultado |
|---|---|
| A migration aplica sem erro | ✅ |
| 12 tabelas criadas | ✅ |
| `created_at` mantém o formato do SQLite | ✅ `2026-09-06 01:39:15` |
| `boolean` é booleano de verdade | ✅ `true`, não `1` |
| `serial` gera id sozinho | ✅ |
| `unique` de slug recusa duplicata | ✅ |
| `settings` com `id = 1` como o código espera | ✅ |
| FK recusa referência inexistente | ✅ |

### O detalhe que quase passou

O SQLite gravava `datetime('now')` no formato `YYYY-MM-DD HH:MM:SS` em UTC. O
`now()` do Postgres devolveria `timestamptz` com fuso e microssegundos — formato
diferente, e as colunas continuam sendo **TEXT com string ISO** (porte sem mudança
de comportamento). Por isso o default virou:

```sql
to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
```

Verificado: o formato sai idêntico ao que o SQLite gravava.

### Duas mudanças de comportamento, ambas para melhor

**Chave estrangeira passa a valer sempre.** No SQLite dependia de
`PRAGMA foreign_keys = ON`; no Postgres é sempre. Se houver linha órfã no banco
atual, ela vai aparecer na carga dos dados — é bom que apareça.

**`enum` continua não sendo validado pelo banco** (é `text` nos dois). A validação
segue no Zod, como já era. Sem regressão.

## 3. Por que ainda não está aplicado

O `db/index.ts` novo **não exporta `sqlite`**. Quem usa SQL cru por ele:

- `src/lib/bookAppointment.ts` — 8 statements, incluindo o `BEGIN IMMEDIATE`
- `src/pages/admin/index.astro` — 3 statements

E o porte é atômico por um motivo maior: o better-sqlite3 tem API **síncrona** e o
driver do Postgres não. Medido no repositório:

- **167 chamadas** `.all()` / `.get()` / `.run()` em **52 arquivos**
- **4 funções exportadas** viram assíncronas: `bookAppointment()`,
  `getAvailableSlots()`, `computeOccupancy()` e `getSettings()` — esta última é
  chamada em quase todo componente do site

## 4. Como seguir

O `tsc` é a lista de tarefas: com o Drizzle no Postgres, `.all()` devolve
`Promise<T[]>`, e usar isso como `T[]` é erro de tipo. Ou seja, **o compilador
aponta os 167 lugares um a um** — não é preciso caçar à mão.

Ordem sugerida:

1. Mover estes quatro arquivos para o destino
2. `npx tsc --noEmit` e corrigir até zerar
3. `npx astro check` para as páginas `.astro`
4. Portar os 11 statements crus (`bookAppointment`, `admin/index.astro`)
5. Portar `scripts/seed.mjs`, `startup.mjs` e o backup (`pg_dump` no lugar de cópia de arquivo)
6. Rodar os 10 arquivos de teste

Os passos 1–4 são um bloco só: o repositório não compila no meio deles.

## 5. Fora deste pacote

`scripts/` continua em better-sqlite3 — `seed.mjs` (7 statements), `startup.mjs`
(migrations no boot) e o backup, que deixa de ser cópia de arquivo e passa a ser
`pg_dump`. É a fatia seguinte, e ela é operacional, não de aplicação.

A exclusion constraint contra duplo agendamento (§7 do documento de arquitetura)
exige colunas `timestamptz` de verdade, não TEXT — fica para depois, junto com a
decisão de converter as colunas de data.
