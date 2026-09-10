# Estado atual do código — comece por aqui

> Registro vivo de **onde o código está**, para quem chega ao projeto ou volta
> depois de um tempo. Atualizado: 06/09/2026.
>
> Companheiro de `PENDENCIAS-ABERTAS.md` (o que ainda não foi **decidido**).
> Este documento é sobre o que já foi **feito** e o que está pela metade.
>
> Tudo aqui foi verificado em 06/09/2026 rodando, não de memória.
>
> **Vai retomar o trabalho agora? Vá direto para o §9** — a fila do que fazer,
> em ordem, com o que quebra se a ordem for invertida.

---

## 1. O essencial em cinco linhas

1. Os dois projetos viraram **um repositório** com dois aplicativos.
2. O porte para **Postgres está escrito e testado, mas NÃO aplicado** — o código
   rodando ainda é SQLite.
3. Todo esse trabalho está na branch **`monorepo`**. A `main` não foi tocada.
4. O site do Bayron está **no ar** e não foi afetado por nada disto.
5. Antes de mexer, leia as três skills em `.claude/skills/` — são regras que já
   custaram erro aqui.

**O próximo passo concreto está no §9 deste documento.**

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
| 1. As três costuras (tenant, settings, uploads) | ✅ feito — a de uploads só em 06/09, ver abaixo |
| 2. Porte para Postgres | ✅ **aplicado em 06/09** — falta o `npm install` e a carga dos dados |
| 3. Tabela `tenants` e `tenant_id` | ✅ **aplicado em 06/09** |
| 3.5. Rede de testes em Postgres | ✅ **aplicado em 06/09** — 124 testes |
| 4. Escopar as rotas | ✅ **54 de 54** — fechado em 09/09 com o login por telefone |
| 5. Sessão decide a barbearia | ✅ **feito em 09/09** — ver §9.8 |
| 5.1. Ligar RLS | não começado |
| 6. Separar site do painel | não começado |
| 7. Login por telefone e exclusion constraint | ✅ login feito em 09/09; falta a exclusion constraint |

⚠️ **A terceira costura do passo 1 não existia.** Até 06/09/2026 este documento e o
`CLAUDE.md` afirmavam que `pastaDeMidia()`/`urlDeMidia()` centralizavam o caminho de mídia.
Só o `tests/tenant.test.ts` as referenciava — o código nunca as teve, e por isso aquele
teste não compilava. Foram escritas em 06/09, dentro do passo 3.5.

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

### Os passos 3, 3.5 e 4 em detalhe

Tudo em `migracao-tenants/`, num patch só (**63 arquivos**), com LEIA-ME próprio.
Aplica sobre o passo 2 — conferido com `git apply --check` num clone limpo.

Verificado em 06/09/2026 contra um **PostgreSQL 16.13** real, com a árvore montada
do zero (clone → porte → patch):

| | |
|---|---|
| Rotas e páginas escopadas | **53 de 54** |
| Testes | **124, 0 falhas** (eram 106, e 3 arquivos não compilavam) |
| `tsc` | **0 erros** (eram 61, todos em `tests/`) |
| `astro check` | 269 contra 282 da linha de base — **0 regressões** |

**O passo 3** cria `tenants`, dá `tenant_id NOT NULL` + índice às 12 tabelas com backfill
do Bayron, e troca os `UNIQUE` de slug por compostos. É idempotente.

**O passo 3.5** não estava na lista: o porte para Postgres não portou os testes — o §6 do
LEIA-ME de lá já registrava isso como pendente, mas o §2 prometia `tsc` zerado, e não era
verdade.

**O passo 4** escopou 53 rotas e páginas. Em produção **nada muda de comportamento**: o
resolvedor ainda devolve o tenant único, então os filtros existem e passam a valer no dia
em que ele for ligado. É de propósito — escopar hoje é inofensivo, ligar o resolvedor não é.

### ⚠️ Quatro coisas que o desenho não previa

