# Roteiro — pôr o Postgres no ar para o Bayron

> Escrito em 13/09/2026. **Ainda não executado.**
> ⚠️ **Atualizado em 10/10/2026: o app novo subiu ANTES da migração, com o banco vazio, e o
> §4.2 não roda mais como está escrito. Leia o §0.2 antes de qualquer passo.**
> Atualizado em 25/09/2026: as migrations 0004 e 0005, o passo 4.8 (a galeria do Bayron),
> e dois defeitos que derrubariam o dia, já consertados (§0.1).
> Companheiro de `ESTADO-ATUAL.md` §9 (a fila) e `PENDENCIAS-ABERTAS.md` §2.5 (o ensaio
> da carga, já feito). O que este documento acrescenta é a parte que o ensaio **não**
> cobriu: o deploy em si.

## 0. Por que existe

A branch `monorepo` está **50 commits à frente da `main`**. Porte para Postgres,
multi-tenant, RLS, resolução por endereço, carregador da migração, backup das fotos e
catálogo sugerido — nada disso está no ar. A produção do Bayron roda a `main`, em
SQLite.

Este é o roteiro que transforma isso em realidade. É também **a operação mais arriscada
do projeto**: troca o motor do banco embaixo de uma barbearia que está atendendo.

⚠️ **Leia inteiro antes de começar o passo 1.** Metade do valor daqui está em saber o
que vem depois antes de dar o primeiro comando.

### 0.1 ⚠️ O que este roteiro teria encontrado no dia — achado em 25/09/2026

Dois defeitos da branch `monorepo`, os dois achados rodando o código como em produção, e
nenhum aparecia na suíte. **Os dois estão consertados e com teste**; ficam aqui porque
mudam o que conferir no §5.

- **O agendamento pelo site não funcionaria.** Toda transação dentro de uma requisição
  estourava, e agendar é uma (`PENDENCIAS-ABERTAS.md` §2.19). O §5 pegaria na linha
  *"um agendamento novo, feito pelo site"* — com o site já no ar, e o caminho seria o
  rollback do §6.
- **A agenda do dia não responderia a clique nenhum** (`PENDENCIAS-ABERTAS.md` §2.20). A
  tela abria normal, e o §5 não tinha linha que pegasse: quem descobriria seria o primeiro
  barbeiro a tentar fechar uma comanda.

---

### 0.2 ⚠️ O app novo subiu antes da migração — 10/10/2026

Em 10/10/2026 o app novo foi para o ar no EasyPanel, construído da `main` — que recebeu a
`monorepo` em 09/10 —, com um Postgres só dele e **o banco vazio**. No boot, o
`scripts/startup.mjs` aplicou as dez migrations. Isso quebra a ordem do §4: a `0001` já rodou
sem dados, e a carga **recusa** — *"a coluna tenant_id já existe, ou seja, a 0001 já rodou"*.

**Ensaiado em 10/10/2026 contra PostgreSQL 16, pelos scripts de verdade** — não pelo atalho do
teste de carga —, conectado como superusuário, como em produção:

| Passo | Resultado |
|---|---|
| Banco vazio e boot completo — a produção de hoje | 10 migrations, nenhuma barbearia |
| A carga nesse banco | **recusa**, com a explicação |
| Apagar e recriar o banco, com o papel `barbearia_app` já existente no servidor | — |
| `--ate=0000`, a carga, o boot completo | a barbearia 1 é o `bayron`, as linhas com `tenant_id`; pelo papel do app, a barbearia 1 vê os agendamentos e a 2 não vê nenhum |
| A galeria, rodada duas vezes | 20 fotos na primeira; *"nada a fazer"* na segunda |

A pergunta que a sessão de 10/10 deixou — se a `0003` aguenta o papel já existindo, já que
papel é do servidor e sobrevive ao banco apagado — está respondida: aguenta (`IF NOT EXISTS`),
e a `0004` também. O SQLite do ensaio é o mesmo de mentira do teste de carga: **dado torto do
banco real só aparece com o banco real** — ensaie com uma cópia dele antes do dia (§2).

