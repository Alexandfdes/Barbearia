# Plano — Produtização: de projeto sob medida a produto vendável

> Decisão de arquitetura e de go-to-market. Data: 2026-08-27.
> Status: **parcialmente substituído.**
>
> ⚠️ **A escolha de arquitetura deste documento foi REVERTIDA em 01/09/2026.** A
> tabela do §3 marca "SaaS comercial + instância isolada" como escolhido e
> multi-tenant como "destino futuro". Inverteu-se: multi-tenant é a decisão vigente
> — ver `ARQUITETURA-MULTI-TENANT-V1.md` e a skill `barbearia-multi-tenant`.
>
> ⚠️ **O preço deste documento está velho.** Vale `PRECIFICACAO.md`: R$ 100/mês,
> sem taxa de instalação, meta de 10 clientes.
>
> ⚠️ **O modelo de entrada deste documento foi substituído em 24/09/2026.** Onde se
> lê montagem assistida — a implantação do §6.1 ao §6.3, e "dono de barbearia não
> completa onboarding" no §2 —, vale o §13: **autoatendimento, com 7 dias grátis.**
>
> **O que continua valendo:** o posicionamento, o público-alvo, e o argumento de
> por que não competir por preço com aplicativo de agendamento.
> Arquitetura técnica: `docs/ARQUITETURA-PRODUTO-V1.md`.
> O que ainda **não** está decidido — preço inclusive: `docs/PENDENCIAS-ABERTAS.md`.

## 1. Contexto

O sistema nasceu sob medida para a Barbearia Bayron (Mossoró/RN), para substituir o
TopSalão. **O cliente não fechou.** Motivos declarados: (a) preço da mensalidade e
(b) percepção de que o TopSalão já resolvia.

Decisão: reaproveitar o sistema para vender a outras barbearias.

### Leitura da recusa — por que ela importa

Os dois motivos juntos descrevem uma disputa travada **no eixo do incumbente**. O
Bayron já tinha agendamento funcionando por ~R$40/mês. A oferta chegou como
agendamento — melhor, mas a mesma categoria. Na conta dele: trocar algo que funciona
por algo novo, não testado, de fornecedor de uma pessoa só, perdendo o histórico,
pagando igual ou mais.

Ninguém troca de fornecedor por empate. Para tirar alguém de um incumbente que
funciona é preciso ser muito melhor em um eixo que ele valoriza, ser muito mais
barato, ou resolver algo que o incumbente não toca.

Agravante a registrar: o Bayron era a venda mais fácil possível — cliente conhecido,
produto feito sob medida para a operação dele, contexto dominado. Se essa não fechou,
o problema não é volume de prospects, é enquadramento da oferta.

## 2. Decisão de modelo

Três modelos foram considerados.

| Modelo | O que é | Veredito |
|---|---|---|
| **Agência** (fork por cliente) | Copiar o repo e adaptar para cada barbearia | ❌ Rejeitado |
| **SaaS multi-tenant puro** | Um banco, `tenant_id` em tudo, cadastro self-service | ⏸ Destino futuro, não agora |
| **SaaS comercial + instância isolada** | Um código, uma imagem, um container/volume por cliente | ✅ **Escolhido** |

### Por que não agência

Com 10 clientes existem 10 bases divergentes. Corrigir uma falha de segurança vira 10
patches manuais; nunca mais é possível construir uma funcionalidade uma vez e vender
para todos; a margem é o tempo do desenvolvedor, que não escala; e o ativo vale zero
no dia em que o trabalho para.

### Por que não multi-tenant agora

Exigiria espalhar `tenant_id` por 47 endpoints — meses de refactor, com risco novo de
vazamento entre lojas, para resolver um problema que ainda não existe (zero clientes).
Além disso, dono de barbearia não completa onboarding self-service: não tem o logo em
PNG separado, não tem as fotos organizadas, não sabe o que é DNS. A implantação é
assistida de qualquer forma.

> ⚠️ **Vencido por decisão em 24/09/2026** (§13). O cadastro passou a ser sozinho. A
> parte do DNS deixou de valer por outro motivo: o subdomínio é nosso e nasce pronto.
> A parte do logo e das fotos continua verdadeira — e por isso o site nasce sem foto.

### O modelo escolhido

**Um código, um template, muitas instâncias, configuração no painel.**

- Uma única base de código. Uma única imagem Docker. **Nunca um fork por cliente.**
- Para cada cliente, um container com o volume dele (SQLite isolado por barbearia).
- A diferença entre a Barbearia X e a Barbearia Y não está em nenhuma linha de código:
  está no conteúdo da tabela `settings` e nos uploads dela.
- Comercialmente o cliente vive um SaaS: paga mensalidade, não vê código, não gerencia
  servidor, e recebe as funcionalidades novas quando saem.
