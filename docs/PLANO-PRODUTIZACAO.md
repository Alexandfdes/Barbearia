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
