# Passos 3 e 3.5 — `tenants`, `tenant_id` e a rede de testes

> Data: 2026-09-06. Passo 3 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9, mais um
> passo 3.5 que não estava na lista.
> Status: **escrito e testado contra um PostgreSQL 16 real; não aplicado.**
> A branch `monorepo` não foi tocada.
>
> **Depende do passo 2** (porte para Postgres) estar aplicado antes.

## 1. O que tem aqui

| Arquivo | O que é |
|---|---|
| `passo3-completo.patch` | Tudo: 7 arquivos. Aplica com `git apply` |
| `0001_tenants.sql` | A migration, para ler antes de aplicar |

Os 7 arquivos do patch:

```
apps/barbearia/drizzle/0001_tenants.sql          migration nova
apps/barbearia/src/db/schema.ts                  tenants + tenantId em 12 tabelas
apps/barbearia/src/lib/uploads.ts                pastaDeMidia() e urlDeMidia()  ← não existiam
apps/barbearia/src/lib/bookAppointment.ts        escopado por tenant
apps/barbearia/tests/tenants-schema.test.ts      12 testes novos
apps/barbearia/tests/bookAppointment.test.ts     portado para Postgres
apps/barbearia/tests/settings.test.ts            portado para Postgres
```

## 2. Como aplicar

```bash
# com o passo 2 já aplicado, na branch dele
git apply migracao-tenants/passo3-completo.patch
psql "$DATABASE_URL" -f apps/barbearia/drizzle/0001_tenants.sql

cd apps/barbearia
DATABASE_URL='postgres://.../barbearia_test' npx vitest run   # 118 testes
```

⚠️ **Os testes recriam o schema do zero.** Aponte `DATABASE_URL` para um banco de
TESTE, nunca para o de produção. Sem `DATABASE_URL` as três suítes de integração
são **puladas** em vez de falhar, para `npm test` continuar rodando numa máquina
sem Postgres.

A migration é **idempotente** — rodar duas vezes não dá erro, e isso é um dos testes.

## 3. Passo 3 — o que a migration faz

1. Cria `tenants` (slug, domain, business_name, status, created_at), com `CHECK`
   no status: só `active`, `suspended` ou `cancelled`.
2. Insere o tenant `bayron` e **preenche as 12 tabelas** com ele.
3. Dá `tenant_id integer NOT NULL REFERENCES tenants(id)` + índice às 12 tabelas.
4. Troca os `UNIQUE` de slug por compostos com `tenant_id` em `barbers`,
   `services` e `products`.
5. `appointments.manage_token` **continua único global**, de propósito.
6. `settings` ganha `UNIQUE (tenant_id)` e uma sequência para o `id`.

### 3.1 🔴 As 16 chaves estrangeiras deixavam vazar entre barbearias

O §5 do documento manda dar `tenant_id` às tabelas, mas **as chaves estrangeiras
continuavam apontando só para `id`**. Nada impedia um agendamento do tenant 1
apontar para um barbeiro do tenant 2.

**O RLS não pegaria isso.** Ele filtra pelo `tenant_id` da própria linha — que
está certo. O que está errado é para quem ela aponta. O dono do tenant 1 veria o
agendamento (é dele) e, ao juntar com `barbers`, leria o nome do barbeiro do
tenant 2.

As 16 viraram compostas:

```sql
FOREIGN KEY (barber_id, tenant_id) REFERENCES barbers (id, tenant_id)
```

Os nomes das constraints antigas são **descobertos no catálogo**, não escritos à
mão: uma primeira tentativa com nomes chutados falhou em silêncio e deixou a
chave antiga viva ao lado da nova.

### 3.2 `settings.id` não tinha sequência

No SQLite era a linha fixa `id = 1`, então a coluna nasceu `integer NOT NULL` sem
default. Com uma linha por tenant, o INSERT do segundo tenant falhava com
`null value in column "id"`. Verificado — era exatamente esse o erro.

### 3.3 O advisory lock não precisa de tenant

`pg_advisory_xact_lock(barberId)` continua correto: `barbers.id` é serial global,
dois tenants nunca compartilham o mesmo id. Registrado em comentário no código
para ninguém "corrigir" isso depois.

## 4. Passo 3.5 — a rede de testes

O §6 do `migracao-postgres/LEIA-ME.md` já listava "Os 10 arquivos de teste do
repo | rodar contra o Postgres" como pendente. O que estava errado era o §2, que
promete `npx tsc --noEmit # deve dar 0`: com o porte aplicado davam **61 erros,
todos em `tests/`**.

### 4.1 🔴 `pastaDeMidia()` e `urlDeMidia()` nunca foram escritas

O `CLAUDE.md` e o `ESTADO-ATUAL.md` afirmam que o passo 1 está completo, com
essas duas funções sendo "os únicos lugares que montam caminho de mídia".
**Elas não existiam.** Só o `tests/tenant.test.ts` as referenciava — daí 2 dos 61
erros. A terceira costura do passo 1 estava por fazer.