1. **As 16 chaves estrangeiras deixavam vazar entre barbearias.** O §5 do documento de
   arquitetura manda dar `tenant_id` às tabelas, mas as chaves continuavam apontando só
   para `id` — nada impedia um agendamento do tenant 1 apontar para um barbeiro do tenant
   2. **O RLS não pegaria**: ele confere o dono da linha, não para quem ela aponta. As 16
   viraram compostas.
2. **A superfície é maior que "49 rotas".** São **41 rotas de API que tocam o banco mais
   12 páginas `.astro`** que consultam direto no frontmatter — o painel inteiro. As
   páginas nunca entraram na conta.
3. **`settings.id` não tinha sequência.** Era a linha fixa `id = 1` do SQLite; o INSERT do
   segundo tenant falhava com `null value in column "id"`.
4. **O compilador só vê os INSERT.** Depois do passo 3 o `tsc` apontava 14 erros, todos
   INSERT sem `tenant_id`. Os `SELECT` sem filtro ele não vê — e são eles que vazam.
   Foram encontrados lendo rota a rota; um deles, `admin/reservations/index.ts`, não tinha
   `.where()` nenhum.

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

### ⚠️ O porte estava incompleto — descoberto em 06/09/2026

O patch cobria `src/`. **Não cobria os scripts**, e dois deles derrubariam a
produção porque o próprio §2 do LEIA-ME manda desinstalar o `better-sqlite3`:

| Script | O que aconteceria | Estado |
|---|---|---|
| `scripts/startup.mjs` | Roda as migrations no boot. **O container não iniciaria.** | ✅ portado |
| `scripts/backup.mjs` | Alimenta o daemon de backup diário do Dockerfile. **O backup pararia em silêncio** — o que `PENDENCIAS-ABERTAS.md` §3.3 chama de "backup que não existe" | ✅ portado |
| `scripts/set-admin-password.mjs` | Caminho de suporte para dono que perdeu a senha | ✅ portado, ciente de tenant |
| `scripts/settings.mjs` | Edição de configuração fora do painel | ✅ portado, ciente de tenant |
| `scripts/seed.mjs` | Era o catálogo e a equipe do Bayron. Virou dois scripts — ver abaixo | ✅ substituído |
| `seed-relatorio-demo.mjs`, `wipe-appointments.mjs` | Ferramentas de desenvolvimento | 🟡 ainda em SQLite |

**Uma bomba junto:** o patch adicionava `0000_init_postgres.sql` mas **não removia
as 9 migrations SQLite** da pasta `drizzle/`. O migrador lê `*.sql` em ordem
alfabética, então `0000_handy_iron_monger.sql` rodaria primeiro, no Postgres. A
remoção entrou no patch — não depende de ninguém lembrar.

**O `startup.mjs` virou um migrador próprio.** O `migrate()` do Drizzle depende de
`drizzle/meta/_journal.json`, que não existe mais: as migrations do Postgres são
`.sql` numerados, escritos à mão. O novo script faz três coisas que o
`drizzle-kit` não faz:

1. **Confere o hash.** O `drizzle-kit` decide o que rodar por *timestamp* e grava
   o hash sem nunca compará-lo — foi assim que o seed do Bayron ficou meses
   invisível dentro das migrations (`PENDENCIAS-ABERTAS.md` §4.6). Agora, arquivo já aplicado que mudou
   de conteúdo aparece como aviso no boot.
2. **Aplica e registra na mesma transação.** Processo morto no meio fazia a
   migration rodar de novo no boot seguinte.
3. **`--ate=0000` para no meio.** Existe por causa de uma operação só, e ela é
   obrigatória na migração da produção do Bayron:

```bash
node scripts/startup.mjs --ate=0000   # só cria as tabelas
<carrega os dados do SQLite>
node scripts/startup.mjs              # a 0001 encontra os dados e faz o backfill
```

⚠️ **Rodar as duas de uma vez deixa todas as linhas carregadas sem `tenant_id`.**
A 0001 só cria o tenant de backfill quando encontra dados; num banco vazio ela
sai sem criar nada, e aí não há tenant para o backfill apontar.

### Provisionar uma barbearia nova — 06/09/2026

O `seed.mjs` foi **apagado** e substituído por dois scripts, porque o problema dele não
era o porte: ele plantava os três barbeiros e os 20 serviços do Bayron em qualquer banco.