⚠️ **11/10/2026 — se o app já tiver trocado o superusuário por um usuário só dele**
(`PENDENCIAS-ABERTAS.md` §3.10): os passos 4 e 5 abaixo rodam com o `DATABASE_URL` do
**superusuário** — o banco recriado é dele, e a `0004` só concede o papel do app com ele (conferido:
o usuário do app, mesmo já membro, não pode concedê-lo a si de novo). No fim, o
`scripts/usuario-do-app.mjs` roda de novo, com o mesmo usuário e a mesma senha, e o `DATABASE_URL`
volta a ser o dele.

**A ordem do dia, revista** — o resto do §4 continua valendo:

1. **Antes do dia:** o backup do app novo saindo da VPS (`PENDENCIAS-ABERTAS.md` §3.3), e o
   banco de produção conferido vazio — nenhuma barbearia de teste. A barbearia 1 tem de ser o
   Bayron: é ela que guarda o caminho antigo das fotos (`src/lib/uploads.ts`).
2. **Montar o volume do site antigo no app novo**, o que redeploya o app. Fica antes de tudo de
   propósito: o boot reaplica o que faltar, e aqui nada falta.
3. **Parar o site antigo** (§4.0). Daqui em diante o Bayron está fora do ar.
4. **Apagar e recriar o banco do app**, conectado ao banco `postgres` do mesmo servidor
   (`DROP DATABASE … WITH (FORCE)`, depois `CREATE DATABASE … OWNER …`).
5. **No console do app:** §4.2, §4.3 — com o caminho do SQLite no volume montado — e §4.4.
   ⚠️ **Sem reiniciar o app no meio:** o boot aplicaria todas as migrations, a carga recusaria
   de novo, e volta-se ao passo 4.
6. O §4.5 muda: o endereço sem `www` já resolve pelo slug, mas o com `www` não — o app tira o
   slug do primeiro pedaço do endereço (`src/lib/tenant.ts`). O `UPDATE` do §4.5 passa a
   apontar para o endereço com `www`.
7. **Mover o endereço:** tirá-lo do serviço antigo e adicioná-lo ao app novo — o certificado
   sai na hora (`ARQUITETURA-COBRANCA-V1.md` §7.4). Depois, do §4.6 ao §4.8. As fotos do volume
   antigo vão para o novo com o mesmo caminho: a barbearia 1 mantém o caminho legado.

*Ensaiada e não recomendada:* um banco novo ao lado, e o app trocando de banco no fim. Funciona
igual — mas o banco está vazio, então apagá-lo não perde nada, e um banco com outro nome deixaria
para trás o que estiver configurado com o nome antigo.

**O serviço antigo do Bayron constrói de outro repositório** — o `Alexandfdes/Barbearia-Bayron`,
com a `main` em `e50926a`, de 10/07 (visto no EasyPanel em 10/10/2026). Por isso o merge do
monorepo na `main` daqui não o tocou (`ESTADO-ATUAL.md` §9.3), e reconstruí-lo continua
possível: o caminho de volta tem código, não só imagem. Até a migração, nada novo naquele
repositório.

⚠️ **O caminho de volta encurta** (§6): até o primeiro agendamento feito no app novo, voltar é
devolver o endereço e religar o site antigo. Depois dele, o que entrou no app novo não existe no
SQLite.

## 1. O que muda, e o que NÃO muda

| | Antes | Depois |
|---|---|---|
| Banco | SQLite em `/data/appointments.db` | Postgres, `DATABASE_URL` |
| Fotos | `/data/uploads` | `/data/uploads` — **não mudam de lugar** |
| Backup | `.db` diário | `.sql.gz` + `-fotos.tar.gz` diários |
| Quem decide a barbearia | ninguém: é uma só | o endereço (`resolverHost`) e a sessão |
| Isolamento entre barbearias | físico (um arquivo cada) | RLS no banco |

**Não muda:** o domínio, o visual, os agendamentos, os links de gerenciamento que os
clientes já receberam (os ids são preservados), as fotos.