Escritas agora, com o contrato que o teste já especificava:

| Chamada | Resultado |
|---|---|
| `pastaDeMidia('logo')` | `…/uploads/logo` — caminho legado, sem slug |
| `pastaDeMidia('logo', outro)` | `…/uploads/vintage/logo` |
| `urlDeMidia('logo','abc.png')` | `/api/media/logo/abc.png` |
| `urlDeMidia('logo','abc.png', outro)` | `/api/media/vintage/logo/abc.png` |

⚠️ A barbearia única mantém o caminho **sem** o slug de propósito: os arquivos já
estão no disco assim e os caminhos estão gravados no banco. Inserir o slug agora
quebraria a instância em produção.

### 4.2 `bookAppointment` gravava sem tenant — e o teste pegou

Portado o teste, 6 dos 12 casos falharam com
`null value in column "tenant_id"`. **Foi o teste fazendo o trabalho dele.**

`bookAppointment` é o caminho de escrita mais importante do sistema, então
escopei os 7 pontos: a busca por idempotência, barbeiro+serviço, produto do
combo, expediente, conflito de horário, bloqueio, e os dois INSERT.

O mais perigoso era a **idempotência**: sem o tenant, uma chave repetida vinda de
outra barbearia devolveria o agendamento dela — com nome, telefone e horário.

O tenant entra como parâmetro opcional que cai em `tenantAtual()`. Vem do
resolvedor, **nunca do corpo da requisição**, como manda a skill.

### 4.3 `settings.test.ts` teve que mudar de premissa

A migration 0009 do SQLite **criava e semeava** a linha 1 com os dados do Bayron.
O `0000_init_postgres.sql` cria a tabela e não semeia — a carga dos dados está no
§6 do LEIA-ME do porte, como pendente. O teste agora **insere** a linha que antes
vinha pronta, em vez de afirmar que a migration a criou.

O seed original não se perdeu: `drizzle/0009_settings.sql` continua no
repositório com os valores do Bayron.

### 4.4 Um contorno que fica registrado como dívida

`src/db/index.ts` cria a conexão **no import** e joga erro sem `DATABASE_URL`.
Isso torna qualquer módulo que dependa dele impossível de importar numa máquina
sem banco — inclusive para testar função pura. O `settings.test.ts` define uma
URL de fachada quando não há banco (o driver conecta de forma preguiçosa, nenhuma
consulta roda).

**É contorno, não solução.** A solução é `db/index.ts` não abrir conexão no
import. Fica para o passo 4.

## 5. O que foi verificado

PostgreSQL 16.13 real, árvore montada do zero (clone limpo → porte → este patch):

| | |
|---|---|
| **118 testes, 11 arquivos, 0 falhas** | ✅ |
| Sem `DATABASE_URL`: 83 passam, 35 pulados, 0 falhas | ✅ |
| `tsc` em `tests/` | ✅ 0 erros (eram 61) |
| Patch aplica limpo sobre o porte | ✅ |

Os 12 testes novos não checam que a migration roda — checam que ela **barra**:
cada um tenta violar uma regra e espera levar não.

## 6. ⚠️ O que ainda NÃO está feito

**RLS não foi ligado.** A ordem do §9 é deliberada: escopar as rotas (passo 4)
vem **antes** de ligar o RLS (passo 5). Com RLS ligado primeiro, uma consulta sem
filtro devolve zero linhas em silêncio e o erro passa despercebido.

**As outras 48 rotas não foram escopadas.** Só `bookAppointment`. O `tsc` aponta
**14 erros em `src/`**, todos `TS2769` em INSERT — a fila do passo 4:

```
4  src/pages/api/admin/barbers/index.ts
1  src/pages/api/admin/services/index.ts
1  src/pages/api/admin/products/index.ts
1  src/pages/api/admin/combos/index.ts
1  src/pages/api/admin/working-hours/index.ts
1  src/pages/api/admin/time-off/index.ts
1  src/pages/api/admin/product-sales/index.ts
1  src/pages/api/admin/barber-services/[serviceId].ts
1  src/pages/api/admin/appointments/[id]/complete.ts
1  src/pages/api/admin/reservations/[id].ts
1  src/pages/reservations/index.ts
```

⚠️ **Essa lista cobre só os INSERT.** Os `SELECT` sem filtro o compilador não
pega — e são eles que vazam. Precisam de leitura rota a rota com teste de escopo,
como manda a skill `barbearia-multi-tenant`.

**`getSettings()` ainda faz `where(id = 1)`** — o "assume barbearia única" que a
skill proíbe. Com uma linha por tenant, o id 1 é a linha do Bayron por ordem de
inserção, não por desenho. Há um teste travando esse comportamento para a troca
ser consciente.
