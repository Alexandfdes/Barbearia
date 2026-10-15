# Estado atual do código — comece por aqui

> Registro vivo de **onde o código está**, para quem chega ao projeto ou volta
> depois de um tempo. Atualizado: 15/10/2026 (§8).
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
2. O código é **Postgres, multi-tenant e com RLS** — porte aplicado em 06/09, RLS e endereço
   por barbearia em 11/09 (§4). **Desde 10/10/2026 o app novo está no ar no EasyPanel, com o
   banco vazio.** O site do Bayron continua no serviço antigo, que constrói de outro
   repositório — o `Alexandfdes/Barbearia-Bayron`, em SQLite —, até a migração; o que mudou nela
   com o app já no ar está no `ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2. *(Corrigido em 27/09/2026 —
   esta linha dizia que o porte não tinha sido aplicado.)*
3. ~~Todo esse trabalho está na branch **`monorepo`**. A `main` não foi tocada.~~ A `main`
   recebeu a `monorepo` em 09/10/2026 (PR #1) e é dela que o EasyPanel constrói.
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
| 5.1. Ligar RLS | ✅ **feito em 11/09** — provado com rota sem filtro via HTTP, ver §9.10 |
| 6. Separar site do painel | ✅ **feito em 11/09** — o host resolve de verdade, ver §9.11. Não vai ao ar sem domínio |
| 7. Login por telefone e exclusion constraint | ✅ login feito em 09/09; a exclusion constraint em 12/10 — o banco recusa horário duplo (`PENDENCIAS-ABERTAS.md` §2.37) |

⚠️ **A terceira costura do passo 1 não existia.** Até 06/09/2026 este documento e o
`CLAUDE.md` afirmavam que `pastaDeMidia()`/`urlDeMidia()` centralizavam o caminho de mídia.
Só o `tests/tenant.test.ts` as referenciava — o código nunca as teve, e por isso aquele
teste não compilava. Foram escritas em 06/09, dentro do passo 3.5.

### O passo 2 em detalhe

*Registro de 06/09/2026, de antes de o porte ser aplicado — no mesmo dia (a tabela acima). As
pastas `migracao-postgres/` e `migracao-tenants/`, citadas aqui e no item seguinte, saíram do
repositório em 12/10/2026; continuam no histórico do git.*

O porte inteiro estava em `migracao-postgres/porte-postgres.patch` — **101
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
| `seed-relatorio-demo.mjs`, `wipe-appointments.mjs` | Ferramentas de desenvolvimento | ✅ apagados em 12/10/2026 — não rodavam desde o porte |

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

> ⚠️ **Decisão de 11/09/2026:** construir primeiro; domínio, contrato e política de
> suporte ficam para depois (`PLANO-PRODUTIZACAO.md` §12). Os itens marcados ⏸️ abaixo
> estão adiados **por escolha, não por esquecimento** — e o do contrato continua com
> prazo duro. O critério de parada acordado não é "100%", é **um dono de barbearia
> usar de ponta a ponta sem ninguém do lado**.

| | O quê | Onde |
|---|---|---|
| ✅ | ~~Como o barbeiro entra no painel com várias barbearias~~ — decidido em 09/09 e **implementado**: o login é por **telefone**, único no mundo, e é ele que grava o tenant na sessão (`api/auth/login.ts`). Falta só cadastrar o telefone dos três barbeiros do Bayron antes do segundo cliente | `PENDENCIAS-ABERTAS.md` §1.5 |
| 🔴 | **O telefone de contato no banco é um número falso** (+1 555), conhecido desde 27/08 e ainda não conferido em produção. O botão de WhatsApp do site não leva a lugar nenhum | `PENDENCIAS-ABERTAS.md` §2.6 |
| ✅ | ~~As migrations plantam os dados do Bayron em todo banco novo~~ — **sem objeto desde 13/09**: as migrations de SQLite saíram do repositório e as de Postgres não inserem dado de barbearia nenhum | `PENDENCIAS-ABERTAS.md` §4.6 |
| ✅ | ~~**`shortName === "Bayron"` decide o que aparece no site**~~ — em dez lugares, não oito; desde 09/10 decide o **endereço**, que o dono não edita, numa função só (`lib/bayron.ts`). O conteúdo do Bayron continua cravado no repositório | `PENDENCIAS-ABERTAS.md` §4.7 |
| 🔴 | **A cobrança está no código e não foi provada na Asaas de verdade.** Desde 10/10: o cartão pelo Checkout, o webhook e o cancelar — provados contra uma Asaas de mentira que segue a documentação, não no sandbox. Falta a prova, que só você faz; as regras do cancelar foram confirmadas no mesmo dia. O cadastro não abre antes | `PENDENCIAS-ABERTAS.md` §4.14 |
| 🟠 | **O CI existe, e o verde ainda não manda em nada.** A suíte com banco, o build e o deploy só com a `main` verde — falta a branch protegida ou o deploy pelo CI, que são seus. E nunca rodou no GitHub | `PENDENCIAS-ABERTAS.md` §3.8 |
| 🔴 | **O cadastro não pode abrir no ar de hoje** (conferido em 10/10): o subdomínio que nasce no cadastro não tem certificado — a tela final agora diz isso em vez de mentir —, a cobrança não foi provada, o e-mail não sai e o backup não sai da VPS. E o domínio em uso é provisório | `PENDENCIAS-ABERTAS.md` §2.31 |
| ✅ | ~~**O barbeiro não fica sabendo de agendamento novo, e a data de nascimento é a senha do cliente**~~ — decididas em 11/10: o e-mail ao barbeiro e ao dono, feito — em produção, só com o provedor de e-mail —; e a data de nascimento fica, e entra no termo | `PENDENCIAS-ABERTAS.md` §2.33 |
| ✅ | ~~**Ver as barbearias e tirar do ar sem `psql`**~~ — desde 11/10, o painel do operador (`/operador`): a lista com a fase de cada barbearia, o contato do dono e o uso, e as ações de estender o teste, tirar do ar e reativar, cada uma registrada — e, desde 12/10, estender a carência de quem está com a cobrança atrasada. Desde 12/10, em seis telas, como o painel do barbeiro — o Início com os números, as barbearias, a ficha de cada uma com anotações, a cobrança, o registro e o sistema. Entra com a senha e, desde 13/10, também com o código de 6 dígitos do celular, se a variável `OPERADOR_SEGUNDO_FATOR` estiver ligada — sem ela, só a senha —, e fica desligado até existir a variável `OPERADOR_SENHA_HASH` | `PENDENCIAS-ABERTAS.md` §3.9 |
| ✅ | ~~**O dono não leva os dados dele**~~ — desde 11/10, a lista de clientes e os agendamentos em planilha, no painel, e até com o site fora do ar | `PENDENCIAS-ABERTAS.md` §3.6 |
| 🟠 | **O app fala com o banco como superusuário.** A troca está pronta e ensaiada desde 11/10 (`scripts/usuario-do-app.mjs`); falta rodar em produção — e a migração do Bayron passa a ter um passo a mais | `PENDENCIAS-ABERTAS.md` §3.10 |
| ✅ | ~~**O backup restaurado voltava sem as permissões do app**~~ — resolvido em 11/10; ⚠️ todo backup anterior, restaurado, precisa do `scripts/permissoes-do-app.mjs`, e o boot avisa | `PENDENCIAS-ABERTAS.md` §3.11 |
| ✅ | ~~**Um script no site de uma barbearia age no painel de outra.**~~ Fechado em 09/10: o middleware recusa, antes de qualquer rota, a requisição que muda dado e não veio do próprio endereço. Sobra a defesa estrutural — o painel num domínio só dele —, registrada e não feita | `PENDENCIAS-ABERTAS.md` §2.30 |
| 🔴 | **O site do Bayron no ar roda o Astro 6.3.7, com falhas críticas conhecidas.** A `main` deste repositório tem o Astro 7 desde 09/10 (PR #1), e o app novo, no ar desde 10/10, também. O site do Bayron constrói de outro repositório, o `Alexandfdes/Barbearia-Bayron`, parado em 10/07. Fecha com a migração do Bayron, ou com a mesma atualização naquele repositório | `PENDENCIAS-ABERTAS.md` §2.29 e `ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2 |
| 🟠 | **O e-mail não sai em produção.** Desde 09/10 existem a senha nova por e-mail, os avisos do teste e da cobrança e o e-mail de boas-vindas — e falta o provedor de envio, que depende do domínio: o DNS na Cloudflare, com SPF e DKIM. Sem ele, o sistema diz que não está funcionando em vez de fingir | `PENDENCIAS-ABERTAS.md` §4.17 |
| ✅ | ~~**Fuso por barbearia**: `TZ_BARBEARIA` vale para o processo inteiro, e o passo 6 já põe várias barbearias no mesmo processo. Trava vender fora do fuso de Fortaleza~~ — feito em 12/10: o fuso de cada barbearia nasce do estado escolhido no cadastro, o dono troca em Configurações, e `TZ_BARBEARIA` não é mais lida | `PENDENCIAS-ABERTAS.md` §2.1 |
| ✅ | ~~Timezone escrito em 20 arquivos como constante~~ — centralizado em 10/09 em `src/lib/timezone.ts`, com teste-guarda; de cada barbearia desde 12/10 | `PENDENCIAS-ABERTAS.md` §2.1 |
| ✅ | ~~O backup salva o banco e não salva as fotos~~ — resolvido em 11/09, com restauração conferida por `diff -r` | `PENDENCIAS-ABERTAS.md` §3.7 |
| ⏸️ | Política de suporte — **adiada em 11/09** por decisão do dono (`PLANO-PRODUTIZACAO.md` §12). Gatilho: antes de combinar escopo com o primeiro cliente | `PENDENCIAS-ABERTAS.md` §1.4 |
| ✅ | ~~Medidor de completude no painel~~ — feito em 10/09 | `PENDENCIAS-ABERTAS.md` §4.4 |
| ⏸️🔴 | Contrato, LGPD e inadimplência — **adiado em 11/09** (`PLANO-PRODUTIZACAO.md` §12), mas **com prazo duro: antes da primeira venda a terceiro**, porque a exposição começa no dia em que o primeiro cliente paga | `PENDENCIAS-ABERTAS.md` §1.2 |
| ✅ | ~~Tela inicial sem fotos e seções com conteúdo do Bayron~~ — resolvido em 06/09 | `PENDENCIAS-ABERTAS.md` §4.1 |

