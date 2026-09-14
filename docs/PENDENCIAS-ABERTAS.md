# Pendências em aberto

> Registro vivo do que ainda **não** está definido. Atualizado: 2026-09-13.
> Companheiro de `PLANO-PRODUTIZACAO.md` (o que foi decidido no negócio) e
> `ARQUITETURA-PRODUTO-V1.md` (o que foi decidido na engenharia).
>
> Este documento existe porque aqueles dois registram **decisões tomadas**. Este
> registra **decisões que faltam**. Item resolvido sai daqui e vira parágrafo lá.

**Prioridade:** 🔴 trava a primeira venda · 🟠 trava operar com vários clientes · 🟡 pode esperar

**Natureza:** `[DECISÃO]` só você decide · `[TÉCNICO]` é trabalho · `[EXTERNO]` precisa de terceiro

---

## 0. Resolvido desde a primeira versão

| Quando | Decisão | Onde mora |
|---|---|---|
| 30/08 | Nome do produto: **Barbearia no Ar** | `src/config.ts` do site do produto |
| 30/08 | Gateway: **Asaas** — Pix a R$ 1,99 fixo bate a Stripe nesse ticket, e o Pix da Stripe é só por convite | `ARQUITETURA-COBRANCA-V1.md` |
| **01/09** | Preço: **R$ 100/mês**, anual R$ 1.000 à vista. **Meta: 10 clientes.** Substitui os R$ 180 decididos em 30/08 | `PRECIFICACAO.md` §2 |
| **01/09** | Domínio: **subdomínio nosso incluso, domínio próprio como opção paga pelo cliente** | `PRECIFICACAO.md` §6 |
| **01/09** | Concorrentes **só oferecem subdomínio deles** — o diferencial está confirmado | `PRECIFICACAO.md` §3 |
| **01/09** | VPS **já comprada**; premissa de que as 10 instâncias cabem, ainda não medida | `ARQUITETURA-PRODUCAO.md` §7 |
| **11/09** | **Construir primeiro.** Domínio (§0 abaixo), contrato (§1.2) e política de suporte (§1.4) ficam para depois de o produto estar usável. Não deixaram de travar a primeira venda — mudou a ordem do trabalho, não o prazo | `PLANO-PRODUTIZACAO.md` §12 |

**Ainda pendente dentro dos itens acima:** registrar `barbearianoar.com.br` (estava
livre em 30/08/2026, **não registrado**) e, se quiser segurar para SEO,
`sitedabarbearia.com.br`. Enquanto não registrar, o `SITE_URL` do produto aponta para um
domínio que não existe.

⚠️ **Adiado por decisão de 11/09/2026** (`PLANO-PRODUTIZACAO.md` §12): o nome definitivo
ainda não está escolhido, e registrar antes de decidir é pagar por endereço que não vai
usar. **O gatilho deixou de ser uma data e passou a ser um evento:** antes de o nome
aparecer em qualquer lugar que o cliente veja — link, e-mail, nota, subdomínio. Trocar
depois de ter cliente é migração, não renomeação.

---

## 1. Comercial

### 1.1 ✅ `[DECISÃO]` Estratégia de domínio — RESOLVIDA em 01/09/2026

*(era §1.3)* Duas opções, e a escolha muda o script de provisionamento e o SSL:

- **Subdomínio seu** (`barbeariax.barbearianoar.com.br`) — você controla, é instantâneo,
  wildcard SSL resolve tudo. Mas o cliente não se sente dono.
- **Domínio próprio do cliente** (`barbeariax.com.br`) — muito melhor de vender, reforça
  o posicionamento. Mas exige registrar, apontar DNS e renovar todo ano.

**A página de vendas já promete a segunda opção**, em dois lugares: no bloco "Um site
seu, no seu domínio" e na pergunta *"E se eu quiser sair?"* — que responde
*"o domínio é registrado no seu nome, então ele continua seu"*. Ou seja: comercialmente
a decisão está tomada, o que falta é o processo que a cumpre.

**Decidido: subdomínio nosso incluso, domínio próprio como opção paga pelo cliente.**

Isso resolve as duas sub-decisões que estavam abertas de uma vez: quem paga a renovação
é o cliente que optar, e se ele cancelar no mês 2 o domínio é dele e o problema não é
seu. A R$ 100 de mensalidade, incluir R$ 40/ano seria meio mês de margem por cliente.

A página de vendas foi corrigida nos **quatro** lugares que prometiam o domínio como
incluso — o card "Um site seu", o item do plano mensal e as duas perguntas do FAQ.
Ver `PRECIFICACAO.md` §6.

### 1.2 🔴 `[EXTERNO]` Contrato, dados e LGPD

Você vai guardar nome, telefone e **data de nascimento** dos clientes das barbearias.
Isso te coloca como operador de dados pessoais de terceiros.

Faltam: termos de uso, política de cancelamento, e resposta para a pergunta que o dono
**vai** fazer — *"se eu sair, levo minha lista de clientes?"*. A resposta certa
comercialmente é sim, com exportação em CSV; isso é feature (§3.6) e cláusula ao mesmo
tempo.

Não é área para improviso. Vale pagar um advogado uma vez e reusar o contrato em todos
os clientes.

⚠️ **Adiado por decisão de 11/09/2026** (`PLANO-PRODUTIZACAO.md` §12) — e é o único dos
três adiados que não tem folga de verdade. **O prazo não é "depois", é a primeira venda:**
no dia em que a primeira barbearia de terceiro paga, o banco passa a guardar nome,
telefone e data de nascimento dos clientes dela sob a sua operação, e a exposição começa
nesse dia. Sem contrato, a resposta para *"se eu sair, levo minha lista de clientes?"* é
improvisada na frente do cliente — e a improvisada vira o combinado.

### 1.3 🔴 `[DECISÃO]` O que acontece quando não paga

O gateway está escolhido, mas a política não. Hoje **não existe nada que suspenda uma
instância**. Se a regra for "site sai do ar após N dias", isso é feature a construir —
ver §3.5. Sem taxa de instalação, essa pendência ficou mais cara: um caloteiro que fica
3 meses sem pagar leva junto todo o trabalho de montagem, que agora não foi cobrado.

### 1.4 🔴 `[DECISÃO]` Política de suporte — virou pré-requisito do preço

⚠️ **Subiu de 🟠 para 🔴 em 01/09/2026, junto com a queda para R$ 100.** A R$ 180, 1,5h
de suporte por cliente/mês cabia. A R$ 100 ela come 60% da mensalidade e sobram R$ 29
de margem — e a R$ 110/h, o valor-hora honesto, vira **prejuízo de R$ 75 por cliente**.
O preço só fecha com o suporte em torno de meia hora. Ver `PRECIFICACAO.md` §5.1.