- Isolamento total de dados sai de graça — é o que o SQLite por volume já dá.

Capacidade estimada: um VPS de 8GB comporta 20–30 instâncias, custo marginal por
cliente próximo de zero.

### A regra que separa produto de agência

O teste é a resposta a um pedido de cliente:

- *"Vou fazer isso pra você"* → agência. Morreu.
- *"Vou adicionar como opção que todo mundo pode ligar"* → produto.

Vale principalmente para o site, onde o instinto de agência puxa mais forte. Cada dono
vai querer um layout diferente. A disciplina é **um template, muito configurável**
(cores, logo, fotos, textos, ordem das seções, quais blocos aparecem) — não design sob
medida por cliente. Mais adiante, dois ou três templates. Nunca N.

## 3. Trabalho técnico

### 3.1 Matar o `src/config.ts` — o refactor que destrava tudo

Hoje `WHATSAPP_NUMBER`, `SITE_URL`, `INSTAGRAM_URL`, `ADDRESS`, `GOOGLE_MAPS_URL` e
`BUSINESS_HOURS` estão hardcoded em código. Somados a `src/data/depoimentos.json`,
`src/data/faq.json` e aos assets em `src/assets/`, são eles que fazem o repositório ser
"o site do Bayron" em vez de "um produto".

Plano em duas etapas, sem quebrar a instância atual:

1. Tabela `settings` + camada de leitura, tendo os valores atuais do Bayron como
   default. Nada quebra, nada muda visualmente.
2. Tela de configuração no admin, com upload de logo e fotos — a infraestrutura de
   upload já existe e funciona em `src/lib/uploads.ts` (usada pelos produtos).

**Nada desse trabalho é jogado fora na migração futura para multi-tenant.** É
exatamente a mesma camada de configuração por loja que o multi-tenant exigiria; muda
só de onde ela é lida. E chega lá já mapeada e testada em produção.

### 3.2 Provisionamento

Um `scripts/provision.mjs` que cria volume, roda migrations, semeia e configura env.
Objetivo: transformar cada venda em ~15 minutos de trabalho, não em um fork do repo.

### 3.3 Demo permanente

`demo.<dominio>` com os dados semeados, resetando toda noite. É o principal ativo de
venda — ver funcionando vale mais que qualquer descrição.

**O demo é uma barbearia fictícia, não a do Bayron.** Regras:

- Fotos de banco de imagem com licença comercial (Unsplash, Pexels). Nunca as fotos do
  Bayron: são a marca dele, os depoimentos são de clientes reais dele com nome e
  sobrenome, e mostrar isso para barbearias concorrentes na mesma cidade é indefensável.
- Nome fictício, conferido para não colidir com barbearia real da região.
- **Apresentar como modelo, nunca como cliente.** "Montei uma barbearia de exemplo pra
  você ver como fica" convence igual e é verdade. Dono de barbearia em Mossoró conhece
  as barbearias de Mossoró — passar exemplo por cliente custa a venda e a reputação.

Prova social real não precisa ser inventada: um sistema completo foi construído e
colocado no ar para uma barbearia de verdade nesta cidade. Isso pode ser dito. Vale
pedir ao Bayron autorização para citar como case — não custa nada e ele não tem motivo
para negar. Aí existe um demo genérico **e** um caso real.

## 4. Posicionamento

**O produto não é agendamento.** Agendamento é commodity: existem dezenas de apps e o
dono já usa algum. Enquanto a comparação for agendamento contra agendamento, o teto de
preço é o preço do concorrente e a oferta sempre parece cara.

O que o sistema entrega e os concorrentes não:

- **O site dele, no domínio dele, com a marca dele.** Concorrente entrega uma página de
  booking dentro do app *deles* — o dono nunca vira dono de nada.
- **Faturamento e relatórios.** Subestimado: barbearia pequena controla caixa em caderno.

Entrando por "sua barbearia não tem site", a âncora de preço deixa de ser a mensalidade
do concorrente e passa a ser o orçamento de agência — outra ordem de grandeza. O
agendamento deixa de ser o produto e passa a ser o motivo de a mensalidade continuar
existindo, em vez de ser uma venda única.

## 5. Alvo

**Barbearias sem sistema nenhum** — caderno de papel, WhatsApp e Instagram. É a maioria
das barbearias pequenas.

Sem incumbente não há custo de troca, não há comparação de preço e as duas dores são
explícitas: "eu não tenho site" e "eu perco horário no WhatsApp". Não se é a
alternativa a nada — se é a primeira solução.

Evitar, por ora, quem já tem sistema funcionando. Foi exatamente essa a briga perdida
com o Bayron.

## 6. Precificação

⚠️ **Nenhum valor está definido.** Esta seção define o *formato* da cobrança, não os
números — ver `PENDENCIAS-ABERTAS.md` §1.1, que é a pendência mais urgente do projeto.