| Script | Para quê |
|---|---|
| `scripts/provisionar.mts` | Cria uma barbearia nova: tenant, configuração, o dono como admin e horário comercial inicial. **Nenhum conteúdo de outra barbearia.** |
| `scripts/seed-bayron.mjs` | Os dados do Bayron, escopados no tenant dele. Serve para refazer ambiente de desenvolvimento |

```bash
DATABASE_URL=... SENHA_INICIAL='...' npx tsx scripts/provisionar.mts \
  --slug=cortes-do-ze --nome="Barbearia Cortes do Zé" --dono="José da Silva" \
  --telefone="84 99999-0000" --endereco="Rua das Flores, 42" --cidade="Mossoró/RN" \
  --cor="#7c3aed"
```

Roda com `tsx` porque importa `src/lib/accent.ts` — a derivação da cor com contraste
garantido mora lá, e duplicar essa conta no script era pedir para as duas versões
divergirem. A senha vai por variável de ambiente, não por argumento: argumento fica no
histórico do shell.

Verificado servindo o site da barbearia criada: nome, cidade, endereço, horários e a cor
da marca dela em tudo; **nenhum resquício do Bayron**; seções sem conteúdo não aparecem.

⚠️ **A barbearia nasce sem serviço nenhum e o script avisa.** O site fica apresentável e
**ninguém consegue agendar** — nada na tela indica que falta algo. Ver
`PENDENCIAS-ABERTAS.md` §4.5.

### ⚠️ Windows e Linux — 09/09/2026