Canal, horário e prazo de resposta. Dono de barbearia manda WhatsApp às 21h de sábado.
Sem política escrita e combinada na venda, você vira plantão 24/7 de graça — e é isso
que mata negócio de um desenvolvedor só, não a tecnologia.

A página de vendas promete *"ajustes pequenos entram na mensalidade"*. Falta definir o
que é **pequeno**, antes que um cliente decida que refazer o site inteiro é pequeno.

⚠️ **Adiado por decisão de 11/09/2026** (`PLANO-PRODUTIZACAO.md` §12). Não trava o
lançamento — decide se existe margem. **Quem paga o atraso é você, em horas não
cobradas**, e a conta só aparece no terceiro ou quarto cliente, quando já é tarde para
mudar o combinado. Gatilho: antes de combinar escopo com o primeiro cliente.

Metade deste item foi construída: o medidor de completude do painel (§4.4, feito em
10/09) existe para o dono preencher sozinho e gerar menos pergunta.

---

### 1.5 ✅ `[DECISÃO]` Como o barbeiro entra no painel — RESOLVIDA em 09/09/2026

**Era o que travava o fim do passo 4.** Das 54 rotas e páginas que tocam o banco,
a última sem escopo era `apps/barbearia/src/pages/api/auth/login.ts` — e não por
falta de trabalho.

✅ **Resolvida: login por telefone**, implementado em 09/09/2026. São **54 de 54**
e a lista de pendentes do teste-guarda está vazia. Detalhes em
`ESTADO-ATUAL.md` §9.7.

O login busca o barbeiro por `slug`. Com a migration 0001 esse slug passou a ser único
**por barbearia** (`UNIQUE (tenant_id, slug)`) em vez de único no mundo. E o painel é
central — `painel.barbearianoar.com.br` — então não há endereço de onde deduzir de qual
barbearia é quem está entrando. Dois donos chamados "bayron" colidem.

**Recomendação registrada** em `ARQUITETURA-MULTI-TENANT-V1.md` §6: **login por
telefone**. Todo barbeiro tem, é único no mundo, e é o mesmo jeito que o cliente já entra
no portal dele.

**Rejeitado: pedir a barbearia junto com o login** (um campo "sua barbearia" na tela).
Funciona, mas põe no dono a tarefa de lembrar um identificador que ele nunca escolheu, e
some com a vantagem de o painel ser um endereço só.

⚠️ **Reaberto e reconfirmado em 14/09/2026.** A proposta voltou na forma "o barbeiro
digita o nome da barbearia e a senha". Recusada de novo, por três motivos que o registro
de 09/09 não tinha escrito:

1. **Nome de barbearia não diz quem é a pessoa.** Cada barbeiro tem login e papel
   próprios, e o painel filtra por isso — barbeiro comum vê a agenda dele, admin vê
   todas. Uma senha por barbearia apaga o filtro, apaga saber quem cancelou o quê, e
   obriga a trocar a senha de todos quando um barbeiro sai.
2. **Nome não é único no mundo.** "Barbearia do Zé" existe em toda cidade. Com o nome
   como chave, o segundo cliente homônimo não entra — ou tem o próprio nome recusado.
3. **O nome é editável no painel.** `business_name` e `short_name` o dono muda quando
   quiser; quem renomeia a barbearia se tranca do lado de fora. Telefone não muda por
   acidente.

**O que a proposta acertou, e virou mudança:** ninguém pensa "meu login é um telefone".
A tela passou a pedir **"Seu WhatsApp"** — o mesmo campo, a mesma chave, a palavra que o
barbeiro usa. As mensagens de erro acompanharam.

⚠️ **Recusado junto: mostrar o nome da barbearia enquanto ele digita o número.** O
servidor teria que responder "de quem é este telefone" a quem ainda não provou ser
ninguém — um oráculo para varrer números e descobrir quem é dono de qual barbearia. O
nome aparece no painel, um passo depois, sem custo nenhum.

⚠️ **O que sobrou:** cadastrar o telefone dos barbeiros que já existem. Enquanto
não fizerem isso, eles entram pelo caminho antigo (slug), que só vale enquanto
houver **uma barbearia só**. No dia do segundo cliente, quem estiver sem telefone
perde o acesso — e a rota recusa de propósito, em vez de escolher a barbearia errada.

## 2. Minas no código (verificadas)

### 2.1 🟡 `[TÉCNICO]` Timezone — centralizado em 10/09/2026, falta o fuso por barbearia

**Era:** `America/Fortaleza` aparecia **24 vezes em 20 arquivos de `src/`** como
constante de código, não lida do ambiente. O `.env.example` tinha `TZ`, mas só
`scripts/backup-daemon.mjs` respeitava; o resto ignorava.

O risco continua o mesmo e vale relembrar: Fortaleza é UTC-3 sem horário de verão,
igual a São Paulo, Recife, Salvador e Rio — por isso nunca quebrou. **Manaus e Cuiabá
são UTC-4; o Acre é UTC-5.** Horário errado num sistema de agendamento não aparece em
log nem em teste: aparece no cliente que chega na hora errada e culpa a barbearia.

**Feito:** `src/lib/timezone.ts` é a fonte única. Exporta `TZ_PADRAO`
(`America/Fortaleza`) e `TZ`, que lê `TZ_BARBEARIA` do ambiente e cai no padrão, com
erro no log, se o valor não for uma zona IANA válida — porque um `RangeError` na
formatação deixaria o painel inteiro em branco. Os 20 arquivos importam. Inclui os dois
casos que não eram constante de código: o SQL de `api/admin/appointments/calendar.ts`
(agora o fuso vai como parâmetro do bind) e `admin/dia/[date].astro` (o navegador
recebe o valor por `define:vars`, em vez de ter a própria cópia).

`tests/timezone-unico.test.ts` é o guarda-corpo: lê o código-fonte e falha se qualquer
arquivo de `src/` cravar uma zona IANA de novo, ou usar `timeZone:` / `AT TIME ZONE`
sem importar do módulo. Foi testado recravando o fuso em `slots.ts` de propósito — o
teste pegou. Sem isso, o problema volta na primeira linha copiada de outro arquivo.

⚠️ **O que sobrou — e por isso o item não está fechado:** variável de ambiente vale
para **o processo inteiro**. Enquanto cada barbearia tem a própria instância, está
certo. No passo 6 de `ARQUITETURA-MULTI-TENANT-V1.md` §9 — um processo servindo vários
domínios — uma barbearia em Manaus e outra em Mossoró não cabem numa variável só.