Formato: **setup na entrada + mensalidade menor.**

- Setup cobre site, fotos, configuração e domínio. Paga o tempo de implantação e filtra
  curioso.
- Mensalidade cobre hospedagem, agendamento, backup e suporte.

Mensalidade única e cheia é o que trava a decisão — foi o motivo (a) da recusa do Bayron.

Para os três primeiros clientes: cobrar pouco, ou só o setup, em troca de depoimento
gravado e direito de uso como portfólio. Neste momento prova social vale mais que receita.

### 6.1 A implantação é uma linha de receita, não um favor

> ⚠️ **§6.1 a §6.3 ficam como histórico.** A taxa de instalação acabou em 30/08
> (`PRECIFICACAO.md` §2), e em 24/09 acabou a própria implantação (§13). Continua
> valendo a regra do §6.2 — *vender o preenchimento, nunca mudar o site* —, agora
> aplicada aos três layouts: escolher entre eles é produto, pedir um quarto é agência.

**O sistema é o produto (mensalidade). A implantação é o serviço (uma vez, na entrada).**

Implantação = buscar as fotos no Instagram do cliente, escolher as boas, cortar, tratar,
escrever os textos, cadastrar serviços e preços, configurar contato e horários, apontar
o domínio. É trabalho real, dá uma tarde, e é cobrado.

⚠️ **Precificar pelo tempo real.** Depois de perder uma venda por preço existe a
tentação de amassar o valor da instalação para fechar a próxima — e o resultado é
trabalhar de graça com mensalidade baixa. Não repetir o erro pelo outro lado.

### 6.2 Onde a implantação vira agência

A distinção que mantém isso escalável:

- ✅ Vender **o trabalho de preencher** — fotos, textos, cadastro, configuração.
- ❌ Vender **mudar o site** — outro layout, seção nova, comportamento diferente.

> **Teste operacional:** se a implantação inteira cabe no painel, sem abrir editor de
> código, é serviço em cima do produto. No minuto em que exige mexer no código, virou
> agência.

Este é o mesmo teste da §2, e não por acaso: é literalmente o critério de aceite da
Fase 6 em `ARQUITETURA-PRODUTO-V1.md` — "provisionar uma barbearia nova sem tocar em
`src/`". A arquitetura já foi desenhada para sustentar este modelo comercial.

### 6.3 Escopo por escrito

Na proposta, lista explícita do que está incluso. "Trocar essa cor?" é opção do painel,
tudo bem. "Botar um vídeo no topo?" não é. Sem a lista, cada cliente vira negociação.

Decidir **desde já**, antes do primeiro contrato: trocar as fotos daqui a seis meses é o
cliente que faz (com um vídeo de 10 min gravado uma vez) ou é serviço pago? Sem decidir,
vira suporte grátis para sempre.

### 6.4 Upsell: ensaio fotográfico

Foto de Instagram de barbearia costuma ser vertical, mal iluminada e de baixa resolução.
Parceria com fotógrafo local — ensaio de uma hora na barbearia, com comissão — melhora
o site drasticamente e o site melhor vira o material de venda da próxima barbearia.
Ciclo que se alimenta.

## 7. Roadmap

**Antes da primeira venda**
1. Corrigir o número de WhatsApp (ver §9).
2. `config.ts` → `settings` (etapas 1 e 2 do §3.1).
3. Demo permanente no ar.
4. Definir por escrito o escopo da implantação e a política de troca de fotos (§6.3).
5. Prospectar 5 barbearias em Mossoró sem site e sem sistema.

**Depois do primeiro cliente pagante**
6. Script de provisionamento.
7. Lembrete de WhatsApp 2h antes do horário. É a funcionalidade nº 1 da categoria e o
   n8n já está disponível no mesmo projeto do EasyPanel. Construir antes de ter cliente
   é otimizar no escuro.

**Não construir ainda**
- Multi-tenant, PWA, pagamento online, push nativo, importação de dados.

## 8. Gatilho de migração para multi-tenant

Revisar por volta de **15–25 clientes**, quando atualizar todo mundo doer de verdade.
Nessa altura haverá receita para bancar o refactor e requisitos vindos de cliente
pagante, em vez de suposição.

## 9. Pendências que bloqueiam a primeira venda

1. **`src/config.ts:6` — `WHATSAPP_NUMBER = "15551547238"` é um número de teste
   americano.** O próprio comentário no arquivo avisa. Alimenta todos os CTAs de
   WhatsApp: barra flutuante, rodapé, localização e tela de confirmação. O número real
   está no README (`+55 84 99905-1196` → `5584999051196`). Abrir o demo para um dono de
   barbearia e ele cair num número americano encerra a conversa.
2. **`src/config.ts` inteiro está hardcoded** — ver §3.1.

