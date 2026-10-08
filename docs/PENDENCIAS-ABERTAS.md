# Pendências em aberto

> Registro vivo do que ainda **não** está definido. Atualizado: 2026-09-27.
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
| **24/09** | **Autoatendimento, com 7 dias grátis.** O dono se cadastra sozinho, recebe o painel na hora e escolhe entre três layouts de site. Substitui a montagem assistida (§4.8). Adiantou para o primeiro cadastro o prazo do contrato (§1.2), do domínio e da política de suporte (§1.4) | `PLANO-PRODUTIZACAO.md` §13 |
| **24/09** | **Cartão no cadastro**, cobrado só depois dos 7 dias. **Três layouts** de site, com **as cores escolhidas pelo dono** (§1.3, §4.13) | `PLANO-PRODUTIZACAO.md` §13 |
| **24/09** | **Fotos no painel, logo depois do cadastro** — galeria do site (o carrossel, a partir de 3 fotos) e foto de produto por barbearia; não no formulário do cadastro. Feito em 25/09 (§2.7) | `PLANO-PRODUTIZACAO.md` §13 |
| **27/09** | **Layout e cores escolhidos no cadastro, antes do cartão** — o site já nasce com a cara que o dono escolheu. Rejeitado: escolher no painel, depois de entrar (§4.13) | `PLANO-PRODUTIZACAO.md` §13 e `JORNADA-DO-BARBEIRO.md` §2.4 |
| **08/10** | **Nome provisório: Fadeline** — escolhido pelo dono entre 103 nomes conferidos no registro.br. Provisório tem prazo: vale até o cadastro abrir. A tela ainda diz "Barbearia no Ar" | `PENDENCIAS-ABERTAS.md` §0.1 |

**Ainda pendente dentro dos itens acima:** registrar `fadeline.com.br` (livre em
08/10/2026, **não registrado**) e procurar o nome na busca de marcas do INPI — classes 42,
35 e 44 — antes de gastar com logo. E trocar o nome no código: o login do painel e o
cadastro ainda dizem "Barbearia no Ar", e `apps/vendas/src/config.ts` ainda crava
`NOME_PRODUTO = 'Barbearia no Ar'` e `SITE_URL = 'https://barbearianoar.com.br'` — um
domínio que nunca foi registrado. O domínio dos subdomínios não precisa de código: vem de
`DOMINIO_BASE`. *(Até 08/10, este item era registrar `barbearianoar.com.br` e, para SEO,
`sitedabarbearia.com.br`.)*

⚠️ **Adiado por decisão de 11/09/2026** (`PLANO-PRODUTIZACAO.md` §12): o nome definitivo
ainda não está escolhido, e registrar antes de decidir é pagar por endereço que não vai
usar. **O gatilho deixou de ser uma data e passou a ser um evento:** antes de o nome
aparecer em qualquer lugar que o cliente veja — link, e-mail, nota, subdomínio. Trocar
depois de ter cliente é migração, não renomeação.

⚠️ **Esse evento ficou mais perto em 24/09/2026** (`PLANO-PRODUTIZACAO.md` §13): no
autoatendimento, o subdomínio aparece para o dono **no minuto do cadastro**. O domínio
tem que existir antes de o cadastro abrir.

**08/10/2026: nome provisório escolhido — Fadeline** (§0.1). "Provisório" tem o prazo do
evento acima: o nome definitivo precisa estar no código e no domínio antes de o cadastro
abrir.

### 0.1 O nome — a pesquisa de 08/10/2026

> Feita em 08/10/2026, a pedido do dono, porque "Barbearia no Ar" soa genérico.
> **Decisão: Fadeline, provisório.** Os domínios foram conferidos no registro.br no mesmo
> dia — disponibilidade muda de um dia para o outro. **Não conferido:** INPI, Instagram e
> se já existe empresa com o nome; a busca na web estava desligada na organização.

**Os critérios, na ordem do dono:** só barbearia — o nome pode usar o vocabulário do
barbeiro; não genérico; português ou inglês; curto, porque aparece no endereço de cada
cliente (`cortesdoze.<nome>.com.br`); e `.com.br` livre.

**Por que Fadeline.** Palavra inventada: entre os finalistas, a marca mais fácil de
proteger. "Fade" é o corte que todo barbeiro faz, e "line" o brasileiro conhece de
"online". Curto (8 letras) e natural como substantivo — "uso o Fadeline".

**O que ele custa, aceito na escolha:** não diz o que faz, e a landing explica; prende a
marca a um estilo de corte; ouvido num áudio, pode ser escrito "feidlain"; e o
`fadeline.com` está à venda por US$ 1.499 (Atom, conferido em 08/10) — qualquer um pode
comprar.

| Finalista | `.com.br` em 08/10 | Por que não ficou |
|---|---|---|
| Tudo na Régua | livre | Frase: diz o que faz, mas trava como substantivo ("uso o Tudo na Régua") |
| Agenda na Régua | livre | O mesmo, e deixa de fora o site, que é o diferencial |
| Tá na Régua | livre | O mesmo; e `naregua.com.br` já tem dono |
| Vez Marcada | livre | Descritivo: protege pouco como marca |
| Cortelo | livre | Inventado e sem significado: começa do zero |
| Book a Fade | livre | Inglês, e fala com o cliente da barbearia, não com quem paga |
| Toalha Quente | livre | Comprido; evoca só a barbearia clássica |
| Barbearia no Ar | livre | O nome anterior: genérico |

**Rejeitados pelo nome, não pelo domínio:** Pode Sentar ("sentar" tem duplo sentido no
funk); Corteiro (no áudio vira "carteiro"); Bem Aparado (`bemaparado` se lê "parado");
Arrumadinho (no Nordeste é o prato típico); Cortagenda (lido rápido, "corta agenda");
Barbook (lido "bar book", e o Facebook já processou nomes terminados em "-book");
Trinque (soa como Trinks, concorrente); e qualquer "Barber-alguma-coisa" — o AppBarber,
concorrente direto, já ocupa esse som.

**Já tinham dono em 08/10 — não adianta procurar de novo:** afiado, trato, acerto, gume,
aprumo, alinhado, topete, freguesia, caderneta, barbada, cortejo, navalhado, arremate,
fade, lineup, blend, nextcut, fadeflow, barbagenda, cadeiracheia, cadeiracativa,
horamarcada, agendacheia, suavez, minhavez, naregua, tratofeito, odesempre, figaro e
minhabarber, todos `.com.br`. Ao todo, 103 nomes conferidos, 31 livres.

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

⚠️ **O prazo adiantou em 24/09/2026** (`PLANO-PRODUTIZACAO.md` §13). Com 7 dias grátis, a
exposição começa **no primeiro cadastro**, não na primeira venda: o dado entra antes de
qualquer pagamento, e pode ficar sem pagamento nunca. E sem ninguém no caminho, não há
conversa onde apresentar o termo — ele tem que ser **aceito na tela de cadastro**, com a
versão aceita gravada junto da barbearia.

**E o cartão pede uma cláusula própria** (decisão de 24/09, §1.3): o termo tem que dizer,
sem letra miúda, **quando** o cartão vai ser cobrado e **como cancelar** antes disso.
Cobrança automática depois de teste grátis é exatamente o que vira reclamação quando não
está dito com clareza — é ponto para o advogado, não para improviso.

Pergunta nova, que o teste grátis cria: **o que acontece com os dados de quem testou e
não pagou?** Nome, telefone e data de nascimento de clientes de terceiro, guardados sem
contrato vigente. Guardar para sempre é exposição; apagar cedo demais perde quem só
esqueceu de pagar.

⚠️ **27/09/2026 — o rodapé fingia que os textos existiam.** O site de toda barbearia mostrava
"Termos de Uso" e "Políticas de Privacidade" apontando para `#`, num site que coleta nome e
telefone. Os dois links saíram (`PENDENCIAS-ABERTAS.md` §2.28) e voltam quando os textos
existirem, cada um com endereço próprio. Link que não leva a lugar nenhum é pior que link
nenhum: parece que a política existe.

### 1.3 🔴 `[DECISÃO]` O que acontece quando não paga

O gateway está escolhido, mas a política não. Hoje **não existe nada que suspenda uma
instância**. Se a regra for "site sai do ar após N dias", isso é feature a construir —
ver §3.5. Sem taxa de instalação, essa pendência ficou mais cara: um caloteiro que fica
3 meses sem pagar leva junto todo o trabalho de montagem, que agora não foi cobrado.

**Meio respondido em 24/09/2026:** todo cliente novo tem **7 dias grátis**
(`PLANO-PRODUTIZACAO.md` §13). O que ficou aberto — e agora vale para todo cliente, não só
para quem atrasa:

- **O que acontece no oitavo dia sem pagamento.** Site fora do ar com uma página
  dizendo o motivo, agenda desligada com o site de pé, ou alguns dias de carência com
  aviso. Parar de responder, dando 404 ou 502, está descartado
  (`ARQUITETURA-COBRANCA-V1.md` §7.3): parece defeito do produto, não inadimplência.
- ✅ **Cartão no cadastro: sim** — decidido em 24/09/2026. O dono cadastra o cartão para
  entrar, e a primeira cobrança só acontece depois dos 7 dias
  (`PLANO-PRODUTIZACAO.md` §13). Com isso, a pergunta de cima muda de forma: deixa de ser
  "e se ele não pagar" e passa a ser **"e se a cobrança no cartão falhar"** — recusado,
  sem limite, vencido, ou cancelado por ele.
- **Aviso antes de acabar.** Quando, e por onde — o dono não abre e-mail; WhatsApp exige
  a Evolution API ou parecido, que hoje não existe no produto.

### 1.4 🔴 `[DECISÃO]` Política de suporte — virou pré-requisito do preço

⚠️ **O gatilho mudou em 24/09/2026** (`PLANO-PRODUTIZACAO.md` §13). Era "antes de combinar
o escopo com o primeiro cliente", e essa conversa não existe no autoatendimento. A
política tem que estar escrita onde o dono se cadastra.

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
Desde 27/09/2026 ele reprova também a **conta** de offset — `h + 3`, `-180`, três horas em
milissegundos —, que passava livre (§2.11).

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

⚠️ **Subiu em 24/09/2026.** No autoatendimento, o `/cadastrar` cria a barbearia com **um**
barbeiro só — o dono. Todo cliente novo começa exatamente no caso em que o passo é inútil.

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