⚠️ **O que este deploy NÃO faz:** não coloca a segunda barbearia no ar. O passo 6 está
pronto e depende de um domínio que ainda não existe (`PLANO-PRODUTIZACAO.md` §12). Aqui
o Bayron continua sozinho, só que sobre a arquitetura nova.

---

## 2. Antes do dia — o que provar na sua máquina

Nada aqui encosta em produção. **Se algum falhar, pare: o dia da migração não começou.**

### 2.1 ✅ A imagem constrói e sobe — FEITO em 13/09/2026

⚠️ **A imagem nunca foi construída.** O `Dockerfile` mudou (instala
`postgresql16-client`, define `UPLOAD_ROOT`) e não existe Docker no ambiente onde o
código foi escrito.

**O que já foi ensaiado sem Docker, em 13/09/2026**, refazendo as etapas do `Dockerfile`
à mão a partir do código exato desta máquina:

| Etapa | Resultado |
|---|---|
| `npm ci` com o `package-lock` de hoje | 464 pacotes, sem erro — é a falha de build mais comum, e não acontece |
| `COPY . .` respeitando o `.dockerignore` | `src/data` entra, `data/` da raiz fica de fora (o padrão `data/` é ancorado na raiz, não pega `src/data`) |
| `npm run build` | ok |
| Os cinco `COPY` da etapa 2 | `dist`, `drizzle`, `scripts`, `node_modules`, `package.json` — todos existem |
| O `CMD` verbatim | migrations aplicadas, `✓ backup: pg_dump`, daemon agendado, servidor ouvindo |
| O `CMD` com o banco fora do ar | `startup.mjs` sai com 1 e **o servidor não sobe** — é a garantia que permite a conexão ser preguiçosa |
| `provisionar.mts` + site da barbearia nova | subdomínio responde 200, endereço desconhecido 404 |

**O que só o Docker prova, e é por isso que este passo continua obrigatório:** se o
`apk add --no-cache postgresql16-client` resolve na imagem `node:22-alpine` de hoje, e se
o `sharp` roda em musl. São os dois pontos que sobraram.

```powershell
cd C:\DEV\barbearia\apps\barbearia
docker build -t barbearia-teste .
```

Depois, provar que ela **sobe e serve**, contra um Postgres descartável:

```powershell
docker network create rede-teste
docker run -d --name pg-teste --network rede-teste `
  -e POSTGRES_USER=barbearia -e POSTGRES_PASSWORD=barbearia -e POSTGRES_DB=barbearia `
  postgres:16-alpine

# ⚠️ ESPERE o banco aceitar conexão antes de subir o app.
# A primeira versão deste roteiro não tinha esta linha e falhou na primeira
# colagem: o Postgres leva alguns segundos inicializando, e o app tentava
# conectar antes. O erro parece defeito da imagem e não é.
# Repita até dizer "accepting connections":
docker exec pg-teste pg_isready -U barbearia

docker run --rm --network rede-teste `
  -e DATABASE_URL="postgres://barbearia:barbearia@pg-teste:5432/barbearia" `
  -e SESSION_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))") `
  -e TZ_BARBEARIA=America/Fortaleza `
  -p 4321:4321 barbearia-teste
```

**O que tem que aparecer na saída, nesta ordem:**

```
→ 0000_init_postgres.sql ... ok
→ 0001_tenants.sql ... ok
→ 0002_barber_phone.sql ... ok
→ 0003_rls.sql ... ok
✓ 4 migration(s) aplicada(s)
✓ backup: pg_dump (PostgreSQL) 16.x        ← se NÃO aparecer isto, a imagem está sem pg_dump
[@astrojs/node] Server listening on http://0.0.0.0:4321
```

⚠️ A linha do `pg_dump` é o motivo de metade deste passo existir. Sem ela, o container
sobe, a barbearia atende, e **nenhum backup é feito** — em silêncio, até o dia de
precisar restaurar.

Limpeza: `docker rm -f pg-teste; docker network rm rede-teste`

**Resultado de 13/09/2026 — passou.** As duas dúvidas que só o Docker respondia:

