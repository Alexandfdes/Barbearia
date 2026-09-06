# Multi-tenant — passos 3, 3.5 e 4 (verificados, **não aplicados**)

> Data: 2026-09-06. Passos 3 e 4 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9, mais
> um 3.5 que não estava na lista.
> Status: **escrito e testado contra um PostgreSQL 16 real; não aplicado.**
> A branch `monorepo` não foi tocada.
>
> **Depende do passo 2** (porte para Postgres) estar aplicado antes.

| | |
|---|---|
| Arquivos alterados | **63** |
| Rotas e páginas escopadas | **53 de 54** |
| Testes | **123, 0 falhas** |
| `tsc` | **0 erros** |
| `astro check` | 269 (a linha de base do porte é 282) — **0 regressões** |

## 1. Como aplicar

```bash
# com o passo 2 já aplicado, na branch dele
git apply migracao-tenants/passo-3-4-completo.patch
psql "$DATABASE_URL" -f apps/barbearia/drizzle/0001_tenants.sql

cd apps/barbearia
DATABASE_URL='postgres://.../barbearia_test' npx vitest run   # 123 testes
```

⚠️ **Os testes recriam o schema do zero.** Aponte para um banco de TESTE. Sem
`DATABASE_URL` as suítes de integração são puladas em vez de falhar.

## 2. Passo 3 — `tenants` e `tenant_id`

Cria a tabela `tenants`, dá `tenant_id NOT NULL` + índice às 12 tabelas com
backfill do Bayron, troca os `UNIQUE` de slug por compostos, e dá sequência ao
`settings.id`. É idempotente.

### 2.1 🔴 As 16 chaves estrangeiras deixavam vazar entre barbearias

O §5 do documento manda dar `tenant_id` às tabelas, mas **as chaves estrangeiras
continuavam apontando só para `id`**. Nada impedia um agendamento do tenant 1
apontar para um barbeiro do tenant 2.

**O RLS não pegaria isso.** Ele filtra pelo `tenant_id` da própria linha — que
está certo. O que está errado é para quem ela aponta. As 16 viraram compostas:
`FOREIGN KEY (barber_id, tenant_id) REFERENCES barbers (id, tenant_id)`.

### 2.2 `settings.id` não tinha sequência

Era a linha fixa `id = 1` do SQLite. O INSERT do segundo tenant falhava com
`null value in column "id"`. Verificado.

## 3. Passo 3.5 — a rede de testes

O §6 do LEIA-ME do porte já listava os testes como pendentes; o que estava errado
era o §2, que promete `tsc` zerado. Com o porte aplicado davam **61 erros**.

### 3.1 🔴 `pastaDeMidia()` e `urlDeMidia()` nunca foram escritas

O `CLAUDE.md` e o `ESTADO-ATUAL.md` afirmam que o passo 1 está completo com essas
funções sendo "os únicos lugares que montam caminho de mídia". **Não existiam** —
só o teste as referenciava. Escritas com o contrato que o teste já especificava.

A barbearia única mantém o caminho **sem** o slug de propósito: os arquivos já
estão no disco assim e os caminhos estão no banco.

### 3.2 O teste pegou `bookAppointment` gravando sem tenant

Portado o teste, 6 de 12 casos falharam. O pior ponto era a **idempotência**: sem
o tenant, uma chave repetida vinda de outra barbearia devolveria o agendamento
dela — com nome, telefone e horário.

## 4. Passo 4 — o escopo, e o que ele revelou

### 4.1 ⚠️ A superfície é maior que "49 rotas"

Os documentos falam em 49 rotas. **A contagem real é 41 rotas de API que tocam o
banco mais 12 páginas `.astro` que consultam direto no frontmatter** — o painel
inteiro. As páginas nunca apareceram na conta.

### 4.2 O que o compilador pegava, e o que não

Depois do passo 3, `tsc` apontava **14 erros**, todos INSERT sem `tenant_id`.
Úteis, mas era só a ponta: **os `SELECT` sem filtro o compilador não vê**, e são
eles que vazam. Foram encontrados lendo rota a rota. Exemplos:

- `admin/reservations/index.ts` — `db.select().from(reservations)` **sem `.where()` nenhum**
- `admin/barbers/index.ts`, `admin/combos/index.ts`, `admin/products/index.ts` — o
  GET listava tudo, de todas as barbearias

