# Pendências em aberto

> Registro vivo do que ainda **não** está definido. Atualizado: 2026-09-11.
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

**Ainda pendente dentro dos itens acima:** registrar `barbearianoar.com.br` (estava
livre em 30/08/2026, **não registrado**) e, se quiser segurar para SEO,
`sitedabarbearia.com.br`. Enquanto não registrar, o `SITE_URL` do produto aponta para um
domínio que não existe.

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

### 2.6 🔴 `[DECISÃO]` O telefone de contato da barbearia é um número falso

Encontrado em 11/09/2026, durante o ensaio da carga, na cópia local do banco.

`settings.whatsapp_number` é **`15551547238`**, exibido como `+1 (555) 154-7238`. É um
número de área fictícia norte-americana — o `555` é o prefixo que Hollywood usa
justamente para não existir.

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

### 3.3 🟠 `[TÉCNICO]` Backup por cliente e teste de restauração

O backup diário com upload off-site já funciona por instância. Com N clientes faltam:
estrutura de pastas no bucket, credenciais (bucket único ou um por cliente), e
**um teste de restauração de verdade** — feito uma vez, antes do primeiro cliente pago.
Backup nunca restaurado é backup que não existe.

### 3.4 🟠 `[TÉCNICO]` Monitoramento

Se o site de um cliente cair sábado de manhã, hoje você descobre quando ele liga. Falta
o mínimo: ping externo por instância e alerta no seu celular.

### 3.5 🟡 `[TÉCNICO]` Suspensão por inadimplência

Depende da decisão §1.3. Se a política for cortar, precisa de um jeito de suspender a
instância sem apagar dados e de religar em um clique.

### 3.6 🟡 `[TÉCNICO]` Exportação de dados do cliente

Depende de §1.2. CSV de clientes e agendamentos, baixável pelo próprio dono no painel.
É resposta comercial a uma objeção de venda, não só conformidade.

### 3.7 🟠 `[TÉCNICO]` O backup não inclui as fotos

Descoberto em 10/09/2026, junto com §2.4. `scripts/backup.mjs` roda `pg_dump`: salva o
banco inteiro e **nada do volume**. O logo, a foto de capa, o favicon, a galeria e as
fotos de produto vivem só em `/data/uploads`, sem cópia em lugar nenhum.

Não é regressão — com SQLite o backup também era só do banco. Mas era menos visível: o
`.db` ficava no mesmo `/data`, e quem copiasse o volume levava tudo junto. Agora o banco
está fora do volume e o volume não está no backup.

O tamanho do estrago: se o volume morrer, o banco volta e a barbearia perde a identidade
visual inteira, que foi justamente o trabalho manual do dono. Restaurar isso significa
pedir as fotos de novo para um cliente pagante.

Correção: `tar` do `UPLOAD_ROOT` junto com o dump, no mesmo `.sql.gz`/`.tar.gz` do dia, e
o mesmo upload off-site. É barato: as fotos mudam pouco e pesam pouco.

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

**Falta desta seção:** nada no código dos componentes. Mas ver §4.6 — as migrations
plantam os dados do Bayron em qualquer banco novo, o que desarma tudo isso.

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
minuto — e agora sabemos que é exatamente isso que as migrations fazem (§4.6).

### 4.2 🟠 `[TÉCNICO]` Cor de destaque — núcleo pronto, pontas soltas

**Resolvido em 01/09/2026:** `src/lib/accent.ts` deriva os três tokens de uma cor de
marca com contraste garantido, `Layout.astro` injeta a sobrescrita, 13 testes cobrem
o comportamento. Verificado no navegador. Ver `ARQUITETURA-PRODUTO-V1.md` D5.1 e D5.2.

**Falta:**