| Pergunta | Resposta |
|---|---|
| `apk add --no-cache postgresql16-client` resolve na `node:22-alpine` de hoje? | **Sim**, em 3,1s |
| O `sharp` carrega em musl? | **Sim** — `sharp ok 8.17.3` |

E o boot saiu como o roteiro promete: as quatro migrations, `✓ 4 migration(s)
aplicada(s)`, **`✓ backup: pg_dump (PostgreSQL) 16.15`**, o daemon agendado — e ele já
gravou um backup de boot em `/data/backups/`, o que prova o caminho inteiro do backup
dentro da imagem, não só a presença do binário.

⚠️ **O que isto NÃO prova:** que o EasyPanel vai construir a mesma coisa. Ele usa o
contexto de build do §2.4 e as variáveis do §3.1. A imagem é a mesma; o ambiente ao redor
dela, não.

⚠️ **O `Dockerfile` mudou em 25/09/2026** — uma linha que leva as fotos do carrossel do
Bayron para `seed/galeria-bayron/`, de onde o passo 4.8 as lê. O build de 13/09 não prova
esta versão: **reconstrua antes do dia.** E a saída do boot agora tem seis migrations, da
`0000` à `0005_galeria.sql`, `✓ 6 migration(s) aplicada(s)` e, logo depois, a linha
`✓ papel do app: <usuário> pode assumir barbearia_app` (conferido em 25/09 contra
PostgreSQL 16.13).

### 2.2 O endereço do Bayron resolve

⚠️ **Este é o detalhe que mais pode derrubar o site depois do deploy, e ele passa
despercebido.**

Com o passo 6, `tenantDoHost()` resolve pelo **primeiro rótulo** do endereço. A produção
é `bayron.alexandrefdev.tech` → rótulo `bayron`; o slug do tenant é `bayron`. **Casa por
coincidência.** Se o endereço fosse `barbeariabayron.com.br`, o site responderia 404.

Não dependa da coincidência. Depois da carga (passo 4.3), preencha a coluna `domain`:

```sql
UPDATE tenants SET domain = 'bayron.alexandrefdev.tech' WHERE slug = 'bayron';
```

`resolverHost()` tenta `domain` primeiro e só depois o slug. Com a coluna preenchida, o
endereço resolve de qualquer jeito.

### 2.3 O Postgres de produção existe e o container alcança

O VPS já tem um Postgres (compartilhado com n8n e redis — `PENDENCIAS-ABERTAS.md` §3.1).
Confirme, **antes do dia**:

- [ ] existe um banco vazio só para o Bayron (ex.: `barbearia_bayron`), e um usuário dono dele;
- [ ] o container do app enxerga esse Postgres pelo nome do serviço na rede do EasyPanel;
- [ ] a `DATABASE_URL` montada com esses dados conecta;
- [ ] **esse usuário pode criar papel** (`CREATEROLE` ou superusuário) — ver abaixo.

*10/10/2026: ✅ existe — um Postgres só do app, e o usuário dele cria papel (§0.2).*

#### O item do `CREATEROLE`, e por que ele entrou aqui em 13/09/2026

⚠️ **Este é o item que teria parado a migração no meio, com o site já fora do ar.**

A migration `0003` cria o papel `barbearia_app`, e o app faz `SET ROLE barbearia_app` em
**toda** requisição — é o que liga o row level security. Duas coisas precisam ser verdade,
e nenhuma delas é automática:

1. o usuário do `DATABASE_URL` precisa poder **criar** o papel (`CREATEROLE` ou superusuário);
2. ele precisa poder **assumir** o papel, o que exige ser **membro** dele.

Superusuário assume qualquer papel — e todo o desenvolvimento rodou conectado como
`postgres`, então nada disso apareceu. Com um usuário comum, conferido contra
PostgreSQL 16.13 em 13/09/2026:

```
CREATE ROLE barbearia_app NOLOGIN;   ->  CREATE ROLE          (passa)
SET ROLE barbearia_app;              ->  ERROR: permission denied to set role
```

