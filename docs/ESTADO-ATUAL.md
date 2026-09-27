# Estado atual do código — comece por aqui

> Registro vivo de **onde o código está**, para quem chega ao projeto ou volta
> depois de um tempo. Atualizado: 27/09/2026 (§8).
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
| 5.1. Ligar RLS | ✅ **feito em 11/09** — provado com rota sem filtro via HTTP, ver §9.10 |
| 6. Separar site do painel | ✅ **feito em 11/09** — o host resolve de verdade, ver §9.11. Não vai ao ar sem domínio |
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
| 🟠 | **`shortName === "Bayron"` decide o que aparece no site** em oito componentes — comparação de texto contra um campo que o próprio cliente edita no painel. Separado do `PENDENCIAS-ABERTAS.md` §4.6 em 13/09 | `PENDENCIAS-ABERTAS.md` §4.7 |
| 🟠 | **Não existe uma linha de código sobre cobrança.** `tenants.status` existe e o host recusa quem não é `active`, mas nada muda esse status — nem tela, nem comando, nem webhook — e quem cai em `suspended` vê 404, não "conta suspensa" | `PENDENCIAS-ABERTAS.md` §3.5 |
| 🟠 | **Fuso por barbearia**: `TZ_BARBEARIA` vale para o processo inteiro, e o passo 6 já põe várias barbearias no mesmo processo. Trava vender fora do fuso de Fortaleza | `PENDENCIAS-ABERTAS.md` §2.1 |
| ✅ | ~~Timezone escrito em 20 arquivos como constante~~ — centralizado em 10/09 em `src/lib/timezone.ts`, com teste-guarda. **Sobrou o fuso por barbearia**, que só morde no passo 6 | `PENDENCIAS-ABERTAS.md` §2.1 |
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

**3. ~~Ligar o RLS~~** (passo 5.1) — **feito em 11/09/2026**. Ver §9.10.

**4. Separar site e painel** (passo 6). É quando `tenantDoHost()` deixa de
devolver `TENANT_UNICO` e passa a usar o `resolverHost()` que já está pronto.

**5. A exclusion constraint** (passo 7), contra dois agendamentos no mesmo
horário do mesmo barbeiro. Hoje isso é garantido por `pg_advisory_xact_lock` no
código; a constraint move a garantia para o banco.

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
