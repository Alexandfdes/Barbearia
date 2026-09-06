# Passo 2 — porte para Postgres (completo, verificado, **não aplicado**)

> Data: 2026-09-06. Passo 2 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9.
> O patch está pronto e testado contra um Postgres 16 de verdade, mas **ainda não
> foi aplicado no repositório**. `src/` continua em SQLite e o site do Bayron
> continua no ar sem nenhuma alteração.

## 1. O que tem aqui

| Arquivo | O que é |
|---|---|
| `porte-postgres.patch` | O porte inteiro: 101 arquivos. Aplica com `git apply` |
| `schema.ts` | Cópia solta do `src/db/schema.ts` portado (já está dentro do patch) |
| `db-index.ts` | Cópia solta do `src/db/index.ts` portado (idem) |
| `drizzle.config.ts` | Vai na raiz do repositório |
| `0000_init_postgres.sql` | Vai em `drizzle/`, substituindo as 9 migrations de SQLite |
| `verificacao/` | Os testes que rodei contra o Postgres — ver §4 |

## 2. Como aplicar

```bash
git checkout -b postgres
git apply migracao-postgres/porte-postgres.patch
cp migracao-postgres/drizzle.config.ts .
mkdir -p drizzle && cp migracao-postgres/0000_init_postgres.sql drizzle/

npm remove better-sqlite3 @types/better-sqlite3
npm install postgres drizzle-orm
npm install -D drizzle-kit

export DATABASE_URL='postgres://usuario:senha@host:5432/barbearia'
psql "$DATABASE_URL" -f drizzle/0000_init_postgres.sql

npx tsc --noEmit      # deve dar 0
npx astro check       # ver §5 antes de olhar o número
```

O patch foi conferido: aplicado sobre o `src/` atual, o resultado bate byte a byte
com a árvore que passou nos testes.

## 3. O que mudou, e por quê

### O banco

O `db/index.ts` **não exporta mais `sqlite`**. No lugar entraram `db` (Drizzle),
`sqlConn` (SQL literal) e o helper `first()`, que substitui o `.get()` do
better-sqlite3.

Números do porte: **167 chamadas** `.all()`/`.get()`/`.run()` em **52 arquivos**,
e **4 funções exportadas viraram assíncronas** — `bookAppointment()`,
`getAvailableSlots()`, `computeOccupancy()` e `getSettings()`, esta última chamada
em quase todo componente do site.

### `created_at` mantém o formato antigo

O SQLite gravava `datetime('now')` como `YYYY-MM-DD HH:MM:SS` em UTC. O `now()` do
Postgres devolveria `timestamptz` com fuso e microssegundos — formato diferente, e
as colunas continuam sendo **TEXT com string ISO** (porte sem mudança de
comportamento). Por isso o default virou:

```sql
to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
```

Verificado: sai idêntico ao que o SQLite gravava.

### `BEGIN IMMEDIATE` virou advisory lock

O `BEGIN IMMEDIATE` do SQLite pegava o lock de escrita na hora, o que impedia dois
agendamentos simultâneos de passarem os dois pela checagem de conflito. O Postgres
não tem equivalente direto, então entrou:

```sql
SELECT pg_advisory_xact_lock(${barberId})
```

Serializa as reservas **do mesmo barbeiro** e cai sozinho no fim da transação.
`bookAppointment` e o reagendamento usam o mesmo lock de propósito: disputam o
mesmo horário, então precisam disputar o mesmo lock.

A garantia definitiva ainda é a exclusion constraint (§7 do documento de
arquitetura), que exige colunas `timestamptz` de verdade, não TEXT. O advisory
lock é o que segura até lá — e continua barato depois.

### Reagendamento saiu de dois lugares para um

Painel do barbeiro e link do cliente faziam a **mesma** transação com strings de
erro diferentes. Agora os dois chamam `src/lib/reagendar.ts` (único arquivo novo
do patch). Era questão de tempo até um dos dois ganhar uma correção que o outro
não.

### Backup deixou de ser cópia de arquivo

`sqlite.backup(dest)` não tem equivalente no Postgres. A rota agora roda `pg_dump`
e o download passa a ser um `.sql` (restaura com `psql`), não um `.db`.

Duas consequências que valem saber antes de subir:

- **`pg_dump` precisa estar instalado no container do app** (`postgresql-client`).
  Se não estiver, a rota responde 500 dizendo exatamente isso.
- A rota tem uma **trava deliberada**: só funciona enquanto `tenantDaSessao()`
  devolver `TENANT_UNICO`. Um `pg_dump` traz o banco inteiro — no dia em que o
  mesmo Postgres servir várias barbearias, este download entregaria os dados de
  todas para o admin de uma só. Quando o passo 3 introduzir a tabela `tenants`, a
  rota passa a responder 501 sozinha em vez de vazar em silêncio.