Criar o papel com `CREATEROLE` dá ADMIN OPTION, que permite **conceder** — não assumir. O
resultado em produção seria migration verde, deploy verde e **500 em toda requisição**.

**Corrigido no código:** a migration `0004_app_pode_assumir_o_papel.sql` faz o
`GRANT barbearia_app TO <usuário do DATABASE_URL>` e, antes de commitar, prova o `SET ROLE`
ali mesmo. E `scripts/startup.mjs` repete a prova a cada boot e **derruba o container** se
falhar — porque migration roda uma vez, e trocar a credencial depois recriaria o problema
em silêncio. Provado aplicando `0000` a `0004` com um usuário comum `CREATEROLE`: as cinco
passam, o RLS separa as duas barbearias, e revogar o `GRANT` reproduz o erro acima.

**Como conferir antes do dia**, conectado com a `DATABASE_URL` de produção:

```sql
SELECT current_user,
       rolsuper      AS eh_superusuario,
       rolcreaterole AS pode_criar_papel
  FROM pg_roles WHERE rolname = current_user;
```

Se as duas colunas vierem `f`, **pare aqui**: peça a quem administra o Postgres um
`ALTER ROLE <usuário> CREATEROLE;`, ou o `GRANT barbearia_app TO <usuário>;` depois de
alguém com permissão criar o papel. Descobrir isso agora custa uma mensagem; descobrir no
dia custa a janela inteira.

⚠️ Colocar cliente pagante no Postgres que é seu, pessoal, é o que
`PENDENCIAS-ABERTAS.md` §3.1 chama de "todos caem juntos". Não bloqueia esta migração —
mas é decisão adiada, não resolvida.

### 2.4 O contexto do build no EasyPanel

O `Dockerfile` mora em `apps/barbearia/`, e o build precisa de **`apps/barbearia` como
contexto**, não a raiz do repositório (`ESTADO-ATUAL.md` §9.3). É um campo na
configuração do serviço. Ajuste **antes** de mandar construir.

---

## 3. Antes do dia — o que preparar

### 3.1 O `.env` novo

O que sai, o que entra:

```diff
- DATABASE_PATH=/data/appointments.db
+ DATABASE_URL=postgres://usuario:senha@servico-postgres:5432/barbearia_bayron
+ TZ_BARBEARIA=America/Fortaleza
  TZ=America/Fortaleza
  SESSION_SECRET=<o MESMO de hoje — trocar desloga todo mundo>
  S3_* (mantém)
```

⚠️ **`UPLOAD_ROOT` não precisa entrar:** o `Dockerfile` já define `/data/uploads`. Se o
EasyPanel tiver uma variável antiga com outro valor, **remova** — ela ganharia do
Dockerfile e mandaria as fotos para o lugar errado.

⚠️ **Não gere um `SESSION_SECRET` novo.** Ele não tem nada a ver com o banco, e trocar
derruba a sessão de todo barbeiro que estiver logado.

**O e-mail (desde 09/10/2026) pode ficar para depois:** `SMTP_URL`, `EMAIL_REMETENTE` e, se
preciso, `PAINEL_URL` (`PENDENCIAS-ABERTAS.md` §4.17). Sem eles o app sobe igual; o boot mostra
o quadro "E-MAIL DESLIGADO", o "Esqueci minha senha" responde que não está funcionando e o
daemon dos avisos escreve uma vez no log que o envio não está configurado — tudo esperado. O
dono do Bayron não tem e-mail cadastrado e a barbearia dele está `active`: para ele, nada muda.

### 3.2 O backup de antes

```bash
# no container atual, ANTES de qualquer coisa
node scripts/backup.mjs        # gera o .db do dia
```

E **tire uma cópia do `/data` inteiro para fora do servidor** — banco e fotos. É o
rollback de verdade: enquanto esse arquivo existir, nada do que vier depois é
irreversível.

### 3.3 A janela

Barbearia fecha em algum momento. Faça **depois do expediente**, com a agenda do dia já
encerrada — assim, se der errado e você voltar para o SQLite, não se perde agendamento
feito no meio da migração.