## 10. Armadilhas registradas

- **Os dados do banco local são sintéticos.** Os 617 agendamentos vêm de
  `scripts/seed-relatorio-demo.mjs`: nomes como "Alexandre Fernandes 2" e taxa de
  no-show **fixada em 8% na linha 194 do script**. Não usar esses números em material
  de venda — a taxa de no-show é ótimo argumento de ROI nessa categoria, mas o número
  precisa vir de uma barbearia real.
- **Custo de troca não resolvido.** O `AGENDAR-V1.md` decidiu "sem importação de
  histórico, começar do zero". Para o dono isso se traduz em "eu perco minha base de
  clientes". Enquanto for assim, todo incumbente ganha por inércia. Se algum dia o alvo
  incluir quem já usa sistema, é preciso oferecer migração assistida.
- **Nunca aceitar pedido de layout sob medida.** Ver a regra do §2.

## 11. Canais de distribuição

É onde o negócio ganha ou morre. Ordem de aposta:

1. **Porta a porta em Mossoró, com o demo no tablet.** Nesse mercado vence DM de
   Instagram com folga, e a vantagem local é real.
2. **Indicação dos barbeiros.** Emanuel e Jackson conhecem outros barbeiros da cidade —
   vale comissão por indicação.
3. **Fornecedor da linha Boris.** Visita várias barbearias por semana. É um canal
   inteiro, hoje inexplorado.

## 12. Decisão: construir primeiro, fechar domínio, contrato e suporte depois

> Data: **11/09/2026**. Decisão do dono do projeto, registrada aqui para encerrar a
> discussão e não voltar a ela a cada sessão.

**O que foi decidido.** Terminar o produto primeiro. A política de suporte
(`PENDENCIAS-ABERTAS.md` §1.4), o contrato e a LGPD (`PENDENCIAS-ABERTAS.md` §1.2) e o
registro do domínio (`PENDENCIAS-ABERTAS.md` §0) ficam para depois. O nome definitivo
ainda não está escolhido, e registrar domínio antes de decidir o nome é pagar por
endereço que não vai usar.

**Rejeitado: parar o desenvolvimento até os três estarem fechados.** Os três dependem de
decisão e de terceiro (advogado), e nenhum deles fica melhor por ser escrito antes de o
produto existir — política de suporte escrita sem saber quanto suporte o produto gera é
chute com aparência de decisão.

### O que esta decisão custa

Registrado agora para não parecer surpresa depois. Nenhum destes é argumento para
reverter — são o preço, e o preço foi aceito.

**1. O contrato não tem prazo "depois". Tem prazo: a primeira venda.**

No dia em que a primeira barbearia de terceiro paga, o banco passa a guardar nome,
telefone e **data de nascimento** dos clientes dela, sob a operação de vocês. Isso é ser
operador de dados pessoais de terceiros, e a exposição começa no primeiro dia — não numa
maturidade futura do produto. Adiar aqui é adiar até a véspera da venda, não até "quando
der".

⚠️ Esta é a única das três que não é reversível por esforço depois. Sem contrato, a
resposta para *"se eu sair, levo minha lista de clientes?"* é improvisada na frente do
cliente — e a resposta improvisada vira o contrato.

**2. A política de suporte não trava o lançamento; ela decide se existe margem.**

A R$ 100/mês (`PRECIFICACAO.md` §5.1), 1,5h de suporte por cliente/mês come 60% da
mensalidade; a R$ 110/h o valor-hora honesto, vira **prejuízo de R$ 75 por cliente**.
Lançar sem a política não impede vender — impede saber se vender vale a pena. Quem paga
o atraso é você, em horas não cobradas, e a conta só aparece no terceiro ou quarto
cliente, quando já é tarde para mudar o combinado.

Mitigação parcial já construída: o medidor de completude do painel
(`PENDENCIAS-ABERTAS.md` §4.4), feito em 10/09, existe justamente para o dono preencher
sozinho e gerar menos pergunta.

**3. Sem domínio escolhido, o site de vendas aponta para um endereço que não existe.**

O `SITE_URL` do produto usa `barbearianoar.com.br`, que **não está registrado**
(verificado livre em 30/08/2026). Enquanto o nome não for decidido, qualquer link
compartilhado, e-mail transacional ou print de tela carrega um endereço morto. O nome
entra em nota fiscal, contrato, e-mail e subdomínio de cliente: trocar depois de ter
cliente é migração, não renomeação.

*(Atualizado em 08/10/2026: o nome provisório é Fadeline, e o `SITE_URL` passou a
`fadeline.com.br` — também ainda não registrado. `PENDENCIAS-ABERTAS.md` §0.1.)*

**4. "Deixar o produto 100% primeiro" é a parte que merece desconfiança.**