A correção definitiva é uma coluna `timezone` em `settings`, com o fuso vindo do tenant
como a cor de destaque já vem, e o `TZ` do módulo deixando de ser constante para virar
argumento das funções que formatam data. Centralizar agora é o que torna essa mudança
**um arquivo, e não vinte** — e o que faz o teste acima falhar se alguém espalhar de
novo enquanto ela não chega.

Fora de `src/`, dois lugares ainda cravam o fuso e ficaram de fora de propósito:
`scripts/backup-daemon.mjs` (usa `process.env.TZ` — é o relógio do **container**,
decidindo a hora do backup, não o horário da barbearia) e
`scripts/seed-relatorio-demo.mjs` (gerador de dados de demonstração, com o offset
UTC-3 fixo). Nenhum dos dois afeta agendamento; entram junto com a coluna por tenant.

### 2.2 🟠 `[TÉCNICO]` Wizard obriga escolher barbeiro mesmo havendo um só

`src/pages/agendar.astro:303` — "Escolha o barbeiro" é o passo 2 de 4, sempre.
Verificado: **não existe lógica de pular** quando há um único barbeiro ativo.

O alvo é barbearia pequena sem sistema — boa parte é de um profissional só. Hoje o
cliente dele faz um passo inútil e o wizard anuncia "4 passos" quando são 3. Atrito bobo
no ponto mais sensível do funil.

Correção: pular o passo e ajustar o contador quando `barbers.length === 1`.

### 2.3 ✅ `[TÉCNICO]` Site do produto sem controle de versão — RESOLVIDO em 06/09/2026

Era: `C:\DEV\produto` tinha `.gitignore` mas **não era repositório git**, e a página de
vendas, o onboarding, a caixa de envios e a autenticação estavam sem histórico.

Resolvido pela unificação: o site do produto virou `apps/vendas/` dentro do monorepo, que
é versionado. Ver `MONOREPO.md`.

⚠️ **`C:\DEV\produto` ainda existe como rede** e deve ser renomeado para
`_produto-ANTIGO` assim que `ESTADO-ATUAL.md` §9.1 passar. O risco não é perder
arquivo — é abrir a pasta velha por hábito e trabalhar uma hora no lugar errado. Já
aconteceu em 06/09.

### 2.4 ✅ `[TÉCNICO]` Restos do porte para Postgres — RESOLVIDOS em 10/09/2026

Achados enquanto eu procurava o que mais tinha ficado amarrado ao SQLite depois do
fuso. **Nenhum chegou a produção** — a versão Postgres ainda não subiu. Todos tinham a
mesma assinatura: passam na suíte inteira, sobem no container sem erro, e só aparecem
depois do deploy.

**A pasta das fotos.** `src/lib/uploads.ts` derivava a raiz de
`dirname(DATABASE_PATH)`. Com SQLite dava `/data/uploads`, dentro do volume — certo por
acidente. O porte trocou a variável por `DATABASE_URL`, e sem ela a raiz virava
`data/uploads`, **relativa**: no container, `/app/data/uploads`, dentro da camada da
imagem. O logo, a capa e as fotos de produto parariam de ser servidos (404 em imagem
não derruba página, só deixa o site feio) e cada foto nova sumiria no deploy seguinte.
A raiz agora não depende de variável de banco nenhuma, e o padrão de produção aponta
para onde os arquivos do Bayron já estão — nada precisa ser movido.

**O backup.** `pg_dump` **não vem** na imagem `node:22-alpine`, e `scripts/backup.mjs` é
um wrapper dele. O app subiria normalmente e todo backup falharia: container rodando,
barbearia atendendo, e a primeira notícia de que não existe backup chegando no dia em
que alguém precisa restaurar. O `Dockerfile` passa a instalar `postgresql16-client`, e o
boot confere e avisa em banner se o binário não estiver lá — sem derrubar o boot, porque
barbearia fora do ar é pior que barbearia sem o backup de hoje.

**Os comandos.** `npm run db:seed` apontava para `scripts/seed.mjs`, apagado no porte.
`db:migrate` rodava `drizzle-kit migrate`, que depende do journal que este projeto
apagou. E `db:push` continuava lá: ele compara o `schema.ts` com o banco e **aplica o
`ALTER` na hora**, sem migration, sem revisão e sem registro — num banco de cliente, uma
mudança de schema que ninguém escreveu e ninguém pode reler depois. Agora `db:migrate`
roda o migrador de verdade, entraram `db:provisionar` e `db:seed-bayron`, e `db:push` /
`db:generate` recusam com explicação. Comando que continua no `package.json` vai ser
rodado um dia, nem que seja por autocompletar.

`tests/uploads.test.ts` e `tests/deploy.test.ts` (11 casos) leem o código, o `Dockerfile`
e o `package.json` e travam tudo isso. Verificado que falham com cada defeito de volta.

⚠️ **O que este item deixou aberto:** ver §3.7 — o backup cobre o banco e **não cobre as
fotos**.

### 2.5 ✅ `[TÉCNICO]` A carga do Bayron não tinha ferramenta nem ensaio — FEITA em 11/09/2026

A ordem obrigatória (`--ate=0000` → carga → resto) estava escrita em três documentos
e o passo do meio era **só uma frase**. Não existia script que carregasse os dados: a
operação de maior risco do projeto — e a única sem volta — era a que não tinha nem
código nem ensaio.

**`scripts/carregar-sqlite.mjs`.** Copia as 12 tabelas na ordem das chaves estrangeiras,
numa transação só, **preservando os ids** (o link de gerenciar agendamento aponta para
uma linha por id e já está no WhatsApp dos clientes — renumerar faria cada link antigo
abrir o agendamento de outra pessoa), converte `active` de 0/1 para boolean e adianta as
sequences. Sem esse último passo a barbearia migra bem e quebra no primeiro cliente que
tenta marcar horário, porque o `INSERT` tenta o id 1.

Usa `node:sqlite`, embutido no Node 22, em vez de trazer o `better-sqlite3` de volta:
módulo nativo para compilar no Windows e na imagem, por uma ferramenta que roda uma vez
na vida de cada barbearia.

**Quatro recusas**, porque quem roda isto está com o sistema parado e o dono esperando:
tabelas ausentes, destino não vazio (carga repetida duplica o histórico), `tenant_id` já
existente (ordem trocada) e vazio na origem onde o destino exige valor — esta última
lista tabela, coluna e quantidade **de uma vez**, em vez de deixar descobrir uma por
tentativa.

