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
cp migracao-postgres/drizzle.config.ts apps/barbearia/
mkdir -p apps/barbearia/drizzle && cp migracao-postgres/0000_init_postgres.sql apps/barbearia/drizzle/

cd apps/barbearia
npm remove better-sqlite3 @types/better-sqlite3
npm install postgres drizzle-orm
npm install -D drizzle-kit

export DATABASE_URL='postgres://usuario:senha@host:5432/barbearia'
node scripts/startup.mjs      # aplica as migrations

npx tsc --noEmit      # deve dar 0
npx astro check       # ver §5 antes de olhar o número
```

⚠️ **Não rode `psql -f drizzle/0000_init_postgres.sql` à mão.** Uma versão
anterior deste arquivo mandava fazer isso, e quebra: o `startup.mjs` não fica
sabendo, tenta aplicar a mesma migration no boot e falha em `CREATE TABLE`
porque as tabelas já existem. `scripts/startup.mjs` é o único caminho.

⚠️ **`npm remove better-sqlite3` derrubava 6 scripts**, não só os dois listados
no §6 original. Quatro já foram portados (§8). **Continuam em SQLite e quebram
quando chamados:** `seed.mjs`, `seed-relatorio-demo.mjs` e
`wipe-appointments.mjs` — todos ferramentas de desenvolvimento, nenhuma roda no
boot nem no atendimento. Ver §9 para por que o `seed.mjs` não é só porte.

O patch foi conferido: aplicado sobre o `src/` atual, o resultado bate byte a byte
com a árvore que passou nos testes.

⚠️ Os caminhos do patch apontam para `apps/barbearia/src/`, atualizados em 06/09/2026
junto com a unificação dos repositórios (`docs/MONOREPO.md`). Aplique **da raiz do
monorepo**, não de dentro de `apps/barbearia/`.

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
npx tsx ../../migracao-postgres/verificacao/smoke.mts    # agendamento e reagendamento
npx tsx ../../migracao-postgres/verificacao/rotas.mts    # as rotas portadas
npx tsx ../../migracao-postgres/verificacao/backup.mts   # pg_dump
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
| ~~`scripts/startup.mjs`~~ | ✅ portado — migrador próprio, §8 |
| ~~`scripts/backup.mjs`~~ | ✅ portado — `pg_dump`, §8 |
| ~~`scripts/set-admin-password.mjs`~~ | ✅ portado, ciente de tenant |
| ~~`scripts/settings.mjs`~~ | ✅ portado, ciente de tenant |
| `scripts/seed.mjs` | ainda em SQLite — e não é só porte, ver §9 |
| `scripts/seed-relatorio-demo.mjs`, `wipe-appointments.mjs` | ainda em SQLite; ferramentas de desenvolvimento |
| ~~Rotina de backup do servidor~~ | ✅ o daemon existente já resolve — `backup.mjs` agora usa `pg_dump` |
| ~~Os 10 arquivos de teste do repo~~ | ✅ 124 testes passando contra Postgres 16 |
| Carga dos dados do Bayron | SQLite → Postgres, com atenção a FK órfã. Ver a ordem obrigatória em §8 |

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


## 8. `scripts/startup.mjs` — migrador próprio (06/09/2026)

O `migrate()` do Drizzle depende de `drizzle/meta/_journal.json`, que não existe
mais: as migrations do Postgres são `.sql` numerados, escritos à mão. O script
foi reescrito e faz três coisas que o `drizzle-kit` não faz:

**1. Confere o hash.** O `drizzle-kit` decide o que rodar pelo *timestamp* e
grava o hash sem nunca compará-lo — foi assim que o seed do Bayron ficou meses
invisível dentro das migrations (`PENDENCIAS-ABERTAS.md` §4.6). Aqui, arquivo já
aplicado que mudou de conteúdo **aparece como aviso no boot**, em vez de sumir.

**2. Aplica cada migration e registra numa transação só.** Processo morto entre
aplicar e registrar deixaria a migration rodando de novo no próximo boot. Por
isso o script remove o `BEGIN;`/`COMMIT;` do arquivo — quem controla a transação
é ele.

**3. `--ate=0000` para no meio.** Existe por causa de uma operação só: a carga do
Bayron, de SQLite para Postgres. A 0001 só cria o tenant de backfill quando
encontra dados, então a ordem obrigatória é:

```bash
node scripts/startup.mjs --ate=0000   # só cria as tabelas
<carrega os dados do SQLite>
node scripts/startup.mjs              # a 0001 encontra os dados e faz o backfill
```

Rodar as duas de uma vez deixaria todas as linhas carregadas sem `tenant_id`.

**Junto com isso, a 0001 mudou:** ela só cria o tenant `bayron` quando há dados
para backfillar. Banco novo sai da migration com **zero tenants**, e quem cria o
do cliente é o provisionamento. Antes, uma barbearia recém-criada nascia com o
subdomínio `bayron.` e o nome "Barbearia Bayron". Coberto pelo teste
*"banco novo NÃO nasce com o tenant do Bayron"* em `tests/tenants-schema.test.ts`.


## 9. `scripts/seed.mjs` não é problema de porte

Ele **não foi portado de propósito.** O conteúdo dele é do Bayron: três
barbeiros com nome real (Bayron Patrezio, Emanuel Brilhante, Jackson Viana) e os
20 serviços dele com os preços dele. Traduzir isso para Postgres só deixaria mais
fácil provisionar um cliente novo com o catálogo e a equipe de outra barbearia —
a mesma doença do `PENDENCIAS-ABERTAS.md` §4.6, agora num script.

O que ele precisa virar são **dois** arquivos:

| | |
|---|---|
| `seed-bayron.mjs` | Os dados do Bayron. Já rodou em produção; serve para recriar ambiente de desenvolvimento |
| `provisionar.mjs` | Cria um tenant novo: linha em `tenants`, linha em `settings` e **um** barbeiro admin com a senha que o dono escolheu |

O `provisionar.mjs` depende de duas coisas que ainda não estão decididas: o
catálogo de serviços padrão (`PENDENCIAS-ABERTAS.md` §4.5) e como o dono entra no
painel (§1.5). Enquanto isso, ele pode nascer **sem catálogo nenhum** — o site já
aguenta: desde 06/09/2026 seção sem conteúdo não é renderizada, então uma
barbearia recém-criada mostra topo, localização e rodapé, e ganha a seção de
serviços quando o dono cadastrar o primeiro.

## 10. Backup: restauração testada (06/09/2026)

`PENDENCIAS-ABERTAS.md` §3.3 pedia "um teste de restauração de verdade, feito uma
vez, antes do primeiro cliente pago". Feito, contra Postgres 16:

```bash
# backup
DATABASE_URL=... BACKUP_DIR=/tmp/bkp node scripts/backup.mjs
# restauração num banco vazio
gunzip -c /tmp/bkp/barbearia_*.sql.gz | psql "$DATABASE_URL_DESTINO"
```

Conferido no banco restaurado: as linhas voltaram (barbearias, barbeiros,
serviços, agendamentos com nome e telefone do cliente), as 36 constraints de
tenant sobreviveram, as sequences continuaram de onde estavam — um `INSERT` novo
recebeu o id seguinte em vez de colidir — e as constraints ainda recusam
duplicata.

⚠️ **Um defeito grave apareceu nesse teste, no primeiro `backup.mjs` que escrevi:**
ele registrava o listener do código de saída do `pg_dump` só *depois* de a escrita
terminar. Quando o `pg_dump` falhava logo de cara — banco fora do ar — o evento
já tinha passado, ninguém via o erro, e o script imprimia "✓ Backup criado" para
um arquivo de 20 bytes com nada dentro. Backup que mente é pior que backup
ausente: você só descobre no dia em que precisa restaurar. Corrigido, e os dois
caminhos agora estão cobertos — sucesso grava o dump completo; falha apaga o
arquivo parcial e sai com código 1.