- Campo de cor em `/admin/configuracoes` chamando `derivarAccent()` na gravação.
- Extração de cores candidatas da logo no onboarding (sugerir, nunca aplicar sozinho).
- **Decidir se o painel também vira a cor do cliente.** Recomendação registrada: não.
  Se o painel pega a cor de cada cliente, ele deixa de parecer o seu produto — suas
  capturas de tela, tutoriais e suporte ficam diferentes a cada cliente. O site é a
  marca dele; o painel é a sua.

### 4.3 🟠 `[TÉCNICO]` Painel administrativo com resumo de verdade

A moldura no estilo Trinks já foi feita, mas o painel ainda mostra pouco. Falta: agenda
de hoje, faturamento da semana e do mês, próximos agendamentos e faltas.

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

### 4.5 🟠 `[DECISÃO]` Catálogo de serviços padrão do template

Alguém precisa sentar e escrever serviço por serviço, com preço sugerido, o catálogo de
uma barbearia brasileira típica. Não dá para reaproveitar os 20 serviços do Bayron: são
os dele, com os preços dele. Mesmo vale para o FAQ padrão e para os textos
institucionais de exemplo.

**Deixou de travar o provisionamento em 06/09/2026.** `scripts/provisionar.mts` cria a
barbearia **sem serviço nenhum**, e o site aguenta: a seção de serviços não é renderizada
até o dono cadastrar o primeiro (§4.1). O script avisa isso na saída.

⚠️ **Mas uma barbearia sem serviço não recebe agendamento.** O site fica apresentável e
inútil ao mesmo tempo — pior do que parece, porque nada na tela indica que falta algo. É
por isso que o medidor de completude (§4.4) e um catálogo sugerido continuam valendo: o
que resolve não é o script, é o dono preencher no primeiro acesso.

---

### 4.6 🔴 `[TÉCNICO]` As migrations plantam os dados do Bayron em todo banco novo

**Descoberto em 06/09/2026, ao testar o §4.1 contra um banco criado do zero.** As
migrations não criam só tabelas: elas **inserem os dados do Bayron**.

| Migration | O que insere |
|---|---|
| `0006_products.sql` | Três produtos Boris (`Óleo Mentolado`, `Balm Classic`, `Tônico`), ativos, com preço e foto |
| `0007_combos.sql` | O "Combo Boris" |
| `0009_settings.sql` | A linha `settings` inteira do Bayron: nome, `short_name='Bayron'`, endereço **R. Jaen Menescal, 174**, Instagram `@barbearia_bayron`, horários, SEO, `products_section_title='Produtos Boris'` e **avaliação 5.0 com 227 avaliações** |

**Por que isso é pior que o §4.1.** Todo o trabalho do §4.1 se apoia em
`shortName === "Bayron"`. A migration `0009` grava exatamente `'Bayron'` nesse campo. Ou
seja: **uma barbearia nova nasce sendo "Bayron" para o código** e abre todos os portões —
depoimentos, FAQ, galeria, catálogo e combos do Bayron aparecem no site dela até o
onboarding sobrescrever o `settings`. Produtos e combos o onboarding **não** apaga.

⚠️ **O item mais grave é a avaliação.** `google_rating='5.0'` e `google_review_count=227`
saem publicados, com `schema.org/AggregateRating` no HTML, para uma barbearia que nunca
recebeu uma avaliação. Isso não é "conteúdo errado": é propaganda enganosa assinada pelo
seu produto, e o Google indexa.

**Parcialmente resolvido em 06/09/2026.** O porte para Postgres foi aplicado, e no mundo
Postgres o problema não existe: `0000_init_postgres.sql` só cria tabelas, os
`TEMPLATE_DEFAULTS` de `lib/settings.ts` são neutros, e a `0001` passou a só criar o
tenant `bayron` quando encontra dados para backfillar. Banco novo nasce com **zero**
tenants, settings, produtos e serviços — conferido, e coberto pelo teste *"banco novo NÃO
nasce com o tenant do Bayron"*.

⚠️ **O que continua valendo:** as migrations **de SQLite** ainda têm os INSERT, e qualquer
instância que ainda rode SQLite nasce com os dados do Bayron. Enquanto a produção não
estiver migrada, a correção abaixo continua de pé.