**O ensaio, com os 820 registros reais.** Auditoria antes: zero chave estrangeira órfã,
`integrity_check` ok, nenhum NULL nas 93 colunas que o Postgres exige preenchidas, e
todas as colunas do SQLite com destino no schema novo. Depois: 617 agendamentos, 88
itens, 60 vínculos, 24 horários, 20 serviços e 3 barbeiros, contagem conferindo nas 12
tabelas; a `0001` encontrou os dados e distribuiu o `tenant_id` (**zero** linha sem
tenant); o próximo agendamento recebeu o id 618; o app subiu contra o banco carregado
servindo o site e as três APIs; e o backup do banco já migrado restaurou com 13 de 13
tabelas idênticas.

`tests/carga-sqlite.test.ts` (8 casos) roda a carga de verdade contra um Postgres de
verdade, com o SQLite montado na hora a partir do catálogo — coluna nova numa migration
entra na fixture sozinha, em vez de envelhecer numa lista escrita à mão.

⚠️ **O ensaio foi com a cópia local, não com o banco de produção.** É o mesmo schema e
o mesmo volume de dados, mas o banco do VPS tem os agendamentos das últimas semanas e
pode ter linha que a cópia não tem. A carga de verdade continua sendo uma operação de
uma vez só — o que mudou é que agora ela tem ferramenta, recusas e um ensaio que passou.

⚠️ **Dois achados de DADOS, que a carga não corrige** — ver §2.6.

### 2.6 🔴 `[TÉCNICO]` O telefone de contato da barbearia é um número falso — conhecido desde 27/08

⚠️ **Correção de 11/09/2026: a primeira versão desta seção dizia "encontrado em
11/09". Estava errado, e o erro importa.** Este número já estava registrado em
`PLANO-PRODUTIZACAO.md` §9 desde **27/08/2026**, como primeiro item da lista
"pendências que bloqueiam a primeira venda". Ele não é novo — ele **mudou de esconderijo**:
era constante de código, e o trabalho de multi-tenant o copiou para dentro do banco.

`settings.whatsapp_number` é **`15551547238`**, exibido como `+1 (555) 154-7238`. É um
número de área fictícia norte-americana — o `555` é o prefixo que Hollywood usa
justamente para não existir. **O número real está no README e no próprio comentário do
`src/config.ts:5`: `+55 84 99905-1196` → `5584999051196`.**

Hoje o valor mora em dois lugares, e só um deles importa:

| Onde | Estado |
|---|---|
| `settings.whatsapp_number`, no banco | **É o que o site usa** — `Layout.astro` e `lib/settings.ts` leem daí |
| `src/config.ts:6`, `WHATSAPP_NUMBER` | Sobra morta: a `waLink()` daquele arquivo não é importada por ninguém; quem usa `waLink` importa de `lib/whatsapp.ts`, que recebe o telefone como argumento |

Corrigir o `config.ts` **não conserta nada** — é a linha do banco que aparece no site. E
essa linha, em produção, ainda não foi conferida.

Duas consequências, se o banco de produção tiver o mesmo valor:

1. **O botão de WhatsApp do site não leva a lugar nenhum.** Todo cliente que clica em
   "fale conosco" abre uma conversa com um número inexistente. No site de uma barbearia,
   esse botão é metade do funil.
2. **O número sai publicado no `schema.org`** (`Layout.astro:73`, `"telephone"`), que é
   o que o Google lê para montar o cartão do negócio na busca.

Não é defeito de código: é o conteúdo do campo. Ou a produção tem o mesmo valor e está
perdendo contato há meses, ou só a cópia local está assim — e aí a cópia local não serve
como fonte fiel para ensaiar migração.

**Conferir no banco de produção antes de qualquer outra coisa.** É o item mais barato de
verificar e o mais caro de descobrir tarde.

⚠️ Junto com ele: os **três barbeiros estão sem telefone** (`barbers.phone` vazio nos
três), o que já estava registrado em §1.5 e o ensaio confirmou. No dia do segundo
cliente eles perdem o acesso ao painel.

### 2.7 🟠 `[TÉCNICO]` As fotos de produto de todas as barbearias na mesma pasta

Encontrado em 11/09/2026, conferindo rota por rota no passo 6.

A mídia da marca (logo, capa, favicon, galeria) já é separada por barbearia:
`pastaDeMidia()` monta `UPLOAD_ROOT/<slug>/<tipo>`. **As fotos de produto não.**
`PRODUCT_UPLOAD_DIR` é `UPLOAD_ROOT/products`, uma pasta só, e os três lugares que
mexem nela — `saveProductImage()`, a remoção em `api/admin/products/[id].ts` e
`api/admin/combos/[id].ts`, e a rota `api/products/image/[name].ts` — usam essa pasta
direto, sem tenant.

**Não é vazamento hoje, e é por acidente:** o nome do arquivo é aleatório, e o que liga
um produto à sua foto é a linha do banco, que já está escopada por tenant e sob RLS.
Ninguém adivinha o nome do arquivo do vizinho.

O que incomoda é a rota `api/products/image/[name].ts`: ela serve **qualquer nome** da
pasta compartilhada, sem perguntar de quem é o endereço. É a única rota pública que ficou
fora da guarda do passo 6, e está na lista de exceções de `tests/host-tenant.test.ts` com
esta seção como motivo.

Correção: `PRODUCT_UPLOAD_DIR` vira função de tenant, como `pastaDeMidia()`, e a rota
passa a servir da pasta do host. ⚠️ **As fotos que já existem estão na pasta antiga** —
mudar exige mover os arquivos do Bayron ou manter a queda para o caminho legado, do mesmo
jeito que `pastaDeMidia()` faz.

---

## 3. Operação com vários clientes

### 3.1 🟠 `[DECISÃO]` Onde as instâncias rodam

O VPS atual é compartilhado com n8n, redis e postgres. Colocar clientes pagantes ali
significa que todos caem juntos, misturados com suas coisas pessoais. Falta decidir
separação (VPS dedicado a clientes?) e plano de capacidade — quantas instâncias por
máquina antes de subir a próxima.

### 3.2 🟠 `[TÉCNICO]` Processo de atualizar N containers

A arquitetura garante "uma imagem, N instâncias", mas não define **como** subir uma
versão nova em dez containers, nem o que fazer quando a migração falha em um deles e
passa nos outros. Clicar dez vezes no EasyPanel não é processo.

### 3.3 🟠 `[TÉCNICO]` Backup por cliente — o teste de restauração já foi feito

O backup diário com upload off-site já funciona por instância.

