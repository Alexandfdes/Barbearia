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
| Painel (o SaaS) | `painel.barbearianoar.com.br` | sessão |
| Site de vendas | `barbearianoar.com.br` | não tem tenant |

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

O último item não é formalidade: são **9 arquivos de teste para 49 rotas**. Não existe
rede. Uma cláusula `WHERE` esquecida vaza nome, telefone e data de nascimento dos
clientes de uma barbearia para outra — é incidente de LGPD, não bug.

## Armadilhas verificadas neste código

**`barbers.slug` é a chave de login *e* uma constraint única global.** Com vários
tenants, dois donos "bayron" colidem no login. Recomendação registrada: login por
telefone (todo barbeiro tem, é único, e é consistente com o portal do cliente).

**`bookAppointment.ts` usa `BEGIN IMMEDIATE` do SQLite.** No Postgres vira exclusion
constraint com `tstzrange`: a garantia contra duplo agendamento sai da aplicação e vira
invariante do banco. A chave de idempotência continua necessária.

**`settings` era linha única (`id = 1`).** Passa a ser uma linha por tenant, e o cache de
módulo do `getSettings()` vira um mapa por tenant.

**A ordem importa:** escopar as rotas **antes** de ligar o RLS. Com RLS ligado primeiro,
uma consulta sem filtro devolve zero linhas em silêncio e o erro passa despercebido no
desenvolvimento.

## O que não fazer

Não reescrever o que funciona sem motivo ligado ao multi-tenant. A lógica de slots,
ocupação, telefone e WhatsApp é agnóstica de tenant e tem teste — deixe em paz.