**Correção proposta** (não aplicada — decisão do dono):

1. Tirar os `INSERT` de `0006`, `0007` e `0009` das migrations.
2. `0009` passa a inserir uma linha `settings` **neutra**: nome vazio ou "Sua Barbearia",
   `google_rating` e `google_review_count` **nulos/zero**, `products_section_title='Produtos'`.
3. Os dados do Bayron viram um script de seed que só roda na instância dele.

**Risco de mexer em migration já aplicada: nenhum, verificado.** O migrator do Drizzle
decide o que rodar por **timestamp**, não por hash
(`drizzle-orm/sqlite-core/dialect.js`: `Number(lastDbMigration[2]) < migration.folderMillis`);
o hash é gravado e nunca comparado. O banco do Bayron já rodou essas migrations e não vai
rodá-las de novo — os dados dele ficam. Só banco novo sente a mudança, que é o objetivo.

**Segunda decisão, junto com essa:** `shortName === "Bayron"` é um discriminador ruim.
É comparação de texto contra um campo que o próprio dono edita no painel. Quando o passo 4
estiver aplicado, o certo é `tenant.slug === 'bayron'` — identidade que o cliente não
edita. Hoje há **seis** comparações espalhadas pelos componentes; o mínimo é concentrá-las
em uma função só, para trocar em um lugar.

---

## 5. Verificações pendentes

- ✅ **AppBarber e Trinks permitem domínio próprio?** **Não** — verificado em
  01/09/2026: eles oferecem site, mas sempre em **subdomínio deles**. Virou linha na
  tabela comparativa da página de vendas e sustenta o modelo do §1.1.
- **R$ 100/mês vende para barbearia sem sistema?** Continua sendo a maior incerteza do
  projeto inteiro, agora com margem mais apertada para errar. Só 5 conversas respondem.
- **Quantas instâncias cabem na VPS?** Ela já foi comprada e a premissa é que as 10
  cabem. `docker stats` com 5 containers confirma ou desmente numa tarde.
- **Restauração de backup** (§3.3), uma vez, antes do primeiro cliente pago — e agora
  também **incluir as fotos no backup** (§3.7), que hoje ficam de fora.

---

## 6. Ordem sugerida

0. **Limpar o seed das migrations** (`PENDENCIAS-ABERTAS.md` §4.6). Subiu para o topo em
   06/09/2026: enquanto isso não for feito, todo banco novo nasce com o nome, o endereço,
   os produtos e **as 227 avaliações** do Bayron — e o §4.1 inteiro fica desarmado, porque
   ele decide pelo `short_name` que a migration grava como `'Bayron'`.
1. ~~**Decidir o login do painel** (§1.5)~~ — decidido e implementado em 09/09.
   Falta cadastrar o telefone dos barbeiros do Bayron antes do segundo cliente.
2. ~~**As duas minas** (§2.1, §2.2)~~ — o fuso (§2.1) foi centralizado em 10/09 e
   está com guarda-corpo; sobrou o fuso por barbearia, que só morde no passo 6.
   **Falta o wizard (§2.2)**: barato agora, caro com cliente pagando.
3. **Registrar o domínio** (`PENDENCIAS-ABERTAS.md` §0). Nome escolhido sem domínio registrado é nome de outra pessoa amanhã.
4. ~~**Tela sem fotos** (§4.1)~~ — feita em 06/09/2026, topo e resto da página.
   A cor de destaque (§4.2) já estava feita.
4b. **Política de suporte** (§1.4). O medidor de completude, que era a outra metade
   deste item, foi feito em 10/09 (§4.4). A R$ 100 a política escrita decide se existe
   margem — deixou de ser melhoria.
5. **Contrato e política de inadimplência** (§1.2, §1.3). Antes do primeiro real entrar.
6. Operação (§3.x) — pode esperar o **segundo** cliente, não o décimo.
