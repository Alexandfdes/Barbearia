# Estado atual do código — comece por aqui

> Registro vivo de **onde o código está**, para quem chega ao projeto ou volta
> depois de um tempo. Atualizado: 06/09/2026.
>
> Companheiro de `PENDENCIAS-ABERTAS.md` (o que ainda não foi **decidido**).
> Este documento é sobre o que já foi **feito** e o que está pela metade.
>
> Tudo aqui foi verificado em 06/09/2026 rodando, não de memória.

---

## 1. O essencial em cinco linhas

1. Os dois projetos viraram **um repositório** com dois aplicativos.
2. O porte para **Postgres está escrito e testado, mas NÃO aplicado** — o código
   rodando ainda é SQLite.
3. Todo esse trabalho está na branch **`monorepo`**. A `main` não foi tocada.
4. O site do Bayron está **no ar** e não foi afetado por nada disto.
5. Antes de mexer, leia as três skills em `.claude/skills/` — são regras que já
   custaram erro aqui.

## 2. Como o repositório está organizado

```
C:\DEV\barbearia\            (o monorepo; C:\DEV\produto não é mais usado)
  apps/barbearia/   site público + agendamento + painel   → porta 4321
  apps/vendas/      landing, /onboarding, /envios         → porta 4322
  docs/             decisões de produto e arquitetura
  migracao-postgres/ o porte para Postgres, pronto e não aplicado
  .claude/skills/   três skills versionadas
  CLAUDE.md         orientação de trabalho
```

Por que num repositório só, e as três alternativas rejeitadas: `MONOREPO.md`.

**Rodar:** `npm run instalar` uma vez, depois `npm run dev` (barbearia) ou
`npm run dev:vendas`. As portas são diferentes de propósito — antes as duas eram
4321 e um 404 em `/admin` normalmente significava que o servidor no ar era o
outro projeto.

## 3. ⚠️ As três coisas que quebram se ignoradas

**O build do Docker mudou de lugar.** O `Dockerfile` está em `apps/barbearia/` e
não mudou por dentro, mas o build precisa de **`apps/barbearia` como contexto**,
não a raiz. Sem esse ajuste no EasyPanel, o build falha — não acha `package.json`
na raiz. Detalhe em `MONOREPO.md` §3.

**Padrão de `.gitignore` sensível nunca é ancorado na raiz.** `data/**/*.db`
casava só com a raiz antiga; ao mover o app para `apps/barbearia/`, a regra parou
de valer e o git tentou versionar o banco com nome, telefone e data de nascimento
dos clientes reais. Foi pego antes do commit. Use `**/data/...`. Ver
`MONOREPO.md` §6.

**O `tsconfig.json` é o que faz o `astro check` valer.** Um `"include"` que só
liste `src/**/*.ts` faz o `astro check` passar sem checar **nenhum** arquivo
`.astro`. Foi assim que 114 erros de `getSettings()` sem `await` passaram
despercebidos numa primeira rodada do porte. O `include` precisa ser `["**/*"]`.

## 4. Migração para multi-tenant — onde parou

O plano tem sete passos, em `ARQUITETURA-MULTI-TENANT-V1.md` §9.

| Passo | Estado |
|---|---|
| 1. As três costuras (tenant, settings, uploads) | ✅ feito, em SQLite |
| 2. Porte para Postgres | ⚠️ escrito e testado, **não aplicado** |
| 3. Tabela `tenants` e `tenant_id` | não começado |
| 4. Escopar as 49 rotas | não começado |
| 5. Ligar RLS | não começado |
| 6. Separar site do painel | não começado |
| 7. Login por telefone e exclusion constraint | não começado |

### O passo 2 em detalhe

O porte inteiro está em `migracao-postgres/porte-postgres.patch` — **101
arquivos**. Ele aplica limpo sobre o código atual (conferido com
`git apply --check`), mas **ninguém o aplicou**: `apps/barbearia/src/` continua
em `better-sqlite3`.

Não é revisão de código. Subi um **PostgreSQL 16**, apliquei a migration, populei
e chamei os handlers de verdade: **26 verificações**, todas passando —
agendamento, idempotência, conflito com rollback, combo, reagendamento pelos dois
caminhos, busca, ficha do cliente, login, troca de horários, upsert, e o
`pg_dump` gerando um dump que **restaura** num banco limpo. Os testes estão em
`migracao-postgres/verificacao/`.