Produto não fica 100% — a lista cresce enquanto se trabalha nela. Só na semana de
06 a 11/09 foram **fechados cinco** itens e **abertos quatro novos**
(`PENDENCIAS-ABERTAS.md` §2.4, `PENDENCIAS-ABERTAS.md` §2.5,
`PENDENCIAS-ABERTAS.md` §2.6 e `PENDENCIAS-ABERTAS.md` §3.7), todos achados por contato
com a
realidade: servir o site contra dois bancos, ensaiar a carga, ler o Dockerfile. Nenhum
deles apareceu por mais construção.

O critério honesto de parada não é "acabou", é **"um dono de barbearia consegue usar de
ponta a ponta sem eu do lado"**. Esse é verificável; "100%" não é.

### O gatilho que substitui a data

Os três itens continuam 🔴 em `PENDENCIAS-ABERTAS.md`, e 🔴 ali quer dizer "trava a
primeira venda" — o que esta decisão muda é a **ordem do trabalho**, não o fato de eles
travarem a venda.

Concretamente:

| Item | Quando deixa de poder esperar |
|---|---|
| Contrato e LGPD (`PENDENCIAS-ABERTAS.md` §1.2) | Antes de a **primeira barbearia de terceiro** pagar |
| Política de suporte (`PENDENCIAS-ABERTAS.md` §1.4) | Antes de **combinar o escopo** com o primeiro cliente |
| Domínio (`PENDENCIAS-ABERTAS.md` §0) | Antes de o **nome aparecer em qualquer lugar** que o cliente veja |

⚠️ **Os três gatilhos adiantaram em 24/09/2026** (§13). Com autoatendimento e 7 dias
grátis, todos acontecem no **primeiro cadastro**: o estranho guarda dado de cliente
desde o primeiro minuto do teste, vê o subdomínio na mesma hora, e não existe mais a
conversa onde o escopo seria combinado. A tabela acima fica como registro do que valia
no modelo assistido.

## 13. Decisão: autoatendimento, com 7 dias grátis

> Data: **24/09/2026**. Decisão do dono do projeto, registrada aqui para encerrar a
> discussão. Substitui o modelo de entrada assistido que este documento (§2 e §6.1 a
> §6.3) e o `ARQUITETURA-COBRANCA-V1.md` §1.1 defendiam.
> Status: **decidido, em implementação.** O que já existe no código está no fim —
> atualizado em 25/09/2026, com o cadastro abrindo o painel e as fotos.

**O que foi decidido.** Tudo automático, sem ninguém no caminho:

1. O dono da barbearia se cadastra sozinho: dados, serviços com preço, horário.
2. Recebe o painel na hora, já com as informações dele.
3. Escolhe entre **três layouts de site**. **As cores são dele**: ele diz quais são as da
   barbearia, e o sistema garante que o texto continue legível. **A escolha acontece no
   cadastro, antes do cartão**, e o site já nasce com ela — decidido em 27/09/2026;
   rejeitado escolher no painel, depois de entrar (`JORNADA-DO-BARBEIRO.md` §2.4).
4. **Cadastra o cartão para entrar**, e tem **7 dias grátis** antes da primeira cobrança,
   com o site no ar desde o primeiro minuto.

> ⚠️ **08/10/2026: os itens 3 e 4 mudaram** — um layout no lançamento, e o cartão pedido no
> fim do teste. Ver o fim desta seção.

**Rejeitado: rascunho com publicação manual.** O dono se cadastraria e entraria no
painel, mas o site só iria ao ar depois de você revisar. Mantinha a promessa da landing,
e põe uma pessoa no caminho de todo cliente novo — o pedido é que não haja nenhuma.

**Rejeitado: só você monta** (`/onboarding` e `/envios`, o fluxo do `FLUXO-COMPLETO.md`).
É o modelo que este documento defendia, com 3,5h de trabalho por cliente
(`PRECIFICACAO.md` §5). Não escala.

**Rejeitado: teste sem cartão.** Mais gente se cadastraria, e menos pagaria — e sobraria
mais barbearia abandonada ocupando endereço e guardando dado de cliente sem contrato.
⚠️ **Revertido em 08/10/2026:** o cartão passou para o fim do teste, com estes mesmos motivos
registrados como custo — ver o fim desta seção.

**Rejeitado: estilo como paleta de cores.** As cores são as da barbearia, escolhidas pelo
dono; o que ele escolhe entre três é a **estrutura** do site.

**Os argumentos contrários não foram refutados — foram vencidos por decisão.** Estão no
`ARQUITETURA-COBRANCA-V1.md` §1.1, e são o que reler se a conversão do teste vier baixa.

### O que continua de pé

- **O posicionamento do §4.** O produto continua sendo o site dele, com a marca dele — o
  que Trinks, AppBarber e Booksy não entregam: eles dão uma página dentro do aplicativo
  *deles*. Sai da história *quem monta*, não *o que se entrega*.