### 2.7 ✅ `[TÉCNICO]` As fotos de produto de todas as barbearias na mesma pasta — RESOLVIDO em 24/09/2026

**A pasta:** `pastaDeProduto(tenant)` (`lib/uploads.ts`), com a mesma regra de
`pastaDeMidia()`: a barbearia 1 continua em `UPLOAD_ROOT/products`, onde as fotos dela já
estão e para onde o banco dela aponta; as outras gravam em `UPLOAD_ROOT/<slug>/products`.
Gravar, apagar e servir passam pela mesma função — a remoção que estava duplicada em
`api/admin/products/[id].ts` e `api/admin/combos/[id].ts` virou `apagarFotoProduto()`.

**A rota:** `api/products/image/[name].ts` serve da pasta da barbearia que o middleware
resolveu (`tenantResolvido()`), nunca de um nome solto numa pasta comum. Sem barbearia, 404.

**Junto, o mesmo defeito na mídia da marca:** `api/media/[...path].ts` olhava só o endereço
(`tenantDoHost`), e o painel mora num endereço central, que não é de barbearia nenhuma — a
prévia da logo e da capa em `/admin/configuracoes` dava 404 para todo mundo. Passou a usar
`tenantResolvido()`: a sessão no painel, o endereço no site.

Coberto por `tests/fotos-por-barbearia.test.ts` (7 casos, 5 mutações verificadas).

⚠️ **Foto de produto de barbearia que não é a 1, enviada antes disto, ficou na pasta comum**
e passa a dar 404. Só em desenvolvimento — em produção existe só o Bayron. Reenvie pelo
painel.

<details><summary>O defeito, como estava</summary>

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

</details>

### 2.8 ✅ `[TÉCNICO]` O backup entregava o banco inteiro — RESOLVIDO em 22/09/2026

Encontrado na auditoria de 15/09/2026, consertado na onda 0.

**O que mudou:** a trava deixou de perguntar QUEM pede e passou a perguntar o que o arquivo
contém — `SELECT COUNT(*) FROM tenants`, e 501 quando não é exatamente uma. A condição é
consultada no banco, e não no cache de tenants, porque um cache velho em outro processo
diria "uma" depois de a segunda já existir. O nome do arquivo também passou a usar a data no
fuso da barbearia. Guarda em `tests/backup-rota.test.ts`, que verifica o 501 usando o cookie
da **barbearia 1** — exatamente a que a trava antiga deixava passar.

⚠️ **A parte grande continua aberta:** enquanto o download existir, ele é `pg_dump` do banco
todo. A versão multi-tenant precisa exportar só as linhas do tenant (COPY com WHERE). Até
lá, o dono perde o botão no dia em que a segunda barbearia nascer — de propósito.

<details><summary>O defeito, como estava</summary>

`api/admin/backup.ts:92` recusa a rota para quem não é `TENANT_UNICO`:

```ts
if (tenant.id !== TENANT_UNICO.id) return json({ ... }, 501);
```

`TENANT_UNICO.id` é **1**, e 1 é a barbearia de backfill — o Bayron, o único cliente em
produção. **Quem não cai no 501 é justamente ele.** O que passa chama `pg_dump` com a
credencial de dono das tabelas, que **ignora o RLS**, sem `--table` e sem `WHERE`.

⚠️ No dia em que a segunda barbearia entrar, o dono do Bayron clica em "baixar backup" e
recebe nome, telefone e data de nascimento dos clientes de **todas** as barbearias, mais o
hash de senha dos donos delas.

O comentário no próprio arquivo chama isso de "a pior falha de isolamento possível no
produto" e descreve a guarda como se ela fechasse o caso. Ela fecha o caso que não acontece.

**Correção imediata:** 501 para todos enquanto o banco for compartilhado. **Depois:**
exportar só as linhas do tenant, sem `pg_dump`.

</details>

### 2.9 ✅ `[TÉCNICO]` A mídia da marca gravava sem saber de qual barbearia era — RESOLVIDO em 22/09/2026

**O que mudou:** `salvarMidiaMarca()` passou a receber o tenant e a montar o caminho com
`pastaDeMidia()` e o endereço com `urlDeMidia()` — as mesmas funções que a leitura já usava.
A rota de upload passa o tenant que ela já tinha resolvido.

**A regra que fica:** um caminho de arquivo tem **uma** função que o monta, usada pela
escrita e pela leitura. Havendo duas, elas divergem — é questão de quando, não de se.

Guarda em `tests/uploads.test.ts` — e ela **não nasceu junto com o conserto**, como a regra
da casa manda. Foi escrita em 24/09, quando a verificação por mutação mostrou que, com o
caminho legado de volta, a suíte inteira continuava verde. Confere as duas metades: a pasta
no disco e o endereço devolvido, para barbearia nova e para a de id 1, que fica no legado.

⚠️ **Continua aberto o §2.7** (foto de produto), que é a mesma classe de defeito no mesmo
arquivo. Não entrou junto de propósito: a leitura de imagem de produto não passa por
`/api/media/`, então mexer na escrita sem entender o outro caminho quebraria as imagens que
já existem.

<details><summary>O defeito, como estava</summary>

`lib/uploads.ts:139` — `salvarMidiaMarca(file, tipo)` **não recebe tenant**. Grava em
`join(UPLOAD_ROOT, tipo)` (`:149`) e devolve `/api/media/${tipo}/...` (`:169`), o formato
legado sem slug. A leitura usa `pastaDeMidia(tipo, tenant)`, que para `tenant.id !== 1` é
`UPLOAD_ROOT/<slug>/<tipo>`.

**As duas metades do mesmo caminho discordam.** Consequências:

- Logo, capa, og e favicon de **toda barbearia nova dão 404 no site dela**. O site nasce sem
  imagem e o dono não tem como consertar pelo painel.
- Os arquivos ficam na pasta da barbearia 1 — a fronteira de armazenamento entre clientes
  não existe. Conteúdo público, então o dano é baixo; a ausência de fronteira não.

</details>

### 2.10 ✅ `[TÉCNICO]` A última hora do expediente era sempre recusada — RESOLVIDO em 22/09/2026

**O que mudou:** `const dateStr = formatInTimeZone(startsAt, TZ, 'yyyy-MM-dd')`. Uma linha,
como estava previsto.

Duas guardas, porque a suspeita de que isto volte é alta: `tests/bookAppointment.test.ts`
ganhou um expediente noturno (18:00–22:00) e agenda às 21:00 — o caso falha com o código
anterior; e `tests/data-do-fuso.test.ts` reprova qualquer ocorrência nova de
`toISOString().slice(0, 10)` fora de uma lista de dois usos conferidos.

⚠️ A lista existe porque o padrão nem sempre está errado: sobre um instante, está; sobre um
`Date.UTC(y, m, d, 12)` montado a partir de data já local, é aritmética de calendário e está
certo. Expressão regular nenhuma separa os dois — por isso a decisão é de quem lê.

<details><summary>O defeito, como estava</summary>

`lib/bookAppointment.ts:156`:

```ts
const dateStr = startsAt.toISOString().slice(0, 10);   // data em UTC, não local
```

`startsAt` é instante UTC, então `toISOString()` devolve a data **em UTC**. Reproduzido:

| Cidade | Cliente escolhe | Código lê o dia |
|---|---|---|
| Fortaleza/Mossoró (UTC-3) | terça, 21:00 | quarta — errado |
| Manaus (UTC-4) | terça, 20:00 | quarta — errado |
| Rio Branco (UTC-5) | terça, 19:00 | quarta — errado |

Com o dia errado ele busca o expediente do dia errado e monta a janela no dia errado; o
horário fica sempre antes da abertura.

⚠️ **O `/api/slots` OFERECE esse horário** — ele faz a conversão certa com `fromZonedTime`.
Só a criação erra. O cliente escolhe o último horário do dia, preenche tudo, clica em
confirmar e recebe **"Horário fora do expediente"**, sem log. Ele conclui que o site quebrou.

Os dois caminhos de **reagendamento** fazem certo (`formatInTimeZone`), o que mostra que
é descuido e não decisão. **Uma linha conserta.**

</details>

### 2.11 ✅ `[TÉCNICO]` Três horas somadas à mão — RESOLVIDO em 27/09/2026

Eram seis lugares, cinco deles no navegador — todos certos em Fortaleza por coincidência, e
errados em qualquer barbearia fora do UTC−3. Os três da agenda do dia saíram primeiro (o
bloco recolhido abaixo); os outros três, no mesmo dia, à noite:

| Onde | A conta | O que fazia em Manaus (UTC−4) | Agora |
|---|---|---|---|
| Bloqueio de horário (`admin/bloqueios.astro:211`, na época) | `Date.UTC(y, mo - 1, d, h + 3, min)` | o almoço das 12:00–13:00 gravava 11:00–12:00, e o site vendia o meio-dia com o barbeiro almoçando | `fromZonedTime` com o fuso da barbearia (`admin/bloqueios.astro:225-227`), que desce pelos dados da página (`admin/bloqueios.astro:70` e `admin/bloqueios.astro:204`) |
| Ocupação por faixa (`lib/occupancy.ts:63`, na época) | `utcOffsetMin ?? -180` — e nenhum chamador informava | a manhã (09:00–13:00) era medida uma hora antes: a ocupação do mês no relatório e a faixa ociosa que a agenda sugere para promoção saíam de outro horário | recebe a zona, não o offset, e converte cada horário por `fromZonedTime` (`lib/occupancy.ts:59` e `lib/occupancy.ts:73-87`) |
| O calendário do cliente, no agendamento (`agendar.astro:329`, na época) | `Date.now() - 3 * 60 * 60 * 1000` | das 23:00 à meia-noite, o calendário começava no dia seguinte — com o rótulo "Hoje" | a data de hoje no fuso da barbearia, pelo `Intl` do navegador (`agendar.astro:337-343`), com o fuso no `data-tz` do wizard (`agendar.astro:59`) |

O do bloqueio não era trocar uma linha: o script daquela tela era `define:vars`, que o Astro
entrega sem empacotar — sem `import`, sem `lib/timezone.ts`. Virou script processado, como o
da agenda do dia.

**A guarda passou a pegar a conta.** `tests/timezone-unico.test.ts:92` reprova, em todo `.ts`
e `.astro` de `src/` — scripts de página inclusive, comentários não —, a hora mais ou menos 3,
o `Date.UTC` com ± 3, o `utcOffsetMin` e o `-180`, as três horas em milissegundos e o
`getTimezoneOffset()`. O controle: rodada sobre a árvore de 27/09 de manhã, ela aponta os
seis lugares, cada um na linha certa; e não confunde a classe `h-3.5` do Tailwind nem o
`rotate-180`.

