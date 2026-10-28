---
name: barbearia-multi-tenant
description: "Regras de arquitetura do Barbearia no Ar — multi-tenant com banco único, RLS e três aplicações. Use ao escrever, revisar ou planejar qualquer código do monorepo: migrations, rotas de API, consultas ao banco, telas do painel ou do site público."
---

# Barbearia no Ar — multi-tenant desde a base

## A decisão está tomada

O produto é construído **escalável desde a base**: multi-tenant, um banco único, três
aplicações. O dono decidiu assim.

**Não reabrir a premissa**, em nenhuma das formas:

- "instância por cliente seria mais simples"
- "nessa faixa de mensalidade isso não se paga"
- "com poucos clientes não compensa"
- "melhor fazer depois, quando doer"

Se aparecer um trade-off técnico novo — latência, custo de operação, uma migration
complicada — **apresente o trade-off e a recomendação sem questionar a premissa.**

## O desenho

| Aplicação | Endereço | Tenant vem de |
|---|---|---|
| Site público | domínio ou subdomínio da barbearia | header `Host` |
| Painel (o SaaS) | `PAINEL_URL`, ou `painel.<DOMINIO_BASE>` | sessão |
| Site de vendas | o domínio do produto | não tem tenant |

O domínio do produto ainda não foi registrado, e o nome (Fadeline) é provisório: endereço
nunca vai cravado no código — sai de `DOMINIO_BASE` e `PAINEL_URL` (`apps/barbearia/src/lib/tenant.ts`).

Um **PostgreSQL** único, com Row-Level Security por tenant.
Desenho completo em `docs/ARQUITETURA-MULTI-TENANT-V1.md`.

## Regras para todo código novo

**1. Nunca assuma barbearia única.**
Proibido: `where(eq(settings.id, 1))`, constante de marca em código, caminho de upload
montado à mão, consulta sem noção de tenant.

**2. Toda tabela de dados tem `tenant_id`.**
`integer NOT NULL REFERENCES tenants(id)`, com índice. Se a tabela guarda dado de
barbearia, ela tem tenant — sem exceção.

**3. Filtre na aplicação **e** confie no RLS.**
O RLS é a segunda parede, não a única. Consulta sem filtro deve estar errada nos dois
níveis.

**4. `UNIQUE` que envolve slug é composto:** `UNIQUE (tenant_id, slug)` para barbeiros,
serviços e produtos.
**Exceção:** `appointments.manage_token` continua único global — é o token anônimo do
link `/a/{token}` e precisa ser único no mundo.

**5. Tenant vem de um resolvedor único.** Um módulo só responde "de quem é esta
requisição". Nunca ler o `Host` ou a sessão direto dentro de uma rota.

**6. A sessão revalida o status do tenant a cada requisição.** Sessão viva de tenant
suspenso é o caminho mais fácil para um inadimplente continuar usando.

**7. Uploads em `uploads/{tenant_slug}/`**, caminho derivado de uma função, e a rota de
mídia confere o tenant antes de servir o arquivo.

## Checklist — migration

- [ ] Tabela nova tem `tenant_id NOT NULL` e índice
- [ ] `UNIQUE` com slug é composto com `tenant_id`
- [ ] Política de RLS criada e habilitada
- [ ] Os testes existentes passam

## Checklist — rota de API

- [ ] Recebe o tenant do resolvedor, **nunca do corpo da requisição**
- [ ] Toda consulta filtra por `tenant_id`
- [ ] **Teste de escopo escrito junto com a rota, não depois**

O último item não é formalidade: `tests/escopo-rotas.test.ts` varre as rotas por texto, e o
`tests/rls.test.ts` prova a segunda parede — mas guarda por texto pode ficar cega sem ficar
vermelha. Uma cláusula `WHERE` esquecida vaza nome, telefone e data de nascimento dos
clientes de uma barbearia para outra — é incidente de LGPD, não bug.

## Armadilhas verificadas neste código

*Resolvidas, e que não voltam:*

- **O login é por telefone**, não por `barbers.slug` — o slug era único global, e dois donos
  "bayron" colidiam. Hoje é `UNIQUE (tenant_id, slug)` (migration `0001`).
- **Duplo agendamento é recusado pelo banco** (migration `0015`, `exclusion constraint`), além do
  `pg_advisory_xact_lock` por barbeiro em `bookAppointment.ts`. Caminho novo que grava horário
  traduz a recusa com `violouExclusao` — senão o cliente recebe 500. A chave de idempotência
  continua necessária.
- **`settings` é uma linha por tenant**, e o cache do `getSettings()` é um mapa por tenant.

**A ordem importa:** escopar as rotas **antes** de ligar o RLS. Com RLS ligado primeiro,
uma consulta sem filtro devolve zero linhas em silêncio e o erro passa despercebido no
desenvolvimento.

## O que não fazer

Não reescrever o que funciona sem motivo ligado ao multi-tenant. A lógica de slots,
ocupação, telefone e WhatsApp é agnóstica de tenant e tem teste — deixe em paz.