- **A regra do §2: "dois ou três templates, nunca N".** Os três layouts são exatamente
  isso. Layout é escolha entre três prontos, nunca estrutura sob medida para um cliente.
- **O princípio da cor que já está implementado:** o dono escolhe o tom, o sistema ajusta
  só a luminosidade até passar no contraste (`lib/accent.ts`). "As cores são dele" é
  esse princípio estendido — ele nunca consegue deixar o próprio site ilegível.

### O que esta decisão custa

Registrado agora, como no §12, para não parecer surpresa depois. Nenhum destes é
argumento para reverter — são o preço.

**1. O prazo do contrato e da LGPD adiantou: não é mais a primeira venda, é o primeiro
cadastro.** Com teste grátis, o estranho guarda nome, telefone e data de nascimento dos
clientes dele no seu banco desde o primeiro minuto — sete dias antes de pagar, ou sem
pagar nunca. E, sem ninguém no caminho, não há conversa onde o termo seria apresentado:
ele tem que ser aceito na tela de cadastro (`PENDENCIAS-ABERTAS.md` §1.2).

**2. O domínio e a política de suporte adiantaram junto.** O endereço aparece para o
dono no primeiro minuto, porque é o subdomínio dele (`PENDENCIAS-ABERTAS.md` §0). E o
§12 usava "combinar o escopo com o primeiro cliente" como gatilho da política de
suporte — esse momento não existe mais. Ela tem que estar escrita onde ele se cadastra
(`PENDENCIAS-ABERTAS.md` §1.4).

**3. A cobrança automática deixou de poder esperar.** O `ARQUITETURA-COBRANCA-V1.md`
§10 mandava criar as três primeiras assinaturas à mão no Asaas, com zero código. Sem
ninguém no caminho, não há quem crie: a assinatura tem que nascer sozinha
(`PENDENCIAS-ABERTAS.md` §4.14).

**4. A landing perde a tese, não uma frase.** O título da comparação é *"A diferença
não é o site. É quem monta."*, e o topo promete *"Pronto, no ar, sem você montar
nada."* Com autoatendimento, quem monta é o dono. São oito pontos da página que deixam
de ser verdade no dia em que o cadastro abrir, e um deles inverte: *"fica no ar do jeito
que estiver"*, que a landing atribui ao concorrente, passa a ser o que este produto faz
(`PENDENCIAS-ABERTAS.md` §4.15).

**5. A primeira impressão passa a ser o que o cadastro gerou.** É o segundo argumento do
`ARQUITETURA-COBRANCA-V1.md` §1.1, e ele enfraqueceu sem sumir. O `/cadastrar` já pede
serviços, preços e horário, então o site nasce agendando, e os três layouts dão cara
pronta. O que isso **não** resolve: o site nasce sem nenhuma foto — o `/cadastrar` continua sem
campo de foto, por decisão (ver *Fotos*, abaixo) —, e quem deixar os preços em branco cai
na tela de agendar vazia (`PENDENCIAS-ABERTAS.md` §4.9). Desde 25/09/2026 o dono sai do
cadastro já dentro do painel, onde sobe logo, capa, galeria e fotos de produto, e o
medidor de completude põe a galeria na lista. O primeiro minuto continua sem foto.

**6. Site publicado sem revisão é publicado sob o seu domínio.** Qualquer um escolhe o
endereço e o que escreve, e vai ao ar na hora. Sem endereços reservados e sem um jeito
de tirar do ar, o primeiro a pegar `bayron` fica com ele, e o conteúdo é problema seu
perante o Google (`PENDENCIAS-ABERTAS.md` §4.16). *(Os reservados existem desde 08/10/2026;
o jeito de tirar do ar, não.)*

**7. O cartão tem regra própria, e tem quem fica de fora.** O número do cartão **não pode
passar pelo seu servidor**: guardá-lo, ou só recebê-lo, põe você dentro das exigências de
segurança de cartão das bandeiras. O cadastro tem que entregá-lo direto para a Asaas
(`PENDENCIAS-ABERTAS.md` §4.14). E o alvo do §5 é barbearia sem sistema nenhum, que
controla tudo no caderno; parte desses donos não tem cartão de crédito no nome do
negócio, e débito em geral não serve para assinatura. Se muita gente desistir, é na tela
do cartão que vai aparecer. Cobrar automaticamente depois do teste também exige termo
claro sobre quando cobra e como cancelar — é exatamente o que vira reclamação quando não
está dito (`PENDENCIAS-ABERTAS.md` §1.2).

**8. As cores do dono valem nos três layouts.** O contraste hoje é garantido para **uma**
cor sobre **um** layout escuro. Com três layouts, cada um tem que passar com qualquer cor
que o dono escolher — e se ele puder escolher mais de uma cor, ou o fundo, o problema
cresce (`PENDENCIAS-ABERTAS.md` §4.13).