O desenvolvimento é em **Windows** e a produção roda em **Linux**. Isso já
custou um teste: `tests/escopo-rotas.test.ts` usava `globSync` e depois
`caminho.replace('src/pages/api/', '')`. `globSync` devolve o separador do
sistema — `/` no Linux, `\` no Windows — então no Windows nenhum `replace`
casava: a contagem de páginas dava zero e os nomes não batiam com a lista de
pendentes. **Três dos cinco casos falhavam**, e o problema não tinha nada a ver
com o porte para Postgres.

Passou porque a verificação foi feita só em Linux.

⚠️ **Todo teste que monta caminho a partir de `glob`, `readdir` ou `path.join`
precisa normalizar antes de comparar com texto:**

```ts
import { sep } from 'node:path';
const norm = caminho.split(sep).join('/');
```

Vale para qualquer código que compare caminho como string, não só testes.

### ⚠️ Restauração de backup testada — 06/09/2026

`PENDENCIAS-ABERTAS.md` §5 pedia "um teste de restauração de verdade, feito uma
vez, antes do primeiro cliente pago". Feito, contra Postgres 16: backup de um
banco com dados, restauração num banco vazio. Voltaram as linhas (barbearias,
barbeiros, serviços, agendamento com nome e telefone do cliente), as **36
constraints de tenant** sobreviveram, as sequences continuaram de onde estavam —
um `INSERT` novo recebeu o id seguinte em vez de colidir — e as constraints ainda
recusam duplicata.

⚠️ **O primeiro `backup.mjs` que escrevi mentia.** Ele registrava o listener do
código de saída do `pg_dump` só *depois* de a escrita terminar; quando o
`pg_dump` falhava logo de cara, o evento já tinha passado e o script imprimia
"✓ Backup criado" para 20 bytes de gzip vazio. Backup que mente é pior que backup
ausente: você só descobre no dia em que precisa restaurar. Corrigido — sucesso
grava o dump completo, falha apaga o parcial e sai com código 1.

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

Lista completa e priorizada em `PENDENCIAS-ABERTAS.md`. Os que travam mais:

| | O quê | Onde |
|---|---|---|
| 🔴 | Como o barbeiro entra no painel com várias barbearias — **é decisão sua e trava o passo 5** | `PENDENCIAS-ABERTAS.md` §1.5 |
| 🔴 | As migrations plantam os dados do Bayron em todo banco SQLite novo | `PENDENCIAS-ABERTAS.md` §4.6 |
| 🔴 | Timezone escrito em 19 arquivos como constante, não lido do ambiente | `PENDENCIAS-ABERTAS.md` §2.1 |
| 🔴 | Política de suporte, que a R$ 100/mês decide se existe margem | `PENDENCIAS-ABERTAS.md` §1.4 |
| 🔴 | Contrato, LGPD e o que acontece quando o cliente não paga | `PENDENCIAS-ABERTAS.md` §1.2 |
| ✅ | ~~Tela inicial sem fotos e seções com conteúdo do Bayron~~ — resolvido em 06/09 | `PENDENCIAS-ABERTAS.md` §4.1 |

**A Fase 3 deixou de ser bloqueio de MVP em 06/09/2026.** Galeria, depoimentos,
catálogo e FAQ não mostram mais o conteúdo do Bayron numa barbearia nova: ou a
seção lê o banco do próprio cliente, ou ela não é renderizada. Verificado
servindo o site contra dois bancos diferentes, com os arquivos do Bayron
preenchidos no repositório.

⚠️ **O que sobrou dessa frente é o catálogo padrão** (`PENDENCIAS-ABERTAS.md`
§4.5): uma barbearia nova hoje nasce **sem serviço nenhum** e a seção some até o
dono cadastrar o primeiro. Funciona e é honesto, mas não é o mesmo que entregar
um catálogo sugerido pronto para editar.

## 8. Histórico recente

| Quando | O quê |
|---|---|
| 06/09 | Nenhuma seção do site mostra conteúdo do Bayron numa barbearia nova (`PENDENCIAS-ABERTAS.md` §4.1 fechado) |
| 06/09 | Descoberto que as migrations SQLite plantam os dados do Bayron — inclusive **5.0 com 227 avaliações** (`PENDENCIAS-ABERTAS.md` §4.6, novo) |
| 06/09 | Porte para Postgres completado: 4 scripts portados, migrador próprio, migrations SQLite removidas da pasta |
| 06/09 | Restauração de backup testada pela primeira vez, contra Postgres 16 |
| 06/09 | Decidido continuar no repositório `Alexandfdes/Barbearia`; o do site de vendas será arquivado (§9.2) |
| 06/09 | Skills do projeto versionadas em `.claude/skills/` |
| 06/09 | Dois repositórios viraram um monorepo; porta do site de vendas fixada em 4322 |
| 06/09 | Porte para Postgres concluído e verificado contra um PostgreSQL 16 real |
| 01/09 | Cor de destaque por barbearia, derivada com contraste garantido |
| 01/09 | Decisão de multi-tenant com banco único, substituindo a D1 |

---

## 9. Como retomar — o próximo passo, em ordem

Estado em 06/09/2026: o monorepo está na branch **`monorepo`**, já enviada ao GitHub, com **14
commits** que a `main` não tem. A `main`
continua em `e50926a` — o site do Bayron não foi afetado por nada disto.

Os passos abaixo são a fila. Cada um só faz sentido depois do anterior.

### 9.1 Provar que o site de vendas roda do lugar novo

```bash
cd C:\DEV\barbearia
npm install --prefix apps/vendas
npm run dev:vendas          # abre http://localhost:4322
```

Só o app da barbearia tem as dependências instaladas; a do vendas foi removida
porque a cópia veio pela metade. **Enquanto este passo não passar, não apague
`C:\DEV\produto`** — ele é a rede. Verificado em 06/09: o conteúdo de
`apps/vendas` é byte a byte igual ao de `C:\DEV\produto`, com uma única
diferença intencional (a porta 4322 no `package.json`).

Depois que passar, renomeie `C:\DEV\produto` para `_produto-ANTIGO` em vez de
apagar. O risco não é perder arquivo — está coberto pelo repositório
`barbersaas-sales-onboarding` no GitHub — é abrir a pasta antiga por hábito e
trabalhar uma hora no lugar errado.

### 9.2 Enviar a branch ao GitHub

```bash
git push -u origin monorepo
```

**Continua sendo o `Alexandfdes/Barbearia`** — decidido em 06/09. Ele já é o
`origin` deste repositório e tem o histórico real. Verificado: existem **0
commits no GitHub que não estejam aqui**, então o push só soma, não sobrescreve
nada.

Empurre **a branch, não a `main`**. O pull request no GitHub deixa a mudança
inteira revisável antes de qualquer coisa entrar em produção.

O `barbersaas-sales-onboarding` fica redundante depois disso — o conteúdo está em
`apps/vendas` e o commit original `076997a` está preservado no histórico do
monorepo. Sugestão: **arquivar**, não apagar.

### 9.3 ⚠️ Ajustar o build antes de tocar na `main`

O `Dockerfile` está em `apps/barbearia/` e não mudou por dentro, mas o build
precisa de **`apps/barbearia` como contexto**, não a raiz do repositório. No
EasyPanel é o campo de caminho/contexto do build.

**Esta é a única coisa que pode derrubar o site do Bayron.** Se a `main` receber
o monorepo antes do ajuste, o próximo deploy falha por não achar `package.json`
na raiz. Detalhe em `MONOREPO.md` §3.

### 9.4 Só então, mesclar na `main`

Com 9.1, 9.2 e 9.3 feitos, o merge é seguro.

### 9.5 ✅ Postgres — aplicado em 06/09/2026

O porte **já está aplicado** na árvore de trabalho, junto com os passos 3, 3.5 e 4. Os
arquivos batem hash a hash com o ambiente onde os 124 testes passaram.

**Falta você fazer, no PowerShell** (não dá para eu rodar: o shell que uso na sua máquina
é um Linux separado, e um `npm install` meu baixaria binários Linux por cima do seu
`node_modules` do Windows):

```powershell
cd C:\DEV\barbearia\apps\barbearia
npm remove better-sqlite3 @types/better-sqlite3
npm install postgres drizzle-orm
npm install -D drizzle-kit