**A Fase 3 deixou de ser bloqueio de MVP em 06/09/2026.** Galeria, depoimentos,
catálogo e FAQ não mostram mais o conteúdo do Bayron numa barbearia nova: ou a
seção lê o banco do próprio cliente, ou ela não é renderizada. Verificado
servindo o site contra dois bancos diferentes, com os arquivos do Bayron
preenchidos no repositório.

✅ **O catálogo sugerido foi feito em 11/09/2026** (`PENDENCIAS-ABERTAS.md` §4.5):
com a lista vazia, o painel oferece oito serviços comuns, já vinculados aos barbeiros
com duração. Entram **sem preço e desligados** de propósito — preço sugerido que o
dono não reparou vira o preço no site dele.

## 8. Histórico recente

| Quando | O quê |
|---|---|
| 15/10 | **A área do cliente com o total de cada visita, pedido pelo dono** (`PENDENCIAS-ABERTAS.md` §2.43), e **as datas em português** (`PENDENCIAS-ABERTAS.md` §2.44). Cada cartão mostra o que o cliente paga, ou pagou — o serviço e todos os itens, o combo inclusive (`totalParaOCliente`, em `apps/barbearia/src/lib/valorDoAtendimento.ts`) —, o mesmo número da página do agendamento, que deixou de chamar a barba lançada na comanda de coisa "para retirar na barbearia". A consulta foi para `apps/barbearia/src/lib/agendamentosDoCliente.ts`, testada contra o banco. A área do cliente e o Início escreviam o mês e o dia da semana em inglês ("20 de Oct · Tue"). **Verificado:** 94 arquivos, **1135 de 1135** contra PostgreSQL 16, nenhum pulado (sem banco: 717 passam, 418 pulam); o `astro check` com 0 erros; 10 defeitos reintroduzidos, os 10 vermelhos. Contra o build, no navegador: 10 conferências na área do cliente e 19 no painel, sem erro de JavaScript; o build anterior reprovou 5 e 1 delas; o CSS idêntico |
| 15/10 | **O atendimento fechado com extras vale o mesmo em toda tela, achado pelo dono testando** (`PENDENCIAS-ABERTAS.md` §2.43). O corte de R$ 50 fechado com mais R$ 30 na comanda continuava "R$ 50" na linha da agenda e no detalhe, enquanto a receita do topo somava os 30; o "Receita prevista" do Início não somava extra nem venda avulsa; a comanda do combo dava o total sem o produto; e a linha fechada ficava com a borda do "Atrasado" até recarregar. Agora a conta é uma só (`apps/barbearia/src/lib/valorDoAtendimento.ts`; no banco, `apps/barbearia/src/lib/receita.ts`), e a aparência de cada situação também (`apps/barbearia/src/lib/situacaoNaAgenda.ts`). **Verificado:** 93 arquivos, **1127 de 1127** contra PostgreSQL 16, nenhum pulado (sem banco: 710 passam, 417 pulam); o `astro check` com 0 erros; 25 defeitos reintroduzidos, os 25 vermelhos. Contra o build, no navegador: 18 conferências — a comanda do corte e a do combo, a linha na hora e recarregada iguais, o detalhe, a receita do topo igual à do Início e a ficha do cliente —, sem erro de JavaScript; o build anterior, no mesmo roteiro, reprovou 11 delas; o CSS idêntico |
| 15/10 | **O servidor de desenvolvimento diz quando o banco está atrás do código, pedido pelo dono** (`PENDENCIAS-ABERTAS.md` §2.42). Em 13/10, o `npm run dev` ligado desde a véspera recebeu a 0015 e a 0016 e toda página caiu em "Failed query". Agora, no desenvolvimento, o middleware compara a pasta `drizzle/` com a `schema_migrations` e, faltando alguma, mostra quais e manda reiniciar (`apps/barbearia/src/lib/bancoAtrasado.ts`). **Verificado:** 92 arquivos, **1103 de 1103** contra PostgreSQL 16, nenhum pulado (sem banco: 692 passam, 411 pulam); o `astro check` com 0 erros; 10 defeitos reintroduzidos, os 10 vermelhos. Num servidor de desenvolvimento de verdade, sobre um banco parado na 0014: a tela com a 0015 e a 0016, o JSON nas rotas `/api/`, a linha no terminal — e, aplicadas as duas por fora, tudo de volta ao normal, sem reiniciar. O build de produção não leva a tela |
| 13/10 | **O horário que o site diz ao Google, o menu do celular e o carrossel dos depoimentos, pedidos pelo dono** (`PENDENCIAS-ABERTAS.md` §2.41). O JSON-LD dava a toda barbearia segunda a sexta até as 20h e "$$"; agora o horário sai do horário de vitrine, o que o site mostra, e, se uma linha não se lê sem dúvida, nenhum horário (`apps/barbearia/src/lib/horarioDosBuscadores.ts`). O menu do celular, fechado, e a página por baixo dele, aberto, ficam fora do teclado e do leitor de tela; o botão diz se ele está aberto, e Esc fecha. O carrossel dos depoimentos para com "reduzir movimento". **Verificado:** 91 arquivos, **1092 de 1092** contra PostgreSQL 16, nenhum pulado; o `astro check` com 0 erros; 15 defeitos reintroduzidos, os 15 vermelhos. Contra o build, antes e depois: o Google passou a ler seg–sex até 19h, o que o site mostra; o menu fechado tinha 6 paradas de teclado em 30 Tabs e 3 links para o leitor de tela — agora 0 e 0; o menu aberto deixava 11 paradas atrás dele em 20 Tabs — agora 0; o carrossel andava 76 px em 2,5 s com "reduzir movimento" — agora parado, e a seta funciona; as 25 fotos do site iguais, a da `vinho` com a galeria escondida; o axe-core com todas as regras, nada novo |
| 13/10 | **Todo conteúdo do site numa área da página, pedido pelo dono** (`PENDENCIAS-ABERTAS.md` §2.40). O topo de cinco telas — o agendar, a área do cliente (a de entrar e a de dentro), o link do horário e o portal — era um bloco comum, e o botão flutuante do WhatsApp ficava solto: quem navega de área em área com o leitor de tela passava por cima. Agora o topo é `<header>`, e o botão tem uma área à parte com nome. **Verificado:** 89 arquivos, **1075 de 1075** contra PostgreSQL 16, nenhum pulado; o `astro check` com 0 erros; 8 defeitos reintroduzidos, os 8 vermelhos. Contra o build, 25 fotos — o site de quatro barbearias e o de uma fora do ar, o agendar, a área do cliente fora e dentro, o link do horário, o portal, o 404, o cadastro e o menu do celular aberto: o axe-core acusava 19, agora nenhuma; 23 idênticas pixel a pixel, e as duas da `vinho` idênticas com o carrossel da galeria escondido — ele muda até entre duas fotos da mesma versão; o CSS e o JavaScript do navegador idênticos, sem erro de JavaScript |
| 13/10 | **Uma área principal por tela, pedido pelo dono** (`PENDENCIAS-ABERTAS.md` §2.39). Treze telas do painel do dono abriam uma `<main>` dentro da do `AdminLayout` — duas áreas principais, uma dentro da outra, que o leitor de tela anuncia como duas —, e as quatro telas de entrar não tinham nenhuma. Agora a das treze é um bloco comum, e a do layout fica, a única; nas de entrar, o bloco do formulário é a `<main>`. **Verificado:** 88 arquivos, **1071 de 1071** contra PostgreSQL 16, nenhum pulado (sem banco: 662 passam, 409 pulam); o `astro check` com 0 erros; 9 defeitos reintroduzidos, os 9 vermelhos. Contra o build, as 24 telas do painel no computador e no celular: uma área principal em cada, e o axe-core sem acusação nas regras das áreas da página — antes, 34 das 48 fotos —; o CSS e o JavaScript do navegador idênticos, byte a byte; as fotos de antes e de depois idênticas pixel a pixel, fora o dado vivo — 48 de 56 —, sem erro de JavaScript |
| 13/10 | **Depois da explicação detalhada, os seis escolhidos pelo dono.** **As quatro travas pequenas:** o dia da semana deixou de sair do fuso do servidor em cinco lugares — com o processo em Kiritimati (+14), a suíte do commit anterior reprovava 9 testes do agendamento, e agora passa inteira (`PENDENCIAS-ABERTAS.md` §2.1) —; o `apps/barbearia/.env.example` passou a contar as sete variáveis que faltavam, com o teste que reprova a próxima (`PENDENCIAS-ABERTAS.md` §4.17); a sobra das 08:00–19:00 saiu da agenda do dia, com o menu de um clique que não existia mais desde antes de 06/09 (`PENDENCIAS-ABERTAS.md` §2.27); e a nota "0,0" — a nota do Google só aparece com nota e quantidade, as estrelas seguem o número, vale para toda barbearia que preencher, sem JSON-LD copiado do Google e sem aceitar 5,9 (`PENDENCIAS-ABERTAS.md` §4.11). **O aviso ao e-mail antigo** quando o e-mail de alguém da equipe muda (`PENDENCIAS-ABERTAS.md` §4.17). **O conferidor de tipos no site de vendas**, zero e no CI (`PENDENCIAS-ABERTAS.md` §2.29). **As cores da logo** sugeridas em Configurações (`PENDENCIAS-ABERTAS.md` §4.2). **O código de 6 dígitos no painel do operador**, opcional por `OPERADOR_SEGUNDO_FATOR`, ligado por `npm run operador:segundo-fator` — que mostra o QR code e só imprime a variável se um código conferir (`PENDENCIAS-ABERTAS.md` §3.9). **O ensaio da migração do Bayron** com as 17 migrations, pelos scripts de verdade, da carga à troca do superusuário (`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2). **Achado no caminho, consertado** (`PENDENCIAS-ABERTAS.md` §2.38): no painel central, o encaixe manual e a comanda da agenda do dia pediam serviços e vagas à rota do site — 404 em toda barbearia. **Verificado:** 87 arquivos, **1064 de 1064** contra PostgreSQL 16, nenhum pulado (sem banco: 655 passam, 409 pulam); o `astro check` com 0 erros nos dois apps; 25 defeitos reintroduzidos, os 25 vermelhos; o QR lido por um leitor de fora — as oito máscaras, das versões 1 a 10, 72 de 72. Contra o build: 65 conferências no navegador — a agenda do dia, o encaixe, "Mover horário", a nota, as cores da logo no computador e no celular, o aviso do e-mail e o segundo fator —, sem erro de JavaScript |
| 12/10 | **Depois da vasculhada geral, os três escolhidos pelo dono.** **O conferidor de tipos zerado** (`PENDENCIAS-ABERTAS.md` §2.29): os 356 erros antigos do `astro check` saíram só com tipo, e o site construído ficou idêntico ao de antes, arquivo por arquivo — a mesma comparação acusa um ponto de exclamação a mais num aviso —; a conferência entrou no CI, antes da suíte (`npm run check`). **Estender a carência** pelo painel do operador (`PENDENCIAS-ABERTAS.md` §3.9): o fim novo em `tenants.carencia_ate` (migration 0016), valendo para um atraso só — um gatilho do banco o apaga quando o atraso muda —, e todo leitor da fase lendo a extensão, com o teste que reprova o que esquecer. **O rascunho da landing do autoatendimento** e o `/acessar` levando ao painel central (`PENDENCIAS-ABERTAS.md` §4.15) — o texto é a voz do dono. **Verificado:** 81 arquivos, **988 de 988** contra PostgreSQL 16, nenhum pulado (sem banco: 597 passam, 391 pulam); `astro check` com 0 erros; 18 defeitos reintroduzidos na carência, os 18 vermelhos. Contra o build, com a 0016 aplicada pelo usuário do app sem superusuário: a barbearia fora do ar pela cobrança volta na hora — 14 conferências no navegador, no computador e no celular; e a landing nas duas larguras, sem rolagem de lado e sem erro de JavaScript |
| 12/10 | **Os três próximos passos, escolhidos pelo dono no mesmo dia.** **O backup sai da VPS em partes** (`PENDENCIAS-ABERTAS.md` §3.3): uma parte de 16 MiB na memória por vez — com um arquivo de 200 MB, o processo foi de 273 MB para 91 MB —, e parte que cai cancela o envio. Falta ligar as `S3_*` em produção, e uma regra no bucket para apagar o velho, que o app não apaga. **O banco recusa horário duplo** (`PENDENCIAS-ABERTAS.md` §2.37): a migration 0015, o passo 7 que faltava; num banco com horário sobreposto, a trava vale depois do último par, e o boot diz desde quando — os 7 pares do SQLite da máquina de desenvolvimento eram de agendamentos fictícios do gerador de demonstração. **A limpeza:** `migracao-postgres/`, `migracao-tenants/` e os scripts da época do SQLite fora do repositório (`PENDENCIAS-ABERTAS.md` §4.6); o teste que mantém a cobrança longe das telas da barbearia (`ARQUITETURA-COBRANCA-V1.md` §2); e "Mover horário" só com os horários livres (`PENDENCIAS-ABERTAS.md` §2.27). **Verificado:** 80 arquivos, **966 de 966** contra PostgreSQL 16 (sem banco: 587 passam, 379 pulam); 19 defeitos reintroduzidos na trava, 4 na grade e 4 na guarda da cobrança; o `astro check` igual à linha de base. Contra o build, com o usuário do app sem superusuário e o RLS: a corrida pelo HTTP dando 409 no agendar e no remarcar, e a grade num navegador — 11 conferências cada |
| 12/10 | **O painel do operador em seis telas, e o JSON que ia ao banco como texto.** **As telas**, pedidas pelo dono no mesmo dia — *"parecido com a interface do painel do barbeiro"* (`PENDENCIAS-ABERTAS.md` §3.9): o menu do lado e, cada uma com endereço próprio, o **Início** — quantas no ar, quantas pagando, a receita prevista e a confirmada no mês, onde cada barbearia está, o que pede atenção com o WhatsApp do dono, do teste para o cartão e os cadastros por semana —, as **Barbearias**, a **ficha** de cada uma — o dono, a assinatura, o uso em contagens, o que falta no site, a linha do tempo e as ações —, a **Cobrança** — as assinaturas, os pagamentos e as falhas do mês, e tudo o que o webhook recebeu —, o **Registro** e o **Sistema** — o banco, as migrations, o backup, o e-mail e a cobrança, sem valor de segredo nenhum. E **as anotações** na ficha, guardadas no registro e sem apagar (migration 0014). Toda tela abre pela porta do operador antes de qualquer consulta, e a guarda reprova a que não abrir; nenhuma mostra dado de cliente de barbearia. **Achado no caminho, consertado** (`PENDENCIAS-ABERTAS.md` §2.36): o JSON mandado com `::jsonb` pelo SQL cru era gravado como string quando o Drizzle ainda não tinha tocado a conexão — o corpo dos eventos da Asaas e o registro do "tirar do ar", de onde o reativar lê como a barbearia estava; a 0014 converte as linhas gravadas assim. **Verificado:** 77 arquivos, **928 de 928** contra PostgreSQL 16.15 (sem banco: 570 passam, 358 pulam); 29 reintroduções, as 29 vermelhas — duas só depois de reforçar o teste: a ordem do "pede atenção" e a guarda do JSON, que deixava passar o parâmetro com chave dentro; contra o build, com o app falando pelo usuário sem superusuário, 64 conferências no navegador — as seis telas no computador e no celular, entrar e voltar à tela pedida, tirar do ar, reativar achando no registro como ela estava, estender e ver o site voltar na hora, anotar, os filtros e nenhum segredo no HTML —, sem erro de JavaScript; com o defeito do JSON de volta no build, 5 delas vermelhas; a 0014 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0013, como dono sem superusuário, e rodar de novo não faz nada; o `astro check` com o mesmo conjunto de erros de antes |
| 12/10 | **O fuso de cada barbearia, e os documentos que descreviam uma instância por barbearia** — os dois escolhidos por você na véspera. **O fuso** (`PENDENCIAS-ABERTAS.md` §2.1): a coluna `tenants.timezone` (migration 0013), com os 16 fusos do Brasil e o banco recusando qualquer outro; nasce do estado, que o cadastro passou a pedir, e o dono troca em Configurações, vendo a hora de lá antes de salvar — o site muda na hora, e só o da barbearia da sessão. `TZ_BARBEARIA` não é mais lida, e o boot avisa quem a deixou no servidor; o `TZ` do módulo sumiu, e os 32 arquivos que o importavam — com os que chamavam as contas de prazo, 51 em `src/` — passaram a dizer de qual barbearia é cada data. O painel do operador mostra o fuso de cada uma e as datas no calendário dela. **Achados no caminho, consertados:** a ficha do cliente na agenda do dia mostrava a data no fuso do navegador, o "Hoje" do calendário da agenda era o do navegador, e o rodapé do site destacava o dia pelo relógio de quem abre. **Os documentos:** o `ARQUITETURA-PRODUCAO.md`, reescrito — descrevia um container e um SQLite por barbearia, e estava marcado como vigente —, e o `PENDENCIAS-ABERTAS.md` §3.1, o `PENDENCIAS-ABERTAS.md` §3.2 e o `PENDENCIAS-ABERTAS.md` §3.3, que falavam em instâncias. No caminho, registrado e não consertado: o envio do backup para fora da VPS lê o arquivo inteiro na memória (`PENDENCIAS-ABERTAS.md` §3.3). **Ficou para depois:** a exclusão do cliente a pedido, decidida — anonimizar os agendamentos dele — e não feita (`PENDENCIAS-ABERTAS.md` §1.2). **Verificado:** 75 arquivos, **893 de 893** contra PostgreSQL 16.15 (sem banco: 551 passam, 342 pulam); 20 reintroduções, as 20 vermelhas — uma só depois de reforçar o teste; contra o build, 24 conferências no navegador com uma barbearia nova no Amazonas e a do Zé em Fortaleza no mesmo processo — o cadastro sem estado não envia, Configurações, os horários do site, o agendamento, a agenda do dia, a troca de fuso valendo na hora e o operador —, sem erro de JavaScript; o script de provisionar com e sem o estado; a 0013 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0012, como dono sem superusuário, e rodar de novo não faz nada; o `astro check` e o `tsc` com o mesmo conjunto de erros de antes |
| 11/10 | **O que estava na fila e não dependia do dono** (`PENDENCIAS-ABERTAS.md` §6). **Os dados do dono em planilha** — clientes e agendamentos, também com o site fora do ar, com a data de nascimento e aviso na tela, decididos por ele; Excel em português, e o nome digitado como fórmula desarmado (`PENDENCIAS-ABERTAS.md` §3.6). **O limite por telefone na área do cliente**, 5 a cada 15 minutos e 10 por dia (`PENDENCIAS-ABERTAS.md` §2.33). **A saúde para o monitor externo**, `/api/saude` (`PENDENCIAS-ABERTAS.md` §3.4). **A imagem sem as dependências de desenvolvimento**, com o `npm audit --omit=dev` em zero (`PENDENCIAS-ABERTAS.md` §3.12). **A troca do superusuário do banco**, pronta e ensaiada no estado de produção (`PENDENCIAS-ABERTAS.md` §3.10). **Achados no caminho, consertados:** o backup restaurado voltava sem as permissões do app — toda tela em 500, com o boot verde (`PENDENCIAS-ABERTAS.md` §3.11); o provisionador nunca rodou no container (`PENDENCIAS-ABERTAS.md` §3.12); e o rodapé de Configurações dizia que a galeria, os serviços e a cor não se editavam (`PENDENCIAS-ABERTAS.md` §2.35). **Verificado:** 74 arquivos, **856 de 856** contra PostgreSQL 16.13 (sem banco: 536 passam, 320 pulam); 34 reintroduções, as 34 vermelhas — duas só depois de reforçar o teste; contra o build, 16 conferências novas no navegador — o download pelo botão, no ar e fora do ar, conferido byte a byte —, e de novo as 35 do operador, as 22 do roteiro, as 14 da tela final, as 36 da cobrança e as 26 do aviso e do mapa; o estágio de produção da imagem simulado, só com as dependências de produção, com o boot, o provisionador, o backup e o roteiro; a troca do usuário e a restauração ensaiadas, inclusive num servidor novo sem o papel do app — e, com o servidor falando pelo usuário novo, sem superusuário, de novo as conferências do operador, da cobrança e da exportação, todas certas; o `astro check` com o mesmo conjunto de erros de antes |
| 11/10 | **O painel do operador e o portal de toda barbearia.** **`/operador`**, pedido pelo dono no mesmo dia (`PENDENCIAS-ABERTAS.md` §3.9): a lista das barbearias com a fase de cada uma, o contato do dono e o uso, e três ações — estender o teste, tirar do ar, reativar —, cada uma registrada em `acoes_do_operador` (migration 0012) e valendo na hora, sem esperar o cache. Abre só no endereço do painel e só com a senha — sem segundo fator, risco aceito —, e não existe sem `OPERADOR_SENHA_HASH` (`npm run operador:senha`). Roda como dono do banco, e a lista não traz dado de cliente de barbearia (`apps/barbearia/src/lib/operadorBarbearias.ts`). **O portal dizia "Portal Bayron" e "Equipe Bayron" em toda barbearia** (`PENDENCIAS-ABERTAS.md` §2.34): agora o nome dela, e a guarda reprova a palavra sozinha. **Decidido:** sem aviso de autorização na tela da galeria — a responsabilidade vai para o termo (`PENDENCIAS-ABERTAS.md` §1.2). **Verificado:** 70 arquivos, **818 de 818** contra PostgreSQL 16.13 (sem banco: 520 passam, 298 pulam); 34 reintroduções, as 34 vermelhas — duas só depois de reforçar o teste; contra o build, 35 conferências no navegador, que acharam o "Sair" recusado pela conferência de origem (`Referrer-Policy: no-referrer` faz o navegador mandar `Origin: null`), e de novo as 22 do roteiro, as 14 da tela final, as 36 da cobrança e as 26 do aviso e do mapa; a 0012 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0011, e rodar de novo não faz nada; o `astro check` com o mesmo conjunto de erros de antes |
| 11/10 | **As decisões do roteiro: o aviso de agenda por e-mail e o mapa conferido pelo dono** (`PENDENCIAS-ABERTAS.md` §2.33). **O barbeiro do horário e o dono recebem e-mail** quando o cliente agenda, desmarca ou remarca pelo site — com o serviço, o preço, o WhatsApp do cliente e o link da agenda do dia —, e o dono desliga por pessoa na Equipe (`apps/barbearia/src/lib/avisoDeAgenda.ts`); em produção, só com o provedor de e-mail. **O Início mostra o mapa do site e pergunta se o ponto está certo**, e Configurações mostra a prévia enquanto o endereço é digitado; a busca conferida fica guardada, e mudar o endereço faz a pergunta voltar. A migration 0011 traz as duas colunas. **Mantidos por você:** a data de nascimento como senha da área do cliente — vai no termo (`PENDENCIAS-ABERTAS.md` §1.2) —, e o e-mail que não se troca fora do ar. **De carona:** desmarcar pelo link virou um comando só, sem a corrida do duplo clique. **Verificado:** 69 arquivos, **779 de 779** contra PostgreSQL 16.13 (sem banco: 500 passam, 279 pulam); 29 reintroduções, as 29 vermelhas — duas só depois de consertar o teste e o código; contra o build, 26 conferências no navegador, e de novo as 22 do roteiro, as 14 da tela final e as 36 da cobrança; a 0011 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0010, e rodar de novo não faz nada; o `astro check` com o mesmo conjunto de erros de antes |
| 10/10 | **O roteiro do dono, tela a tela, na máquina dele** — ele abrindo o produto no navegador e mandando print: cadastro, site, agendamento, painel e o site fora do ar. Achou o que a suíte não via (`PENDENCIAS-ABERTAS.md` §2.32): **três links de mapa vazios em toda barbearia do cadastro** — o "Traçar rota", o endereço do rodapé e o "Abrir no Maps" da confirmação liam um campo que só Configurações grava, e clicar reabria o site —, agora numa função só (`apps/barbearia/src/lib/mapa.ts`), pelo endereço quando o dono não deu o link; **"Siga no Instagram" sem Instagram** e o buraco do texto "sobre" no rodapé; **"Agenda do dia" levando ao resumo**, e "Reservas" que eram de produto; **o cadastro sem o aviso do teste e do cartão**, que só a tela do fim dava; e a tela de assinatura falando de uma "próxima etapa" já feita. **No `npm run dev`, a tela final diz sempre "quase no ar"**: o servidor de desenvolvimento do Astro recusa a imagem que ela pede; no build, confere — anotado, sem mexer na segurança do Astro. Ficaram quatro decisões suas (`PENDENCIAS-ABERTAS.md` §2.33): como o barbeiro fica sabendo de agendamento novo, a data de nascimento como senha do cliente, quem confere o ponto do mapa — no roteiro, ele caiu em outra cidade — e o e-mail que não se troca fora do ar. **Verificado:** 67 arquivos, **749 de 749** contra PostgreSQL 16.13 (sem banco: 488 passam, 261 pulam); 13 reintroduções, as 13 vermelhas; contra o build, 22 conferências em duas barbearias — uma só com o obrigatório, outra com Instagram, texto e o link de rota do dono —, e de novo as 36 da cobrança e as 14 da tela final; o `astro check` com o mesmo conjunto de erros de antes |
| 10/10 | **A cobrança, a tela final que confere e o CI** — os três escolhidos para adiantar enquanto o domínio e o CNPJ não saem. **A cobrança no código, sem a prova no sandbox** (`PENDENCIAS-ABERTAS.md` §4.14): o cartão no Checkout da Asaas pela tela de assinatura, o webhook — token em tempo constante, o evento cru gravado antes e na mesma transação, a barbearia achada por qualquer das chaves do evento — e o cancelar; o desenho em `ARQUITETURA-COBRANCA-V1.md` §5.3, migration 0010. O ensaio contra o build, com uma Asaas de mentira, achou três defeitos que a suíte não pegava: o mesmo cliente em duas barbearias quebrava o webhook a cada reentrega — e 15 falhas param a fila de todas —; o Checkout pago que não era o último ficava sem barbearia; e reativar removia de novo a assinatura já removida. E uma regra errada: com a cobrança atrasada não dava para cancelar, e a Asaas seguiria tentando o cartão. As regras do cancelar, decididas na implementação, foram confirmadas por você no mesmo dia — e rejeitada a remoção da assinatura depois de 30 dias fora do ar. **A tela final do cadastro confere antes de dizer "no ar"**, do navegador do dono, por uma imagem que só o app serve (`JORNADA-DO-BARBEIRO.md` §2.8); o e-mail de boas-vindas e o começo do cadastro deixaram de prometer. **O CI** (`PENDENCIAS-ABERTAS.md` §3.8): a suíte com banco — teste pulado reprova —, o build dos dois apps e o deploy só com a `main` verde; nunca rodou no GitHub. **Verificado:** 66 arquivos, **734 de 734** contra PostgreSQL 16.13 (sem banco: 473 passam, 261 pulam); 20 reintroduções na cobrança e na tela, todas pegas; contra o build, 36 conferências da cobrança e 14 da tela final; a 0010 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0009, como o de produção; e cada um dos três commits de código rodou a suíte sozinho (650 e 666 nos dois primeiros). O `astro check` tem o mesmo conjunto de erros de antes: nenhum novo |
| 10/10 | **O app novo no ar, e o que isso mudou** — trazido de duas sessões de 10/10 e conferido nesta. A `main` recebeu a `monorepo` em 09/10 (PR #1; conferido no GitHub: contém o conserto do `PENDENCIAS-ABERTAS.md` §2.30), e o EasyPanel constrói dela, com o banco vazio. **O roteiro do Bayron deixou de rodar como estava escrito:** o boot aplicou as dez migrations, e a carga recusa depois da 0001. **Ensaiado contra PostgreSQL 16, pelos scripts de verdade:** apagar o banco e refazer 0000 → carga → resto funciona com o papel `barbearia_app` já existente, e a galeria é idempotente (`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2). **A taxa da Asaas no cartão estava trocada** nestes documentos: 2,99% + R$ 0,49, não 1,99% — R$ 3,48 numa mensalidade de R$ 100 —, e o cartão cai na conta em 32 dias (`ARQUITETURA-COBRANCA-V1.md` §4). **O cadastro não pode abrir**, por quatro motivos conferidos no código (`PENDENCIAS-ABERTAS.md` §2.31). |
| 09/10 | **Um script no site de uma barbearia não age mais no painel de outra** (`PENDENCIAS-ABERTAS.md` §2.30). O middleware recusa, antes de qualquer rota, a requisição que muda dado e não veio do próprio endereço — pela `Origin`, comparando só o nome, porque o esquema muda atrás do proxy (`src/lib/origem.ts`). **Verificado contra o build:** o ataque reproduzido mais cedo, agora recusado e registrado no log — no build anterior, o agendamento cancelado; o painel cancelando, enviando foto e os roteiros de ponta a ponta do e-mail (47) e do primeiro minuto (28) passando, sem nenhuma recusa. 63 arquivos, **639 de 639** contra PostgreSQL 16.13 (sem banco: 420 passam, 219 pulam); 8 reintroduções, as 8 vermelhas; o `astro check` com o mesmo conjunto de erros de antes |
| 09/10 | **A página "Como fica" com as quatro telas** (`PENDENCIAS-ABERTAS.md` §4.10). No lugar dos recados *"Coloque a imagem em…"*, os prints de uma barbearia fictícia montada para isso — o site, o agendamento, a agenda do dia e o relatório —, tirados contra o build. ⚠️ O print do site sai sem foto, e o texto ao lado promete *"suas fotos"*. De carona, no relatório: a projeção do mês dizia *"(superaa meta)"* — a frase era montada em pedaços —, visto no print. **Verificado:** o `/demo` servido pelo build do site de vendas, as quatro imagens carregando e nenhum erro de JavaScript; 62 arquivos, **619 de 619** contra PostgreSQL 16.13 (sem banco: 400 passam, 219 pulam), e a frase em pedaços de volta deixa o teste vermelho |
| 09/10 | **O conteúdo do Bayron pelo endereço, e não pelo nome** (`PENDENCIAS-ABERTAS.md` §4.7). Dez lugares comparavam o nome curto — que o dono edita em Configurações — com "Bayron": num navegador, contra o build anterior, uma barbearia `impostor` chamada "Bayron" servia o FAQ, os depoimentos, o logo, a foto do topo e a prévia dele. Agora `ehOBayron()`, pelo `slug`, nos dez; o cadastro recusa o endereço `bayron`; e o `src/config.ts` perdeu as constantes mortas do Bayron, o número falso inclusive. **Verificado:** 62 arquivos, **617 de 617** contra PostgreSQL 16.13 (sem banco: 398 passam, 219 pulam); 6 reintroduções, as 6 vermelhas; e servido o build: o Bayron com tudo, o impostor sem nada |
| 09/10 | **O primeiro minuto do cliente** — sete consertos do caminho de quem agenda e de quem acabou de se cadastrar. O `/agendar` sem serviço oferece o WhatsApp da barbearia em vez de uma tela em branco (`PENDENCIAS-ABERTAS.md` §4.9); com um barbeiro só, pula a escolha do barbeiro e conta três passos (`PENDENCIAS-ABERTAS.md` §2.2); o combo vale só nos dias marcados — o dia do horário, na barbearia — no servidor, no calendário e na página inicial (`PENDENCIAS-ABERTAS.md` §2.16); o resumo do combo sem "Combo Boris" e com todo nome escapado (`PENDENCIAS-ABERTAS.md` §2.24); a semana do painel no dia da barbearia (`PENDENCIAS-ABERTAS.md` §2.22); os dois logins só com JSON (`PENDENCIAS-ABERTAS.md` §2.23); e o hover do par padrão escurecendo, com a migration 0009 consertando as linhas gravadas (`PENDENCIAS-ABERTAS.md` §4.12). **Achados no caminho:** o XSS do wizard era maior que o registrado e **executou num navegador** contra o build anterior; e um script no site de uma barbearia cancela agendamento no painel de outra — reproduzido, registrado como `PENDENCIAS-ABERTAS.md` §2.30, não consertado. **Verificado:** 61 arquivos, **610 de 610** contra PostgreSQL 16.13 (sem banco: 391 passam, 219 pulam); 22 reintroduções, as 22 vermelhas; o E2E contra o build, **28 de 28** — e contra o build anterior, 6 de 24: as telas em branco e de um botão só voltaram, o script do produto executou e o hover clareou; a 0009 aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0008; o `astro check` com o mesmo conjunto de erros de antes |
| 09/10 | **Astro 7, por segurança** (`PENDENCIAS-ABERTAS.md` §2.29). O `npm audit` apontava falhas críticas no Astro 6.3.7, no adaptador Node 10 e no sharp 0.34 — nos dois apps, e na `main`, que é a produção. Agora: Astro 7.3.5, `@astrojs/node` 11.1.6, sharp 0.35.5, Vitest 4, um Vite só (o 8) e o `@types/node`; `npm audit` zero nos dois. O compilador novo recusou duas telas que o antigo consertava sozinho — o `<script>` sem fechar do `/agendar` e dois elementos num ramo do `? :` no `Hero.astro` —, e a regra de espaço em branco continua a do Astro 6. **Verificado:** 56 arquivos, **556 de 556** contra PostgreSQL 16.13 (sem banco: 354 passam, 202 pulam); o HTML de 25 telas do app e de 8 do site de vendas igual ao do Astro 6, nó por nó; nenhuma tela com erro de JavaScript ao abrir; os três roteiros E2E (47, 54 e 25 conferências); 5 reintroduções, as 5 vermelhas; os `package-lock.json` instalando com o npm 10 e com o 11. O `astro check` caiu de 674 erros para 356, quase todos em dois arquivos. ⚠️ A `main` continua com as versões com falha |
| 09/10 | **O e-mail: a senha nova, os avisos e a sessão que cai quando a senha muda** (`PENDENCIAS-ABERTAS.md` §4.17 e `PENDENCIAS-ABERTAS.md` §2.13). O login ganhou **"Esqueci minha senha"**: o WhatsApp de login, e o link vai ao e-mail gravado — uma hora, uma vez, o hash do token no banco, a mesma resposta exista o número ou não, e o endereço do link vindo da configuração, nunca do `Host` de quem pediu. **Trocar a senha derruba as sessões abertas**, pelo link, pela tela da equipe ou pelo script de suporte — até aqui, uma sessão valia 30 dias com a senha trocada ou não. **O e-mail aparece e se troca na tela da equipe**; o cadastro manda **boas-vindas**; e os **avisos** do teste e da cobrança saem 2 dias antes do fim do teste, no começo da carência e quando o site sai do ar, um por prazo, disparados de hora em hora por um daemon no container, como o de backup (migration 0008). O envio é SMTP de qualquer provedor (o `nodemailer`, dependência nova); **falta o provedor**, e sem ele o sistema diz que não está funcionando. **Junto:** o `npm run dev` passou a aplicar as migrations antes de subir — foi a 0007 sem migrar que derrubou o ambiente de desenvolvimento na véspera —, e a prévia do cadastro mostra o endereço inteiro, com o aviso de que ele não muda depois. **Verificado:** 55 arquivos, **552 de 552** contra PostgreSQL 16.13 (sem banco: 350 passam, 202 pulam); 44 reintroduções, as 44 vermelhas — 42 na suíte e 2 no roteiro, com o build de produção alterado de propósito; o SMTP de verdade, contra um servidor SMTP local, na suíte e no roteiro; com o build de produção, as 47 conferências do roteiro novo, as 54 do de sempre e as 25 do teste de 7 dias, sem erro de JavaScript; o `npm run dev` num banco vazio, aplicando as 9 migrations; e o desenvolvimento subindo sem o `nodemailer` instalado |
| 09/10 | **Correção: o certificado dos subdomínios não sai como os documentos diziam** (`ARQUITETURA-COBRANCA-V1.md` §7.4). O desenho de 28/08 contava com o Traefik do EasyPanel emitindo certificado para cada subdomínio na hora, pelo HTTP-01; conferido na documentação do Traefik e na do EasyPanel, ele não faz isso, e o certificado curinga exige o desafio DNS-01, com a API do provedor de DNS — que o registro.br não tem na lista do Traefik. O caminho: registrar no registro.br e pôr o DNS na Cloudflare. Corrigidos também o `ARQUITETURA-PRODUCAO.md` §4, que ainda dizia aberta a escolha entre subdomínio e domínio próprio, decidida em 01/09, e o `PRECIFICACAO.md` §6. `fadeline.com.br` continua livre e **não registrado** (conferido nesta data). Só documento |
| 08/10 | **O teste de 7 dias, a carência e o site fora do ar** — a segunda parte do desenho do mesmo dia (`PLANO-PRODUTIZACAO.md` §13), com quatro decisões a mais: o teste que acaba sem cartão segue os 3 dias; o site fora do ar mostra o WhatsApp da barbearia; o painel fora do ar mostra os próximos horários; o teste vai até o fim do 7º dia. Toda barbearia nasce `trial`, com a data de fim (migration 0007), e **a fase sai do relógio**, sem tarefa agendada (`apps/barbearia/src/lib/situacao.ts`): no teste e na carência, tudo no ar e a faixa do painel contando os dias; depois, o site responde 503 com o aviso e o WhatsApp, e o painel abre só a tela de assinatura, cujo botão do cartão fica desligado até a Asaas (`PENDENCIAS-ABERTAS.md` §4.14). O login de quem está fora do ar passou a entrar — só nessa tela. Achado testando pela rota, não pelo script: a data do fim do teste, passada como `Date` ao pool do app, estourava o driver — o Drizzle troca o conversor de datas dele. **Verificado:** 50 arquivos, **485 de 485** contra PostgreSQL 16.13 (sem banco: 320 passam, 165 pulam); 17 reintroduções, as 17 vermelhas; e com o build de produção, 25 conferências no roteiro do teste — o tempo andando de verdade, com o cache de 30 s — e as 54 do roteiro de sempre, sem erro de JavaScript |
| 08/10 | **O cadastro novo** — a primeira parte do desenho do mesmo dia (`PLANO-PRODUTIZACAO.md` §13). O `/cadastrar` passou a pedir **a cor**, oito prontas e uma livre, e **a frase do topo**, com a prévia do topo do site na cor escolhida — a mesma derivação de contraste do painel, rodando no navegador (`JORNADA-DO-BARBEIRO.md` §2.4); **o e-mail**, obrigatório, numa coluna nova de `barbers` (migration 0006) — a recuperação de senha que vai usá-lo ainda não existe (`PENDENCIAS-ABERTAS.md` §4.17); **recusa 39 endereços reservados**, `painel`, `www` e o nome do produto entre eles (`PENDENCIAS-ABERTAS.md` §4.16); e termina numa tela **"O seu site está no ar"**, com o link, o WhatsApp com o texto pronto, a bio do Instagram e os próximos passos (`JORNADA-DO-BARBEIRO.md` §2.8). Achados antes de sair da nuvem: o "Petróleo" da primeira lista de cores era a cor padrão, que o medidor do painel não conta — quem o escolhesse ouviria que faltava escolher a cor —, e a prévia dizia "o mesmo tom, mais escuro" para o cinza, que vira a cor padrão. **Verificado:** 45 arquivos, **439 de 439** contra PostgreSQL 16.13 (sem banco: 290 passam, 149 pulam); 11 reintroduções, as 11 vermelhas; a migration 0006 pelo `scripts/startup.mjs`, num banco novo e num com as cinco anteriores e um barbeiro gravado; e com o build de produção, 54 conferências no roteiro E2E, sem erro de JavaScript |
| 08/10 | **O produto passa a se chamar Fadeline — provisório**, até o cadastro abrir (`PENDENCIAS-ABERTAS.md` §0.1). Escolhido entre 103 nomes conferidos no registro.br, 31 livres; os finalistas e por que cada um ficou de fora estão lá. Trocado no código no mesmo dia: o site de vendas inteiro (`NOME_PRODUTO` e `SITE_URL` em `apps/vendas/src/config.ts`), a tela de entrar do painel e o cadastro. O app da barbearia escrevia o nome à mão em quatro lugares e passou a ler de `src/lib/produto.ts`; `tests/nome-do-produto.test.ts` reprova se as duas constantes divergirem ou se uma tela escrever o nome à mão. O domínio **não foi registrado**. **Verificado:** 43 arquivos, **426 de 426** contra PostgreSQL 16.13 (sem banco: 279 passam, 147 pulam); 4 reintroduções, as 4 vermelhas; e com o build de produção, 41 conferências no roteiro E2E e as páginas servidas sem nenhum "Barbearia no Ar" |
| 08/10 | **O desenho do cadastro e da cobrança, decidido** (`PLANO-PRODUTIZACAO.md` §13): um layout com a cor do dono escolhida no cadastro; o cartão no fim do teste — reverte a rejeição do "teste sem cartão" de 24/09; a cobrança como módulo do app, revertendo o `ARQUITETURA-COBRANCA-V1.md` §2; e-mail para a senha e os avisos; 3 dias de carência; só mensal. Só documento |
| 28/09 | **A suíte rodou no Windows e deu 418 de 419.** Dois testes das fotos estouravam `EPERM` na limpeza da pasta temporária, depois de os casos passarem: lendo a imagem pelo caminho, o sharp deixava o `.webp` aberto — medido no Linux pelo `/proc`; o `.jpg` não fica — e no Windows arquivo aberto não se apaga. Os testes passaram a ler a imagem por buffer (`tests/imagemEmDisco.ts`), com guarda; o código do app já fazia assim. Esses testes só tinham rodado no Linux desde que entraram, com as fotos no painel. **Verificado:** 42 arquivos, **423 de 423** contra PostgreSQL 16.13 (sem banco: 276 passam, 147 pulam); e **no Windows, rodado na máquina do dono em 07/10: 421 passam e 2 pulam** — os dois casos que olham o `/proc`, que o Windows não tem — e nenhum `EPERM` |
| 27/09 | **O fuso fora do UTC−3, fechado** (`PENDENCIAS-ABERTAS.md` §2.11): o bloqueio de horário, a ocupação por faixa e o calendário do cliente somavam ou subtraíam três horas à mão. Em Manaus, o almoço das 12:00 gravava 11:00, e às 23:30 o calendário do cliente abria no dia seguinte marcado "Hoje" — os dois vistos rodando com o servidor em `America/Manaus`, antes e depois do conserto. **E a guarda passou a pegar a conta**, não só o nome do fuso: rodada sobre a árvore da manhã de 27/09, ela aponta os seis lugares que existiam. Junto: o gráfico por hora do relatório, fixo de 09 a 19 (`PENDENCIAS-ABERTAS.md` §2.27); o ícone do Astro na aba de toda barbearia sem ícone, que virou a inicial dela na cor dela (`JORNADA-DO-BARBEIRO.md` §2.8); e o §1 deste documento e o `CLAUDE.md` da raiz, que ainda diziam que o código era SQLite. **Verificado:** 41 arquivos, **419 de 419** contra PostgreSQL 16.13 (sem banco: 272 passam, 147 pulam); **12 defeitos reintroduzidos um por vez**, os 12 vermelhos; e com o build de produção num navegador, 41 conferências no caminho de Fortaleza e 5 no de Manaus, sem erro de JavaScript |
| 27/09 | **O primeiro teste de ponta a ponta na máquina do dono**, com ele abrindo cada tela: landing, cadastro, painel, site, agendamento e agenda do dia. Achou usando o que a suíte não pegava: **o WhatsApp de toda barbearia nova chamava um número do Vietnã** — o cadastro gravava o número sem o 55, e o teste travava o defeito (`PENDENCIAS-ABERTAS.md` §2.25); **o nome, o endereço e a foto do Bayron** no lembrete da agenda, na prévia do link, no convite de calendário, no portal, na área do cliente e no relatório impresso (`PENDENCIAS-ABERTAS.md` §2.26); **a grade de mover horário fixa em 08:00–19:00**, oferecendo horário que a API recusava (`PENDENCIAS-ABERTAS.md` §2.27); e três textos falsos (`PENDENCIAS-ABERTAS.md` §2.28). Consertados no mesmo dia, com os centavos (`PENDENCIAS-ABERTAS.md` §2.15), os dois `+ 3` da agenda do dia (`PENDENCIAS-ABERTAS.md` §2.11) e, achado escrevendo o registro, o bloqueio fora de 08:00–19:00 que sumia da agenda (`PENDENCIAS-ABERTAS.md` §2.27). **Verificado:** 40 arquivos, **392 de 392** contra PostgreSQL 16.13 (sem banco: 245 passam, 147 pulam); **26 defeitos reintroduzidos um por vez**, e os 26 deixaram o teste certo vermelho; e com o build de produção num navegador, **38 conferências** sem erro de JavaScript. Sobrou, registrado: o `+ 3` do bloqueio e o `-180` da ocupação (`PENDENCIAS-ABERTAS.md` §2.11) e o gráfico por hora do relatório (`PENDENCIAS-ABERTAS.md` §2.27) |
| 27/09 | **A jornada do barbeiro, da landing ao site no ar** (`JORNADA-DO-BARBEIRO.md`): dez passos, cada um conferido no código — três funcionam, três pela metade, quatro não existem. **Decisão: layout e cores escolhidos no cadastro, antes do cartão** (`PLANO-PRODUTIZACAO.md` §13). Achados: não existe recuperação de senha nem e-mail no cadastro (`PENDENCIAS-ABERTAS.md` §4.17); a tokenização da Asaas não mantém o cartão fora do servidor — sobra o Checkout (`PENDENCIAS-ABERTAS.md` §4.14); e a prova no sandbox passou para a frente da onda 2 (`PENDENCIAS-ABERTAS.md` §6). Só documento: nenhuma linha de código mudou |
| 25/09 | **Fotos: galeria do site e foto de produto por barbearia** (decisão de 24/09, `PLANO-PRODUTIZACAO.md` §13). O dono sobe as fotos no painel logo depois do cadastro: `/admin/galeria` — até 20, ordem pelas setas, a seção aparece no site a partir de 3 — e a foto de produto ganhou a pasta de cada barbearia (`PENDENCIAS-ABERTAS.md` §2.7). Tabela nova `gallery_images` (migration 0005), com RLS; e `tests/rls.test.ts` passou a exigir a política em **toda** tabela com `tenant_id`, inclusive as que vierem depois. **As 20 fotos do Bayron só entram no banco pelo `scripts/importar-galeria-bayron.mjs`** — passo novo do roteiro (`ROTEIRO-MIGRACAO-PRODUCAO.md` §4.8); sem ele, o site do Bayron fica sem a galeria. Foto de celular passou a ser gravada em pé e sem o GPS (`PENDENCIAS-ABERTAS.md` §2.21). E o cadastro passou a deixar o dono logado no painel da barbearia nova, em vez de mandá-lo para o login |
| 25/09 | **Dois defeitos que derrubariam o dia da migração**, achados rodando como em produção — nenhum aparecia na suíte: **toda transação dentro de requisição estourava, o agendamento pelo site inclusive** (`PENDENCIAS-ABERTAS.md` §2.19), e **a agenda do dia não respondia a clique nenhum** (`PENDENCIAS-ABERTAS.md` §2.20). E o guarda de escopo passou a olhar consulta por consulta: achou doze sem filtro de barbearia, que o RLS segurava, e um 500 no cadastro de barbeiro com telefone repetido (`PENDENCIAS-ABERTAS.md` §2.18) |
| 25/09 | **Verificado:** 35 arquivos, **334 de 334** contra PostgreSQL 16.13 (sem banco: 187 passam, 147 pulam). **40 defeitos reintroduzidos um por vez** deixaram o teste certo vermelho. Outros dois passaram na primeira tentativa e mostraram guarda furado — o filtro da barbearia dentro do ramo por papel, e um comentário que citava a tag do script e escondia o bloco real —, e os dois guardas foram consertados antes de seguir. Dois sobreviveram e ficaram aceitos: gravar a foto da galeria sem passar a barbearia explícita (equivalente dentro da requisição) e apagar sem conferir o prefixo do caminho (o caminho só vem do banco). **E ao vivo, com o build de produção:** cadastro → painel já logado → galeria (enviar, ordenar, remover) → site com e sem a seção → agendamento pelo site → as 13 telas do painel: 35 conferências, sem erro de JavaScript. Foi essa verificação que achou o `PENDENCIAS-ABERTAS.md` §2.20 e o `PENDENCIAS-ABERTAS.md` §2.22 |
| 24/09 | **Decisão: autoatendimento, com 7 dias grátis** (`PLANO-PRODUTIZACAO.md` §13). O dono se cadastra sozinho com o cartão, recebe o painel na hora e escolhe entre três layouts de site, com as cores da barbearia dele; a primeira cobrança só vem depois dos 7 dias. Sai a montagem assistida que os documentos defendiam desde 27/08. **Só a decisão — nada disto está implementado.** Existe o cadastro com serviços e preços; não existem os três layouts, o teste de 7 dias, o cartão nem a cobrança. A decisão adiantou para o primeiro cadastro o prazo do contrato e da LGPD (`PENDENCIAS-ABERTAS.md` §1.2), abriu quatro pendências (`PENDENCIAS-ABERTAS.md` §4.13 a `PENDENCIAS-ABERTAS.md` §4.16) e reordenou a fila (`PENDENCIAS-ABERTAS.md` §6) |
| 24/09 | **As ondas 0 e 1 verificadas com banco: 274 de 274.** Rodado contra PostgreSQL 16.13, sobre uma cópia da árvore conferida arquivo por arquivo, byte a byte, com a máquina de desenvolvimento. E verde não bastou: **13 defeitos foram reintroduzidos de propósito, um por vez, e os 13 deixaram o teste certo vermelho** — é o que separa teste que passa de teste que guarda. A mesma verificação mostrou duas mudanças de 22/09 sem teste nenhum (a permissão da busca e o caminho da mídia): com qualquer uma desfeita, a suíte seguia 269 de 269. Os dois testes foram escritos (`tests/busca-permissao.test.ts` e um bloco novo em `tests/uploads.test.ts`). **E um vermelho real no Windows:** o caso "a porta nasce fechada" de `tests/cadastro.test.ts` estourava 5 s porque carregava a rota dentro do `it`, e o tempo de import era cobrado do caso — 5 ms com o import num gancho |
| 22/09 | **Onda 1 da auditoria** — o que só não dói porque hoje existe uma barbearia só. A mídia da marca passou a gravar na pasta do tenant (`PENDENCIAS-ABERTAS.md` §2.9) — sem isso o site de toda barbearia nova nascia sem logo nem capa; o JSON-LD passou por escape (`PENDENCIAS-ABERTAS.md` §2.12), fechando o XSS pelo nome da barbearia; a busca de clientes passou a conferir papel e `getSession()` a reconsultar o barbeiro a cada requisição (`PENDENCIAS-ABERTAS.md` §2.13) — demitir agora tira o acesso, antes levava até 30 dias; e o guarda de escopo por tenant deixou de ser cego (`PENDENCIAS-ABERTAS.md` §2.17), o que expôs **quatro arquivos que nunca tinham sido escopados** — `slots.ts`, `reagendar.ts`, `appointments/search.ts` e `appointments/calendar.ts`. De 54 de 54 para **64 de 64** |
| 22/09 | **Onda 0 da auditoria** (`PENDENCIAS-ABERTAS.md` §6): os três consertos que precisavam vir antes de qualquer deploy. A data do agendamento passou a vir do fuso da barbearia e não de UTC (`PENDENCIAS-ABERTAS.md` §2.10) — a última hora do dia voltou a ser vendável; `await` nas duas transações que respondiam antes de gravar (`PENDENCIAS-ABERTAS.md` §2.14); e a trava do backup passou a olhar quantas barbearias existem no banco, em vez de quem está pedindo (`PENDENCIAS-ABERTAS.md` §2.8) — a condição anterior barrava todas menos a que existe. **Três guardas novas**, porque nenhum dos três aparecia na suíte: `tests/data-do-fuso.test.ts`, `tests/transacoes-awaited.test.ts` e `tests/backup-rota.test.ts` |
| 15/09 | **Auditoria completa do projeto**: 172 arquivos, 25.662 linhas. 17 defeitos confirmados com arquivo e linha, cada um reproduzido no código (`PENDENCIAS-ABERTAS.md` §2.8 a `PENDENCIAS-ABERTAS.md` §2.17, e `PENDENCIAS-ABERTAS.md` §4.8 a `PENDENCIAS-ABERTAS.md` §4.12). Três vazam entre barbearias no dia do segundo cliente; quatro quebram fora do fuso de Fortaleza. A ordem de execução virou quatro ondas no §6 |
| 15/09 | Cadastro de barbearia pela web (`PENDENCIAS-ABERTAS.md` §4.8), fechado por `CADASTRO_ABERTO`. A regra de criar barbearia virou função compartilhada com o script. **E o dia rendeu cinco defeitos achados USANDO o produto**, nenhum deles pego pela suíte: o nome de outra barbearia no painel (cache frio no resolvedor), a sessão vazando entre cadastros, o "Ver meu site" apontando para `/`, o `/agendar` em branco e o `/demo` sem imagem |
| 13/09 | Inventário do que falta no código, conferido no repositório e não no documento. Três seções estavam desatualizadas: `PENDENCIAS-ABERTAS.md` §4.3 (painel) e `PENDENCIAS-ABERTAS.md` §4.6 (migrations) já estavam feitas, e o teste de restauração de `PENDENCIAS-ABERTAS.md` §3.3 já tinha sido feito duas vezes. Corrigidas, e o `shortName === "Bayron"` virou `PENDENCIAS-ABERTAS.md` §4.7 |
| 11/09 | Barbearia nova sai da tela em branco: catálogo de oito serviços sugeridos no painel, **sem preço de propósito** (`PENDENCIAS-ABERTAS.md` §4.5) |
| 11/09 | Conferido que o campo de cor da marca no painel já existia e funciona — o documento afirmava que faltava (`PENDENCIAS-ABERTAS.md` §4.2) |
| 11/09 | `npm run test:db`: Postgres descartável para a suíte inteira rodar na máquina de desenvolvimento, em vez de 84 casos pulados em silêncio |
| 11/09 | Passo 6: o endereço passa a decidir a barbearia. Dois sites servidos pelo mesmo processo, sem vazar conteúdo um do outro; host desconhecido responde 404 (`PENDENCIAS-ABERTAS.md` §2.7 nasceu daí) |
| 11/09 | RLS ligado (passo 5.1): o banco passa a recusar sozinho que uma barbearia alcance os dados de outra. Provado com uma rota escrita de propósito sem filtro, chamada por dois donos logados |
| 11/09 | As fotos entram no backup: o `pg_dump` salvava o banco e nada do volume, então volume morto significava barbearia sem logo, capa nem galeria (`PENDENCIAS-ABERTAS.md` §3.7) |
| 11/09 | Carga do Bayron de SQLite para Postgres: o script que faltava, quatro recusas e o ensaio com os 820 registros reais — incluindo o app subindo contra o banco carregado e o backup dele restaurando inteiro (`PENDENCIAS-ABERTAS.md` §2.5) |
| 10/09 | Restos do porte para Postgres, achados e corrigidos antes do deploy: a pasta das fotos saía de `DATABASE_PATH` e virava relativa; `pg_dump` não existia na imagem, ou seja, backup nenhum; `db:seed` apontava para arquivo apagado e `db:push` continuava podendo alterar o schema sem migration (`PENDENCIAS-ABERTAS.md` §2.4) |
| 10/09 | Fuso horário sai de 20 arquivos e vira `src/lib/timezone.ts`, com `tests/timezone-unico.test.ts` impedindo que volte a espalhar (`PENDENCIAS-ABERTAS.md` §2.1) |
| 10/09 | Medidor de completude no painel (`PENDENCIAS-ABERTAS.md` §4.4) |
| 10/09 | `/admin/configuracoes` lia e gravava sempre no tenant 1 — corrigido, e o teste-guarda passou a exigir que o tenant venha da sessão |
| 09/09 | Login do painel por telefone; a sessão passa a decidir a barbearia (passos 4 e 5) |
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