**9. O número que decide o negócio mudou.** Com montagem, o custo de entrada era o seu
trabalho: 3,5h por cliente (`PRECIFICACAO.md` §5). Sem montagem, esse custo vai a perto
de zero — e passa a decidir tudo **quantos dos que testam pagam no oitavo dia**. Esse
número não existe ainda. Os concorrentes que dão teste grátis servem de referência para
medir, não para supor.

### Fotos: no painel, logo depois do cadastro

> Data: **24/09/2026**, decisão do dono. Implementado em 25/09/2026.

O dono sobe as fotos **no painel**, depois que o cadastro cria a barbearia — não no
formulário do `/cadastrar`:

- **Galeria do site** (`/admin/galeria`) — o carrossel da página inicial. Até 20 fotos, na
  ordem que ele escolher; a seção só aparece a partir de 3 (`src/lib/galeria.ts`).
- **Foto de produto e de combo** (`/admin/produtos`, `/admin/combos`), cada barbearia na
  própria pasta (`PENDENCIAS-ABERTAS.md` §2.7).
- **Logo e capa** (`/admin/configuracoes`), que já existiam.

**Rejeitado: foto dentro do cadastro.** O formulário já pede dados, serviços com preço e
horário. Foto de celular pode passar de 5 MB (estimativa, não medido — por isso o limite
de envio é 12 MB), e subir várias pelo 4G põe o passo mais lento e mais sujeito a erro —
formato HEIC, arquivo grande, conexão caindo — justo antes de a barbearia existir: erro de
foto ali é cadastro perdido. E a foto precisa da pasta da barbearia para ser gravada, que
só existe depois do cadastro. No painel, cada foto sobe sozinha e mostra o próprio erro.

O que isto custa: o site continua nascendo sem foto (custo 5, acima). O cadastro deixa o
dono logado no painel e o medidor pede *"Suba fotos dos seus cortes"* — mas fazer é com
ele.

### O que já existe no código

Conferido em 24/09/2026, atualizado em 25/09/2026 e em 08/10/2026:

| Parte | Estado |
|---|---|
| Cadastro sozinho, com serviços, preços e horário | ✅ `/cadastrar`, fechado atrás de `CADASTRO_ABERTO=1` |
| Painel na hora | ✅ o dono sai do cadastro **já logado** no painel da barbearia nova (desde 25/09; antes entrava pelo login) |
| Fotos — galeria do site e foto de produto | ✅ 25/09, no painel, depois do cadastro (ver *Fotos*, acima) |
| Três layouts de site | ❌ existe **um**, escuro — e é o do lançamento, pela decisão de 08/10 (abaixo) |
| Cores do dono | ✅ **uma**, escolhida no cadastro com a prévia do topo do site desde 08/10, e trocada no painel; o contraste é garantido por derivação (`lib/accent.ts`, 13 testes) |
| E-mail do dono | ✅ pedido no cadastro desde 08/10, para a senha e os avisos — que ainda não existem |
| Cartão no cadastro | ❌ nenhuma linha de código — e, desde 08/10, pedido no fim do teste, não no cadastro |
| Teste de 7 dias | ❌ nenhuma data de fim. O status da barbearia só admite `active`, `suspended` e `cancelled` — no tipo (`lib/tenant.ts:37`) e numa trava `CHECK` da migration 0001 |
| Cobrança automática | ❌ nenhuma linha de código |

### O que muda nos outros documentos

Pela regra da casa, estes **não foram reescritos**: descrevem o que está no ar hoje, e
reescrever antes de implementar poria nos documentos um sistema que não existe. Cada um
ganhou, no máximo, um aviso apontando para cá.

- `ARQUITETURA-COBRANCA-V1.md` §1 — a "decisão central: checkout self-service,
  onboarding assistido".
- `ARQUITETURA-COBRANCA-V1.md` §1.1 — o argumento contra o autoatendimento.
- `ARQUITETURA-COBRANCA-V1.md` §3 — o fluxo pagar → formulário → você monta.
- `ARQUITETURA-COBRANCA-V1.md` §5.2 — os estados do tenant, que não têm teste grátis.
- `ARQUITETURA-COBRANCA-V1.md` §8 — duas linhas: teste com instância viva e cadastro sem
  pessoa no caminho.
- `ARQUITETURA-COBRANCA-V1.md` §10 — a ordem, que começava com assinaturas à mão.
- `PRECIFICACAO.md` §2 e `PRECIFICACAO.md` §5 — "a montagem está inclusa" e a premissa
  das 3,5h.