**Visto rodando**, com o servidor em `America/Manaus`: antes do conserto, o bloqueio das
12:00 às 13:00 foi gravado como 15:00–16:00 UTC — 11:00–12:00 lá — e o calendário, às 23:30
de uma segunda, abriu em *"Ter 29 · Hoje"*. Depois: 16:00–17:00 UTC, e *"Seg 28 · Hoje"*.

⚠️ **O que a guarda ainda não pega:** a classe 3 da skill `barbearia-fuso` — o dia lido no
fuso do processo com `getDay()`, que é o `PENDENCIAS-ABERTAS.md` §2.22, ainda aberto. A data
lida em UTC com `toISOString().slice(0, 10)` tem a guarda dela (`tests/data-do-fuso.test.ts`).
E o fuso continua um só por processo (§2.1).

<details><summary>Como estava de 25/09 até a tarde de 27/09/2026</summary>

**O que sobra:** `admin/bloqueios.astro:211` (conferido em 27/09/2026):

```js
return new Date(Date.UTC(y, mo - 1, d, h + 3, min)).toISOString();
```

Fortaleza cravada no código que roda no celular do dono. Em Manaus, bloquear o almoço das
**12:00–13:00** grava **11:00–12:00** local.

⚠️ O horário das 12:00 continua sendo vendido no site. **O cliente agenda, chega, e o
barbeiro está almoçando** — o pior modo de falha de uma agenda, porque ninguém percebe até
alguém estar parado na porta.

**Não é trocar uma linha.** O script dessa tela usa `define:vars`, e o Astro entrega script
assim do jeito que está, sem empacotar: `import` não funciona dentro dele, e o
`lib/timezone.ts` não chega lá. O conserto é a conversão ir para o servidor — que já recebe a
data e a hora — ou o script sair do `define:vars`.

⚠️ **O mesmo erro fora do navegador**, achado em 27/09/2026: `lib/occupancy.ts:63` assume
`-180` quando ninguém informa o fuso, e nenhum dos dois chamadores informa
(`admin/dia/[date].astro:352` e `admin/relatorios.astro:251`). Fora do UTC−3, a ocupação sai
deslocada: a faixa ociosa que a agenda sugere para promoção (`admin/dia/[date].astro:353`) e a
ocupação do mês no relatório.

⚠️ **`tests/timezone-unico.test.ts` não pega nenhum dos dois.** Ele procura a string
`'America/...'`; a conta `h + 3` e o número `-180` passam livres. A guarda existente dá falsa
sensação de que o fuso foi centralizado — ela cobre a constante, não a conta.

**O que saiu em 27/09/2026:** os dois da agenda do dia — `admin/dia/[date].astro:1385` e
`:2018`, na época — e um quarto lugar que não estava nesta lista: o rótulo da grade de mover,
que desfazia a conta com `(h - 3 + 24) % 24` (`:2481`, na época). A conversão passou a ser
`fromZonedTime` com o fuso da barbearia (`admin/dia/[date].astro:1420-1421`), usada pela grade
de mover (`:2041`), pelo encaixe (`:2163`) e pela criação manual (`:2610-2611`); o rótulo, por
`formatInTimeZone` (`:2504`). Fora do UTC−3, o de mover era o pior: deslocava o horário em uma
hora e a API aceitava em silêncio, porque o horário deslocado também era expediente válido.
Guarda nova: `tests/grade-de-horarios.test.ts:85` reprova `h + 3` e `h - 3 + 24` — **naquele
arquivo só**.

</details>

### 2.12 ✅ `[TÉCNICO]` XSS armazenado pelo nome da barbearia — RESOLVIDO em 22/09/2026

**O que mudou:** os três lugares passaram a usar `jsonLdSeguro()` (`src/lib/jsonLd.ts`), que
escapa `<` como `\u003c` — escape válido de JSON, então quem lê recebe o texto original de
volta e o navegador nunca vê a sequência que fecharia a tag.

**Escapar na saída, e não proibir caractere na entrada**, de propósito: lista de proibidos
resolve o campo conhecido e deixa inseguro o próximo campo que alguém adicionar. E nome de
barbearia com `&` ou `<3` é legítimo.

Guarda em `tests/json-ld.test.ts`: reprova `set:html={JSON.stringify(...)}` em qualquer
`.astro` **dos dois aplicativos**, e confere que o escape volta idêntico no `JSON.parse`.

✅ Conferido de passagem: o `set:html` do CSS da cor de destaque (`Layout.astro:102`) está
seguro — `cssDoAccent()` passa cada valor por `isHex()` e cai num padrão quando não é.

<details><summary>O defeito, como estava</summary>

`layouts/Layout.astro:66`, `components/FAQ.astro:38`, `components/Testimonials.astro:48`:

```astro
<script type="application/ld+json" set:html={JSON.stringify({ "name": s.businessName, ... })} />
```

`JSON.stringify` **não escapa** `<` nem `/` — conferido rodando. Um `businessName` contendo
`</script><script>...</script>` fecha o bloco e executa. O schema de escrita
(`api/admin/settings.ts`) limita só o tamanho, não os caracteres.

Roda no navegador de **todo cliente que abrir a página**, num endereço com o seu domínio.
Com `CADASTRO_ABERTO=1` (§4.8), qualquer um de fora planta isso.

</details>

### 2.13 ✅ `[TÉCNICO]` Dois buracos de permissão dentro da mesma barbearia — RESOLVIDOS em 22/09/2026

**A busca:** barbeiro comum passou a achar só os próprios agendamentos — a mesma regra de
`calendar.ts`, de propósito, porque as duas telas mostram a mesma agenda por caminhos
diferentes. O `manage_token` continua na resposta: ele é o link que o atendente manda para o
cliente, e agora só vem junto de agendamento que o barbeiro pode ver.

Guarda em `tests/busca-permissao.test.ts`, escrita **dois dias depois** do conserto pelo
mesmo motivo do §2.9: com o filtro de papel removido, a suíte seguia 269 de 269. Ela roda a
rota fora de `comTenant`, na conexão de dono, para testar a parede da aplicação e não a do
banco — e confere que o barbeiro não recebe o link de cancelamento do colega.

**A sessão:** `getSession()` passou a reconsultar a linha do barbeiro a cada requisição, e o
`role` do banco vence o do cookie. Demitir corta o acesso na requisição seguinte; rebaixar
tem efeito sem derrubar a sessão. É uma consulta por chave primária — preferida a um cache
com TTL, porque o atraso de um cache aqui é exatamente o que estava sendo consertado.

A consulta filtra por `tenant_id` além do `id`: este caminho roda **antes** de `comTenant`,
na conexão de dono, que enxerga todas as barbearias — sem o filtro, um cookie com
`barberId` de uma barbearia e `tenantId` de outra passaria.

Quatro casos novos em `tests/sessao-tenant.test.ts`, todos vermelhos com a versão anterior.

⚠️ **Trocar a senha ainda não derruba sessão.** A reconsulta cobre demissão e rebaixamento,
não revogação por senha — para isso falta um carimbo de versão da sessão gravado no
barbeiro e conferido aqui.

<details><summary>Os defeitos, como estavam</summary>

**A busca não confere papel.** `api/admin/appointments/search.ts:59` tem só
`if (!session)`. Todas as outras rotas de agendamento fazem
`if (session.role !== 'admin' && appt.barberId !== session.barberId) return 403`. E ela
devolve o `manage_token` de cada agendamento (`:84`).

Um barbeiro comum digita duas letras em `/admin/buscar` e recebe nome, telefone e o link
`/a/<token>` dos clientes dos colegas — e com esse link cancela horário alheio, com o
registro gravado como `cancelledBy: 'customer'`, **como se o próprio cliente tivesse
desmarcado**.

**A sessão nunca reconsulta o barbeiro.** `lib/session.ts:52` revalida o *tenant*, mas o
`role` e o `active` viajam lacrados no cookie com TTL de **30 dias**. Desmarcar "ativo" de
um demitido, ou rebaixar um admin, **não faz efeito**. Trocar a senha também não derruba
sessão nenhuma.

</details>

### 2.14 ✅ `[TÉCNICO]` Duas transações sem `await` — RESOLVIDO em 22/09/2026

**O que mudou:** `await` nas duas. A variante que devolve a promessa (`return db.transaction`,
em `lib/reagendar.ts`) foi conferida e está certa — quem chama espera.

Guarda em `tests/transacoes-awaited.test.ts`: lê o código-fonte e reprova qualquer
`.transaction(` que não seja `await`ada nem devolvida. Não precisa de banco, então roda no
`npm test` de qualquer máquina — que é onde um guarda-corpo tem que rodar.

<details><summary>O defeito, como estava</summary>

`api/admin/appointments/[id]/complete.ts:63` e `api/admin/reservations/[id].ts:45` chamam
`db.transaction(...)` **sem `await`** e respondem 200 em seguida.

É pior que promessa solta comum: o `src/middleware.ts` lê o corpo da resposta e, no
`finally` de `comTenant`, roda `RESET ROLE` e devolve a conexão ao pool — **a mesma conexão
em que a transação ainda está aberta**.

O barbeiro aperta **Concluir** com os extras da comanda, vê sucesso, e o atendimento
continua confirmado — ou fica concluído sem os extras. Na reserva: produto marcado como
retirado e **não faturado**. As outras rotas do mesmo diretório usam `await`; são só estas
duas.

</details>

### 2.15 ✅ `[TÉCNICO]` Editar o nome de um serviço apaga os centavos do preço — RESOLVIDO em 27/09/2026

**O que mudou:** preço passou a ter uma função só para aparecer e uma só para ser lido do
campo, as duas em `lib/dinheiro.ts`.

- `reais(centavos)` (`lib/dinheiro.ts:16`) mostra **R$ 39,90** quando há centavos e **R$ 40**
  quando não há, como o site sempre mostrou. Passam por ela o site
  (`components/Services.astro`), o agendamento (`agendar.astro`), a confirmação
  (`a/[token].astro:70-72`), a área do cliente (`cliente/index.astro:103`) e o painel — início,
  reservas, agenda do dia, relatórios e a lista de agendamentos
  (`api/admin/appointments/index.ts:81`).