⚠️ **Correção de 13/09/2026:** este item pedia "um teste de restauração de verdade, feito
uma vez, antes do primeiro cliente pago". **Ele foi feito — duas vezes — e a seção não
tinha sido atualizada.** Em 06/09/2026 contra Postgres 16 (backup de um banco com dados,
restauração num banco vazio: voltaram as linhas, as 36 constraints de tenant sobreviveram,
as sequences continuaram de onde estavam) e de novo em 11/09/2026 contra o banco já
carregado com os 820 registros reais do Bayron. As fotos entraram no backup em 11/09 e a
restauração delas é conferida por comparação de árvore (§3.7). Registro em
`ESTADO-ATUAL.md` §4.

**O que continua faltando, e só aparece com N clientes:** estrutura de pastas no bucket e
credenciais — bucket único ou um por cliente. Com banco único multi-tenant, o backup deixou
de ser por instância e virou um só, o que torna a decisão mais simples e a falha mais cara.

### 3.4 🟠 `[TÉCNICO]` Monitoramento

Se o site de um cliente cair sábado de manhã, hoje você descobre quando ele liga. Falta
o mínimo: ping externo por instância e alerta no seu celular.

### 3.5 🟡 `[TÉCNICO]` Suspensão por inadimplência

Depende da decisão §1.3. Se a política for cortar, precisa de um jeito de suspender a
instância sem apagar dados e de religar em um clique.

### 3.6 🟡 `[TÉCNICO]` Exportação de dados do cliente

Depende de §1.2. CSV de clientes e agendamentos, baixável pelo próprio dono no painel.
É resposta comercial a uma objeção de venda, não só conformidade.

### 3.7 ✅ `[TÉCNICO]` O backup não incluía as fotos — RESOLVIDO em 11/09/2026

**Era:** `scripts/backup.mjs` rodava `pg_dump` e salvava o banco inteiro e **nada do
volume**. O logo, a foto de capa, o favicon, a galeria e as fotos de produto viviam só
em `/data/uploads`, sem cópia em lugar nenhum.

Não era regressão — com SQLite o backup também era só do banco. Mas era menos visível: o
`.db` ficava no mesmo `/data`, e quem copiasse o volume levava tudo junto. O porte tirou
o banco do volume e ninguém percebeu que o volume tinha ficado de fora.

O tamanho do estrago: volume morto significava banco voltando inteiro e a barbearia sem
identidade visual nenhuma — que é justamente o trabalho manual do dono. Recuperar seria
pedir as fotos de novo para um cliente pagante.

**Feito.** Cada dia gera dois arquivos, separados de propósito:

```
barbearia_<data>.sql.gz          o banco
barbearia_<data>-fotos.tar.gz    o conteúdo de UPLOAD_ROOT
```

Restaurar um não deveria exigir o outro: banco corrompido com fotos intactas é o caso
comum, e nele ninguém quer mexer nas fotos. Os caminhos dentro do `tar` são relativos,
então a restauração é `tar -xzf <arquivo> -C /data/uploads` e funciona mesmo se o volume
estiver montado em outro lugar.

Três decisões que valem lembrar: falha no `tar` **não** invalida o backup do banco (o
dump já está no disco e é a parte insubstituível); barbearia sem foto nenhuma não gera
arquivo vazio; e a retenção passou a olhar os dois sufixos — sem isso o volume enche de
fotos antigas até o disco acabar, e disco cheio derruba o banco junto.

⚠️ **A regra do `UPLOAD_ROOT` está escrita em dois lugares** — `src/lib/uploads.ts` e
`scripts/backup.mjs`, que é `.mjs` e não importa o `.ts`. Repetição de regra foi
exatamente como o fuso horário se espalhou por 20 arquivos (§2.1), então
`tests/deploy.test.ts` lê os dois e falha se divergirem. Se divergissem em silêncio, o
backup salvaria uma pasta vazia dizendo que deu certo — o pior defeito possível num
backup.

`tests/backup-fotos.test.ts` (5 casos) confere o **conteúdo**, não a existência: as fotos
são restauradas num diretório limpo e comparadas com `diff -r` contra o original. Arquivo
que existe e não restaura é o mesmo que arquivo nenhum, com a desvantagem de parecer
backup.

⚠️ **Custo que ficou de pé:** as fotos são reempacotadas todo dia, mudem ou não. Com 30
dias de retenção são 30 cópias das mesmas imagens no bucket. Para uma barbearia é pouco;
se incomodar com 10 clientes, a saída é comparar o conteúdo antes de gerar e reaproveitar
o arquivo do dia anterior — mas aí restaurar um dia qualquer passa a exigir procurar o
arquivo mais recente até ele, e isso é complexidade num caminho que só é usado em
emergência. Foi deixado simples de propósito.

---

## 4. Especificações que faltam escrever

### 4.1 ✅ `[TÉCNICO]` Tela inicial sem fotos — RESOLVIDA em 06/09/2026

**Topo.** `apps/barbearia/src/components/Hero.astro` tem duas versões: com foto (a de
sempre) e, sem foto, uma versão tipográfica — fundo escuro, dois focos de brilho na cor
de destaque **do cliente**, cidade em cima e nome em serifada grande. Verificado
renderizando as duas, em 1280px e em 390px.

⚠️ **Três defeitos corrigidos junto, e o primeiro era grave:**

1. **Sem foto, o site caía na foto do Bayron.** O fallback era
   `assets/fotos-videos/foto-inicial5.png`, cravado no código: uma barbearia nova abriria
   o site e veria a fachada de outra. Pior que retângulo preto. Agora a foto do Bayron só
   aparece na instância dele, por um interruptor explícito no componente.
2. **O botão tinha a cor cravada** (`bg-[#0f766e]`), então não seguia a cor do cliente —
   exatamente o que a skill `barbearia-paleta` proíbe. Virou token `bg-teal`.
3. **Título e subtítulo eram texto do Bayron no código.** As colunas `tagline` e
   `hero_subtitle` já existiam na tabela `settings` e **nenhum componente as lia**. Agora
   o topo usa o que o cliente escreveu.