- `COMO-FUNCIONA.md` §6 — "por que a montagem é sua", e o passo "você monta".
- `FLUXO-COMPLETO.md` — o caminho `/onboarding` → `/envios` → você monta.
- `ARQUITETURA-PRODUCAO.md` — o nó "Implantação ~3,5h — você monta" do diagrama.
- `ARQUITETURA-PRODUTO-V1.md` — "mesmo com a implantação assistida", e "onboarding
  self-service" na lista do que não construir.
- `MONOREPO.md` — `/onboarding` e `/envios` no app de vendas, quando saírem.

### 08/10/2026 — o desenho do cadastro e da cobrança

> Decisões do dono em 08/10/2026, para começar o bloco grande: o teste, a cobrança, a cara
> do site no cadastro e a senha. Mudam os itens 3 e 4 da decisão de 24/09 e fecham cinco
> pendências. Cada uma foi escolhida entre opções apresentadas com o custo de cada lado.

**1. Um layout no lançamento, com a cor do dono escolhida no cadastro.** Os outros dois
layouts ficam para quando houver clientes pagando que peçam. Muda o item 3, que eram três.
Pesou: três estruturas para manter e passar no contraste com qualquer cor, para sempre,
antes de alguém pagar o primeiro mês. A cor é **uma**, e o fundo é o do layout — a
garantia de contraste que já existe (`lib/accent.ts`) cobre (`PENDENCIAS-ABERTAS.md` §4.13).

**2. O cartão é pedido no fim do teste, não no cadastro.** O dono entra só com o cadastro,
tem os 7 dias com o site no ar, e o painel pede o cartão antes do 8º dia. Muda o item 4 e
**reverte a rejeição do "teste sem cartão"** registrada acima. Os motivos daquela
rejeição continuam verdadeiros e viram o custo desta escolha:

- mais gente começa o teste, e menos gente paga;
- sobra barbearia abandonada ocupando endereço e guardando dado de cliente sem contrato —
  e falta a regra de quanto tempo a suspensa guarda os dados e segura o endereço
  (`PENDENCIAS-ABERTAS.md` §1.2);
- trazer de volta quem não cadastrou o cartão depende do aviso, e o canal escolhido é o
  e-mail (item 4).

O argumento a favor, que já estava registrado: quem não tem cartão de crédito desistia no
cadastro (`JORNADA-DO-BARBEIRO.md` §2.5).

**3. A cobrança mora num módulo do app da barbearia**, não num aplicativo separado. Reverte
o `ARQUITETURA-COBRANCA-V1.md` §2, onde a reversão está registrada com o motivo.

**4. O canal da recuperação de senha e dos avisos é o e-mail**, pedido no cadastro. Um canal
só para as duas coisas (`PENDENCIAS-ABERTAS.md` §4.17). Rejeitado: WhatsApp, que exige um
serviço de envio pago ou não oficial. Custo aceito: o dono pode não abrir o e-mail — e é por
ele que vêm o aviso do fim do teste e o de cobrança.

**5. Cobrança que falha dá 3 dias de carência.** O painel avisa e o site segue no ar; depois,
o site mostra "temporariamente indisponível", sem expor a dívida aos clientes da
barbearia, e o painel só abre a tela de regularizar. Nada é apagado; pagou, volta na hora
(`PENDENCIAS-ABERTAS.md` §1.3). Rejeitados: suspender na hora, e desligar só a agenda.
**Proposto, a confirmar:** o teste que acaba sem cartão segue a mesma regra.

**6. Só plano mensal no lançamento.** O anual vira oferta no painel depois do 8º dia, para
quem já viu o produto funcionando.

**O que muda nos outros documentos** — reescritos junto com o código de cada parte, e
marcados com um aviso até lá:

- os passos 4, 5, 9 e 10 da jornada: `JORNADA-DO-BARBEIRO.md` §2.4,
  `JORNADA-DO-BARBEIRO.md` §2.5, `JORNADA-DO-BARBEIRO.md` §2.9 e `JORNADA-DO-BARBEIRO.md` §2.10;
- as duas decisões do passo 5 e a ordem de construção: `JORNADA-DO-BARBEIRO.md` §3 e
  `JORNADA-DO-BARBEIRO.md` §5;
- as pendências: `PENDENCIAS-ABERTAS.md` §1.3, `PENDENCIAS-ABERTAS.md` §4.13,
  `PENDENCIAS-ABERTAS.md` §4.14, `PENDENCIAS-ABERTAS.md` §4.17 e a ordem do
  `PENDENCIAS-ABERTAS.md` §6;
- os estados do tenant: `ARQUITETURA-COBRANCA-V1.md` §5.2.

**Reescritos em 08/10/2026, com o código do cadastro novo:** `JORNADA-DO-BARBEIRO.md` §2.4
e `PENDENCIAS-ABERTAS.md` §4.13, e em parte `PENDENCIAS-ABERTAS.md` §4.17 — o e-mail é pedido;
a recuperação não existe.