### 4.3 🔴 As consultas por telefone eram as piores

`admin/appointments/[id]/history.ts` monta a ficha do cliente buscando por
`customer_phone`. **Telefone não é escopado por barbearia** — é a mesma pessoa nas
duas. Sem o filtro, o dono de uma barbearia veria o histórico completo do cliente
na barbearia do vizinho: agendamentos, serviços, quanto gastou.

`admin/appointments/[id]/customer.ts` é pior: fazia `UPDATE ... WHERE
customer_phone = ?`, ou seja, **reescreveria** nome e data de nascimento do
cliente na outra barbearia.

`customer/login.ts` autentica por telefone + nascimento: sem tenant, o cliente
entraria no portal da barbearia errada.

### 4.4 `getSettings()` — cache por tenant

Fazia `where(id = 1)` e guardava o resultado numa variável única. Com várias
barbearias isso serviria a marca, as cores e o WhatsApp de uma no site de outra,
dependendo de quem carregou primeiro. Virou `Map<number, Settings>` com
`invalidateSettings(tenant?)`.

### 4.5 A única que ficou de fora, e por quê

**`api/auth/login.ts`.** Não é falta de trabalho: o login do painel busca o
barbeiro por `slug`, que agora é único **por tenant**, e o painel é central
(`painel.barbearianoar.com.br`) — não há host de onde tirar a barbearia. Dois
donos "bayron" colidem.

A recomendação do §6 do documento de arquitetura é **login por telefone**.
Enquanto essa decisão não for tomada, escopar essa rota é chutar.

## 5. O teste-guarda

`tests/escopo-rotas.test.ts` lê o código-fonte e falha de duas formas:

1. uma rota **fora** da lista de pendentes toca o banco sem tenant → alguém regrediu;
2. uma rota **da** lista já está escopada → tire-a da lista.

A segunda existe para a lista encolher de verdade em vez de virar cemitério.
Quando ela zerar, o passo 4 acabou. Não precisa de banco: roda sempre.

## 6. Erros meus no caminho — todos pegos por rodar, não por revisar

Registrados porque são o tipo de coisa que passa em silêncio:

- **Nomes de constraint chutados.** O `DROP` não achava nada e deixava a chave
  antiga viva ao lado da nova. Passei a descobrir no catálogo do banco.
- **Um erro de sintaxe escondeu 6 erros semânticos.** Meu script quebrou um
  arquivo; com erro de parse, o `tsc` para de checar semântica e reporta só os de
  sintaxe. **"Poucos erros" pode significar "a checagem parou".**
- **Filtro na tabela errada.** `.from(services)` com `eq(appointments.tenantId,…)`.
  Escrevi uma auditoria que compara a tabela do filtro com a do `from` e rodei em
  tudo; hoje dá limpo.
- **`tenant` fora de escopo.** Seis funções auxiliares usavam uma variável
  declarada só dentro do handler.
- **Passei `dummy` como nome de tabela** e contaminei 9 arquivos. Revertidos do
  zero e refeitos.
- **Vírgula pendurada** ao remover um `and(`, em 2 arquivos.

## 7. ⚠️ O que ainda NÃO está feito

**RLS não foi ligado** (passo 5). A ordem do §9 é deliberada: escopar antes de
ligar. Com RLS primeiro, uma consulta sem filtro devolve zero linhas em silêncio.

**O resolvedor ainda devolve o tenant único.** `tenantDoHost()` e
`tenantDaSessao()` retornam `TENANT_UNICO`, então **em produção nada muda de
comportamento** — os filtros existem e passam a valer no dia em que o resolvedor
for ligado. É de propósito: escopar é inofensivo hoje, ligar o resolvedor não é.

⚠️ `tests/tenant.test.ts` tem um teste que **deve falhar** quando o resolvedor
for ligado. É o alarme de que os chamadores precisam passar host e sessão de
verdade. Não o apague quando falhar — é ele avisando que chegou a hora.

**`db/index.ts` abre conexão no import**, o que impede importar qualquer módulo
dependente sem `DATABASE_URL`. Há um contorno no teste de settings, marcado como
dívida.

**A carga dos dados do Bayron** (SQLite → Postgres) continua pendente, como o §6
do LEIA-ME do porte já dizia.