Instruções de aplicação: `migracao-postgres/LEIA-ME.md`.

### ⚠️ Três defeitos que só apareceram porque rodou

Nenhum deles o `tsc` ou o `astro check` pega. Estão comentados no código, e
repetidos aqui porque voltam:

1. **`= ANY(${array})` não funciona pelo template do Drizzle.** Ele expande um
   array JS como **tupla** — vira `($1, $2)` — e `= ANY` exige um array de
   verdade. Erro 42809, só em tempo de execução, com o painel em branco.
2. **`LIKE` do Postgres é sensível a maiúsculas**, o do SQLite não era. A busca
   do painel usa `ILIKE`; com `LIKE`, procurar "João" deixaria de achar "joão" —
   sem erro, só resultado vazio.
3. **`COUNT`/`SUM` voltam como string.** São bigint e o driver entrega em texto
   para não perder precisão. Sem `Number()`, `total === 0` nunca é verdade e a
   receita do painel vira concatenação de texto.

## 5. Skills do projeto

`.claude/skills/` tem três, versionadas — chegam junto com o clone:

| Skill | Quando vale |
|---|---|
| `barbearia-multi-tenant` | qualquer código: migration, rota, consulta, tela |
| `barbearia-paleta` | cor, tema, botão, texto sobre fundo colorido |
| `barbearia-docs` | criar ou editar arquivo em `docs/` |

A de paleta merece destaque: **as regras de botão dos dois sites são
invertidas**. No site de vendas o botão é claro com texto grafite; no site da
barbearia é escuro com texto branco. Copiar a regra de um para o outro produz
botão ilegível, e já aconteceu.

A de multi-tenant tem uma seção "não reabrir a premissa": multi-tenant com banco
único **é decisão tomada pelo dono**. Trade-off técnico novo se apresenta com
recomendação; a premissa não se rediscute.

## 6. O que NÃO fazer

**Não aplicar o patch do Postgres direto na `main`.** Ele muda 101 arquivos e o
site está no ar. Branch, ajuste do build, e só então.

**Não usar `npm workspaces` sem ajustar o Dockerfile no mesmo commit.** Eles
juntariam os `package-lock.json` na raiz e quebrariam o build de um site no ar.
Ficaram de fora de propósito — `MONOREPO.md` §4.

**Não reescrever o que funciona sem motivo ligado ao multi-tenant.** A lógica de
slots, ocupação, telefone e WhatsApp é agnóstica de tenant e tem teste.

**Não marcar como pronto o que não foi visto funcionando.** Este projeto já teve
três documentos discordando entre si sobre o que estava pronto — é a razão de a
skill `barbearia-docs` existir.

## 7. O que está pendente e é mais urgente

Lista completa e priorizada em `PENDENCIAS-ABERTAS.md`. Os quatro que travam mais:

| | O quê | Onde |
|---|---|---|
| 🔴 | Timezone escrito em 19 arquivos como constante, não lido do ambiente | `PENDENCIAS-ABERTAS.md` §2.1 |
| 🔴 | Tela inicial sem fotos — o cliente paga e cai num retângulo preto | `PENDENCIAS-ABERTAS.md` §4.1 |
| 🔴 | Política de suporte, que a R$ 100/mês decide se existe margem | `PENDENCIAS-ABERTAS.md` §1.4 |
| 🔴 | Contrato, LGPD e o que acontece quando o cliente não paga | `PENDENCIAS-ABERTAS.md` §1.2 |

Fase 3 continua sendo bloqueio de MVP: galeria, depoimentos, catálogo de serviços
e FAQ ainda estão com o conteúdo do Bayron, não com conteúdo genérico de produto.

## 8. Histórico recente

| Quando | O quê |
|---|---|
| 06/09 | Skills do projeto versionadas em `.claude/skills/` |
| 06/09 | Dois repositórios viraram um monorepo; porta do site de vendas fixada em 4322 |
| 06/09 | Porte para Postgres concluído e verificado contra um PostgreSQL 16 real |
| 01/09 | Cor de destaque por barbearia, derivada com contraste garantido |
| 01/09 | Decisão de multi-tenant com banco único, substituindo a D1 |