**Resto da página, feito em 06/09/2026.** O diagnóstico inicial ("as seções vazias
renderizam") estava certo mas era pequeno demais: quatro componentes **não estavam
vazios, estavam cheios de conteúdo do Bayron cravado no repositório**.

| Componente | O que uma barbearia nova mostrava | Agora |
|---|---|---|
| `Testimonials.astro` | **6 depoimentos com nome de pessoa real** (`data/depoimentos.json`) | Só na instância do Bayron, e só se o arquivo tiver conteúdo |
| `FAQ.astro` | Perguntas respondidas com a operação do Bayron | Idem |
| `Gallery.astro` | Fotos do Bayron importadas em tempo de build | Idem |
| `Services.astro` | Catálogo do Bayron inteiro — "Corte Social", "Degradê + Barba", combos | Lista os serviços **do próprio banco**; sem serviço, a seção some |
| `Products.astro` | `<h2>Produtos Boris</h2>` cravado, ignorando a coluna `products_section_title` que já existia | Lê a coluna; sem produto ativo, a seção some |
| `Header.astro` / `Footer.astro` | **Logo do Bayron** como fallback de quem não subiu logo | Sem logo, só o nome |
| `Footer.astro` | Assinatura "Premium Barber" para todo mundo | Só o Bayron |
| `Footer.astro` | Link "Painel Administrativo" apontando para **um dia fixo** (`/admin/dia/2026-06-02`) | `/admin` |
| `Header.astro` | Menu com links fixos para seções que não existem mais | Link cujo alvo não renderiza é removido no carregamento |
| `Location.astro` | Bloco "Horário" com rótulo e nada embaixo; mapa em branco | Some quando não há horário / endereço |

**Como foi verificado.** O site foi servido duas vezes contra bancos diferentes — um com
`short_name='Vintage'` e um com `'Bayron'` — e a página renderizada em navegador de
verdade. Com os arquivos do Bayron **preenchidos** no repositório, o site da Vintage não
mostrou nenhum deles:

```
VINTAGE  seções: hero | servicos | localizacao | contato     vazamentos: (nenhum)
BAYRON   seções: hero | galeria | servicos | depoimentos | localizacao | faq | contato
```

⚠️ **Um bug encontrado só porque os dois casos foram testados.** `Services.astro` e
`Products.astro` ficaram com `getSettings()` sem `await` — depois do porte Postgres a
função é assíncrona, então `cfg.shortName` era `undefined` e a comparação dava `false`
**sempre**. O site da barbearia nova ficou correto por acidente; **o do Bayron perdeu o
próprio catálogo**. `astro check` acusa (`Property 'shortName' does not exist on type
'Promise<Settings>'`), mas o projeto tem 277 erros de base e um erro a mais não aparece.
Lição em `ARQUITETURA-MULTI-TENANT-V1.md` §12.

**Falta desta seção:** nada no código dos componentes. A ressalva que estava aqui — de
que as migrations plantavam os dados do Bayron em qualquer banco novo e desarmavam tudo
isto — caiu em 13/09/2026 com o §4.6. O que sobrou é o discriminador do §4.7: o portão
continua sendo `shortName === "Bayron"`, texto que o próprio cliente edita.

---

### 4.1.1 A regra

Regra acordada: **nenhuma seção meia-boca** — ou tem conteúdo, ou não é renderizada.
Galeria vazia some, depoimentos vazios somem, produtos somem (a maioria das barbearias
não vende nada). Sobra um site mínimo de quatro blocos que já é respeitável: topo,
serviços, localização e rodapé.

⚠️ **Uma seção com o conteúdo de outra barbearia é pior que uma seção vazia.** Foi o que
o §4.1 encontrou: o problema não era "renderiza vazio", era "renderiza cheio, com dados
de outro negócio". Ao escrever componente novo, a pergunta não é "e se estiver vazio?",
é "de quem é esse texto?".

⚠️ **Ficou mais urgente com o provisionamento automático.** A promessa nova é que o
cliente pague e já veja a plataforma na cor dele. Se ele pagar e cair num site com o
nome, o endereço e as avaliações de outra barbearia, a promessa quebra no primeiro
minuto — e era exatamente isso que as migrations de SQLite faziam, até saírem do
repositório (§4.6).

### 4.2 🟡 `[TÉCNICO]` Cor de destaque — o dono já escolhe a dele

⚠️ **Correção de 11/09/2026: esta seção estava desatualizada.** Ela listava "campo de
cor em `/admin/configuracoes`" e "decidir se o painel também vira a cor do cliente"
como pendências. **As duas já estavam feitas**, e ninguém tinha atualizado aqui — quase
custou reimplementar o que existe.

**Feito em 01/09/2026:** `src/lib/accent.ts` deriva os três tokens de uma cor de marca
com contraste garantido, `Layout.astro` injeta a sobrescrita, 13 testes cobrem o
comportamento. Ver `ARQUITETURA-PRODUTO-V1.md` D5.1 e D5.2.

**Conferido em 11/09/2026, servindo de verdade** — e não por leitura de código:

| O quê | Resultado |
|---|---|
| Campo no painel | `/admin/configuracoes` tem seletor de cor, campo hex, botão "padrão" e prévia |
| Gravação | `api/admin/settings.ts` aceita **só** `accentColor`; `hover` e `light` são derivados no servidor |
| Um caso difícil de verdade | Vinho `#6b1f2a`, que reprova cru em site claro, virou `#6b1f2a` / `#4f171f` / `#dd8895` |
| Contraste recalculado | 11,32:1 e 14,24:1 com branco; o claro dá 7,57:1 sobre fundo escuro; o hover **escurece**, como manda a regra do site da barbearia |
| Chegou na tela | O `:root` do site do Bayron saiu com a cor nova; o da outra barbearia continuou no padrão |
| O painel ficou neutro | Nenhuma sobrescrita de `:root` no `/admin` — a decisão registrada abaixo está implementada |

**Decidido e implementado: o painel NÃO vira a cor do cliente.** Se o painel pega a cor
de cada cliente, ele deixa de parecer o seu produto — suas capturas de tela, tutoriais e
suporte ficam diferentes a cada cliente. O site é a marca dele; o painel é a sua.

**Falta só uma ponta, e é melhoria, não bloqueio:** extrair cores candidatas da logo no
onboarding (sugerir, nunca aplicar sozinho). Sem isso o dono digita o hex ou usa o
seletor — o que já resolve.

### 4.3 ✅ `[TÉCNICO]` Painel administrativo com resumo de verdade — CONFERIDO em 13/09/2026

⚠️ **Correção de 13/09/2026: esta seção estava desatualizada.** Ela dizia que "o painel
ainda mostra pouco" e listava quatro pendências — agenda de hoje, faturamento da semana e
do mês, próximos agendamentos e faltas. **As quatro já estavam implementadas.** É a
segunda seção com esse defeito em três dias (a primeira foi o §4.2, em 11/09), e o risco é
o mesmo: planejar em cima de um mapa que mente, e reimplementar o que existe.

Conferido em `src/pages/admin/index.astro` (559 linhas), lendo a página inteira:

| O que o item pedia | Onde está |
|---|---|
| Agenda de hoje | Contagem do dia, receita prevista e botão "Ver agenda de hoje" para `/admin/dia/<data>`. A lista completa é a página do dia, de propósito — o painel é resumo, não substituto da agenda |
| Faturamento da semana e do mês | Dois cards (`revenueWeek`, `revenueMonth`) e um gráfico de barras da receita por dia da semana corrente |
| Próximos agendamentos | Lista das próximas 48 h, só `confirmed`, ordenada por horário, no máximo 8 |
| Faltas | Bloco de alertas com **atrasados** (passou da hora e continua `confirmed`) e **faltas dos últimos 7 dias, com o valor perdido somado** |

Tudo escopado por barbearia (`eq(appointments.tenantId, tenant.id)`) e por papel: barbeiro
comum vê só os próprios, admin vê todos. O medidor de completude do §4.4 vive na mesma tela.

### 4.4 ✅ `[TÉCNICO]` Medidor de completude no painel — FEITO em 10/09/2026

Empurra o dono a preencher sozinho e reduz suporte — uma das duas alavancas que derrubam
a hora de suporte, e a R$ 100 isso decide se existe margem (§1.4 e `PRECIFICACAO.md` §5.1).

**Feito em 10/09/2026.** A regra está em `src/lib/completude.ts` (função pura, 13 testes)
e o card no topo de `/admin`. Cada item entrou respondendo uma pergunta só: *que mensagem
de WhatsApp no sábado isso evita?*

⚠️ **São duas listas, não uma porcentagem.** Uma barbearia pode ter 90% dos campos
preenchidos e **não receber um agendamento sequer**, por falta do primeiro serviço. Dizer
"90% completo" ali é pior que não ter medidor. Enquanto faltar serviço, barbeiro com
expediente, WhatsApp ou endereço, aparece só o que impede de **funcionar**, em vermelho e
sem porcentagem. Resolvido isso, vira a barra com o que falta para ficar **apresentável**.

⚠️ **Mostra três itens de cada vez.** A primeira versão listava os oito pendentes; na
tela, 15% com oito linhas paralisa — o dono olha, não sabe por onde começar e não faz
nenhum. Os três mais pesados valem metade dos pontos; o resto fica atrás de um clique.

⚠️ **O exemplo original desta seção não era implementável.** Ela dizia *"faltam fotos da
galeria"*, mas a galeria é build-time (`import.meta.glob` dos assets), sem tabela nem
coluna — não dá para medir por barbearia. Mede-se logo, capa, ícone e OG, que têm coluna
em `settings`. Ligar a galeria enviada pelo painel continua pendente.

**Pesos, para quem for mexer:** logo 20; horários publicados, texto sobre a barbearia e
frase do topo 15 cada; foto de capa e cor da marca 10; Instagram, avaliações do Google e
SEO 5 cada. Peso alto para o que gera pergunta, baixo para o que é cosmético.

### 4.5 ✅ `[TÉCNICO]` Catálogo de serviços sugerido — FEITO em 11/09/2026

**Era:** barbearia nova nascia com **zero serviço**. O site aguentava — a seção não é
renderizada até existir o primeiro (§4.1) — mas o resultado era um site apresentável e
**inútil ao mesmo tempo**: sem serviço não entra agendamento, e nada na tela dizia que
faltava alguma coisa. A tela em branco é o pior lugar para deixar alguém que acabou de
pagar.

**Feito.** Quando a lista está vazia, `/admin/servicos` oferece oito serviços comuns de
barbearia masculina. Um clique cria todos, já vinculados aos barbeiros ativos com
duração — sem o vínculo o serviço existe e **não é agendável**, porque `api/services.ts`
junta `services` com `barber_services`.

⚠️ **Eles entram sem preço, e essa é a decisão que vai parecer estranha depois.**

Preço de corte muda de cidade, de bairro e de posicionamento. Um valor sugerido que o
dono não reparou vira o preço no site dele — e ele descobre quando o cliente chegar no
caixa com outra expectativa. **Preço errado no ar é pior que preço faltando.**

Então os serviços entram **inativos e com preço zero**. Inativo não aparece no site nem
no agendamento, então ninguém vê "R$ 0,00" em lugar nenhum — conferido servindo o site
com os oito criados: `/api/services` devolveu `[]` e a página não tinha uma ocorrência
de "0,00". E `api/admin/services/[id].ts` passou a **recusar ativar serviço com preço
zero**: sem essa regra, um clique em "ativar" publicaria R$ 0,00 e a intenção do preço
vazio viraria defeito.

⚠️ **As durações são estimativa, não pesquisa.** Estão ali porque
`barber_services.duration_minutes` é obrigatório e porque chutar 30 minutos para tudo
produziria agenda errada. São editáveis na mesma tela. Não foi possível pesquisar preço
nem duração de mercado (busca na web bloqueada no ambiente de trabalho), e preferiu-se
não ter número a apresentar chute com cara de dado.

**Por que um botão e não o provisionamento.** Plantar dado que o dono não pediu foi
exatamente o §4.6 — as migrations enfiavam os dados do Bayron em todo banco novo,
inclusive 5.0 com 227 avaliações. Aqui o dono aperta: o catálogo é sugestão que ele
aceitou, não fato que apareceu. O endpoint recusa (409) se a barbearia já tiver qualquer
serviço.

`tests/catalogo-sugerido.test.ts` (9 casos) vigia menos "o catálogo é criado" e mais o
que ele **não** pode fazer: não entra sozinho, não entra duas vezes, e não põe preço
nenhum no ar. Verificado que falha ao remover cada uma das duas recusas.

⚠️ **O que sobrou desta frente:** o FAQ padrão e os textos institucionais de exemplo,
citados na versão antiga desta seção, continuam sem existir. Não bloqueiam: sem FAQ a
seção não é renderizada (§4.1).

### 4.6 ✅ `[TÉCNICO]` As migrations plantavam os dados do Bayron em todo banco novo — RESOLVIDO, conferido em 13/09/2026

⚠️ **Correção de 13/09/2026: esta seção estava desatualizada, e era a pior do documento
para estar.** Ficou marcada 🔴 e no topo da ordem sugerida do §6 durante dias depois de o
problema ter deixado de existir — mandando refazer trabalho que já estava feito.

**O que era.** Descoberto em 06/09/2026, ao testar o §4.1 contra um banco criado do zero:
as migrations de SQLite não criavam só tabelas, elas **inseriam os dados do Bayron**.

| Migration | O que inseria |
|---|---|
| `0006_products.sql` | Três produtos Boris (`Óleo Mentolado`, `Balm Classic`, `Tônico`), ativos, com preço e foto |
| `0007_combos.sql` | O "Combo Boris" |
| `0009_settings.sql` | A linha `settings` inteira do Bayron: nome, `short_name='Bayron'`, endereço **R. Jaen Menescal, 174**, Instagram `@barbearia_bayron`, horários, SEO, `products_section_title='Produtos Boris'` e **avaliação 5.0 com 227 avaliações** |

O item mais grave era a avaliação: `google_rating='5.0'` e `google_review_count=227` saíam
publicados, com `schema.org/AggregateRating` no HTML, para uma barbearia que nunca recebeu
uma avaliação. Não é "conteúdo errado" — é propaganda enganosa assinada pelo seu produto, e
o Google indexa.

**Por que acabou.** Duas coisas, nesta ordem:

1. O porte para Postgres (06/09) trouxe migrations novas. `0000_init_postgres.sql` só cria
   tabelas, os `TEMPLATE_DEFAULTS` de `lib/settings.ts` são neutros, e a `0001` só cria o
   tenant `bayron` quando encontra dados para backfillar.
2. As migrations de SQLite **saíram do repositório**. Conferido em 13/09/2026:
   `apps/barbearia/drizzle/` tem quatro arquivos — `0000_init_postgres.sql`,
   `0001_tenants.sql`, `0002_barber_phone.sql` e `0003_rls.sql` — e o **único** `INSERT
   INTO` que restou em todos eles é o backfill condicional do tenant na `0001`, que só
   dispara se já existirem barbeiros, settings ou agendamentos.

Não há mais caminho no código que crie um banco SQLite, então não há mais banco novo que
possa nascer sendo "Bayron". A correção proposta na versão antiga desta seção — tirar os
`INSERT` da `0006`, `0007` e `0009` — ficou sem objeto: os arquivos não existem.

Coberto pelo teste *"banco novo NÃO nasce com o tenant do Bayron"*.

⚠️ **Duas pontas soltas que estavam penduradas aqui, e não são esta seção:**

- O discriminador `shortName === "Bayron"` continua no código. Virou o §4.7 abaixo.
- `migracao-postgres/` e `migracao-tenants/`, na raiz do monorepo, estão **versionadas** e
  guardam cópias das migrations — a `0001` de lá **diverge** da que está em `drizzle/` —
  mais dois patches de 388 KB e 196 KB. Eram entregas de passo. Hoje são a armadilha de
  alguém aplicar a cópia errada. Apagar, ou mover para `docs/historico/`.

### 4.7 🟠 `[TÉCNICO]` `shortName === "Bayron"` decide o que aparece no site

Separado do §4.6 em 13/09/2026, quando aquele item fechou e este não.

Oito componentes comparam o nome curto da barbearia com o texto `"Bayron"` para decidir o
que renderizar: `Header.astro`, `Footer.astro`, `Hero.astro`, `FAQ.astro`, `Gallery.astro`,
`Products.astro`, `Services.astro` e `Testimonials.astro`. Atrás da comparação está conteúdo
do Bayron cravado no repositório — o logo empacotado em `assets/`, a foto do topo, os
depoimentos, o FAQ, a galeria e o catálogo agrupado por categoria.

**O problema é a natureza do campo.** `short_name` é editável pelo dono, em
`/admin/configuracoes`. É comparação de texto contra dado que o próprio cliente controla:
quem digitar "Bayron" ali herda depoimentos, FAQ, galeria e catálogo de outra barbearia. A
probabilidade é baixa; a consequência é conteúdo de terceiro no site de quem está pagando.

**Correção:** trocar por `tenant.slug === 'bayron'` — identidade que o cliente não edita e
que o contexto do passo 6 já entrega em toda requisição — e **concentrar as oito comparações
numa função só**, para a próxima troca ser um arquivo em vez de oito.

---

## 5. Verificações pendentes

- ✅ **AppBarber e Trinks permitem domínio próprio?** **Não** — verificado em
  01/09/2026: eles oferecem site, mas sempre em **subdomínio deles**. Virou linha na
  tabela comparativa da página de vendas e sustenta o modelo do §1.1.
- **R$ 100/mês vende para barbearia sem sistema?** Continua sendo a maior incerteza do
  projeto inteiro, agora com margem mais apertada para errar. Só 5 conversas respondem.
- **Quantas instâncias cabem na VPS?** Ela já foi comprada e a premissa é que as 10
  cabem. `docker stats` com 5 containers confirma ou desmente numa tarde.
- ✅ **Restauração de backup** (§3.3) — feita em 06/09 e repetida em 11/09 contra o banco
  com os dados reais do Bayron. As fotos entraram no backup em 11/09 (§3.7), com a
  restauração conferida por comparação de árvore.

---

## 6. Ordem sugerida

0. ~~**Limpar o seed das migrations** (`PENDENCIAS-ABERTAS.md` §4.6)~~ — **sem objeto desde
   13/09/2026.** As migrations de SQLite que plantavam o nome, o endereço, os produtos e as
   227 avaliações do Bayron não existem mais no repositório; ver
   `PENDENCIAS-ABERTAS.md` §4.6. Sobrou o discriminador `shortName === "Bayron"`, que virou
   `PENDENCIAS-ABERTAS.md` §4.7.
1. ~~**Decidir o login do painel** (§1.5)~~ — decidido e implementado em 09/09.
   Falta cadastrar o telefone dos barbeiros do Bayron antes do segundo cliente.
2. ~~**As duas minas** (§2.1, §2.2)~~ — o fuso (§2.1) foi centralizado em 10/09 e
   está com guarda-corpo; sobrou o fuso por barbearia, que só morde no passo 6.
   **Falta o wizard (§2.2)**: barato agora, caro com cliente pagando.
3. ~~**Registrar o domínio** (`PENDENCIAS-ABERTAS.md` §0)~~ — **adiado em 11/09**
   (`PLANO-PRODUTIZACAO.md` §12): o nome ainda não está escolhido.
4. ~~**Tela sem fotos** (§4.1)~~ — feita em 06/09/2026, topo e resto da página.
   A cor de destaque (§4.2) já estava feita.
4b. ~~**Política de suporte** (`PENDENCIAS-ABERTAS.md` §1.4)~~ — **adiada em 11/09**
   (`PLANO-PRODUTIZACAO.md` §12). O medidor de completude, que era a outra metade deste
   item, foi feito em 10/09 (`PENDENCIAS-ABERTAS.md` §4.4).
5. **Contrato e política de inadimplência** (`PENDENCIAS-ABERTAS.md` §1.2 e
   `PENDENCIAS-ABERTAS.md` §1.3). **Adiado em 11/09, mas com prazo duro: antes da
   primeira venda a terceiro.** Ver `PLANO-PRODUTIZACAO.md` §12.
6. Operação (§3.x) — pode esperar o **segundo** cliente, não o décimo.