- `centavosDoCampo(valor)` (`lib/dinheiro.ts:33`) aceita *"39,90"*, *"39.90"* e *"40"*; o que
  não é número vira `NaN`, e quem chama decide a mensagem. A tela de serviços mostra `39.90` no
  campo (`admin/servicos.astro:52`), com passo de centavo no de criar e no de editar (`:98`,
  `:232`), e salvar e criar passam por ela (`:386`, `:429`).

Guarda: `tests/dinheiro.test.ts` — os casos das duas funções e uma varredura que reprova, em
todo `.astro` e `.ts` do app, os quatro jeitos de arredondar que existiam (`toFixed(0)`,
`Math.round(c / 100)`, `maximumFractionDigits: 0` e `parseInt(…) * 100`), com um caso de
controle provando que os quatro pegam as linhas antigas. Fica de fora `lib/combo.ts`, que
calcula o desconto em centavos — é conta, não exibição.

**Visto ao vivo em 27/09/2026**, na máquina do dono: o "Corte + barba" de R$ 39,90 aparecia
**R$ 40** no site, no agendamento, na confirmação e na agenda do dia — o arredondamento não era
só do site, como esta seção dizia. Depois do conserto, conferido com o build de produção num
navegador: R$ 39,90 nas quatro telas, renomear o serviço manteve os 3990 centavos, e um serviço
novo de 29,90 gravou 2990.

<details><summary>O defeito, como estava</summary>

`admin/servicos.astro:50`, `:231`, `:383` (linhas conferidas em 25/09/2026):

```ts
priceNum: Math.floor(r.priceCents / 100),                    // 3990 -> 39
<input type="number" step="1" value={svc.priceNum} />
priceCents: parseInt(priceEl.value, 10) * 100                // 39 -> 3900
```

Serviço de **R$ 39,90** aparece como `39`. O dono entra para corrigir só o nome, salva, e o
preço vira **R$ 39,00** — sem aviso. E é impossível cadastrar centavos por essa tela.

Os produtos fazem certo (`api/admin/products/index.ts:53-57`, com `parseFloat` e
`Math.round`), o que mostra que aqui foi descuido.

**E o site arredonda por conta própria** (conferido em 25/09/2026):
`components/Services.astro:32` mostra `R$ ${Math.round(c / 100)}` — o serviço de R$ 39,90
aparece como **R$ 40**. O site anuncia um preço que não é o cobrado.

</details>

### 2.16 🟠 `[TÉCNICO]` O desconto do combo vale em qualquer dia da semana

`api/appointments/index.ts:71` resolve o combo validando `id`, `active` e `tenantId` — e
**não valida o bitmask `weekdays`**, que é justamente o que define em que dias o combo
existe (`schema.ts:179`).

O dono cria "Combo de segunda, 20% OFF". Qualquer pessoa que abra `/agendar?combo=3` numa
sexta recebe os 20%, sobre o serviço **e** sobre o produto. O link circula no WhatsApp e o
desconto de segunda vira permanente. No relatório, aparece como receita legítima.

### 2.17 ✅ `[TÉCNICO]` O guarda de escopo por tenant era cego para metade das rotas — RESOLVIDO em 22/09/2026

**O guarda:** `\bSELECT\s` no lugar de `SELECT ` (e o mesmo para INSERT/UPDATE/DELETE), e o
glob passou a varrer `src/lib/**` e `src/db/**` além de `src/pages/**`.

**E as quatro que ele não via foram escopadas de verdade**, que é o trabalho que o guarda
escondia: `appointments/search.ts`, `appointments/calendar.ts`, `lib/slots.ts` (cinco
consultas) e `lib/reagendar.ts` (três, incluindo os dois UPDATE).

O número passou de "54 de 54" para **64 de 64**, e o piso do teste subiu junto. O 54 nunca
foi falso — era o do recorte, não o do sistema.

**A lição registrada no próprio teste:** guarda que varre um recorte mede o recorte, e **não
fica vermelho quando o recorte encolhe**. Todo guarda por texto precisa de um caso de
controle — um arquivo que ele tem que pegar.

<details><summary>O defeito, como estava</summary>

`tests/escopo-rotas.test.ts:56` detecta consulta com o padrão `SELECT ` — **com espaço**.
Rota cujo SQL quebra a linha depois do `SELECT` não casa, `tocaBanco` dá `false` e ela fica
invisível. Conferido: `api/admin/appointments/search.ts` e `.../calendar.ts` são invisíveis
ao teste.

E o glob varre só `src/pages/**` — nunca `src/lib/`, onde estão `slots.ts` e `reagendar.ts`,
ambos sem uma única menção a tenant.

⚠️ **Não é vazamento hoje** — o middleware embrulha tudo em `comTenant()` e o RLS filtra. Mas
a camada de aplicação sumiu nesses pontos e o guarda-corpo não avisa: **o produto tem uma
parede onde os documentos afirmam ter duas**, e a afirmação de "54 de 54 rotas escopadas"
mede menos do que diz.

</details>

### 2.18 ✅ `[TÉCNICO]` O guarda de escopo olhava o arquivo, não a consulta — RESOLVIDO em 25/09/2026

**O guarda novo:** `tests/escopo-rotas.test.ts` passou a olhar **cada consulta** do Drizzle
(`.from()`, `.update()`, `.delete()`) a tabela com `tenant_id` — e não mais só se o arquivo
menciona `tenant.id` em algum lugar. As duas exceções, o login achando o barbeiro pelo
telefone como dono, estão escritas no próprio teste, com o motivo.

**E as doze consultas que ele achou foram escopadas:** as listas de produtos, combos,
reservas e barbeiros nas telas do painel; o mapa de nomes da agenda do dia; o barbeiro
logado em `/admin/configuracoes`; a próxima posição de produto e de combo; e o ramo do dono
em serviços e bloqueios, na tela e na API. Nesses quatro últimos, o filtro da barbearia saiu
de dentro do ramo por papel — `and(eq(x.tenantId, tenant.id), papel === 'admin' ? undefined : …)` —
para nenhum ramo conseguir esquecê-lo.

**Uma delas era defeito de verdade, não só parede faltando.** `api/admin/barbers/index.ts`
conferia o telefone "em todas as barbearias, de propósito" — só que, sob o RLS, a consulta
enxergava apenas a própria. Telefone já usado em outra barbearia passava pela conferência,
batia no índice único e voltava como 500, "Erro ao criar barbeiro", sem o motivo. Agora quem
responde é o índice, com 409 e a mensagem certa (`tests/telefone-unico.test.ts`).

⚠️ **Nenhuma das doze vazava** — o RLS segurava todas. Mas "66 arquivos tocam o banco, 66
filtram" era verdade e enganava: quase toda tela menciona `tenant.id` na primeira consulta,
a que confere o barbeiro logado, e a segunda — a que lista o conteúdo da tela — podia não
filtrar nada. O limite do guarda novo está escrito nele: pega **omissão**, não filtro errado.

### 2.19 ✅ `[TÉCNICO]` Toda transação dentro de uma requisição estourava — inclusive o agendamento — RESOLVIDO em 25/09/2026

`comTenant()` (`src/db/index.ts`) reserva uma conexão do pool para a requisição e a entrega
ao Drizzle. A conexão reservada do postgres.js **não tem `begin()`**, e a transação do
Drizzle é, por dentro, `client.begin(...)`. Toda transação dentro de uma requisição com
barbearia estourava `this.client.begin is not a function`. São seis: **o agendamento pelo
site**, o reagendamento, concluir atendimento, retirar reserva, salvar expediente e criar
barbeiro.