⚠️ **Agendamento feito durante a migração se perde.** A carga é um retrato do SQLite no
instante em que roda. Se um cliente marcar horário pelo site depois do retrato e antes da
virada, ele existe só no banco antigo. Por isso a janela é com o site fora do ar, não com
ele rodando.

---

## 4. O dia — a ordem

⚠️ **A ordem dos passos 4.2 a 4.4 é obrigatória e não pode ser trocada.** A migration
`0001` só cria o tenant e distribui o `tenant_id` nas linhas que **encontra**. Rodar
todas as migrations antes da carga deixa tudo sem tenant — e o banco recusa, porque a
coluna é `NOT NULL`. O script também recusa, com a explicação.

### 4.0 Parar o site

Pare o container atual no EasyPanel. **Não apague nada** — nem o container, nem o volume,
nem a imagem antiga. Eles são o caminho de volta.

### 4.1 Tirar o SQLite do servidor

```bash
# copie /data/appointments.db do volume para a máquina onde vai rodar a carga
```

A carga lê o arquivo; não escreve nele. O original fica intacto.

### 4.2 Só as tabelas

```bash
DATABASE_URL='postgres://...' node scripts/startup.mjs --ate=0000
```

Confira: `✓ 1 migration(s) aplicada(s)`.

### 4.3 A carga

```bash
DATABASE_URL='postgres://...' node scripts/carregar-sqlite.mjs ./appointments.db
```

Confira: `✓ N linha(s) carregada(s), contagem confere em 12 tabelas`.

O script **recusa** se: as tabelas não existirem, o destino já tiver linha, a `0001` já
tiver rodado, ou a origem tiver vazio onde o destino exige valor. Cada recusa diz o que
fazer. **Recusa não é problema — é o roteiro funcionando.**

### 4.4 O resto das migrations

```bash
DATABASE_URL='postgres://...' node scripts/startup.mjs
```

Confira: da `0001` à última aplicadas, a linha do papel do app e a do `pg_dump`. A `0009`
troca o hover do par padrão de cores na linha do Bayron, que chega da carga com o antigo — o
botão passa a escurecer quando o mouse passa, em vez de clarear (`PENDENCIAS-ABERTAS.md` §4.12).

### 4.5 O endereço

```sql
UPDATE tenants SET domain = 'bayron.alexandrefdev.tech' WHERE slug = 'bayron';
SELECT id, slug, domain, status FROM tenants;
```

### 4.6 Conferir ANTES de subir o site

```sql
-- nenhuma linha órfã de tenant
SELECT 'appointments' t, COUNT(*) FROM appointments WHERE tenant_id IS NULL
UNION ALL SELECT 'barbers', COUNT(*) FROM barbers WHERE tenant_id IS NULL;

-- a contagem bate com o SQLite?
SELECT COUNT(*) FROM appointments;   -- compare com o que o script imprimiu

-- a sequence continua de onde parou
SELECT last_value, is_called FROM appointments_id_seq;
```

### 4.7 Subir

Aponte o serviço para a `main` (depois do merge) ou para a `monorepo`, com o contexto de
build corrigido e o `.env` novo, e construa.

### 4.8 A galeria do Bayron

Com o site novo no ar, no **console do container** no EasyPanel:

```bash
node scripts/importar-galeria-bayron.mjs
```

Confira: `✓ 20 foto(s) importada(s) para a galeria de "bayron" (barbearia 1)`.

Até 24/09 as fotos do carrossel eram uma pasta do repositório; desde a migration 0005 o
site lê a galeria do banco. **Sem este passo, o site do Bayron fica sem a seção** — não
quebra, só some. O script lê as fotos que a imagem traz em `seed/galeria-bayron/`, grava
no volume (`/data/uploads/galeria`) e é idempotente: se a galeria já tiver foto, não faz
nada. Ensaiado em 25/09 com as 20 fotos reais: 19 ganharam a variante de 640 px; a
`carrosel12.jpg` tem 416 px de largura e fica só com o original — a foto já é pequena de origem.