> ⚠️ **Esta fila é de 06/09/2026 e ficou para trás** — os passos 9.1 e 9.2, por exemplo,
> já foram feitos. **A ordem vigente é a do `PENDENCIAS-ABERTAS.md` §6**, reordenada em
> 24/09 pela decisão do autoatendimento. O que segue fica como registro de como o
> monorepo foi montado.

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

*10/10/2026: o risco deste item não existia como escrito. O serviço do Bayron no EasyPanel
constrói de outro repositório, o `Alexandfdes/Barbearia-Bayron` (a `main` de lá em `e50926a`), e
não da `main` deste — visto no painel em 10/10. A `main` daqui recebeu o monorepo em 09/10 sem
tocar no site dele (`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2).*

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
| Barbearia suspensa continua entrando | por até 30s. Numa cobrança mensal é irrelevante, e o login já recusa suspensa na porta *(até 08/10/2026; desde então ela entra, mas só na tela de assinatura)* |
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

**3. ~~Ligar o RLS~~** (passo 5.1) — **feito em 11/09/2026**. Ver §9.10.

**4. Separar site e painel** (passo 6). É quando `tenantDoHost()` deixa de
devolver `TENANT_UNICO` e passa a usar o `resolverHost()` que já está pronto.

**5. ~~A exclusion constraint~~** (passo 7) — **feita em 12/10/2026**: o banco recusa dois
agendamentos do mesmo barbeiro no mesmo horário (`PENDENCIAS-ABERTAS.md` §2.37). O
`pg_advisory_xact_lock` continua no código — é ele que dá a mensagem certa.

### 9.10 ✅ O RLS — o banco recusa sozinho (11/09/2026)

Até aqui, o que separava a barbearia A da B era **disciplina**: as 54 rotas foram
escopadas uma a uma e `tests/escopo-rotas.test.ts` vigia isso. Funciona enquanto
ninguém errar. Agora uma consulta que esqueça o `WHERE tenant_id` não devolve a
linha errada — devolve **nenhuma**.

**A prova, via HTTP de verdade.** Foi criada uma rota com
`SELECT tenant_id, name FROM barbers`, sem filtro nenhum — a "rota 55 escrita com
pressa" — e chamada com as sessões de dois donos. O do Bayron recebeu os 3
barbeiros dele; o da Vintage recebeu 1. Antes, a mesma rota devolveria os 4 para
os dois. A rota temporária não foi commitada; o equivalente vive em
`tests/rls.test.ts` (9 casos).

Também provado: `DELETE FROM barbers` **sem cláusula**, rodado pela Vintage, apaga
só o dela; `UPDATE services SET price_cents = 1` não alcança o preço da outra; e
`INSERT` com `tenant_id` alheio é recusado pelo banco.

**Como o tenant chega lá.** `src/middleware.ts` resolve a barbearia (sessão do
painel, senão o host) e embrulha a requisição em `comTenant()`, que reserva uma
conexão, assume o papel `barbearia_app` e grava `app.tenant_id`. As 64 rotas
continuam com `import { db }` e **não mudaram uma linha**: `db` virou proxy.
Trocar por parâmetro seria 64 arquivos e 64 chances de esquecer um — e o esquecido
não falharia, só deixaria de ser protegido, em silêncio.

**Quatro decisões que vão parecer estranhas daqui a seis meses:**

1. **Papel separado, não segunda credencial.** O dono das tabelas ignora RLS (é
   assim que o Postgres funciona — senão ele não faria manutenção). Por isso
   `barbearia_app` é `NOLOGIN` e assumido com `SET ROLE`. Uma credencial só no
   `.env`, e migrations, carga e provisionamento continuam enxergando tudo.
2. **`NULLIF` na política.** Depois de `RESET app.tenant_id` a variável não volta
   a `NULL`: vira **string vazia**, e `''::int` não devolve `NULL`, **estoura**.
   Sem o `NULLIF`, conexão reaproveitada do pool trocaria "não vê nada" por "erro
   no meio da página".
3. **A resposta é lida inteira dentro do contexto** (`arrayBuffer()`). O Astro
   devolve a página como stream, e o que falta renderizar ainda consulta o banco.
   Custa o primeiro byte chegar com a página pronta; na maior página daqui
   (50 KB) não se vê. Conferido que binário não corrompe.
4. **Limpeza que falha fecha a conexão** em vez de devolvê-la ao pool. Conexão
   voltando ainda como `barbearia_app` com o tenant de outra barbearia serviria a
   próxima requisição com o crachá errado.

⚠️ **Dois furos, ambos de propósito e vigiados.** A tabela `tenants` fica fora das
políticas, com `SELECT` apenas — é o roteamento, e protegê-la criaria um
ovo-e-galinha em que ninguém entra; ela não tem dado de cliente. E o **login** usa
`dbDono`, porque acha o barbeiro pelo telefone antes de saber de qual barbearia ele
é. `tests/rls.test.ts` mantém a lista de quem pode usar `dbDono` fechada e falha se
ela crescer.

⚠️ **O RLS não dispensa filtrar na rota.** Ele reduz a gravidade do esquecimento,
não o conserta: uma rota sem filtro passa a devolver zero linhas, o que ainda é uma
tela vazia para o dono. `tests/escopo-rotas.test.ts` continua valendo.

### 9.11 ✅ O passo 6 — o endereço decide a barbearia (11/09/2026)

Até aqui o produto tinha multi-tenant por dentro e **uma barbearia só por fora**:
`tenantDoHost()` devolvia a barbearia número 1, fixa. A segunda podia existir no
banco, com dados isolados e RLS ligado, e não tinha endereço.

Verificado servindo os dois endereços contra o mesmo processo:

```
bayron.barbearianoar.com.br     200  "Barbearia Bayron"    51 KB, 7 seções
vintage.barbearianoar.com.br    200  "Barbearia Vintage"   27 KB, 5 seções
naoexiste.barbearianoar.com.br  404
painel.barbearianoar.com.br     404 no site, painel funcionando normalmente
```

Zero menção a "Bayron", "Mossoró", "Jaen Menescal" ou "Produtos Boris" na página da
Vintage. No painel, no mesmo endereço central, cada dono logado vê só a sua: 3
barbeiros para o Bayron, 1 para a Vintage.

**O defeito que quase passou, e era pior que o problema.** Ligar a resolução por
host sozinha não bastava: **doze componentes e layouts chamam `await getSettings()`
sem argumento**, e o padrão deles vinha de `tenantAtual()`, que devolvia 1 fixo. O
endereço da Vintage abriria com o nome, o endereço, os horários, o Instagram e a
marca do Bayron — HTTP 200, página bonita, barbearia errada. `tenantAtual()` passou
a ler a barbearia do contexto da requisição (o mesmo do RLS), e os doze pontos de
chamada ficaram certos de uma vez, sem mudar uma linha neles.

**O segundo, que só apareceu conferindo rota por rota.** `/api/media` montava o
caminho com `UPLOAD_ROOT` cru e exigia exatamente dois segmentos — mas
`urlDeMidia()` gera `/api/media/<slug>/logo/x.webp` para quem não é a barbearia
legada. Ou seja: **logo, capa, favicon e galeria da segunda barbearia davam 404**, e
o site dela nasceria sem imagem nenhuma. A pasta agora vem do host; slug que não bate
com ele é 404, porque aceitar o slug da URL deixaria qualquer um pedir a pasta de
qualquer barbearia trocando uma palavra no endereço.

**O resto.** Treze rotas de API ganharam guarda de 404 — o compilador apontou todas
sozinho quando o retorno virou `Tenant | null`, que é quebrar na cara em vez de em
silêncio. Sete páginas `.astro` foram conferidas à mão, porque o `tsc` não as lê.
`/api/slots` não perguntava nada e, num host desconhecido, rodaria sem contexto (logo,
sem RLS) com o `barberId` da query alcançando a agenda de qualquer cliente. E o
`404.astro` lê `settings`: sem guarda, quem apontasse qualquer domínio para o servidor
veria a marca do primeiro cliente.

O middleware aquece o cache de tenants antes de resolver o host. `getSession()` já
aquecia, mas só quando existe cookie — e visitante de site não tem cookie. Sem isso a
primeira visita depois de cada boot cairia em 404: defeito que só aparece em produção,
no primeiro acesso depois de cada deploy, e some quando alguém vai conferir.

⚠️ **Está pronto e não vai ao ar.** A resolução por subdomínio precisa de um domínio
que exista, e o nome ainda não foi escolhido (`PLANO-PRODUTIZACAO.md` §12). É o custo
técnico daquela decisão, e ele fica visível aqui de propósito.

⚠️ **Sobrou uma rota fora da guarda**, de propósito e registrada:
`api/products/image/[name].ts` serve de uma pasta compartilhada por todas as
barbearias (`PENDENCIAS-ABERTAS.md` §2.7).

⚠️ **Nada disso é o que trava a primeira venda.** Os três itens que decidem se o
negócio fecha: política de suporte (`PENDENCIAS-ABERTAS.md` §1.4), medidor de
completude (`PENDENCIAS-ABERTAS.md` §4.4) e contrato (`PENDENCIAS-ABERTAS.md` §1.2). A R$ 100/mês, meia hora de
suporte a mais por cliente come toda a margem — o multi-tenant não resolve isso.