$env:DATABASE_URL='postgres://usuario:senha@host:5432/barbearia'
node scripts/startup.mjs
npx vitest run          # deve dar 124 testes, 0 falhas
```

⚠️ **Não rode `psql -f drizzle/0000_init_postgres.sql` à mão.** O `startup.mjs` não fica
sabendo, tenta aplicar a mesma migration no boot e falha em `CREATE TABLE`.

⚠️ **A carga dos dados do Bayron tem uma ordem obrigatória**, senão as linhas carregadas
ficam sem `tenant_id` — ver "O porte estava incompleto" no §4 deste documento.

### 9.6 ✅ Passos 3, 3.5 e 4 — aplicados em 06/09/2026

Aplicados junto com o porte, na mesma árvore. `npx vitest run` com `DATABASE_URL`
apontando para um banco de teste deve dar **124 testes, 0 falhas**. Se der menos, alguma
coisa não entrou.

⚠️ **Nada disso está commitado ainda** — são ~120 arquivos na árvore de trabalho. Vale
separar em dois commits: o do site (10 componentes + docs) e o da migração (o resto).

### 9.7 ✅ Login do painel — resolvido em 09/09/2026

**Login por telefone**, decidido em 06/09 e implementado em 09/09. A rota
`api/auth/login.ts` era a última das 54 sem escopo de tenant; agora são **54 de
54** e a lista `PENDENTES` do `tests/escopo-rotas.test.ts` está vazia.

Por que telefone: o slug virou único **por barbearia** na migration 0001, e o
painel é central — não há endereço de onde deduzir de quem é o login. O telefone
é único no mundo por natureza, então identifica a pessoa e a barbearia de uma vez.

⚠️ **O índice é único GLOBAL, não por tenant** (migration 0002). É o oposto do que
a 0001 fez com o slug, de propósito: `(tenant_id, phone)` deixaria o mesmo número
em duas barbearias e a ambiguidade voltaria. Consequência aceita: barbeiro que
trabalha em duas barbearias precisa de dois números.

**A coluna é anulável**, e é o que sustenta a transição: enquanto houver uma
barbearia só, o slug continua funcionando e o Bayron não perde acesso. Com duas
ou mais, a rota **recusa** o slug em vez de escolher — entrar na barbearia errada
dá a um dono o painel do outro. Como remover esse bloco está comentado no próprio
arquivo.

**A rota grava `session.tenantId`**, que existia vazio desde o passo 1. É a peça
que o passo 5 precisa.

Coberto por `tests/login.test.ts` — 13 casos, incluindo o que motivou a mudança:
dois barbeiros chamados "bayron" em barbearias diferentes, cada um entrando na sua.

### 9.8 ✅ O passo 5 — a sessão decide a barbearia (09/09/2026)

`tenantDaSessao()` devolvia `TENANT_UNICO` fixo, então os filtros que o passo 4
espalhou pelas 53 rotas **não tinham efeito real**. Agora ela lê o `tenantId` que
o login grava.

**Como isso não virou 53 arquivos.** A tabela `tenants` foi para a memória (TTL de
30s) e a validação subiu para `getSession()` — que toda rota do painel já chama
antes, e cujo retorno nulo elas já tratam com 401. As 53 chamadas continuam
síncronas e intocadas.

Ir ao banco por requisição tornaria a função assíncrona e exigiria 53 `await`
novos. Este projeto já perdeu o catálogo do Bayron por **um** `await` esquecido em
`Services.astro`: `cfg.shortName` virou `undefined` em silêncio.

**O que o cache custa, e por que vale:**

| | |
|---|---|
| Barbearia suspensa continua entrando | por até 30s. Numa cobrança mensal é irrelevante, e o login já recusa suspensa na porta |
| Barbearia nova demora a aparecer | o mesmo tanto. `invalidarTenants()` existe para o provisionamento não esperar |

`getSession()` passou a recusar em três casos, todos aparecendo para o barbeiro
como "faça login": sessão sem `tenantId`, tenant que sumiu do banco, e barbearia
suspensa ou cancelada.

⚠️ **No dia da virada, todo mundo entra uma vez a mais.** As sessões existentes não
têm `tenantId`, e cair num tenant padrão serviria os dados da barbearia errada.

⚠️ **`tenantDoHost()` ainda devolve `TENANT_UNICO`** — o site público continua
sendo uma instância por barbearia. `resolverHost()` já está escrito e testado
(subdomínio e domínio próprio) e entra no lugar dele no passo 6. Ligar agora
seria pior: nada no site público chama `getSession()`, então o cache não estaria
quente e toda página precisaria de um `await` no caminho mais quente que existe.

Coberto por `tests/sessao-tenant.test.ts` — 8 casos, incluindo suspender uma
barbearia e ver o acesso cair.

### 9.9 O que vem agora

Na ordem, e cada um só faz sentido depois do anterior:

**1. Cadastrar o telefone dos barbeiros do Bayron.** Enquanto não fizerem, eles
entram pelo caminho antigo (slug), que só vale com **uma** barbearia no banco. No
dia do segundo cliente, quem estiver sem telefone perde o painel. É trabalho de
minutos e tem prazo: antes da segunda venda.

**2. A carga do Bayron, de SQLite para Postgres.** A ordem é obrigatória — ver
"O porte estava incompleto" no §4 deste documento. Rodar as migrations de uma vez
deixa as linhas carregadas sem `tenant_id`.

**3. Ligar o RLS** (passo 5.1 da tabela do §4). Agora é seguro: as 54 rotas estão
escopadas e a sessão resolve o tenant de verdade. Antes disso, o RLS devolveria
zero linhas em silêncio.

**4. Separar site e painel** (passo 6). É quando `tenantDoHost()` deixa de
devolver `TENANT_UNICO` e passa a usar o `resolverHost()` que já está pronto.

**5. A exclusion constraint** (passo 7), contra dois agendamentos no mesmo
horário do mesmo barbeiro. Hoje isso é garantido por `pg_advisory_xact_lock` no
código; a constraint move a garantia para o banco.

⚠️ **Nada disso é o que trava a primeira venda.** Os três itens que decidem se o
negócio fecha estão em `PENDENCIAS-ABERTAS.md`: política de suporte (§1.4),
medidor de completude (§4.4) e contrato (§1.2). A R$ 100/mês, meia hora de
suporte a mais por cliente come toda a margem — o multi-tenant não resolve isso.