---

## 5. Depois — o que conferir com o site no ar

Na ordem, porque cada um depende do anterior:

- [ ] **O site abre** em `bayron.alexandrefdev.tech` e mostra o conteúdo do Bayron.
      Se der 404, é o §2.2 — o endereço não resolveu.
- [ ] **As fotos aparecem** — logo e capa. Se sumiram, é `UPLOAD_ROOT`. **A galeria**
      aparece depois do 4.8; se não aparecer, é ele que faltou.
- [ ] **Um barbeiro consegue entrar no painel.** Pelo slug ainda funciona enquanto
      houver uma barbearia só.
- [ ] **A agenda do dia mostra os agendamentos de sempre.**
- [ ] **Um agendamento novo, feito pelo site**, aparece no painel. É o teste da
      sequence: se der erro de chave duplicada, foi o `setval` (não deve acontecer, está
      coberto por teste). É também o teste da transação dentro da requisição (§0.1).
- [ ] **A agenda do dia responde:** abra `/admin/dia/<hoje>`, clique num agendamento e no
      calendário. Até 25/09 a tela abria e não respondia a nada (§0.1).
- [ ] **O backup roda:** `node scripts/backup.mjs` gera os **dois** arquivos, `.sql.gz`
      e `-fotos.tar.gz`.
- [ ] **O log do boot** não tem o banner de `pg_dump` faltando.

---

## 6. Como voltar atrás

**Enquanto o volume antigo e a imagem antiga existirem, o rollback é apontar o serviço de
volta para a `main` antiga e subir.** O SQLite não foi tocado pela carga — ela só lê.

| Onde deu errado | O que fazer |
|---|---|
| A imagem não constrói (§2.1) | Nem comece. Produção não foi tocada. |
| A carga recusa (4.3) | A recusa diz o motivo. Nada foi gravado: está tudo numa transação. |
| A carga passou mas a contagem não bate | `dropdb` e `createdb` do banco novo, e recomece do 4.2. O SQLite está intacto. |
| O site sobe e dá 404 | §2.2 — preencha `tenants.domain`. Não precisa reverter nada. |
| O site sobe sem a galeria | Rode o 4.8. Não precisa reverter nada. |
| Qualquer coisa pior | Serviço de volta para a imagem antiga + volume antigo. Perde-se o que tiver sido feito no Postgres. |

⚠️ **Só apague o `/data` antigo depois de uma semana rodando.** Ele é a única cópia do
estado anterior, e um problema de migração pode demorar dias para aparecer.

---

## 7. O que continua pendente depois disto

- **O `.env` local de desenvolvimento** ainda tem `DATABASE_PATH` e nenhum
  `DATABASE_URL`. Depois do merge, `npm run dev` na sua máquina para de funcionar até
  você trocar. Não afeta produção.
- **`ARQUITETURA-PRODUCAO.md` descreve o desenho antigo** — uma instância por cliente,
  SQLite, `DATABASE_PATH`. Depois desta migração ele passa a mentir sobre produção, e
  precisa ser reescrito. (`PENDENCIAS-ABERTAS.md` §2.4 aconteceu por causa de documento
  desatualizado; §4.2 quase custou reimplementar o que já existia.)
- **Deploy em canário** (`ARQUITETURA-PRODUCAO.md` D-P2) é uma decisão 🔴 do próprio
  documento e **este roteiro não a cumpre**: com um cliente só, "canário" seria subir um
  segundo container com uma cópia dos dados e testar nele antes. Vale o esforço se você
  puder gastar mais uma hora — com dois clientes, passa a não ser opcional.
- **O telefone dos três barbeiros** continua vazio (`PENDENCIAS-ABERTAS.md` §1.5). Sem
  ele, no dia do segundo cliente eles perdem o painel.
- **O WhatsApp de contato** continua sendo um número americano falso no banco
  (`PENDENCIAS-ABERTAS.md` §2.6) — e agora é hora barata de corrigir: você vai estar com
  o `psql` aberto de qualquer jeito.