## 4. O que foi testado, e como

Não é revisão de código. Subi um **PostgreSQL 16**, apliquei a migration, populei
e chamei os handlers de verdade. Os testes estão em `verificacao/` e rodam com:

```bash
export DATABASE_URL='postgres://...' SESSION_SECRET='...'
npx tsx migracao-postgres/verificacao/smoke.mts    # agendamento e reagendamento
npx tsx migracao-postgres/verificacao/rotas.mts    # as rotas portadas
npx tsx migracao-postgres/verificacao/backup.mts   # pg_dump
```

| O que | Resultado |
|---|---|
| Migration aplica; 12 tabelas | ✅ |
| `created_at` no formato antigo | ✅ `2026-09-06 01:39:15` |
| `boolean` é booleano (`true`, não `1`); `serial` gera id; FK e `unique` valem | ✅ |
| Agendamento cria, com preço certo | ✅ |
| Idempotência devolve o existente, sem duplicar | ✅ |
| Conflito de horário devolve 409 **e não deixa resto** (rollback) | ✅ |
| Combo grava o item na mesma transação, com desconto certo | ✅ |
| Reagendar move o horário e grava quem editou | ✅ |
| Reagendar pelo link do cliente **não** grava editor | ✅ |
| Reagendar agendamento cancelado é recusado | ✅ |
| Busca por nome ignora maiúsculas | ✅ |
| Ficha do cliente devolve números, não strings | ✅ |
| Login do cliente aceita o par certo e recusa o errado | ✅ |
| Troca de horários é atômica; lista vazia apaga tudo | ✅ |
| Upsert de `barber_services` usa o unique | ✅ |
| Slug de produto não repete nem entra em laço | ✅ |
| `pg_dump` gera dump que **restaura** num banco limpo | ✅ |

### Três coisas que só apareceram porque rodou

**1. `= ANY(${array})` não funciona pelo template do Drizzle.** O Drizzle expande
um array JS como **tupla** — vira `($1, $2)` — e `= ANY` exige um array de verdade
do lado direito. Erro 42809, só em tempo de execução, com o painel em branco. Nem
o `tsc` nem o `astro check` pegam. Está comentado no `admin/index.astro`.

**2. `LIKE` do Postgres é sensível a maiúsculas.** No SQLite não era. A busca do
painel usa `ILIKE` — com `LIKE`, procurar "João" deixaria de achar "joão", sem
erro nenhum, só resultado vazio.

**3. `COUNT`/`SUM` voltam como string.** São bigint, e o driver entrega em string
pra não perder precisão. Sem `Number()`, `total === 0` nunca é verdade e a receita
do painel vira concatenação de texto. Todo agregado do patch passa por conversão.

## 5. `astro check` — leia antes de olhar o número

`npx astro check` acusa **~265 erros**, e isso é esperado: são todos código de
`<script>` client-side que **já existia antes do porte** (`possibly null`,
`implicitly any` em `dia/[date].astro` etc.).

O que importa:

- **0 erros** nos arquivos `.ts`
- **0 erros** no *frontmatter* dos `.astro` fora 7 avisos de variável não usada,
  todos conferidos como pré-existentes no HEAD

⚠️ **O `tsconfig.json` do repositório é o que faz esse check valer.** Um
`"include"` que só liste `src/**/*.ts` faz o `astro check` passar sem checar
nenhum `.astro` — foi exatamente assim que 114 erros de `getSettings()` sem
`await` passaram despercebidos numa primeira rodada. O `include` precisa ser
`["**/*"]`.

## 6. O que ainda falta

| | |
|---|---|
| `scripts/seed.mjs` | 7 statements ainda em better-sqlite3 |
| `scripts/startup.mjs` | migrations no boot |
| Rotina de backup do servidor | cron com `pg_dump`, fora da aplicação |
| Os 10 arquivos de teste do repo | rodar contra o Postgres |
| Carga dos dados do Bayron | SQLite → Postgres, com atenção a FK órfã |

### Duas mudanças de comportamento, ambas para melhor

**Chave estrangeira passa a valer sempre.** No SQLite dependia de
`PRAGMA foreign_keys = ON`. Se houver linha órfã no banco atual, ela vai aparecer
na carga — é bom que apareça.

**`enum` continua não sendo validado pelo banco** (é `text` nos dois). A validação
segue no Zod, como já era. Sem regressão.

## 7. Depois disto

Passos 3 a 7 do `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9: tabela `tenants`,
escopo nas 49 rotas, RLS, separação dos dois apps, login por telefone e a
exclusion constraint.