**Depois da migração para Postgres, o site do Bayron deixaria de aceitar agendamento.** O
roteiro pegaria no §5 — "um agendamento novo, feito pelo site" — com o site já no ar
(`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.1).

Por que a suíte não via: os testes chamavam as rotas **fora** de `comTenant`, onde `db` é o
pool do dono, que tem `begin()`. Achado por acaso, rodando uma rota como em produção.

**O conserto:** `ensinarTransacao()` dá à conexão reservada um `begin()` que abre a
transação nela mesma — onde estão o papel restrito e a barbearia. Abrir em outra conexão do
pool seria rodar como dono, sem RLS. Transação dentro de transação vira `SAVEPOINT`; duas ao
mesmo tempo na mesma requisição são recusadas com o motivo, em vez de se intercalarem.

Coberto por `tests/transacao-na-requisicao.test.ts` (7 casos, todos dentro de `comTenant`)
e por um caso novo em `tests/bookAppointment.test.ts`, que agenda do jeito que roda em
produção. Conferido ao vivo em 25/09/2026 com o build de produção: agendamento pelo site de
uma barbearia recém-cadastrada, resposta 201.

### 2.20 ✅ `[TÉCNICO]` A agenda do dia não respondia a clique nenhum — RESOLVIDO em 25/09/2026

`admin/dia/[date].astro` recebia o fuso por `<script define:vars={{ TZ }}>`. **`define:vars`
implica `is:inline`**: o Astro para de processar o bloco — e esse bloco tinha `import` e era
TypeScript. O navegador recusava o bloco **inteiro** ("Cannot use import statement outside a
module"): calendário, WhatsApp, comanda, venda de produto, concluir atendimento — nada
respondia, na tela que o barbeiro mais abre.

Conferido na branch `monorepo`; a `main` não foi olhada. Achado abrindo a tela no navegador,
em 25/09; nenhum teste abria. O fuso passou a descer pelos dados da página
(`clientData.tz`), e `tests/scripts-inline.test.ts` reprova `import` e sintaxe de TypeScript
em qualquer script inline.

⚠️ A regra 2 da skill `barbearia-fuso` mandava exatamente isto: *"o fuso desce por
`define:vars`"*. Serve para script sem `import` e escrito em JavaScript puro — e só.

### 2.21 ✅ `[TÉCNICO]` Foto de celular saía deitada e com o GPS de quem tirou — RESOLVIDO em 25/09/2026

Duas coisas que o arquivo do celular traz, achadas desenhando a galeria:

1. **A rotação em etiqueta.** Celular em pé grava os pixels deitados e uma etiqueta EXIF
   dizendo "gire 90°". O navegador obedece a etiqueta no arquivo original, mas as variantes
   WebP saíam do sharp sem ela — e é a variante que o srcset serve. Toda foto tirada em pé
   aparecia **de lado**. Reproduzido com sharp 0.34.5: 1600×1200 com orientação 6 virava um
   WebP de 640×480.
2. **O GPS.** O original era gravado byte a byte e servido em endereço público (o `src` da
   imagem): qualquer visitante lia onde a foto foi tirada. Foto tirada em casa entrega o
   endereço do barbeiro.

`normalizarFoto()` (`lib/uploads.ts`) grava tudo girado, **sem EXIF** e com no máximo 2560 px
(produto: 1600). Arquivo que não é imagem de verdade passou a ser recusado, em vez de gravado
e servido como `image/jpeg`. O limite de envio de produto subiu de 5 para 12 MB, o mesmo da
marca. Coberto em `tests/uploads.test.ts`, com 4 mutações verificadas.

O custo aceito: a foto é recomprimida (qualidade 88) e o "original" guardado deixa de ser o
byte a byte do celular. ⚠️ **O que já está no volume não mudou:** fotos enviadas antes
(logo, capa, produtos) continuam como estavam.

### 2.22 🟠 `[TÉCNICO]` O gráfico da semana no painel depende do fuso do processo

`admin/index.astro:33-37` acha a segunda-feira com `getDay()` e `setDate()` — que usam o
fuso do **processo** — e formata o resultado com o da barbearia. É a regra 3 da skill
`barbearia-fuso`, e não estava registrada aqui.

Visto ao vivo em 25/09/2026, com o processo em UTC às 21h29 de Fortaleza: o gráfico mostrou
**"SEG 20"** — 20/09/2026 foi domingo — e a janela da semana foi de 20/09 a 26/09. Entre 21h
e meia-noite, o card "Esta semana" e o gráfico erram de semana.

Em produção só não aparece se o container tiver `TZ=America/Fortaleza`: o `Dockerfile` não
define, e o roteiro manda manter no `.env` (`ROTEIRO-MIGRACAO-PRODUCAO.md` §3.1). Com uma
barbearia fora de UTC−3 (§2.1), não existe `TZ` que sirva às duas.

**Correção:** a segunda-feira sai de `todayStr` — a data no fuso da barbearia —, com a conta
de dias em UTC ao meio-dia, como o `addDaysStr` duas linhas abaixo já faz.

### 2.23 🟡 `[TÉCNICO]` O login do painel aceita corpo que não é JSON

`api/auth/login.ts:54` lê `request.json()` sem conferir o tipo do corpo, e abre sessão. Com o
`checkOrigin` do Astro desligado (`astro.config.mjs`), um formulário de outro site consegue
mandar `text/plain` com o corpo em forma de JSON: a página maliciosa deixaria o visitante
logado numa conta **dela** ("login CSRF"), e o que ele digitasse depois iria para lá.

**Não reproduzido num navegador** — é o mecanismo, conferido no código. O `/api/cadastrar`,
que passou a abrir sessão em 25/09/2026, já recusa o que não é `application/json` (415). O
login precisa da mesma linha.

### 2.24 🟡 `[TÉCNICO]` O resumo do combo diz "Combo Boris" e põe o nome do produto no HTML sem escape

`agendar.astro:445` interpola o nome do produto direto num `innerHTML`, e a linha 448
escreve **"Combo Boris"** — o nome do combo do Bayron — no resumo de toda barbearia que
tiver combo. Nome de produto com `<` ou `&` quebra o resumo; com HTML, executa no site da
própria barbearia (quem cadastra o produto é o dono dela). Correção: escapar e usar o nome
do combo que a tela já carrega.

### 2.25 ✅ `[TÉCNICO]` O WhatsApp de toda barbearia nova chamava um número do Vietnã — RESOLVIDO em 27/09/2026

**Achado ao vivo** em 27/09/2026, no primeiro teste de ponta a ponta na máquina do dono: o
botão do site abriu *"Conversar com +84 99 665 89 51"*.

O `/cadastrar` gravava o número da loja com 10 ou 11 dígitos, **sem o 55**, e o `waUrl()`
(`lib/settings.ts`) punha o número cru no `wa.me/` — sem o código do país, o wa.me lê o DDD
como país, e 84 é o Vietnã. Toda barbearia criada pelo cadastro nascia assim, e todo botão de
WhatsApp do site usava esse número: o rodapé, a localização, a barra flutuante, a página do
agendamento (`a/[token].astro`) e o link que a API devolve
(`api/appointments/by-token/[token].ts`). O `schema.org` publicava `+84996658951` para o
Google. **E o teste travava o defeito:** `tests/cadastro.test.ts` esperava `'84999990000'`. O
próprio painel pede o número com o 55 (`admin/configuracoes.astro:51`, *"Ex: 5584999051196"*)
— o cadastro não seguia a regra do painel.

**O que mudou, dos dois lados:**

- **Gravar:** o cadastro grava o número da loja com o 55 (`lib/provisionarBarbearia.ts:303`,
  `:330`). O telefone de login continua sem ele — é outra regra (`PENDENCIAS-ABERTAS.md` §1.5).
- **Ler:** `numeroDaLojaInternacional()` (`lib/settings.ts:221`) completa o 55 de quem está
  gravado sem ele, e é por ela que passam o `waUrl()` (`lib/settings.ts:200-205`) e o
  `schema.org` (`layouts/Layout.astro:85`). **Isso conserta as barbearias que já existem, sem
  migration de dado.** Número que não passa na regra brasileira fica como está — o botão não
  some.
- **Mostrar:** o telefone escrito no rodapé sai formatado, *"(84) 99665-8951"*, por
  `formatarTelefone()` (`lib/phone.ts:30`) — antes saía como digitado, *"84996658951"*.

⚠️ **Barbearia criada antes de 27/09 continua com o telefone do rodapé como foi digitado**,
até o dono editar o campo em Configurações: a formatação acontece no cadastro, não na
leitura. Os botões já saem certos.

Guarda: `tests/whatsapp-da-loja.test.ts` (12 casos, com controle de que o bloco do
`schema.org` existe) e `tests/cadastro.test.ts`, que passou a esperar `'5584999990000'` e
`'(84) 99999-0000'`. Não confundir com o `PENDENCIAS-ABERTAS.md` §2.6, que é o **conteúdo** do
campo no banco do Bayron.

### 2.26 ✅ `[TÉCNICO]` O nome, o endereço e a foto do Bayron em toda barbearia — RESOLVIDO em 27/09/2026

**Achado ao vivo** no mesmo teste: numa barbearia chamada "Barbearia Teste", o lembrete da
agenda saiu *"Olá joao, aqui da Barbearia Bayron — lembrando do seu horário dia 28/09 às
09:00"*, com a prévia na tela, pronta para mandar. O teste mostrou também o slogan fixo no
rodapé; procurando a mesma família no código, apareceram mais cinco lugares. Nenhum estava no
`PENDENCIAS-ABERTAS.md` §4.7 — lá estão as comparações com `"Bayron"`; aqui o nome e o
endereço estavam **escritos**, sem comparação nenhuma:

| Onde | O que saía em toda barbearia | Agora |
|---|---|---|
| Lembrete do WhatsApp na agenda do dia | *"aqui da Barbearia Bayron"* (`lib/whatsapp.ts:60`, na época) | assinado com o nome da barbearia da agenda (`lib/whatsapp.ts:57-65`, chamado em `admin/dia/[date].astro:1616`) |
| Endereço canônico, `og:url`, e o `@id` e o `url` do `schema.org` | `https://bayron.alexandrefdev.tech`, a constante `SITE_URL` de `config.ts` | o endereço da barbearia servida (`lib/tenant.ts:249-253`): domínio próprio, subdomínio do produto ou, em desenvolvimento, o da requisição. Usado em `layouts/Layout.astro:27-28` e `components/Testimonials.astro:16` |
| Prévia do link (`og:image`) | a foto do Bayron (`/og.jpg`), no link de quem não subiu imagem | a imagem de compartilhamento da barbearia, senão a capa dela; sem nenhuma das duas, sem imagem. O `/og.jpg` só no site do Bayron (`layouts/Layout.astro:37-40`) |
| Convite de calendário | link e identificador em `bayron.alexandrefdev.tech`, arquivo `bayron-….ics` | o endereço da barbearia (`api/appointments/by-token/[token]/ics.ts:69-70`), arquivo `agendamento-….ics` (`api/appointments/by-token/[token]/ics.ts:76`) |
| `/portal`, `/cliente/entrar` e `/cliente` | *"Barbearia Bayron"* no título da aba, na descrição e no topo | o nome da barbearia (`portal.astro:21`, `cliente/entrar.astro:27`, `cliente/index.astro:26`) |
| Relatório impresso | *"Barbearia Bayron — Relatório"*, com a logo dele | o nome e a logo da barbearia; a logo empacotada, só no Bayron (`admin/relatorios.astro:28-30`, `admin/relatorios.astro:335-337`) |
| Rodapé do site | o slogan *"Respeito e precisão em cada detalhe."* | só no site do Bayron (`components/Footer.astro:196-198`) |

⚠️ **O custo aceito:** para o Bayron continuar com a foto de prévia e a logo do relatório,
entraram duas comparações novas com `"Bayron"` — `layouts/Layout.astro:37` e
`admin/relatorios.astro:30`. É o padrão que o `PENDENCIAS-ABERTAS.md` §4.7 quer eliminar, e
ele passou de oito para dez lugares. Quando o §4.7 for feito, estas duas entram na mesma
função.

Guarda: `tests/endereco-do-site.test.ts` — o endereço de cada caso (domínio próprio,
subdomínio, desenvolvimento, sem barbearia) e varreduras que reprovam importar uma constante de
endereço, o domínio do Bayron escrito em qualquer arquivo, *"Barbearia Bayron"* no código de
qualquer tela e o `/og.jpg` fora da comparação, com controle de que a varredura encontra os
arquivos. E `tests/whatsapp.test.ts`: as mensagens assinam com o nome que recebem, sem nome não
inventam um, e a agenda passa o dela.

### 2.27 ✅ `[TÉCNICO]` A agenda do dia vivia num expediente fixo de 08:00 às 19:00 — RESOLVIDO em 27/09/2026

**Achado ao vivo** no mesmo teste: a barbearia abre às 09:00, a grade de "Mover horário"
ofereceu 08:00, e a API recusou — *"Horário fora do expediente do barbeiro"*
(`api/admin/appointments/[id]/reschedule.ts:96`). O dono escolhe um horário que a própria tela
ofereceu e recebe erro. A grade era fixa: `START_HOUR = 8` e *"entre 08:00 e 19:00"*
(`admin/dia/[date].astro:18` e `:2008-2009`, na época). O contrário também valia: barbearia
que fecha às 21:00 não conseguia mover para depois das 19:00 pelo painel. E o cabeçalho
*"08:00 → 19:00"* da agenda vinha da mesma constante.

**O que mudou:** `lib/gradeDeHorarios.ts` monta a grade a partir do expediente **do barbeiro**
no dia da semana escolhido — de 15 em 15 minutos, dentro de cada janela, com o atendimento
inteiro cabendo antes do fechamento e o almoço de fora no turno partido. A página lê o
expediente da barbearia (`admin/dia/[date].astro:398-406`) e a grade sai dele (`:2032`); dia
sem expediente diz *"O barbeiro não trabalha neste dia."* (`:2034`). O cabeçalho e o "Dia
livre" mostram o expediente real, ou *"Sem expediente neste dia"* (`:614`, `:626-628`). E a
conversão do horário escolhido deixou de somar três horas à mão
(`PENDENCIAS-ABERTAS.md` §2.11).

**E um quarto efeito da mesma constante**, achado escrevendo este registro: **bloqueio fora de
08:00–19:00 sumia da agenda do dia.** A lista descartava o bloqueio sem altura na linha do
tempo fixa — linha do tempo que nem existe mais na tela. Visto rodando: o bloqueio das 19:30 às
20:30 era gravado e não aparecia na lista. Num dia sem agendamento, a tela ainda diria
*"Nenhum agendamento para este dia · Dia livre"* com a noite bloqueada — isso lido no código,
não visto. Agora a lista mostra todo bloqueio que toca o dia
(`admin/dia/[date].astro:268-269`).

Conferido depois, com o build de produção num navegador: grade de 09:00 a 18:00 num
expediente de 09:00 às 19:00, para um serviço de 60 minutos; mover para 09:15 gravou 12:15
UTC; e o bloqueio das 19:30 aparece.

⚠️ **O que não mudou:** a grade não conhece os outros agendamentos nem os bloqueios — nunca
conheceu. Horário ocupado aparece como livre, e o servidor recusa ao confirmar. O próximo
passo natural é a grade sair do mesmo cálculo de vagas do site.

✅ **O gráfico por hora do relatório, da mesma família, saiu no mesmo dia, à noite.** Contava só os
atendimentos que começavam entre 09:00 e 19:59 — o das 08:00 ou o das 20:00 sumia, sem
aviso. Agora conta as 24 horas (`admin/relatorios.astro:117`) e mostra do começo do primeiro
expediente ao fim do último, mais qualquer hora com atendimento fora dele
(`lib/gradeDeHorarios.ts:77`, usado em `admin/relatorios.astro:300`). Visto rodando: num
expediente de 09:00 às 19:00, as barras vão de 9 a 18 — antes, de 9 a 19, fixo.

⚠️ **Sobra:** a constante continua no topo da agenda (`admin/dia/[date].astro:21-23`),
alimentando cálculos que a tela não usa mais — a linha do "agora" e as linhas de hora da
linha do tempo antiga.

Guarda: `tests/grade-de-horarios.test.ts` — a grade começa na abertura, termina a tempo,
alcança a noite, respeita o turno partido e o dia de folga; a página usa o expediente, não
volta a cravar 08:00 → 19:00 nem a descartar o bloqueio pela linha do tempo (`:78`); e o
relatório não volta ao 09 → 19.

### 2.28 ✅ `[TÉCNICO]` Três textos que diziam o que não é — RESOLVIDO em 27/09/2026

Achados no mesmo teste. Nenhum quebra nada; os três fazem o dono ou o cliente acreditar numa
coisa falsa.

1. **Configurações dizia que a frase do topo era ignorada.** *"Frase de efeito — Guardada para
   uso futuro — o topo do site ainda não lê daqui"* e *"Texto abaixo do título — Idem"*
   (`admin/configuracoes.astro:39-40`, na época). Mas o topo usa os dois — a frase
   **substitui** o título grande e o texto vira o subtítulo (`components/Hero.astro:27-28`) —,
   e o medidor do próprio painel diz o contrário: *"É a primeira coisa que o cliente lê"*
   (`lib/completude.ts:129`). Quem acredita no aviso deixa o topo genérico. Agora: *"Frase do
   topo"* e *"Texto abaixo da frase"*, com o aviso verdadeiro
   (`admin/configuracoes.astro:43-44`) — o mesmo nome que o medidor cobra. E o exemplo do nome
   curto deixou de ser *"Bayron"* (`admin/configuracoes.astro:38`).
2. **O rodapé tinha "Termos de Uso" e "Políticas de Privacidade" apontando para `#`**, num
   site que coleta nome e telefone. Saíram até os textos existirem
   (`PENDENCIAS-ABERTAS.md` §1.2); o comentário no lugar diz por quê
   (`components/Footer.astro:189-192`).
3. **"1 agendamento considerados"** na agenda do dia — agora concorda
   (`admin/dia/[date].astro:575`, `:1528`).

Guarda: `tests/textos-do-painel.test.ts`, com controle de que o topo do site lê os dois campos
— sem ele, o caso do aviso passaria mesmo se o topo parasse de ler.

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

⚠️ **Atualizado em 25/09/2026:** a galeria saiu da lista do que se herda. Em `Gallery.astro`
a comparação decide agora só o avatar do cartão do Instagram (o logo empacotado, quando a
barbearia não subiu o dela); as fotos vêm da tabela `gallery_images` de cada barbearia
(migration 0005). Continuam oito componentes com a comparação.

⚠️ **Atualizado em 27/09/2026: agora são dez lugares.** O conserto do
`PENDENCIAS-ABERTAS.md` §2.26 tirou o nome e o endereço do Bayron de toda barbearia; para o
Bayron continuar com a foto de prévia e a logo do relatório impresso, entraram duas
comparações novas: `layouts/Layout.astro:37` e `admin/relatorios.astro:30`. Custo aceito de
propósito — as duas entram na mesma função quando este item for feito.

### 4.8 ✅ `[DECISÃO]` Dois caminhos para a barbearia nascer — DECIDIDO em 24/09/2026

**Autoatendimento, com 7 dias grátis e cartão no cadastro.** O dono se cadastra sozinho,
recebe o painel na hora e escolhe entre três layouts de site, com as cores dele.
Sobrevive o `/cadastrar`; o `/onboarding` e o
`/envios` saem (§4.15). A decisão, as duas alternativas rejeitadas e o que ela custa
estão em `PLANO-PRODUTIZACAO.md` §13.

**O que ela abriu:** os três layouts (§4.13), o teste e a cobrança (§4.14), a landing que
conta a história antiga (§4.15) e o endereço publicado sem revisão (§4.16). E adiantou
para o primeiro cadastro o prazo do contrato (§1.2) e da política de suporte (§1.4).

Os três bloqueios listados abaixo continuam valendo — mudaram de "motivo para não
decidir" para "o que tem que existir antes de abrir o cadastro" (§6).

<details><summary>Como a pendência estava antes da decisão</summary>

Encontrado em 15/09/2026, listando as rotas do monorepo — depois de o segundo já estar
construído.

| | Onde | O que faz |
|---|---|---|
| `/onboarding` | site de vendas | O dono manda nome, WhatsApp, endereço, serviços com preço, horários e **até 30 fotos**. Grava com protocolo num SQLite próprio. **Você** revisa em `/envios` e monta o site |
| `/cadastrar` | app da barbearia | O dono preenche quase os mesmos campos e a barbearia **nasce no ar na hora**, com os serviços e os preços dele |

**São dois produtos, não duas telas.** O primeiro é o que a landing vende, com todas as
letras, na tabela comparativa contra Trinks, AppBarber e Booksy:

> **Quem monta a sua página** — *eles:* você, sozinho, preenchendo formulário ·
> *aqui:* ✓ **Eu monto inteira, do zero**

E mais abaixo: *"Se você não preencher: não vai para o ar até estar bom."* O
autoatendimento põe o produto na coluna da esquerda — a do concorrente.

⚠️ **A contradição ainda não está no ar**, e é de propósito: `/cadastrar` só existe com
`CADASTRO_ABERTO=1`, e sem a variável a rota responde **404** — não 403, que anunciaria
que ela existe. O botão na landing obedece à mesma variável.

**O que trava o autoatendimento hoje, se a decisão for por ele:**

1. **Não existe cobrança** (§3.5). Cadastro aberto sem cobrar é barbearia fantasma
   ocupando endereço no domínio do produto, para sempre.
2. **Não existe contrato nem LGPD** (§1.2, adiado por decisão do dono). Desconhecido
   gravando dado de cliente dele no seu banco, sem termo aceito.
3. **Slug é endereço no seu domínio.** O primeiro estranho que pegar `bayron` fica com
   ele, e o que ele publicar é seu problema perante o Google.

**Decisão necessária: qual dos dois sobrevive.** Enquanto os dois existirem, os dois
precisam ser mantidos — e a landing precisa escolher uma história.

</details>

### 4.9 🔴 `[TÉCNICO]` A tela de agendar é branca quando não há serviço

Visto em 15/09/2026, servindo o site de uma barbearia recém-criada.

`/agendar` renderiza "Escolha o serviço — Passo 1 de 4" e **nada embaixo**. A árvore da
página tem três elementos: um `main`, um título e o contador. Sem lista, sem aviso, sem
saída.

**Não é caso raro.** O próprio provisionador diz que barbearia nova nasce sem serviço —
então **todo cliente novo tem, desde o primeiro minuto, um site com um botão grande
"RESERVAR HORÁRIO" que leva a uma tela em branco.**

O §4.1 cuidou das seções do site (*ou tem conteúdo, ou não é renderizada*) e deixou o
wizard de fora. A correção é um estado vazio que diga o que está acontecendo e ofereça o
WhatsApp da barbearia.

O `/cadastrar` reduz a janela — quem preenche preço no cadastro já nasce agendando — mas
não fecha: quem deixar tudo em branco cai aqui.

⚠️ **Subiu em 24/09/2026** (§4.8). Sem ninguém revisando antes de publicar, todo cadastro
com preço em branco vai ao ar assim, no primeiro minuto do teste grátis — que é quando o
dono decide se vai pagar.

### 4.10 🔴 `[TÉCNICO]` A página "Como fica" do site de vendas não tem nenhuma imagem

`/demo`, no site de vendas, é o destino do link do menu **e** do botão secundário do topo
("Ver como fica"). O que o visitante lê, quatro vezes:

> 01 O site — *Coloque a imagem em `public/demo/site.png`*
> 02 O agendamento — *Coloque a imagem em `public/demo/agendamento.png`*
> 03 Sua agenda do dia — *Coloque a imagem em `public/demo/agenda.png`*
> 04 Seu faturamento — *Coloque a imagem em `public/demo/relatorio.png`*

A página existe para mostrar como o produto fica, e mostra um recado para o
desenvolvedor. **Um dono de barbearia que clicar ali fecha a aba.**

As quatro imagens são print do sistema funcionando: site, wizard de agendar, agenda do
dia e relatório. Precisa de uma barbearia com serviços, agendamentos e faturamento —
senão são quatro telas vazias, o que é pior que o placeholder.

### 4.11 🟠 `[TÉCNICO]` A avaliação publica "0,0" e as estrelas são enfeite

Dois defeitos na mesma seção, vistos servindo o site em 15/09/2026.

**Publica nota zero.** Com `google_rating` vazio, a seção renderiza **"0,0 — Baseado em 0
avaliações"** com cinco estrelas douradas acesas, e emite `AggregateRating` no HTML com
`ratingValue: 0`. É a regra do §4.1.1 — *nenhuma seção meia-boca* — sendo quebrada pela
seção cujo próprio comentário no código a cita.

**As cinco estrelas não olham a nota.** `Testimonials.astro`: `Array.from({ length: 5 })`,
todas pintadas de `text-yellow-400`. Uma barbearia com 3,8 mostraria cinco estrelas
cheias. No Bayron (5.0) parece certo por coincidência.

Hoje nenhum dos dois está no ar, porque a seção inteira depende do `shortName === "Bayron"`
(§4.7). Os dois acordam no dia em que a seção for generalizada.

### 4.12 🟠 `[TÉCNICO]` O hover do botão padrão reprova no contraste

Medido em 15/09/2026:

| Token | Com branco |
|---|---|
| `--color-teal` `#0f766e` | 5,24:1 ✓ |
| `--color-teal-hover` `#0d9488` | **3,59:1** ✗ |

O `teal-hover` padrão é **mais claro** que o `teal`, e o texto branco em cima cai abaixo
do piso de 4,5:1. O botão fica legível parado e **piora quando o mouse passa por cima**.

Contradiz a regra da skill de paleta — *no site da barbearia o hover **escurece*** — que o
`derivarAccent()` obedece (vinho `#6b1f2a` → hover `#4f171f`). Quem não obedece é o **par
padrão**, usado por toda barbearia que ainda não escolheu cor — incluindo o Bayron.

Correção: um `--color-teal-hover` mais escuro que `#0f766e`. Muda a cor de todos os botões
do painel e do site padrão, então é decisão do dono.

### 4.13 🔴 `[TÉCNICO]` Três layouts de site — hoje existe um

Decidido em 24/09/2026 (`PLANO-PRODUTIZACAO.md` §13): o dono escolhe entre **três
layouts**, e **as cores são dele**. Hoje o site tem **um** layout, a paleta "Dark
Industrial" de `src/styles/global.css`, e o que muda de uma barbearia para outra é a cor de
destaque (§4.2, `lib/accent.ts`), o conteúdo e as fotos.

**Onde a escolha acontece — decidido em 27/09/2026:** no cadastro, antes do cartão, no
bloco "Sua marca" que o `/cadastrar` já tem. O site já nasce com o layout e a cor
escolhidos. Rejeitado: escolher no painel, depois de entrar — o cadastro ficaria mais
curto, mas o site nasceria no padrão e dependeria de o dono lembrar de trocar.
Recomendado junto: pedir a frase do topo no mesmo bloco. Detalhe, com o efeito no
medidor de completude, em `JORNADA-DO-BARBEIRO.md` §2.4.

**"Estilo" quer dizer estrutura** — ordem e forma das seções, topo com ou sem foto. Foi a
opção maior das duas que estavam na mesa: são três layouts para manter, testar e passar
no contraste, para sempre. Rejeitada: estilo como paleta sobre a mesma estrutura, porque
a paleta é do dono.

**O princípio das cores já existe, e vale estender:** o dono escolhe o tom, e
`derivarAccent()` ajusta só a luminosidade até o texto passar no contraste, preservando a
matiz (13 testes). Ele nunca consegue deixar o próprio site ilegível.

**Ainda falta decidir — e muda o tamanho do trabalho:**

- **Quantas cores.** Hoje é **uma**: como cor, `api/admin/settings.ts` só aceita
  `accentColor`. Se o dono quiser a principal e uma de apoio, são duas — e o painel, o
  banco e a derivação de contraste passam a lidar com um par, não com uma cor.
- **E o fundo.** Os três layouts são escuros, ou o dono pode ter site claro? Se o fundo
  também for escolha dele, a garantia de contraste deixa de ser uma cor sobre um fundo
  conhecido e passa a ser qualquer combinação — em três estruturas.

O que já vale, e passa a valer para os três:

- A regra do §4.1.1: seção sem conteúdo do cliente não aparece.
- A skill `barbearia-paleta`: cada layout tem que passar no contraste com **qualquer** cor
  que o dono escolher, não só com a padrão.
- `PLANO-PRODUTIZACAO.md` §2: três, nunca N. Pedido de um quarto, sob medida, é agência.

⚠️ **O site nasce sem foto** (`PLANO-PRODUTIZACAO.md` §13). No primeiro dia, o layout é
quase tudo o que o visitante vê. Layout que depende de foto grande no topo fica pior sem
ela do que um que não depende — e vai ser julgado exatamente sem ela. Dos três, pelo menos
um tem que ficar bom sem foto nenhuma, e ser o que o cadastro sugere.

Desde 25/09/2026 o dono sobe galeria, logo, capa e fotos de produto no painel logo depois
do cadastro — isso muda o segundo dia, não o primeiro minuto. E cada layout tem que tratar
a galeria como opcional: abaixo de 3 fotos ela não existe (`src/lib/galeria.ts`).

### 4.14 🔴 `[TÉCNICO]` O teste de 7 dias e a cobrança automática não existem

Decidido em 24/09/2026 (`PLANO-PRODUTIZACAO.md` §13). Conferido no código no mesmo dia:

- **Não há data de fim.** A barbearia nasce `active` e fica assim para sempre. O status só
  admite `active`, `suspended` e `cancelled` — no tipo (`lib/tenant.ts:37`) e numa trava
  `CHECK` da migration 0001. O teste precisa de migration.
- **Não há cobrança.** O desenho que existe contava com as primeiras assinaturas criadas
  à mão (`ARQUITETURA-COBRANCA-V1.md` §10); agora ela tem que nascer sozinha. A Asaas
  continua sendo o gateway (`ARQUITETURA-COBRANCA-V1.md` §4), e **exige CPF ou CNPJ** do
  dono — o `/cadastrar` não pede.
- **Não há conta na Asaas.** Conta PJ exige CNPJ (`ARQUITETURA-COBRANCA-V1.md` §11).
- **O cartão vem no cadastro** (decisão de 24/09, §1.3), e o número **nunca pode passar
  pelo seu servidor** — receber ou guardar cartão põe você dentro das exigências de
  segurança das bandeiras. O cadastro tem que entregá-lo direto para a Asaas, pela
  página de pagamento dela ou pela tokenização dela. **Conferir na documentação da Asaas
  qual das duas aceita cartão hoje e primeira cobrança daqui a 7 dias**, antes de
  desenhar a tela.
- **Não há suspensão que se veja.** O status `suspended` já tira o site do ar, mas com
  404; falta a página que diz o motivo (§3.5).

Depende do que acontece no oitavo dia (§1.3).

⚠️ **O webhook precisa de idempotência desde o primeiro cliente**
(`ARQUITETURA-COBRANCA-V1.md` §5.1). A Asaas reenvia o evento quando não recebe resposta,
e processar o mesmo pagamento duas vezes pode reativar uma barbearia suspensa.

⚠️ **Ninguém desenhou ainda onde o teste expira.** O desenho de dois aplicativos
(`ARQUITETURA-COBRANCA-V1.md` §2) continua de pé — a barbearia nunca sabe que dinheiro
existe —, mas quem sabe a data de fim do teste é o banco da barbearia, e quem sabe se
pagou é o outro aplicativo. A costura entre os dois é o primeiro desenho a fazer.

**Conferido na documentação da Asaas em 27/09/2026 — não testado em sandbox**
(`JORNADA-DO-BARBEIRO.md` §2.5):

- O **Checkout**, a página de pagamento hospedada pela Asaas, aceita cartão com cobrança
  recorrente e a primeira cobrança numa data futura — os 7 dias.
- ⚠️ **A tokenização não resolve** o cartão fora do servidor, ao contrário do que o item
  acima supunha: é uma chamada à API com os dados do cartão, autenticada pela chave da
  conta, que não pode ir para o navegador. Sobra o Checkout.
- **Três perguntas que a documentação não responde**, para o sandbox responder antes de
  qualquer tela: que evento chega no dia do cadastro, se nada é cobrado nele; se o cartão
  é validado no cadastro; e quais dados a página pede ao titular.

**A costura, proposta em 27/09/2026 e pendente de você** (`JORNADA-DO-BARBEIRO.md` §3.1
e `JORNADA-DO-BARBEIRO.md` §3.2): a barbearia nasce `pending` antes do cartão, o webhook a
passa para `trial` com a data de fim, e uma limpeza devolve o endereço das pendentes com
mais de 24 horas. E a pergunta de onde mora o código da cobrança — o aplicativo separado
do `ARQUITETURA-COBRANCA-V1.md` §2 ou um módulo isolado no app da barbearia; a
recomendação é o módulo, registrando a reversão. Junto com o teste, o painel precisa da
contagem dos dias e do botão de cancelar.

### 4.15 🔴 `[TÉCNICO]` A landing e o `/onboarding` contam a história antiga

**A landing.** Não é uma frase: é a tese da página. Conferido em 24/09/2026 em
`apps/vendas/src/pages/index.astro`:

| Linha | O que diz |
|---|---|
| `index.astro:93` | *"Pronto, no ar, sem você montar nada."* — no topo |
| `index.astro:168` | *"A diferença não é o site. É quem monta."* — título da comparação |
| `index.astro:185` | Quem monta: concorrente *"você, sozinho, preenchendo formulário"*; aqui *"eu monto inteira"* |
| `index.astro:188` | Se não preencher: concorrente *"fica no ar do jeito que estiver"*; aqui *"não vai para o ar"* |
| `index.astro:48` | Pergunta frequente: montar o site está incluso |
| `index.astro:243` | *"a montagem do seu site está inclusa"* |
| `index.astro:252` | No plano mensal: *"Site montado por mim, do zero"* |
| `index.astro:268` | No plano anual: *"Prioridade na fila de montagem"* |

⚠️ A linha 188 virou o contrário: no autoatendimento, *"fica no ar do jeito que estiver"*
é o que **este** produto faz. A comparação precisa de outro eixo — e o que sobra é o do
`PLANO-PRODUTIZACAO.md` §4: o site dele, com a marca dele, contra a página dentro do
aplicativo dos outros. Mais os 7 dias grátis e os três layouts. O texto é a sua voz; o
rascunho pode ser meu.

**O `/onboarding` e o `/envios`** (app de vendas) saem, para existir um caminho só.
Antes de apagar, conferir se o SQLite dele tem envio de verdade: quem mandou dados e
fotos por ali está esperando resposta.

**Achado em 27/09/2026, desenhando a jornada** (`JORNADA-DO-BARBEIRO.md` §2.1 e
`JORNADA-DO-BARBEIRO.md` §2.7):

- **O cartão de preço também conta outra história:** *"avisando 30 dias"*
  (`index.astro:250`), contra 7 dias grátis e cancelar pelo painel; *"Endereço próprio"*
  (`index.astro:252`), que se lê como domínio dele; e o plano *"Anual, à vista"*
  (`index.astro:262`), que o teste com cartão não comporta sem decisão. Recomendação:
  tirar o anual da primeira versão e oferecê-lo no painel depois do 8º dia.
- **O `/acessar`** (`apps/vendas/src/pages/acessar.astro:31`) pede o endereço do site e
  diz que o painel mora nele — o modelo de um painel por barbearia. Com o painel central,
  vira redirecionamento (`ARQUITETURA-MULTI-TENANT-V1.md` §8).

### 4.16 🔴 `[TÉCNICO]` Endereço escolhido e publicado sem revisão

No autoatendimento, qualquer um escolhe o endereço e o que escreve, e vai ao ar na hora
sob o seu domínio. Conferido em 24/09/2026: o provisionador só confere se o endereço é um
rótulo de DNS válido (`lib/provisionarBarbearia.ts:210`) e se já existe
(`lib/provisionarBarbearia.ts:237`). **Não há lista de reservados.**

- **Reservar** os nomes do próprio produto — `www`, `painel`, `admin`, `api`, `app`,
  `mail` e o nome da marca. Sem isso, o primeiro a se cadastrar como `painel` recebe o
  endereço do seu painel.

  Conferido em 25/09/2026 como isso acontece: `resolverHost()` (`lib/tenant.ts:174-176`)
  usa o primeiro rótulo de qualquer endereço como slug, e o middleware embrulha toda
  requisição que resolve. Com uma barbearia `painel` ativa, **a raiz de `painel.<dominio>`
  passa a mostrar o site dela** — no endereço que o dono de cada barbearia digita todo dia.
  A tela de login não muda (não lê marca de barbearia nenhuma) e o login continua
  funcionando: acha o barbeiro pelo telefone, e dali em diante quem decide é a sessão.
- **Tirar do ar** o que não pode ficar sob o seu domínio. O mecanismo existe no banco — o
  status `suspended` já some com o site —, mas acioná-lo hoje é abrir o `psql`.
- O primeiro a pegar o nome de uma barbearia de verdade, que ainda nem é cliente, fica
  com ele. Não tem conserto técnico barato; tem que caber no termo de uso (§1.2).

### 4.17 🟠 `[DECISÃO]` Recuperação de senha — e o e-mail que o cadastro não pede

Encontrado em 27/09/2026, desenhando a jornada do barbeiro (`JORNADA-DO-BARBEIRO.md` §2.2).

**Não existe "esqueci minha senha".** Quem troca a senha de um dono hoje é você, rodando
`scripts/set-admin-password.mjs` — o próprio script se apresenta como o caminho de suporte.
E o cadastro não pede e-mail (`apps/barbearia/src/pages/api/cadastrar.ts:61-74`): não há
para onde mandar link de troca, recibo ou aviso de cobrança.

No autoatendimento, a senha criada às pressas no cadastro é a que ele esquece, e cada
esquecimento vira um chamado — com o suporte tendo que caber em meia hora por cliente
(§1.4).

⚠️ **Até existir, a regra manual:** só troque a senha se o pedido vier **do próprio número
de login**. Qualquer um pode mandar WhatsApp dizendo ser dono de uma barbearia; o número
de login é a única prova que você tem. E trocar a senha **não derruba a sessão aberta** —
a revogação ficou de sobra da onda 1 (§6).

**Falta decidir o canal:**

- **Código pelo WhatsApp** — é o login dele, e ele lê. Exige o serviço de envio que o
  aviso antes de cobrar também exige (§1.3).
- **Link por e-mail** — mais barato de construir, e ele pode nunca abrir. Põe um campo a
  mais no cadastro.

Recomendação: um canal só para as duas coisas, recuperação e aviso de cobrança — um para
construir e manter, não dois.

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

⚠️ **Reordenada de novo em 24/09/2026**, pela decisão do autoatendimento (§4.8 e
`PLANO-PRODUTIZACAO.md` §13). A onda 2 de 15/09 — o fuso — virou a onda 3. A onda 3 de
15/09 — *antes de cobrar* — foi absorvida pela nova onda 2: sem ninguém no caminho,
cobrar é pré-requisito de abrir a porta, não etapa depois dela.

⚠️ **Reordenada em 15/09/2026, depois da auditoria completa.** A lista numerada abaixo é
anterior a ela e continua válida para o que sobrou; estas ondas vêm antes.

**Onda 0 — antes de qualquer deploy. ✅ FEITA em 22/09/2026.**
A data no fuso da barbearia (§2.10), `await` nas duas transações (§2.14) e a trava do backup
pela contagem de tenants (§2.8). Três mudanças minúsculas, três desastres diferentes — e
três guardas novas, porque a lição das três é a mesma: nenhuma delas aparecia em revisão de
código nem na suíte.

**Onda 1 — antes do segundo cliente. ✅ FEITA em 22/09/2026.**
Mídia por tenant (§2.9), papel na busca e revalidação da sessão (§2.13), escapar o JSON-LD
(§2.12), consertar o guarda de escopo (§2.17) — e, junto com o último, escopar as quatro
rotas que ele não enxergava. Sobra do bloco: a revogação de sessão por troca de senha. O
§2.7 (foto de produto) foi feito em 24/09, com a galeria.

**Achados de 25/09/2026, ✅ já consertados — eram da onda 0:** a transação dentro da
requisição (§2.19) e a agenda do dia sem resposta (§2.20). Os dois derrubariam o dia da
migração, e nenhum aparecia na suíte. Junto, o guarda de escopo por consulta (§2.18) e a
foto de celular (§2.21). Abertos no mesmo dia, para as ondas abaixo: §2.22, §2.23 e §2.24.

**Achados de 27/09/2026, no primeiro teste de ponta a ponta na máquina do dono, ✅ já
consertados:** o WhatsApp de toda barbearia nova (§2.25), o nome e o endereço do Bayron
(§2.26), a agenda do dia presa em 08:00–19:00 (§2.27) e três textos falsos (§2.28). Com eles
saíram os centavos (§2.15, do item 1 da onda 2) e os dois `+ 3` da agenda do dia (§2.11).
Os três que ficaram registrados — o `+ 3` do bloqueio, o `-180` da ocupação e o gráfico por
hora do relatório — saíram no mesmo dia, à noite, junto com um sexto lugar da conta, o calendário do
cliente (§2.11), e o ícone do Astro na aba de toda barbearia (`JORNADA-DO-BARBEIRO.md` §2.8).

**Onda 2 — antes de abrir o cadastro público.**
No autoatendimento a porta abre sem ninguém olhando, então nada aqui é opcional.

*Decisões suas, que o código não substitui:* o termo aceito no cadastro, com a cláusula
da cobrança do cartão (§1.2); o que acontece quando o cartão recusa (§1.3); a política de
suporte escrita na tela (§1.4); o domínio (§0); quantas cores o dono escolhe, e se o
fundo é dele ou do layout (§4.13); e o canal da recuperação de senha (§4.17). Propostas
em 27/09, também suas: o cartão antes de a barbearia existir, e onde mora o código da
cobrança (§4.14).

*Código, nesta ordem* — detalhada pelo caminho do barbeiro em
`JORNADA-DO-BARBEIRO.md` §5:

0. **Acrescentado em 27/09/2026:** a conta na Asaas e a prova no sandbox, antes de
   qualquer código da onda. É o único ponto que pode desmentir o desenho do cartão
   (`JORNADA-DO-BARBEIRO.md` §2.5). E abrir a conta não depende de código: se exigir CNPJ,
   é prazo que corre por fora (`ARQUITETURA-COBRANCA-V1.md` §11) — melhor começar já.
1. Os dois que já mordem hoje e tinham ficado fora de todas as ondas de 15/09:
   ~~os centavos do preço (§2.15)~~ — ✅ feito em 27/09 — e o combo em qualquer dia (§2.16). Junto, os três de 25/09
   que são uma linha cada: a semana do painel (§2.22), o login só com JSON (§2.23) e o
   resumo do combo (§2.24).
2. O que todo cadastro encontra no primeiro minuto: a tela de agendar vazia (§4.9) e o
   passo inútil do barbeiro único (§2.2).
3. Endereços reservados e um jeito de tirar do ar (§4.16).
4. Os três layouts, com as cores do dono (§4.13) — escolhidos no cadastro, antes do
   cartão (decisão de 27/09).
5. O teste de 7 dias, a cobrança e a página de suspensão (§4.14 e §3.5) — dependem do
   §1.3 e da conta na Asaas. Com eles, no painel, a contagem dos dias e o botão de
   cancelar.
   - **5b.** A recuperação de senha (§4.17) e o aviso antes de cobrar (§1.3), que usam o
     mesmo canal.
6. A landing, o `/acessar` e a aposentadoria do `/onboarding` (§4.15) — por último de
   propósito: ela descreve o produto pronto.
7. A página "Como fica" (§4.10) — as imagens têm que mostrar os três layouts, então vem
   depois deles.

**Onda 3 — antes do primeiro cliente fora do UTC-3.** *(Era a onda 2 em 15/09.)*
~~As contas de offset (§2.11) e o teste de fuso passando a pegá-las~~ — ✅ feitos em
27/09. Sobra a coluna `timezone` por barbearia (§2.1).


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
