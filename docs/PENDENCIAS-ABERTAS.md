# Pendências em aberto

> Registro vivo do que ainda **não** está definido. Atualizado: 2026-10-13.
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
| **08/10** | **Nome provisório: Fadeline** — escolhido pelo dono entre 103 nomes conferidos no registro.br. Provisório tem prazo: vale até o cadastro abrir. Trocado no código no mesmo dia | `PENDENCIAS-ABERTAS.md` §0.1 |
| **09/10** | **O hover do par padrão escurece:** `#0b5f58`, o tom que o código já tinha como padrão — com os sete consertos do primeiro minuto do cliente, que você pediu. **E o combo vale no dia do HORÁRIO marcado, não no dia em que se agenda** — ⚠️ esta, decidida na implementação: falta você confirmar | `PENDENCIAS-ABERTAS.md` §4.12 e `PENDENCIAS-ABERTAS.md` §2.16 |
| **08/10** | **O desenho do cadastro e da cobrança:** um layout com a cor do dono; o cartão no fim do teste; a cobrança como módulo do app; e-mail para a senha e os avisos; 3 dias de carência; só mensal. **Feitos no mesmo dia:** o cadastro (§4.13, §4.16 e §4.17) e o teste de 7 dias, com a carência e o site fora do ar (§1.3, §3.5 e §4.14). **Em 09/10:** o e-mail — a senha nova, os avisos do teste e da cobrança e a troca de senha derrubando as sessões (§4.17 e §2.13) | `PLANO-PRODUTIZACAO.md` §13 |
| **10/10** | **A cobrança no código** — o cartão pelo Checkout da Asaas, o webhook e o cancelar —, **sem a prova no sandbox**. E três regras decididas na implementação e **confirmadas por você no mesmo dia**: quem cancela em dia fica no ar até o fim do período pago, sem carência; quem cancela com a cobrança atrasada fica só o que restava da carência, e a mensalidade que falhou deixa de existir; e quem sai do ar pela cobrança sem cancelar continua com a assinatura viva — a Asaas tenta o cartão de novo, e o pagamento que passar traz o site de volta. Rejeitado: remover a assinatura depois de 30 dias fora do ar | `PENDENCIAS-ABERTAS.md` §4.14 |
| **11/10** | **As quatro decisões do roteiro do dono:** o e-mail ao barbeiro do horário e ao dono quando o cliente agenda, desmarca ou remarca pelo site — cada um desligável na Equipe —; a data de nascimento continua sendo a senha da área do cliente, e o termo tem de dizer; o dono confere o ponto do mapa no Início; e o e-mail que não se troca fora do ar fica como está. O e-mail e o mapa foram feitos no mesmo dia | `PENDENCIAS-ABERTAS.md` §2.33 |
| **11/10** | **A exportação dos dados do dono — também fora do ar, com a data de nascimento e aviso na tela**, decidida por você. E, sem decisão nova, o que estava na fila dos próximos passos: o limite por telefone na área do cliente, a saúde para o monitor externo, a imagem sem as dependências de desenvolvimento e a troca do superusuário do banco, pronta para rodar. No caminho, dois defeitos que ninguém via: o backup restaurado voltava sem as permissões do app, e o provisionador nunca rodou no container | `PENDENCIAS-ABERTAS.md` §3.6, `PENDENCIAS-ABERTAS.md` §3.10, `PENDENCIAS-ABERTAS.md` §3.11 e `PENDENCIAS-ABERTAS.md` §3.12 |
| **11/10** | **O painel do operador:** a lista das barbearias, com a fase de cada uma, e três ações — estender o teste, tirar do ar, reativar —, cada uma registrada. **Entra só com senha, sem segundo fator: o risco foi dito e aceito por você.** Feito no mesmo dia. E o aviso sobre autorização de quem aparece nas fotos da galeria: não precisa — a responsabilidade vai para o termo | `PENDENCIAS-ABERTAS.md` §3.9 e `PENDENCIAS-ABERTAS.md` §1.2 |
| **12/10** | **O fuso de cada barbearia: nasce do estado escolhido no cadastro, e o dono troca em Configurações** — escolhido por você em 11/10, feito em 12/10. Rejeitados na implementação: o fuso em `settings`, que sob o RLS o cache das outras barbearias não enxergaria, e o campo livre, onde um nome errado derrubaria toda data. **E o cliente que pede para ser apagado tem os agendamentos anonimizados**, também decidido em 11/10 — não feito | `PENDENCIAS-ABERTAS.md` §2.1 e `PENDENCIAS-ABERTAS.md` §1.2 |
| **12/10** | **Os três próximos passos, escolhidos por você:** o backup saindo da VPS em partes, sem o arquivo inteiro na memória; o banco recusando dois agendamentos do mesmo barbeiro no mesmo horário; e a limpeza — as entregas antigas fora do repositório, o teste que mantém a cobrança longe das telas da barbearia e a grade de "Mover horário" só com os horários livres. Feitos no mesmo dia. Decidido na implementação — ⚠️ falta você confirmar: num banco que já tinha horário sobreposto, a trava vale a partir do fim do último par, em vez de o boot parar | `PENDENCIAS-ABERTAS.md` §3.3, `PENDENCIAS-ABERTAS.md` §2.37, `PENDENCIAS-ABERTAS.md` §4.6 e `PENDENCIAS-ABERTAS.md` §2.27 |
| **12/10** | **O painel do operador em telas, como o do barbeiro** — o Início com os números, a ficha de cada barbearia, a Cobrança, o Registro e o Sistema —, **e as anotações na ficha**, escolhidos por você; feitos no mesmo dia. Decididos na implementação — ⚠️ falta você confirmar: a anotação não se edita nem se apaga, e o "pede atenção" do Início mostra o teste a 3 dias do fim e quem cancelou a 15 dias de sair. No caminho, consertado: o JSON que ia ao banco como texto (§2.36) | `PENDENCIAS-ABERTAS.md` §3.9 e `PENDENCIAS-ABERTAS.md` §2.36 |
| **12/10** | **Depois da vasculhada geral, três escolhidos por você:** o conferidor de tipos zerado e no CI; estender a carência pelo painel do operador; e o rascunho da landing do autoatendimento, com o `/acessar` levando ao painel central — feitos no mesmo dia. Decididos na implementação: a carência estendida grava o fim novo e vale para um atraso só — o banco a apaga quando o atraso muda —; e o plano anual fora do rascunho. **O botão de apagar o cliente a pedido saiu da lista, por decisão sua — *"ninguém pede isso"*** | `PENDENCIAS-ABERTAS.md` §2.29, `PENDENCIAS-ABERTAS.md` §3.9, `PENDENCIAS-ABERTAS.md` §4.15 e `PENDENCIAS-ABERTAS.md` §1.2 |
| **13/10** | **Depois da explicação detalhada, seis escolhidos por você:** as quatro travas pequenas — o dia da semana sem o fuso do servidor, o `.env.example` completo, a sobra das 08:00–19:00 na agenda do dia e a nota "0,0" —; o aviso ao e-mail antigo quando o e-mail muda; o conferidor de tipos no site de vendas; as cores sugeridas da logo; o código de 6 dígitos no painel do operador, que você tinha deixado de fora em 11/10; e o ensaio da migração do Bayron com as 17 migrations — feitos no mesmo dia. O teste de carga ficou de fora, por escolha sua. **Decididos na implementação — ⚠️ falta você confirmar:** a nota do Google passa a aparecer no site de toda barbearia que preencher a nota e a quantidade, e não só no do Bayron, e sem JSON-LD de nota; e, com o segundo fator, a tela não diz se errou a senha ou o código. **Achado no caminho, consertado:** o encaixe manual da agenda do dia e a comanda pediam os serviços e as vagas à rota do site — no painel central, 404 em toda barbearia | `PENDENCIAS-ABERTAS.md` §2.1, `PENDENCIAS-ABERTAS.md` §2.27, `PENDENCIAS-ABERTAS.md` §2.38, `PENDENCIAS-ABERTAS.md` §4.11, `PENDENCIAS-ABERTAS.md` §4.17, `PENDENCIAS-ABERTAS.md` §2.29, `PENDENCIAS-ABERTAS.md` §4.2, `PENDENCIAS-ABERTAS.md` §3.9 e `ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2 |
| **13/10** | **Uma área principal por tela**, pedido por você: treze telas do painel do dono tinham duas — uma dentro da outra, que o leitor de tela anuncia como duas —, e as quatro telas de entrar, nenhuma. Agora cada tela tem uma, e a aparência não mudou: o CSS e o JavaScript saíram idênticos, e as fotos de antes e depois batem pixel a pixel, fora o que é dado vivo | `PENDENCIAS-ABERTAS.md` §2.39 |
| **13/10** | **Todo conteúdo do site numa área da página**, pedido por você: o topo de cinco telas — o agendar, a área do cliente (a de entrar e a de dentro), o link do horário e o portal — e o botão do WhatsApp estavam fora de qualquer área, e quem navega de área em área com o leitor de tela passava por cima. Eram seis telas, não as três do §2.39. A aparência não mudou | `PENDENCIAS-ABERTAS.md` §2.40 |

**Ainda pendente dentro dos itens acima:** registrar `fadeline.com.br` (livre em
08/10/2026 e de novo em 09/10, **não registrado**) e procurar o nome na busca de marcas do
INPI — classes 42, 35 e 44 — antes de gastar com logo. **E, descoberto em 09/10/2026:** para
os subdomínios terem certificado sem trabalho por cliente, o DNS do domínio tem que morar na
Cloudflare, não no registro.br — o certificado curinga só sai pelo desafio DNS-01, e o
registro.br não tem a API que o Traefik usa (`ARQUITETURA-COBRANCA-V1.md` §7.4). O mesmo DNS
recebe os registros do envio de e-mail (`PENDENCIAS-ABERTAS.md` §4.17). O código já usa o nome novo, desde 08/10: o
`NOME_PRODUTO` de `apps/vendas/src/config.ts` e o de `apps/barbearia/src/lib/produto.ts`,
que `tests/nome-do-produto.test.ts` mantém iguais; o `SITE_URL` é `https://fadeline.com.br`.
O domínio dos subdomínios não precisa de código: vem de `DOMINIO_BASE`. *(Até 08/10, este item era registrar `barbearianoar.com.br` e, para SEO,
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
tempo. *A feature existe desde 11/10/2026 — e abre até com o site fora do ar (§3.6). Falta a
cláusula.*

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

**10/10/2026 — as regras do cancelamento, para o termo** (confirmadas por você;
`PENDENCIAS-ABERTAS.md` §4.14): cancela-se pelo painel, a qualquer hora, inclusive com o site fora
do ar; em dia, o site fica até o fim do período pago; com a cobrança atrasada, só o que restava
da carência, e a mensalidade que falhou não é cobrada. E **sair do ar por falta de pagamento
não cancela a assinatura**: a Asaas tenta o cartão nos vencimentos seguintes, e o pagamento que
passar traz o site de volta. Esta é a que mais precisa estar escrita — é a que cobra quem achou
que tinha ido embora.

**11/10/2026 — a área do cliente, para o termo** (`PENDENCIAS-ABERTAS.md` §2.33): o cliente da
barbearia entra com o telefone e a data de nascimento, e vê os agendamentos dele, com o link
que desmarca e remarca. Mantido por você, com o risco: quem sabe os dois de alguém entra no
lugar dele. O termo do dono e o aviso de privacidade ao cliente têm de dizer.

**11/10/2026 — as fotos da galeria, para o termo.** O carrossel do site mostra as fotos que o
dono sobe em `/admin/galeria` — cortes de cliente, quase sempre com o rosto. Perguntado se a
tela da galeria devia lembrar o dono de que precisa da autorização de quem aparece: **não
precisa, decidido por você.** Sem o aviso na tela, sobra o termo: ele tem de dizer que a
autorização é do dono, que tira a foto e a publica — e o que acontece quando um cliente pede
para tirar a dele (o dono apaga na galeria; a foto sai do site na hora).

**12/10/2026 — o botão de apagar o cliente a pedido saiu da lista, por decisão sua:** *"ninguém
pede isso"*. Não vai ser construído. ⚠️ **O que fica:** o direito do cliente de pedir continua na
lei, com ou sem botão. Se um pedido chegar, o caminho é à mão — você, no banco de produção, nos
agendamentos e reservas daquele telefone, naquela barbearia —, e o termo ainda tem de dizer como o
cliente pede.

<details><summary>Como estava, até 12/10/2026</summary>

> **11/10/2026 — o cliente que pede para ser apagado, decidido por você:** os agendamentos dele
> são **anonimizados**, não apagados. **Não está feito** — nem a tela, nem a rota —, e o termo
> tem de dizer como o cliente pede. *12/10/2026: o desenho foi apresentado — um botão na tela
> Buscar cliente, só do dono; os agendamentos e as reservas daquele telefone, naquela barbearia,
> sem nome, telefone, nascimento e observações; o link de desmarcar deixando de valer; e, proposta
> minha ainda não decidida, o que estava marcado para frente desmarcado —, e ficou para depois,
> por escolha sua. Não alcança o backup já feito nem a planilha que o dono já exportou: o termo
> também tem de dizer isso.*

</details>

Pergunta nova, que o teste grátis cria: **o que acontece com os dados de quem testou e
não pagou?** Nome, telefone e data de nascimento de clientes de terceiro, guardados sem
contrato vigente. Guardar para sempre é exposição; apagar cedo demais perde quem só
esqueceu de pagar.

⚠️ **27/09/2026 — o rodapé fingia que os textos existiam.** O site de toda barbearia mostrava
"Termos de Uso" e "Políticas de Privacidade" apontando para `#`, num site que coleta nome e
telefone. Os dois links saíram (`PENDENCIAS-ABERTAS.md` §2.28) e voltam quando os textos
existirem, cada um com endereço próprio. Link que não leva a lugar nenhum é pior que link
nenhum: parece que a política existe.

### 1.3 ✅ `[DECISÃO]` O que acontece quando não paga — DECIDIDO E FEITO em 08/10/2026

> **Decidido em 08/10/2026** (`PLANO-PRODUTIZACAO.md` §13): cobrança que falha dá **3 dias de
> carência** — o painel avisa e o site segue no ar; depois, o site mostra "temporariamente
> indisponível", sem expor a dívida, e o painel só abre a tela de regularizar. Nada é
> apagado. E o cartão deixou de ser pedido no cadastro: vem no fim do teste. **Confirmado
> no mesmo dia:** o teste que acaba sem cartão segue a mesma regra. **E decidido junto:** o
> site fora do ar mostra o WhatsApp da barbearia; o painel fora do ar mostra também os
> próximos horários, para consulta; e o teste vai até o fim do 7º dia depois do cadastro.
> **Feito em 08/10/2026:** a regra roda no código (`apps/barbearia/src/lib/situacao.ts`); falta
> a cobrança que a dispara (§4.14). **Feito em 09/10/2026:** os avisos por e-mail — 2 dias
> antes do fim do teste, no começo da carência e quando o site sai do ar (§4.17). **Continua
> aberto:** quanto tempo a barbearia suspensa guarda os dados e segura o endereço (§1.2).
> **10/10/2026:** a cobrança que a dispara existe no código, sem a prova no sandbox (§4.14). E
> decidido: sair do ar pela cobrança **não cancela** a assinatura — a Asaas tenta o cartão nos
> vencimentos seguintes, e o pagamento que passar traz o site de volta; o termo tem de dizer
> (§1.2).

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
- ⚠️ **Cartão no cadastro: sim** — decidido em 24/09/2026, **revertido em 08/10/2026**: o
  cartão passou para o fim do teste (`PLANO-PRODUTIZACAO.md` §13). O dono cadastra o cartão para
  entrar, e a primeira cobrança só acontece depois dos 7 dias
  (`PLANO-PRODUTIZACAO.md` §13). Com isso, a pergunta de cima muda de forma: deixa de ser
  "e se ele não pagar" e passa a ser **"e se a cobrança no cartão falhar"** — recusado,
  sem limite, vencido, ou cancelado por ele.
- ~~**Aviso antes de acabar.** Quando, e por onde — o dono não abre e-mail; WhatsApp exige
  a Evolution API ou parecido, que hoje não existe no produto.~~ — ✅ por e-mail, decidido em
  08/10 e feito em 09/10/2026 (§4.17). O custo aceito continua: o dono pode não abrir o e-mail.

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

### 2.1 ✅ `[TÉCNICO]` Timezone — centralizado em 10/09/2026; o fuso de cada barbearia, FEITO em 12/10/2026

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

~~⚠️ **O que sobrou — e por isso o item não está fechado:**~~ ✅ feito em 12/10/2026, logo
abaixo. O texto de 10/09, de registro: variável de ambiente vale para **o processo inteiro**.
Enquanto cada barbearia tem a própria instância, está certo. No passo 6 de
`ARQUITETURA-MULTI-TENANT-V1.md` §9 — um processo servindo vários domínios — uma barbearia
em Manaus e outra em Mossoró não cabem numa variável só.

A correção definitiva é uma coluna `timezone` em `settings`, com o fuso vindo do tenant
como a cor de destaque já vem, e o `TZ` do módulo deixando de ser constante para virar
argumento das funções que formatam data. Centralizar agora é o que torna essa mudança
**um arquivo, e não vinte** — e o que faz o teste acima falhar se alguém espalhar de
novo enquanto ela não chega. *(12/10/2026: foram 51 arquivos. Centralizar deixou o fuso num
lugar só, mas cada data teve de passar a dizer de qual barbearia é.)*

Fora de `src/`, dois lugares ainda cravam o fuso e ficaram de fora de propósito:
`scripts/backup-daemon.mjs` (usa `process.env.TZ` — é o relógio do **container**,
decidindo a hora do backup, não o horário da barbearia) e
`scripts/seed-relatorio-demo.mjs` (gerador de dados de demonstração, com o offset
UTC-3 fixo). Nenhum dos dois afeta agendamento; entram junto com a coluna por tenant.

**Feito em 12/10/2026 — o fuso é da barbearia.** A decisão foi sua, em 11/10: o fuso **nasce
do estado** escolhido no cadastro, e o dono **troca em Configurações**.

- **Onde mora:** a coluna `tenants.timezone` (migration 0013), e não `settings`, como o
  parágrafo acima previa. Toda conta de data precisa do fuso — inclusive fora de requisição,
  como a tarefa dos avisos —, e a linha de `tenants` já fica em memória
  (`apps/barbearia/src/lib/tenant.ts`), lida sem `await` por `fusoDe(barbearia)`
  (`apps/barbearia/src/lib/timezone.ts`). Rejeitado: `settings` — sob o RLS, cada requisição
  só enxerga a linha da própria barbearia, e o cache das outras ficaria com o padrão, errado e
  calado.
- **A lista é fechada:** os 16 fusos do Brasil da base da IANA (`FUSOS_DO_BRASIL`), e o banco
  recusa qualquer outro (o `CHECK` da 0013). Rejeitado: o campo livre — *"America/Manus"*
  derrubaria toda data da barbearia com um `RangeError`. Dez dos 16 dão hoje a mesma hora
  (UTC−3), e cada estado fica com o seu mesmo assim: se o horário de verão voltar só no Sul e
  no Sudeste, muda o `America/Sao_Paulo` e não o `America/Fortaleza`, sem migration.
- **Os 27 estados** têm cada um o fuso da capital (`ESTADOS`). Os três com mais de um fuso — o
  Amazonas, o Pará e Pernambuco, com Noronha — ficam com o da capital, e o dono troca.
- **O cadastro pela web pede o estado**, num select obrigatório ao lado da cidade; sem ele, nem
  envia. A cidade é guardada como *"Cidade/UF"*, o formato que Configurações pede. O script
  (`scripts/provisionar.mts`) aceita `--estado`, a sigla no fim da cidade, como sempre, e
  `--fuso`, para a ponta de estado com outro fuso; sem nenhum dos três, recusa.
- **Configurações → Endereço → "Fuso horário"**: os 16, com o deslocamento de hoje (*"UTC−4"*)
  e *"Nesse fuso, agora são 22:41."* para o dono conferir antes de salvar. Grava só na
  barbearia da sessão, pela conexão do dono do banco — o papel do app só lê `tenants` —, num
  arquivo que faz só isso (`apps/barbearia/src/lib/fusoDaBarbearia.ts`, na lista fechada de
  `tests/rls.test.ts`), e descarta o cache: o site muda na hora.
- **O painel do operador** mostra o fuso de cada barbearia, e as datas de cada uma — o fim do
  teste, o teste estendido — saem no calendário dela; a hora dos eventos e das ações, no
  relógio do operador.
- **`TZ_BARBEARIA` não é mais lida.** O boot avisa se ela continua no servidor — e avisa alto
  se ela tinha outro fuso que não Fortaleza, porque a 0013 pôs as barbearias que já existiam no
  padrão da coluna, `America/Fortaleza`, o fuso que o processo usava (`scripts/startup.mjs`).
- **O `TZ` do módulo deixou de existir**, de propósito: sem ele, os 32 arquivos que o
  importavam pararam de compilar, e cada um — com os que chamavam as contas de prazo, 51 em
  `src/` — teve de dizer de qual barbearia é a data. Sobrou `TZ_PADRAO`, que só vale onde não
  há barbearia: a barbearia única sem requisição, o padrão da coluna e o relógio do operador.

**Achados no caminho, consertados:** na agenda do dia, a ficha do cliente mostrava a hora no
fuso da barbearia e a **data** no do navegador — um corte às 23:30 saía com a data do dia
seguinte —; o *"Hoje"* do calendário da agenda era o do navegador, e o botão levava a ele; e o
rodapé do site destacava o dia de hoje pelo relógio de quem abre o site, como o combo fazia
até 09/10 (§2.16).

**As guardas:** `tests/timezone-unico.test.ts` reprova, em `src/`, o nome de um fuso cravado,
o `TZ` exportado ou importado, o `TZ_PADRAO` fora da lista fechada, o fuso tirado do ambiente
ou do relógio de quem roda (`TZ_BARBEARIA`, `process.env.TZ`, `resolvedOptions().timeZone`) e a
data mostrada no navegador sem `timeZone`. `tests/fuso-por-barbearia.test.ts` põe Mossoró e
Manaus no mesmo processo: os horários livres, o agendamento, a agenda e o calendário do mês, a
remarcação pelo link, o e-mail do agendamento, o fim do teste e da carência, o painel do
operador, o cadastro, Configurações, o `CHECK` e a 0013 sobre um banco parado na 0012.

**Fora de `src/`:** o `scripts/backup-daemon.mjs` continua no `TZ` do container, de propósito —
é a hora do backup, não de barbearia nenhuma. E o `scripts/seed-relatorio-demo.mjs`, com o
offset fixo, é da era SQLite: importa o `better-sqlite3`, que não é mais dependência do app, e
não roda contra o banco de hoje. *Apagado em 12/10/2026 (§3.12).*

✅ **13/10/2026 — o dia da semana também saía do relógio de quem roda**, escolhido por você
entre as travas pequenas. Cinco lugares — o cálculo de vagas, o agendamento, os dois
reagendamentos e o título da agenda do dia — faziam `new Date(Date.UTC(y, m - 1, d, 12)).getDay()`:
o meio-dia UTC lido no fuso do PROCESSO. Certo com o servidor no Brasil ou em UTC; num servidor
com fuso de +12 horas ou mais (Fiji, Nova Zelândia), segunda virava terça — e o expediente que
decide as vagas era o de terça. **Visto rodando:** a suíte do commit anterior, com o processo em
`Pacific/Kiritimati` (+14), reprovava 9 testes do agendamento; depois da troca, as 1064 passam
assim. Os cinco usam `diaDaSemana` (`apps/barbearia/src/lib/calendario.ts`), que lê com
`getUTCDay`; o relatório e a grade de horários, que tinham cópias dela, também; e o
mini-calendário da agenda, no navegador — a regra não tem exceção para lembrar. A guarda:
`tests/timezone-unico.test.ts` reprova `getDay()` em `src/`, com um controle que põe o processo em
Kiritimati e mostra o erro de verdade.

### 2.2 ✅ `[TÉCNICO]` Wizard obriga escolher barbeiro mesmo havendo um só — RESOLVIDO em 09/10/2026

Era: "Escolha o barbeiro" sempre como passo 2 de 4, sem lógica de pular quando havia um
barbeiro só. No autoatendimento, todo cadastro nasce exatamente nesse caso: o `/cadastrar`
cria a barbearia com o dono e mais ninguém. O cliente dele passava por uma tela com um botão
só, e o contador anunciava quatro passos quando eram três.

**Feito:** com um barbeiro só no serviço escolhido — ou no serviço do combo —, ele é escolhido
sozinho e o cliente vai direto ao horário (`pages/agendar.astro:415-419`). O contador e os
pontos saem de `passosDoAgendamento()` (`lib/agendamento.ts:26`): "Passo 1 de 3" na barbearia
de um barbeiro só, "de 4" quando há escolha. A regra é por serviço — numa barbearia com dois
barbeiros, o serviço que só um deles faz também pula a tela. O cartão do serviço mostra a
duração no lugar de "1 barbeiro" (`pages/agendar.astro:281-284`): era a tela do barbeiro que a
mostrava. Na tela do horário, o "Voltar" vira "Alterar serviço", e o do topo volta ao serviço.

De carona, um defeito do mesmo "Voltar", que não estava registrado: no combo, o do topo apagava
o serviço do combo, e a tela respondia *"Este combo não está mais disponível"* — visto no build
anterior. Um lugar só limpa o serviço agora, e não no combo (`pages/agendar.astro:141`).

Guarda: `tests/agendar-primeiro-minuto.test.ts` — a regra dos passos como função, e o fonte da
página usando a regra em vez de reescrevê-la (o script da página não roda no vitest). Na tela,
conferido num navegador contra o build (`ESTADO-ATUAL.md` §8, 09/10).

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
justamente para não existir. **O número real está no README — e estava no comentário do
`src/config.ts`, até a constante sair em 09/10/2026: `+55 84 99905-1196` → `5584999051196`.**

O valor morava em dois lugares, e só um deles importa:

| Onde | Estado |
|---|---|
| `settings.whatsapp_number`, no banco | **É o que o site usa** — `Layout.astro` e `lib/settings.ts` leem daí |
| ~~`src/config.ts`, `WHATSAPP_NUMBER`~~ | Sobra morta, que ninguém importava — removida em 09/10/2026 (`PENDENCIAS-ABERTAS.md` §4.7) |

Corrigir o `config.ts` **não consertava nada** — é a linha do banco que aparece no site. E
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
| Bloqueio de horário (`admin/bloqueios.astro:211`, na época) | `Date.UTC(y, mo - 1, d, h + 3, min)` | o almoço das 12:00–13:00 gravava 11:00–12:00, e o site vendia o meio-dia com o barbeiro almoçando | `fromZonedTime` com o fuso da barbearia (`admin/bloqueios.astro:226-228`), que desce pelos dados da página (`admin/bloqueios.astro:71` e `admin/bloqueios.astro:205`) |
| Ocupação por faixa (`lib/occupancy.ts:63`, na época) | `utcOffsetMin ?? -180` — e nenhum chamador informava | a manhã (09:00–13:00) era medida uma hora antes: a ocupação do mês no relatório e a faixa ociosa que a agenda sugere para promoção saíam de outro horário | recebe a zona, não o offset, e converte cada horário por `fromZonedTime` (`lib/occupancy.ts:59` e `lib/occupancy.ts:73-87`) |
| O calendário do cliente, no agendamento (`agendar.astro:329`, na época) | `Date.now() - 3 * 60 * 60 * 1000` | das 23:00 à meia-noite, o calendário começava no dia seguinte — com o rótulo "Hoje" | a data de hoje no fuso da barbearia, pelo `Intl` do navegador (`agendar.astro:340-346`), com o fuso no `data-tz` do wizard (`agendar.astro:62`) |

O do bloqueio não era trocar uma linha: o script daquela tela era `define:vars`, que o Astro
entrega sem empacotar — sem `import`, sem `lib/timezone.ts`. Virou script processado, como o
da agenda do dia.

**A guarda passou a pegar a conta.** `tests/timezone-unico.test.ts:156` reprova, em todo `.ts`
e `.astro` de `src/` — scripts de página inclusive, comentários não —, a hora mais ou menos 3,
o `Date.UTC` com ± 3, o `utcOffsetMin` e o `-180`, as três horas em milissegundos e o
`getTimezoneOffset()`. O controle: rodada sobre a árvore de 27/09 de manhã, ela aponta os
seis lugares, cada um na linha certa; e não confunde a classe `h-3.5` do Tailwind nem o
`rotate-180`.

**Visto rodando**, com o servidor em `America/Manaus`: antes do conserto, o bloqueio das
12:00 às 13:00 foi gravado como 15:00–16:00 UTC — 11:00–12:00 lá — e o calendário, às 23:30
de uma segunda, abriu em *"Ter 29 · Hoje"*. Depois: 16:00–17:00 UTC, e *"Seg 28 · Hoje"*.

⚠️ **O que a guarda ainda não pega:** a classe 3 da skill `barbearia-fuso` — o dia lido no
fuso do processo com `getDay()`. O caso dela era o `PENDENCIAS-ABERTAS.md` §2.22, fechado em
09/10/2026, e o rodapé do site, em 12/10/2026 (§2.1); a classe continua sem guarda geral —
`tests/semana-do-painel.test.ts` olha o painel, e `tests/agendar-primeiro-minuto.test.ts`, o
combo e o rodapé. A data
lida em UTC com `toISOString().slice(0, 10)` tem a guarda dela (`tests/data-do-fuso.test.ts`).
E o fuso continuou um só por processo até 12/10/2026, quando passou a ser de cada barbearia (§2.1).

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

✅ **Trocar a senha derruba as sessões abertas — desde 09/10/2026.** O cookie passou a levar
quando foi emitido, e a troca grava `barbers.senha_trocada_em` (migration 0008): a sessão
emitida antes da troca deixa de valer na requisição seguinte
(`apps/barbearia/src/lib/session.ts`). Vale pelos três caminhos — o link do e-mail, a tela da
equipe e o `scripts/set-admin-password.mjs`. Quem troca a própria senha pela tela da equipe
recebe uma sessão nova na mesma resposta, e os outros aparelhos caem. Cookie de antes desta
versão vale até a primeira troca. *Como estava:* a reconsulta cobria demissão e
rebaixamento, não revogação por senha.

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
  (`a/[token].astro:73-75`), a área do cliente (`cliente/index.astro:104`) e o painel — início,
  reservas, agenda do dia, relatórios e a lista de agendamentos
  (`api/admin/appointments/index.ts:82`).
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

### 2.16 ✅ `[TÉCNICO]` O desconto do combo vale em qualquer dia da semana — RESOLVIDO em 09/10/2026

Era: `api/appointments/index.ts` resolvia o combo conferindo o `id`, o `active` e a barbearia,
e não o bitmask `weekdays` (`db/schema.ts`) — justamente o que define em que dias o combo existe.
O "Combo de segunda, 20% OFF" valia numa sexta para quem tivesse o link, sobre o serviço e o
produto, e entrava no relatório como receita normal.

**A decisão que a correção exigia — qual dia conta:** o do **horário marcado**, na barbearia.
"Combo de segunda" é desconto para encher a segunda: quem abre o link numa sexta pode marcar
para segunda, e não para sexta. *Rejeitado: o dia em que o cliente agenda* — deixaria quem abre
o link na segunda marcar com desconto para a sexta cheia. ⚠️ **Tomada na implementação, em
09/10/2026, sem você.** Se a intenção é a outra, a troca está numa linha: a data que
`api/appointments/index.ts:118` confere passa a ser a de hoje, e não a do horário.

**Feito, nas três pontas, com uma regra só** — `comboValeNaData()` (`lib/combo.ts:34`):

- **O servidor recusa** o horário fora dos dias do combo (`api/appointments/index.ts:118`),
  com o dia lido no fuso da barbearia: segunda 21h30 em Fortaleza já é terça em UTC, e vale.
  Combo sem dia nenhum marcado não vale em dia nenhum.
- **O calendário do `/agendar`** só abre os dias do combo (`pages/agendar.astro:477-479`), e o
  resumo diz quais são — *"Dias do combo: segunda"*. Quando nenhum dia dos próximos 30 abre —
  combo de domingo numa barbearia que não abre no domingo —, a tela diz isso, em vez de pedir
  que se escolha um dia (`pages/agendar.astro:498`).
- **A seção do combo na página inicial** acha o dia de hoje no fuso da barbearia
  (`components/ComboBoris.astro:31-36`). Era `new Date().getDay()`, o relógio de quem abre o
  site: com o navegador num fuso em que já era sábado, o combo da sexta sumia — visto no build
  anterior.

Guarda: `tests/combo-do-dia.test.ts`, contra o banco — terça recusada sem gravar nada, segunda
aceita com o desconto no serviço e no produto, os dois lados da virada do dia em UTC e o combo
sem dia. E `tests/agendar-primeiro-minuto.test.ts`, para a regra e para as duas telas.

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

### 2.22 ✅ `[TÉCNICO]` O gráfico da semana no painel depende do fuso do processo — RESOLVIDO em 09/10/2026

Era: `admin/index.astro` achava a segunda-feira com `getDay()` e `setDate()` — que usam o fuso
do **processo** — e formatava o resultado com o da barbearia. Visto ao vivo em 25/09/2026, com o
processo em UTC às 21h29 de Fortaleza: o gráfico mostrou **"SEG 20"** — 20/09/2026 foi domingo
—, e o card "Esta semana" e o gráfico erravam de semana das 21h à meia-noite. Só não aparecia em
produção com `TZ=America/Fortaleza` no container, e com uma barbearia fora de UTC−3 (§2.1) não
haveria `TZ` que servisse às duas.

**Feito:** a segunda-feira sai de `todayStr`, a data na barbearia, por conta de calendário em
que o relógio do processo não entra (`admin/index.astro:49`, `lib/calendario.ts:42`).

**Conferido ao vivo em 09/10/2026**, os dois builds lado a lado contra o mesmo banco, o processo
em UTC: às 21h01 de sexta, 09/10, em Fortaleza — já 00h01 de sábado em UTC —, o build anterior
mostrou a semana **04/10 — 10/10, com "SEG 4" num domingo**, o mesmo sintoma de 25/09; o novo,
05/10 — 11/10. Antes, às 20h28, com a barbearia em Tóquio, onde já era sábado: o anterior
mostrou "SEG 6" numa terça; o novo, a semana certa.

Guarda: `tests/semana-do-painel.test.ts` — a conta, o caso de 25/09 reproduzido (a conta antiga
dá o domingo 20/09; a nova, a segunda 21/09) e o painel sem conta de dia no relógio do processo.

### 2.23 ✅ `[TÉCNICO]` O login do painel aceita corpo que não é JSON — RESOLVIDO em 09/10/2026

Era: `api/auth/login.ts` lia `request.json()` sem conferir o tipo do corpo, e abria sessão. Com
o `checkOrigin` do Astro desligado (`astro.config.mjs`), um formulário de outro site manda
`text/plain` com o corpo em forma de JSON, sem pré-voo de CORS, e o navegador guarda o cookie
que volta: o visitante ficaria logado numa conta do atacante ("login CSRF"), e o que digitasse
depois iria para lá.

**Feito:** o login do painel recusa com 415 o que não é `application/json`, antes de ler o
corpo (`api/auth/login.ts:60`). O **login do cliente**, no portal de cada barbearia, tinha o
mesmo buraco e não estava registrado — recusa igual (`api/customer/login.ts:54`). O
`/api/cadastrar` já recusava desde 25/09.

Guarda: `tests/login-so-json.test.ts` — as duas rotas contra o banco (`text/plain` e formulário
recusados, sem cookie; a mesma credencial em JSON entra) e uma varredura: toda rota que abre
sessão pela credencial do corpo recusa antes de ler, com controle de que a varredura acha as
três. Conferido no código e nesses casos — não com um site de fora de verdade.

⚠️ **Isto não fechava o CSRF do painel**: era outro caminho, e mais grave — fechado no mesmo
dia (`PENDENCIAS-ABERTAS.md` §2.30).

### 2.24 ✅ `[TÉCNICO]` O resumo do combo diz "Combo Boris" e põe o nome do produto no HTML sem escape — RESOLVIDO em 09/10/2026

Era: o `/agendar` escrevia **"Combo Boris"** — o combo do Bayron — no resumo de toda barbearia
com combo, e montava o `innerHTML` com o nome do produto cru.

**Era pior que o registrado:** não só o produto — o nome do serviço, o do barbeiro e o do combo
também entravam sem escape no `innerHTML` do wizard inteiro. **Confirmado num navegador em
09/10/2026, contra o build anterior:** um produto chamado `Pomada <img src=x onerror=…>`
**executou o script** no `/agendar?combo=` da própria barbearia. Quem cadastra o produto é o
dono dela — e, no autoatendimento, qualquer pessoa é dono de uma. É o caminho que tirava do
papel o `PENDENCIAS-ABERTAS.md` §2.30.

**Feito:** todo nome que vai para o `innerHTML` do wizard passa por `escaparHtml()`
(`lib/html.ts:15`), e a linha do combo usa o nome do combo que o cliente abriu
(`pages/agendar.astro:589`).

Guarda: `tests/agendar-primeiro-minuto.test.ts` — o fonte do script sem nenhum nome fora de
`esc(`, com controle de que o guarda pega o nome cru, e nenhum "Boris" no código.

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
próprio painel pede o número com o 55 (`admin/configuracoes.astro:60`, *"Ex: 5584999051196"*)
— o cadastro não seguia a regra do painel.

**O que mudou, dos dois lados:**

- **Gravar:** o cadastro grava o número da loja com o 55 (`lib/provisionarBarbearia.ts:383`,
  `:384`). O telefone de login continua sem ele — é outra regra (`PENDENCIAS-ABERTAS.md` §1.5).
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
| Lembrete do WhatsApp na agenda do dia | *"aqui da Barbearia Bayron"* (`lib/whatsapp.ts:60`, na época) | assinado com o nome da barbearia da agenda (`lib/whatsapp.ts:57-65`, chamado em `admin/dia/[date].astro:1622`) |
| Endereço canônico, `og:url`, e o `@id` e o `url` do `schema.org` | `https://bayron.alexandrefdev.tech`, a constante `SITE_URL` de `config.ts` | o endereço da barbearia servida (`lib/tenant.ts:304-308`): domínio próprio, subdomínio do produto ou, em desenvolvimento, o da requisição. Usado em `layouts/Layout.astro:27-28` e `components/Testimonials.astro:16` |
| Prévia do link (`og:image`) | a foto do Bayron (`/og.jpg`), no link de quem não subiu imagem | a imagem de compartilhamento da barbearia, senão a capa dela; sem nenhuma das duas, sem imagem. O `/og.jpg` só no site do Bayron (`layouts/Layout.astro:37-40`) |
| Convite de calendário | link e identificador em `bayron.alexandrefdev.tech`, arquivo `bayron-….ics` | o endereço da barbearia (`api/appointments/by-token/[token]/ics.ts:70-71`), arquivo `agendamento-….ics` (`api/appointments/by-token/[token]/ics.ts:77`) |
| `/portal`, `/cliente/entrar` e `/cliente` | *"Barbearia Bayron"* no título da aba, na descrição e no topo | o nome da barbearia (`portal.astro:23`, `cliente/entrar.astro:27`, `cliente/index.astro:27`) |
| Relatório impresso | *"Barbearia Bayron — Relatório"*, com a logo dele | o nome e a logo da barbearia; a logo empacotada, só no Bayron (`admin/relatorios.astro:29-31`, `admin/relatorios.astro:336-338`) |
| Rodapé do site | o slogan *"Respeito e precisão em cada detalhe."* | só no site do Bayron (`components/Footer.astro:215-220`) |

⚠️ **O custo aceito:** para o Bayron continuar com a foto de prévia e a logo do relatório,
entraram duas comparações novas com `"Bayron"` — `layouts/Layout.astro:37` e
`admin/relatorios.astro:31`. É o padrão que o `PENDENCIAS-ABERTAS.md` §4.7 quer eliminar, e
ele passou de oito para dez lugares. Quando o §4.7 for feito, estas duas entram na mesma
função. ✅ *Entraram em 09/10/2026, com as outras oito (`PENDENCIAS-ABERTAS.md` §4.7).*

Guarda: `tests/endereco-do-site.test.ts` — o endereço de cada caso (domínio próprio,
subdomínio, desenvolvimento, sem barbearia) e varreduras que reprovam importar uma constante de
endereço, o domínio do Bayron escrito em qualquer arquivo, *"Barbearia Bayron"* no código de
qualquer tela e o `/og.jpg` fora da comparação, com controle de que a varredura encontra os
arquivos. ⚠️ *A varredura procurava só a frase "Barbearia Bayron", e o "Portal Bayron" e o
"Equipe Bayron" do mesmo `/portal` passaram por ela até 11/10/2026 (`PENDENCIAS-ABERTAS.md`
§2.34). Desde então ela reprova a palavra "Bayron" sozinha.* E `tests/whatsapp.test.ts`: as mensagens assinam com o nome que recebem, sem nome não
inventam um, e a agenda passa o dela.

### 2.27 ✅ `[TÉCNICO]` A agenda do dia vivia num expediente fixo de 08:00 às 19:00 — RESOLVIDO em 27/09/2026

**Achado ao vivo** no mesmo teste: a barbearia abre às 09:00, a grade de "Mover horário"
ofereceu 08:00, e a API recusou — *"Horário fora do expediente do barbeiro"*
(`api/admin/appointments/[id]/reschedule.ts:97`). O dono escolhe um horário que a própria tela
ofereceu e recebe erro. A grade era fixa: `START_HOUR = 8` e *"entre 08:00 e 19:00"*
(`admin/dia/[date].astro:18` e `:2008-2009`, na época). O contrário também valia: barbearia
que fecha às 21:00 não conseguia mover para depois das 19:00 pelo painel. E o cabeçalho
*"08:00 → 19:00"* da agenda vinha da mesma constante.

**O que mudou:** `lib/gradeDeHorarios.ts` monta a grade a partir do expediente **do barbeiro**
no dia da semana escolhido — de 15 em 15 minutos, dentro de cada janela, com o atendimento
inteiro cabendo antes do fechamento e o almoço de fora no turno partido. A página lê o
expediente da barbearia (`admin/dia/[date].astro:399-407`) e a grade sai dele (`:2032`); dia
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
(`admin/dia/[date].astro:269-270`).

Conferido depois, com o build de produção num navegador: grade de 09:00 a 18:00 num
expediente de 09:00 às 19:00, para um serviço de 60 minutos; mover para 09:15 gravou 12:15
UTC; e o bloqueio das 19:30 aparece.

~~⚠️ **O que não mudou:** a grade não conhece os outros agendamentos nem os bloqueios — nunca
conheceu. Horário ocupado aparece como livre, e o servidor recusa ao confirmar. O próximo
passo natural é a grade sair do mesmo cálculo de vagas do site.~~

✅ **Feito em 12/10/2026, escolhido por você:** a grade mostra só os horários livres — sem outro
atendimento confirmado ou concluído do barbeiro, nem bloqueio dele ou da casa, no caminho. A
agenda do dia escolhido vem do servidor — pode ser outro dia que não o da tela —, e a conta é a da
conferência do reagendamento, num lugar só (`horariosLivres` e `ocupacaoDoBarbeiro`, em
`apps/barbearia/src/lib/gradeDeHorarios.ts`). Mover 15 minutos por cima do próprio horário pode; o
horário em que ele já está aparece apagado. O servidor continua conferindo ao confirmar — e, desde
o mesmo dia, o banco (§2.37). Rejeitado: o cálculo de vagas do site (`/api/slots`), que responde
pelo endereço da barbearia, não pelo do painel, e conta a duração do serviço de hoje, não a do
atendimento. Visto num navegador, contra o build: no dia do atendimento, o horário de outro cliente
e o bloqueio do barbeiro saem da grade; noutro dia, saem os de lá — o cliente e o bloqueio da casa
toda — e os do dia da tela voltam; e o horário escolhido grava. Guarda: os casos novos de
`tests/grade-de-horarios.test.ts`, com 4 defeitos reintroduzidos que eles pegaram.

✅ **O gráfico por hora do relatório, da mesma família, saiu no mesmo dia, à noite.** Contava só os
atendimentos que começavam entre 09:00 e 19:59 — o das 08:00 ou o das 20:00 sumia, sem
aviso. Agora conta as 24 horas (`admin/relatorios.astro:118`) e mostra do começo do primeiro
expediente ao fim do último, mais qualquer hora com atendimento fora dele
(`lib/gradeDeHorarios.ts:77`, usado em `admin/relatorios.astro:301`). Visto rodando: num
expediente de 09:00 às 19:00, as barras vão de 9 a 18 — antes, de 9 a 19, fixo.

~~⚠️ **Sobra:** a constante continua no topo da agenda (`admin/dia/[date].astro:21-23`),
alimentando cálculos que a tela não usa mais — a linha do "agora" e as linhas de hora da
linha do tempo antiga.~~ ✅ **Tirada em 13/10/2026**, entre as travas pequenas, escolhidas por
você: a janela fixa, a conta da posição de cada atendimento, a linha do "agora", as linhas de
hora, a altura da hora no CSS e o clique num espaço vazio — com o menu que ele abria
("encaixar cliente", "bloquear 30 min", "bloquear 1 hora"), inalcançável desde antes de 06/09: o
elemento que ele escutava não existia mais. Agendar e bloquear continuam pelos botões de baixo
da agenda; o atalho está no histórico do git, se um dia quiser de volta. Visto no navegador,
contra o build: o título e o calendário do mês, o encaixe e o "Mover horário" — e foi conferindo
o encaixe que apareceu o §2.38. Guarda: `tests/grade-de-horarios.test.ts` reprova a volta de
qualquer um deles.

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
   (`admin/configuracoes.astro:52-53`) — o mesmo nome que o medidor cobra. E o exemplo do nome
   curto deixou de ser *"Bayron"* (`admin/configuracoes.astro:47`).
2. **O rodapé tinha "Termos de Uso" e "Políticas de Privacidade" apontando para `#`**, num
   site que coleta nome e telefone. Saíram até os textos existirem
   (`PENDENCIAS-ABERTAS.md` §1.2); o comentário no lugar diz por quê
   (`components/Footer.astro:208-213`).
3. **"1 agendamento considerados"** na agenda do dia — agora concorda
   (`admin/dia/[date].astro:576`, `:1528`).

Guarda: `tests/textos-do-painel.test.ts`, com controle de que o topo do site lê os dois campos
— sem ele, o caso do aviso passaria mesmo se o topo parasse de ler.

### 2.29 ✅ `[TÉCNICO]` Dependências com falha de segurança conhecida — RESOLVIDO na `monorepo` em 09/10/2026 e na `main` no mesmo dia; o site do Bayron no ar continua com elas

O `npm audit` de 09/10/2026 apontava, nos dois apps, falhas críticas e altas no que vai para
produção: o Astro 6 (XSS, SSRF pelo cabeçalho `Host`, desvio de autorização, execução remota
pela otimização de imagem AVIF), o adaptador Node 10 (um `Host` malformado derruba o servidor,
segundo o aviso — não reproduzido aqui) e o sharp 0.34 (libvips, libheif, librsvg). As
correções do Astro só existem na versão 7.

**Feito:** Astro 7.3.5, `@astrojs/node` 11.1.6 e sharp 0.35.5 nos dois apps; no da barbearia,
também o Vitest 4 — para o Astro, o Tailwind e os testes usarem um Vite só, o 8 — e o
`@types/node`, que faltava. O `npm audit` dá zero nos dois, no que vai para produção. Versões
publicadas há ao menos duas semanas, menos o sharp 0.35.5, a única com a correção.

O que o compilador novo mudou, e como foi conferido:

- **Recusa o que o antigo consertava sozinho.** O `<script>` do `/agendar` nunca tinha sido
  fechado, e o `Hero.astro` tinha um comentário HTML e uma `<div>` lado a lado num ramo do
  `? :`. Os dois pararam o build; estão consertados. `tests/astro-7.test.ts` compila todo
  `.astro` dos dois apps a cada rodada da suíte — o `npm run dev` só descobriria ao abrir a tela.
- **Espaço em branco.** O padrão novo (`compressHTML: 'jsx'`) apaga espaço entre elementos de
  linha. Os dois `astro.config.mjs` fixam `true`, a regra do Astro 6.
- **O HTML renderizado foi comparado** com o do Astro 6 — as mesmas páginas, contra o mesmo
  banco: 25 telas do app e 8 do site de vendas, iguais nó por nó, fora espaço entre blocos, que
  não aparece, a minificação dos scripts e o `charset` em minúsculas na página 404 do site de
  vendas. Nenhuma tela com erro de JavaScript ao abrir.

⚠️ **O npm 10 quebra ao mexer nessas dependências** (*"Cannot read properties of null (reading
'edgesOut')"*, um defeito dele com dependências pares). Os `package-lock.json` foram gerados com
o npm 11 e regravados com o npm 10 — o 11 grava um lock que o `npm ci` do 10 recusa, e o
`npm ci` do Docker é o 10. Os dois instalam com os dois.

⚠️ **A produção não tem nada disso.** O site do Bayron roda a `main`, que trava as mesmas
versões com falha — o `package-lock.json` da `main`, conferido em 09/10/2026: Astro 6.3.7,
`@astrojs/node` 10.1.1, sharp 0.34.5. Fecha com a migração (`ROTEIRO-MIGRACAO-PRODUCAO.md`) ou
com a mesma atualização na `main`, antes dela.

**`astro check`:** com o `@types/node`, de 674 erros para 356, quase todos em dois arquivos — os
scripts de `admin/dia/[date].astro` (264) e de `cadastrar.astro` (78). Erro novo em qualquer
outro arquivo agora aparece.

✅ **12/10/2026: zero**, escolhido por você. Os 356 saíram só com tipo — `as`, `!`, parâmetro
anotado e `apps/barbearia/src/lib/agendaDoDia.ts`, o formato que a agenda do dia manda para o
navegador, conferido nos dois lados. O site construído ficou **idêntico ao de antes, arquivo
por arquivo** (fora a chave aleatória que o Astro gera a cada build); a mesma comparação acusa
um ponto de exclamação a mais num aviso. E a conferência entrou no CI, antes da suíte: erro
novo reprova, e o deploy espera (`.github/workflows/testes.yml`; `apps/barbearia/tests/ci.test.ts`
reprova se ela sair). Rode com `npm run check`. ~~O site de vendas não tem o conferidor instalado.~~

✅ **13/10/2026, no site de vendas também**, escolhido por você. Eram 24 erros, todos do mesmo
tipo: faltava a descrição das funções do Node (`@types/node`) e a do `better-sqlite3` — nenhum
era defeito. Com as duas, zero; e o job do site de vendas no CI confere antes do build
(`apps/barbearia/tests/ci.test.ts` reprova se sair). Os quatro pacotes novos são só de
desenvolvimento; o lock foi gerado com o npm 11 e regravado com o 10, e o `npm ci` dos dois passa.

⚠️ **10/10/2026:** a `main` recebeu a correção com o merge do PR #1, em 09/10, e o app novo no
ar roda dela. **O site do Bayron, não** — e nunca rodou da `main` deste repositório, ao
contrário do que este item supunha: o serviço dele constrói do `Alexandfdes/Barbearia-Bayron`,
parado em 10/07 com o Astro 6.3.7 (visto no EasyPanel em 10/10; `ROTEIRO-MIGRACAO-PRODUCAO.md`
§0.2). Fecha com a migração, ou com a mesma atualização naquele repositório.

### 2.30 ✅ `[TÉCNICO]` Um script no site de uma barbearia age no painel de outra — o CSRF entre subdomínios — RESOLVIDO em 09/10/2026

Era: a sessão do painel é `SameSite=Lax` (`lib/session.ts:173`), e o `checkOrigin` do Astro
está desligado porque, atrás do proxy do EasyPanel, a conta dele não batia. O `SameSite` segura
o pedido de outro **site** — mas, para o navegador, `painel.fadeline.com.br` e
`qualquer.fadeline.com.br` são o mesmo site, e os sites das barbearias são esses subdomínios.
**Reproduzido em 09/10/2026, contra o build:** logado no painel da Barbearia Solo, o mesmo
navegador abriu o site de outra barbearia, e um `fetch` simples rodando ali cancelou um
agendamento da Solo. As 15 rotas `POST` do painel estavam no mesmo caminho — trocar a senha de um
barbeiro, criar e reagendar horário, mexer em serviço, produto e combo. Faltava só rodar script
num subdomínio, e o XSS do `/agendar` (§2.24) fazia isso.

**Feito:** o `src/middleware.ts`, antes de qualquer rota — antes do desvio das tarefas e de
decidir a barbearia —, recusa com 403 toda requisição que muda dado (tudo que não é GET, HEAD ou
OPTIONS) que não veio do próprio endereço (`lib/origem.ts`):

- com `Origin`, que todo navegador manda num `POST`, o nome dela tem que ser o do `Host` — só o
  nome: o esquema e a porta mudam atrás do proxy;
- sem `Origin`, o `Sec-Fetch-Site` tem que ser `same-origin` (ou `none`);
- sem nenhum dos dois não é navegador — o daemon dos avisos, um webhook — e passa: só o navegador
  da vítima tem o cookie dela.

A recusa sai no log com o motivo — *"[origem] recusado POST /api/admin/appointments/1/cancel: veio
de vinho.fadeline.test, endereço painel.fadeline.test"* —, e quem chamou recebe só que a
requisição não veio deste endereço.

**Conferido contra o build, em 09/10/2026:** o mesmo ataque, agora recusado, com o agendamento
intacto — no build anterior, cancelado. O próprio painel cancelando continua passando, o envio de
foto pelo painel (multipart) também, e os roteiros de ponta a ponta do e-mail (47 conferências) e
do primeiro minuto (28) passam inteiros, sem nenhuma recusa no log.

*Rejeitado:* religar o `checkOrigin` do Astro — ele monta a origem esperada com o esquema que o
servidor enxerga, que atrás do proxy não é o do navegador, o motivo de ter sido desligado. E
conferir rota a rota — quinze lugares para esquecer, e as quatro rotas sem corpo não teriam o que
conferir.

O site de vendas foi olhado também: a única escrita com sessão nele é um `PATCH`, que o navegador
não manda de outro endereço sem o pré-voo de CORS. Ficou como está.

⚠️ **O que continua valendo:** um XSS no site de uma barbearia ainda age naquele mesmo site — é
o endereço dele. E o painel num subdomínio do mesmo domínio dos clientes continua pedindo
cuidado: a defesa estrutural seria o painel num domínio só dele, o que mexe em DNS e certificado
— fica registrado, não feito.

Guarda: `tests/origem.test.ts` — o que passa e o que não passa, com o caso reproduzido, o
`Origin: null`, o domínio de cima e o nome que só começa igual; e o lugar da conferência no
middleware, antes do desvio e da barbearia.

### 2.31 🔴 `[TÉCNICO]` O cadastro não pode abrir no ar de hoje — conferido em 10/10/2026

Desde 10/10 o app está no ar no EasyPanel, com o cadastro fechado: sem `CADASTRO_ABERTO`, o
`/cadastrar` responde 404, como deve. Uma sessão de 10/10 registrou a intenção de abri-lo mesmo
com o §2.30 em aberto — mas o §2.30 já está fechado no ar: a `main` que o EasyPanel constrói
contém o conserto (conferido no GitHub nesta data). O que impede de abrir é outra coisa, e
cada item abaixo foi conferido no código ou nos documentos:

1. **O site que nasce no cadastro não abre com cadeado.** O certificado sai por endereço,
   quando alguém o adiciona ao serviço no EasyPanel — foi assim com o do painel. O subdomínio
   que o cadastro cria ninguém adiciona. O DNS curinga já existe; falta o **certificado
   curinga**, que só sai pelo desafio DNS-01 (`ARQUITETURA-COBRANCA-V1.md` §7.4). ~~E a tela
   final do cadastro diria *"o seu site está no ar"* assim mesmo~~ — ✅ desde 10/10 ela confere
   o endereço, do navegador do dono, antes de dizer; sem o certificado, diz *"quase no ar"* e
   não oferece divulgar (`JORNADA-DO-BARBEIRO.md` §2.8). A sessão de 10/10 propôs um clique no
   EasyPanel por barbearia nova, sem Cloudflare. Funciona — e é o que o
   `ARQUITETURA-COBRANCA-V1.md` §7.4 rejeitou em 09/10: o cadastro das 3 da manhã fica sem site
   até alguém clicar. Se for esse o caminho, a decisão é sua — e a tela final já não mente
   enquanto ninguém clica. *Não conferido abrindo um subdomínio novo — o acesso desta sessão ao domínio foi
   bloqueado. O teste: abrir no navegador um subdomínio que ninguém adicionou. Se abrir com
   cadeado, este item está errado.*
2. **Ninguém consegue pagar — ainda.** O código da cobrança existe desde 10/10 (§4.14), mas sem
   a prova no sandbox e sem as variáveis `ASAAS_*` no app; sem elas, a tela de assinatura
   continua dizendo *"Ainda não dá para pagar por aqui"* (`src/pages/admin/assinatura.astro`), e
   toda barbearia que entrar sai do ar no 11º dia.
3. **O e-mail não sai.** Sem `SMTP_URL`, o envio em produção recusa (`src/lib/email.ts`): a
   senha esquecida e os avisos do teste e da cobrança não chegam (§4.17).
4. **O backup não sai da VPS.** O diário grava em `/data/backups`, no mesmo disco, e só sobe
   para fora com as variáveis `S3_*` (`scripts/backup.mjs`), que o app novo não tem. O backup
   de volume do EasyPanel também grava na própria VPS. Perdido o disco, vai tudo (§3.3). *Desde
   12/10/2026 o envio vai em partes, pronto para ligar — faltam as variáveis.*

E dois que não são código:

- **O domínio é provisório.** O `DOMINIO_BASE` de produção é um domínio pessoal do dono, não o
  `fadeline.com.br` — que continua sem registro, com o nome ainda provisório (§0.1). Barbearia
  que entrar agora ganha um endereço que vai mudar, e endereço de barbearia vai para Instagram,
  cartão de visita e Google: trocar depois quebra o que ela já divulgou.
- **Os termos e o CNPJ** (§1.2 e `ARQUITETURA-COBRANCA-V1.md` §11).

**Para ligar o `CADASTRO_ABERTO=1`:** o certificado curinga provado com um subdomínio que
ninguém adicionou à mão; a cobrança de ponta a ponta no sandbox (§4.14); o `SMTP_URL`, com SPF
e DKIM, e uma senha esquecida recuperada de verdade; o backup chegando fora da VPS, e uma
restauração dele; o domínio definitivo; os termos na tela.

*Rejeitado:* abrir agora e ir consertando. No autoatendimento ninguém olha a porta: quem entrar
encontra o site sem cadeado no primeiro minuto e fora do ar no 11º dia — e a primeira
impressão de um produto novo não se refaz.

### 2.32 ✅ `[TÉCNICO]` O que o roteiro do dono achou na tela — RESOLVIDO em 10/10/2026

Achado em 10/10/2026, com o dono abrindo cada tela na máquina dele e mandando print: uma
barbearia nascida pelo cadastro só com o obrigatório — como faz quem tem pressa —, o site, um
agendamento, o painel e o site fora do ar. Nenhum dos defeitos abaixo aparecia na suíte, e o
guarda do rodapé que já existia (§2.28) procurava `href="#"`, não o link que fica vazio porque
o dado nunca foi preenchido.

1. **Três links de mapa vazios em toda barbearia do cadastro.** O "Traçar rota" do site, o
   endereço do rodapé e o "Abrir no Maps" da confirmação do agendamento usavam o `mapsUrl`
   direto. Só Configurações grava esse campo — o cadastro não —, então os três saíam com
   `href=""`, e clicar abria o próprio site de novo. Desde que o cadastro existe (15/09): o
   Bayron tinha o link preenchido. Agora os três saem de `apps/barbearia/src/lib/mapa.ts` — o
   link do dono, se houver; senão a rota, ou o lugar, buscados pelo endereço; sem nada para
   buscar, o botão some.
   ⚠️ O mapa da página e a rota saem da **mesma** busca. No roteiro, *"nova betania, natal"*
   caiu na Nova Betânia de **Mossoró**: endereço ambíguo erra os dois juntos, em vez de o mapa
   mostrar um lugar e a rota levar a outro. Conferir o ponto é do dono — desde 11/10, pelo
   Início do painel (§2.33).
2. **"Siga no Instagram" sem Instagram** — o link vazio também reabria o site. E **o texto
   "sobre" vazio** deixava um buraco no rodapé, que o medidor do painel usava de argumento:
   *"Vazio, sobra um buraco."* Agora os dois só aparecem preenchidos, e o medidor diz para que
   serve o texto (`apps/barbearia/src/lib/completude.ts:124`).
3. **"Agenda do dia" levava ao resumo.** O primeiro item do menu tinha o nome da agenda e o
   endereço `/admin`, que é o resumo; a agenda de verdade ficava atrás de um botão dele. Agora
   "Início" é o resumo, e "Agenda do dia" leva à agenda de hoje no dia da barbearia — o fuso
   dela, não o do servidor (`apps/barbearia/src/layouts/AdminLayout.astro:29-30`).
4. **"Reservas" eram de produto.** O botão do topo do site diz *"Reservar Horário"*, e o dono
   procurou os agendamentos ali. Agora o menu diz "Reservas de produto".
5. **O cadastro não falava do teste nem do cartão** — só a tela do fim. E quem tem medo de
   cobrança pode desistir antes de enviar. Agora, embaixo do título: *"7 dias grátis, sem cartão: ele
   só é pedido no fim do teste."* (`apps/barbearia/src/pages/cadastrar.astro:201`).
6. **A tela de assinatura sem a Asaas dizia** *"o cartão entra na próxima etapa do sistema"*,
   uma etapa feita no mesmo dia (§4.14). Agora: *"a cobrança pelo cartão ainda não foi
   ligada."*
7. **Configurações não dizia que os dois campos do mapa são opcionais**, nem que a "Busca do
   mapa embutido" passou a valer também para a rota. Agora diz — e é por ela que o dono
   conserta o ponto errado (`apps/barbearia/src/pages/admin/configuracoes.astro:77-78`).
8. **No `npm run dev`, a tela final do cadastro diz sempre "quase no ar".** Não é defeito: o
   servidor de desenvolvimento do Astro 7 recusa a imagem que ela pede ao endereço novo — um
   403 *"Cross-origin request blocked"*, de `astro/dist/vite-plugin-astro-server/sec-fetch.js`
   —, e no build ela confere de verdade. Visto na máquina do dono e reproduzido com o
   `astro dev`. Anotado em `apps/barbearia/src/lib/noAr.ts` e no `CLAUDE.md`; a segurança do
   Astro ficou como está.

Guarda: `apps/barbearia/tests/roteiro-do-dono.test.ts`, 15 casos — os do mapa chamando a
função, os das telas lendo o fonte, com controle. Desfeito cada conserto, 13 reintroduções,
as 13 vermelhas. E contra o build, 22 conferências em duas barbearias — uma só com o
obrigatório, outra com Instagram, texto e o link de rota do dono —, sem link vazio e sem erro
de JavaScript.

Vistos no mesmo roteiro e já registrados: a landing e o `/acessar` contando a história antiga
(§4.15), e o termo que o cadastro não pede (§1.2).

### 2.33 ✅ `[DECISÃO]` O que o roteiro do dono deixou para você decidir — DECIDIDO em 11/10/2026

Achados no roteiro do §2.32, conferidos no código, e decididos por você no dia seguinte.
Nenhum era defeito de código: cada um era uma escolha de produto, com custo.

1. ✅ **O barbeiro não ficava sabendo de agendamento novo — agora recebe e-mail. Feito em
   11/10/2026.** Até então nada avisava: com a agenda do dia aberta, ela se atualizava
   sozinha a cada minuto (`apps/barbearia/src/pages/admin/dia/[date].astro:2711`); fechada,
   o dono que não abria o painel descobria o cliente novo quando ele chegava na porta.

   **Decidido:** e-mail, por enquanto — o WhatsApp fica para quando for orçado. Sai quando o
   cliente **agenda, desmarca ou remarca** pelo site; recebe **o barbeiro do horário, se
   tiver e-mail, e o dono**, que vê todos — na barbearia de uma pessoa só, um e-mail por
   mudança. O dono liga ou desliga, por pessoa, na tela da Equipe — o barbeiro não tem tela
   própria (`barbers.avisar_agendamentos`, migration 0011; nasce ligado, inclusive para quem
   já existia). *Rejeitados por você:* só o dono; e só o barbeiro, que deixaria sem aviso
   quem não tem e-mail — na equipe, quase todo mundo.

   **Como ficou** (`apps/barbearia/src/lib/avisoDeAgenda.ts`): o e-mail diz quem, quando —
   no fuso da barbearia —, o serviço, o preço, com quem, o WhatsApp do cliente e o link da
   agenda daquele dia; não leva a data de nascimento nem o link que desmarca. O que o
   barbeiro faz pelo painel não avisa ninguém, e o duplo clique — a mesma chave de
   idempotência — não avisa duas vezes. O e-mail que não sai nunca derruba o agendamento:
   vira uma linha `[agenda]` no log. **De carona:** desmarcar pelo link passou a conferir e
   desmarcar num comando só (`apps/barbearia/src/pages/api/appointments/by-token/[token]/cancel.ts`)
   — antes, dois cliques ao mesmo tempo podiam responder os dois "desmarcado", e com o aviso
   seriam dois e-mails.

   ⚠️ **Em produção, nada sai sem o provedor de e-mail** (§4.17) — o mesmo bloqueio da senha
   nova e dos avisos do teste.
2. ✅ **A data de nascimento continua sendo a senha do cliente — mantido por você em
   11/10/2026.** A área do cliente entra com telefone e data de nascimento
   (`apps/barbearia/src/pages/api/customer/login.ts`) e lista os agendamentos com o link de
   cada um, que desmarca e remarca. O risco, aceito: telefone e aniversário não são segredo —
   quem sabe os dois de alguém vê onde e quando ele corta o cabelo, e desmarca. **Por isso o
   termo tem de dizer** como o cliente entra e o que a área mostra (§1.2). ✅ *Feito em
   11/10/2026, a sugestão que estava aqui:* além do limite por endereço de rede, o telefone tem
   cota própria — 5 tentativas a cada 15 minutos e 10 por dia, por barbearia
   (`apps/barbearia/src/pages/api/customer/login.ts`). Com ~23 mil datas possíveis para um
   adulto, varrer todas leva anos; antes, com muitos endereços de rede, não havia limite. ⚠️ O
   custo: qualquer um bloqueia por um dia a área do cliente de um telefone, errando de propósito
   — agendar continua funcionando. E o limite mora na memória do processo
   (`apps/barbearia/src/lib/rateLimit.ts`): zera a cada deploy. Guarda:
   `apps/barbearia/tests/area-do-cliente-limite.test.ts`.
3. ✅ **O ponto do mapa — agora o dono confere. Feito em 11/10/2026.** O Início do painel
   mostra ao dono o mapa que o site mostra, com a busca que o Google usou, e pergunta: *"Está
   certo"* ou *"Não está — corrigir o endereço"*, que leva a Configurações
   (`apps/barbearia/src/pages/admin/index.astro`). Lá, embaixo do endereço, a prévia do mapa
   acompanha o que ele digita (`apps/barbearia/src/pages/admin/configuracoes.astro`). A
   resposta guarda a **busca** conferida (`settings.mapa_conferido`, migration 0011; a rota é
   `apps/barbearia/src/pages/api/admin/mapa-conferido.ts`): mudou o endereço, a pergunta volta
   sozinha. O site, o Início e Configurações montam o mapa pela mesma função (`embedDoMapa`,
   em `apps/barbearia/src/lib/mapa.ts`). Só o dono vê; barbearia sem endereço não tem mapa
   nem pergunta. ⚠️ Toda barbearia que já existe — o Bayron inclusive, depois da migração —
   vê a pergunta uma vez.
4. ✅ **Fora do ar, o e-mail não se troca — fica como está, decidido por você em
   11/10/2026.** A tela de assinatura mostra para onde vão os avisos e esconde o "Trocar"
   quando o site está fora do ar (`apps/barbearia/src/pages/admin/assinatura.astro:136`),
   porque nessa fase o painel só abre ela. Quem digitou o e-mail errado no cadastro só corrige
   depois de pagar — e pagar funciona fora do ar. *Rejeitado:* um campo para trocar o e-mail
   na própria tela de assinatura.

Guarda: `apps/barbearia/tests/aviso-de-agenda.test.ts` e
`apps/barbearia/tests/mapa-conferido.test.ts` — 30 casos; 29 reintroduções, as 29 vermelhas.
Duas não ficaram na primeira tentativa, e isso mudou o teste e o código: o admin inativo
recebendo o aviso passava — o inativo do teste era barbeiro, que não recebe de qualquer
jeito —, e o desmarcar duplo também — cinco cliques ao mesmo tempo não produziram a corrida
no teste; o desmarcar virou um comando só, e o caso em sequência passou a pegar. Contra o
build: 26 conferências no navegador, e a 0011 aplicada pelo `scripts/startup.mjs` sobre um
banco parado na 0010.

### 2.34 ✅ `[TÉCNICO]` O portal de toda barbearia dizia "Portal Bayron" — RESOLVIDO em 11/10/2026

**Achado por você**, no mesmo roteiro, com print: o `/portal` da "tour-teste" — a página do
botão "Portal", no topo de todo site — tinha o título *"Portal Bayron"* e o cartão *"Equipe
Bayron"*, numa barbearia que não é dele. O conserto de 27/09 (§2.26) trocou a aba, a
descrição e o topo dessa página e deixou os dois: a guarda procurava só a frase *"Barbearia
Bayron"*, e nenhum dos dois a contém.

**Agora** o título e o cartão dizem o nome curto da barbearia, ou o nome inteiro quando o
curto está vazio (`apps/barbearia/src/pages/portal.astro:23-24`). A guarda de
`apps/barbearia/tests/endereco-do-site.test.ts` passou a reprovar a **palavra** "Bayron"
sozinha no código de qualquer tela — comentário não conta —, com controle: ela pega
*"Portal Bayron"* e *"Equipe Bayron"*, e deixa passar `ehOBayron(t)`, `avatarBayron` e o nome
do arquivo da logo, que são do mecanismo do §4.7, não texto na tela. Conferido na varredura:
os dois do portal eram os únicos. Desfeito o conserto, cada um dos dois fica vermelho; e
contra o build, o portal de uma barbearia recém-cadastrada diz o nome dela, e "Bayron" não
aparece na página (o E2E do §3.9).

### 2.35 ✅ `[TÉCNICO]` Configurações dizia que a galeria, os serviços e a cor "ainda não" se editavam — RESOLVIDO em 11/10/2026

O rodapé de Configurações dizia: *"A galeria de fotos da página inicial continua vindo do
código, junto com os depoimentos, as perguntas frequentes e o catálogo de serviços — é a próxima
fase. A cor de destaque já existe no banco, mas o site ainda não a lê"*. Três das quatro coisas
já se editavam havia semanas: a Galeria e os Serviços têm tela própria no painel, e a cor está
na mesma página, acima do rodapé — e o site a lê (§4.2). O dono que acreditasse não subiria foto
nenhuma. Achado montando a exportação, na mesma tela. Agora o rodapé diz só o que é verdade —
depoimentos e perguntas frequentes não existem no painel, e por isso o site dele não tem essas
duas seções —, com o link da Galeria e dos Serviços
(`apps/barbearia/src/pages/admin/configuracoes.astro`). Guarda:
`apps/barbearia/tests/exportacao.test.ts`, e o E2E do §3.6.

### 2.36 ✅ `[TÉCNICO]` O JSON ia ao banco como texto — o corpo dos eventos da Asaas e o registro do operador — RESOLVIDO em 12/10/2026

**Achado escrevendo o teste das telas do operador** (§3.9): os dados de teste, gravados como o
código gravava — `${JSON.stringify(x)}::jsonb` —, voltavam do banco como **string**, não como
objeto. O `::jsonb` deixa o parâmetro tipado como jsonb, e o driver (postgres.js) serializa
parâmetro jsonb com `JSON.stringify` — de novo, por cima do texto que já era JSON: o banco recebia
`"{\"a\":1}"` e gravava um texto entre aspas. Só não acontecia depois de o Drizzle tocar a
conexão, porque ele troca esse serializador por um que passa o texto como está. Conferido num
script e na suíte: na mesma conexão, a mesma linha sai string antes do Drizzle e objeto depois.

Por isso o defeito dependia de quem chegava primeiro no processo — e o webhook da Asaas e o
painel do operador não passam pelo Drizzle no começo da requisição. Depois de um deploy, a Asaas
reenvia de uma vez o que ficou na fila. **O que ele estragava:**

- **O registro das ações do operador** (`acoes_do_operador.detalhe`, desde 11/10). O "reativar"
  lê ali como a barbearia estava antes de sair do ar; com a string, não achava — e perguntava,
  como se ela tivesse sido tirada do ar fora do painel. A resposta ficava com quem estivesse na
  tela: "em dia" para uma que estava em teste a trazia de volta como paga, sem ter pago. E as
  últimas ações perdiam o *"estava no teste"* e os dias da extensão.
- **O corpo dos eventos da Asaas** (`webhook_events.payload`, desde 10/10). Até 12/10 nada do
  app lia dentro dele — só quem olhasse pelo `psql` (§4.14) —, mas as telas novas leem: o valor e
  o meio de pagamento, e os pagamentos do mês.

**Agora** é `::text::jsonb`, nos cinco lugares que mandavam só `::jsonb`
(`apps/barbearia/src/lib/cobranca.ts` e `apps/barbearia/src/lib/operadorBarbearias.ts`) e na
anotação, que já nasceu assim: o parâmetro vai tipado como texto, o driver o manda como está, e
o banco o lê como objeto — com ou sem Drizzle. A migration 0014 converte de volta as linhas que
o defeito gravou, nas duas tabelas; a que não é JSON — o corpo de webhook que não se leu, guardado
como texto de propósito — fica como está.

**Guarda:** `apps/barbearia/tests/jsonb-parametro.test.ts` reprova, em `src/`, parâmetro convertido
direto para json ou jsonb — pelo `::` ou pelo `CAST` —, e prova contra o banco, numa conexão que
o Drizzle não tocou, que `::text::jsonb` grava objeto e só `::jsonb` grava string. ⚠️ **A guarda
nasceu furada:** parava no primeiro `}` depois do `${`, e `${JSON.stringify({ texto })}::jsonb` —
com chave dentro do parâmetro — passava. Visto reintroduzindo o defeito na anotação; consertada no
mesmo dia, com o caso nos controles. Contra o build, o E2E das telas manda eventos da Asaas como as
primeiras requisições do processo e confere o corpo gravado como objeto, e tira uma barbearia do
ar antes de qualquer outra coisa passar pelo Drizzle; com o defeito de volta no build, 5
conferências ficaram vermelhas. A regra foi para o `CLAUDE.md`, junto da das datas em SQL cru.

### 2.37 ✅ `[TÉCNICO]` Dois agendamentos do mesmo barbeiro no mesmo horário: só o código impedia — o banco recusa desde 12/10/2026

**O que era:** quem garantia era só o código. O agendamento e o reagendamento entram numa fila
por barbeiro (`pg_advisory_xact_lock`) e conferem o conflito antes de gravar
(`apps/barbearia/src/lib/bookAppointment.ts` e `apps/barbearia/src/lib/reagendar.ts`). Funciona
enquanto todo caminho que grava horário passar pelos dois. Um caminho novo que esquecesse — ou
um defeito na conferência — marcaria dois clientes na mesma cadeira, sem erro nenhum. Era o
passo 7 que faltava (`ARQUITETURA-MULTI-TENANT-V1.md` §9), escolhido por você em 12/10.

**Agora o próprio banco recusa** (migration 0015, a trava `appointments_sem_horario_duplo`):
mesmo barbeiro, agendamento confirmado ou concluído, horários que se cruzam. Encostado não é
cruzado — o que termina às 10:30 e o que começa às 10:30 convivem —, e cancelado e falta não
ocupam a cadeira: é a mesma regra da conferência do código. A fila e a conferência continuam:
são elas que dão a mensagem certa. Quando a trava pega o que elas deixaram passar, o app traduz
a recusa no mesmo 409 do conflito — *"Horário não está mais disponível"* —, e não num 500
(`violouExclusao`, em `apps/barbearia/src/lib/api.ts`).

**Três coisas que o rascunho da arquitetura não previa** (`ARQUITETURA-MULTI-TENANT-V1.md` §7.1):

- **Os horários são texto**, herança do SQLite — o ISO em UTC do `toISOString()`, como
  `'2026-10-12T13:00:00.000Z'`. A trava precisa do instante, e o Postgres não aceita a conversão
  de texto para instante num índice. A migration cria `instante_utc()`, a mesma conversão
  declarada imutável — o que só é verdade porque o texto traz o `Z`. Daí a segunda regra,
  `appointments_horario_utc`: o formato do `toISOString()`, e o fim depois do começo. Rejeitado:
  trocar as colunas para `timestamptz` — mexeria em cada consulta que compara horário como texto,
  para o mesmo resultado.
- **Sem extensão:** a igualdade de barbeiro vai como `int4range(barber_id, barber_id, '[]')`, que
  o índice compara sem o `btree_gist` — extensão pede ao usuário do banco uma permissão que o do
  app pode não ter.
- **O banco pode já ter horário sobreposto.** O SQLite da sua máquina
  (`apps/barbearia/data/appointments.db`, de 06/09) tem **617 agendamentos e 7 pares do mesmo
  barbeiro que se cruzam**, de 25/05 a 03/06/2026, e nenhum horário fora do formato — conferido em
  12/10/2026. ⚠️ **Não é o histórico do Bayron:** 606 dos 617 são fictícios, do gerador de dados de
  demonstração (o `seed-relatorio-demo.mjs`, apagado no mesmo dia; marcados `[FICTICIO]`), e cada par é um agendamento de
  verdade e um fictício — o gerador gravava sem conferir conflito. Com pares assim, a trava não
  nasceria, e o boot pararia: todas as barbearias fora do ar pelo histórico de uma. Em vez disso,
  ela passa a valer a partir do fim do último par — ali, **03/06/2026 14:10 UTC** —, o histórico
  fica como estava, e o boot diz desde quando:
  *"ⓘ horário duplo: o banco recusa a partir de 03/06/2026 14:10 UTC"*. Sem par nenhum, como num
  banco novo, vale para tudo: *"✓ horário duplo: o banco recusa…"*. Se o SQLite de produção tem
  par, não se sabe daqui — o gerador tem um modo para rodar lá; a linha do boot diz no dia da
  migração (`ROTEIRO-MIGRACAO-PRODUCAO.md` §4.4). ⚠️ **Se o par mais recente ainda estiver por vir** — dois
  clientes já marcados na mesma cadeira —, a trava não vale até lá, e o boot avisa alto, com o que
  fazer: desmarcar um de cada par e rodar a 0015 de novo, que pode rodar quantas vezes precisar.

⚠️ **Horário gravado fora do formato também não para o boot** — fica fora da trava, e a regra
do formato entra valendo só para o que for gravado depois. Mas o Postgres confere a regra em toda
linha que muda: um agendamento desses **não aceita mais cancelar nem concluir** até o horário ser
corrigido. O boot conta quantos são. No SQLite da sua máquina, nenhum.

**Guarda:** `apps/barbearia/tests/horario-duplo.test.ts` — a recusa sem o código no meio, por
inserção direta e por duas conexões ao mesmo tempo, sem a fila; o encostado, o outro barbeiro, o
cancelado que volta, o mover por cima do próprio horário e o de outro; o formato. E, num banco
montado pelo boot até a 0014 com pares como os do SQLite da sua máquina e um horário torto, o boot de verdade
aplicando a 0015 sem tocar em nenhum agendamento, o corte, a recusa depois dele, as duas linhas do
boot e a migration rodando duas vezes; e o par marcado para daqui a dez dias, com o aviso alto e
o conserto. Em `apps/barbearia/tests/bookAppointment.test.ts`, a corrida: outro caminho grava sem
a fila e segura a transação aberta; o app passa pela conferência, para na trava esperando, e responde 409 quando a outra confirma — no agendar e no remarcar.
**19 defeitos reintroduzidos, um por vez:** os 17 que tinham de deixar a suíte vermelha deixaram;
o que tinha de deixar verde deixou — sem a fila e sem a conferência, o agendamento continua dando
409, porque o banco segura; e um passou, por ser equivalente com os dados de hoje (tirar o filtro
de formato da conta do corte não muda nada quando não há horário torto). **Contra o build**, no
banco de ensaio com o usuário do app — sem superusuário — e o RLS: o boot aplicou a 0015, e
pelo HTTP, a mesma corrida deu 409 no agendar e no remarcar, com o log do servidor limpo.

### 2.38 ✅ `[TÉCNICO]` O encaixe manual e a comanda pediam à rota do site — no painel central, 404 em toda barbearia — RESOLVIDO em 13/10/2026

**Achado no navegador**, conferindo a agenda do dia depois da limpeza do §2.27. O "Novo
agendamento" da agenda do dia — o encaixe de quem liga ou chega sem marcar — pedia os serviços a
`/api/services` e as vagas a `/api/slots`; a comanda (fechar o atendimento com serviço extra)
pedia os serviços à mesma `/api/services`. As duas rotas são do SITE: acham a barbearia pelo
endereço, de propósito — endereço desconhecido não calcula horário de ninguém. O painel mora num
endereço só, o `painel.<DOMINIO_BASE>`, que para elas não é barbearia nenhuma: a resposta era
**404 "Barbearia não encontrada"**, em toda barbearia. Na tela, o seletor de serviço ficava só com
"Selecione" — o dono não conseguia encaixar ninguém pelo painel —, e a comanda abria sem os
serviços extras, sem erro nenhum. As chamadas são de antes do monorepo (06/09), e nenhum teste
abria o encaixe.

**O que mudou:** a agenda pede os serviços a `/api/admin/services`, que já existia, e as vagas a
`apps/barbearia/src/pages/api/admin/slots.ts`, nova — as duas pela sessão (`tenantDaSessao`),
como toda rota do painel. As regras do dia são as da rota do site: de hoje a 30 dias, no fuso da
barbearia; barbeiro de outra barbearia é 404. *Rejeitado:* fazer as rotas do site aceitarem a
sessão — mexeria no portão que impede o site de calcular horário sem barbearia.

**Visto rodando**, no build, pelo painel central: o encaixe carrega o serviço e as vagas do dia (20)
e grava; a rota dos serviços da comanda responde com a lista. Guarda:
`apps/barbearia/tests/vagas-do-painel.test.ts` — o escopo da rota nova, e nenhuma tela do painel
chamando rota que acha a barbearia pelo endereço.

---

### 2.39 ✅ `[TÉCNICO]` Duas áreas principais, uma dentro da outra, em treze telas do painel — e nenhuma nas telas de entrar — RESOLVIDO em 13/10/2026

**O que era.** A área principal de uma página — a `<main>` — é a que o leitor de tela anuncia
como o conteúdo principal, e para onde ele pula quando a pessoa pede. O `AdminLayout` já tinha a
dele, em volta de toda tela do painel do dono; e treze telas — Início, Agenda do dia, Buscar
cliente, Reservas de produto, Serviços, Expediente, Bloqueios, Produtos, Combos, Galeria, Equipe,
Configurações e Relatórios — abriam outra por dentro: duas áreas principais, uma dentro da outra,
que o leitor de tela anuncia como duas. A regra do HTML é uma só por página, e nunca dentro de
outra. Já as quatro telas de entrar — a do dono (`/admin/login`), a da senha esquecida, a da senha
nova e a do operador — não tinham nenhuma: o atalho para o conteúdo não levava a lugar nenhum. As
telas do operador, a Assinatura e as do site já tinham uma só.

**O que mudou** (pedido por você em 13/10): a `<main>` de cada uma das treze telas virou um bloco
comum, com as mesmas classes — fica a do `AdminLayout`, a única. Nas quatro telas de entrar, o
bloco do formulário virou a `<main>`. Na tela, nada muda: o CSS e o JavaScript que vão ao navegador
saíram idênticos, byte a byte. *Rejeitado:* tirar a `<main>` do `AdminLayout` e deixar a de cada
tela — a Assinatura e toda tela nova ficariam sem nenhuma. Com ela no layout, a regra vale para
todas sem ninguém lembrar, como já era no painel do operador.

**Visto rodando**, no build, contra o banco de ensaio, no computador e no celular — as 24 telas do
painel, 4 de entrar, 14 do dono e 6 do operador: cada uma com uma área principal só, e o axe-core,
um verificador de acessibilidade de fora, sem nenhuma acusação nas regras das áreas da página —
antes, 34 das 48 fotos eram acusadas. As fotos de antes e de depois, comparadas pixel a pixel: 48
de 56 idênticas; as 8 diferentes mudaram só no que é dado vivo — o relógio de Configurações, o
processo na tela Sistema e as entradas no registro do operador, que as próprias fotos geram.
Guarda: `apps/barbearia/tests/area-principal.test.ts` — o layout que traz a `<main>` é o dono
dela, a página sem esse layout traz a sua, uma só, e componente nenhum abre outra.

~~**Visto e não mexido:** no site, três telas têm conteúdo fora de qualquer área — o botão
flutuante do WhatsApp na página inicial, um texto do `/agendar` e o topo do `/cliente/entrar`. É
a regra `region` do axe-core, de boa prática: o leitor de tela lê, mas quem navega pelas áreas
pula esses trechos.~~ ✅ *Consertado no mesmo dia, a seu pedido — e eram seis telas, não três:
§2.40.*

---

### 2.40 ✅ `[TÉCNICO]` Seis telas do site com pedaços fora de qualquer área — o topo de cinco e o botão do WhatsApp — RESOLVIDO em 13/10/2026

**O que era.** Uma página se divide em áreas que o leitor de tela anuncia e entre as quais ele
pula: o topo (`<header>`), a principal (`<main>`), o rodapé (`<footer>`), a navegação (`<nav>`)
e as áreas à parte (`<aside>`). O que fica fora de todas, ele lê na ordem, mas quem navega de
área em área — o atalho dele — passa por cima. No site, eram dois casos:

- **o topo de cinco telas** — o "Voltar" ou "Início" e o nome da barbearia —, num bloco comum: o
  agendar, a área do cliente (a de entrar e a de dentro), o link do horário (`/a/…`) e o portal;
- **o botão flutuante do WhatsApp**, na página inicial de toda barbearia.

No §2.39 eram três: só aquelas telas tinham sido testadas. Com todas as telas do site no
navegador, apareceram mais três com o mesmo topo — o portal, o link do horário e a área do
cliente por dentro. A página inicial, o 404, o cadastro e o site fora do ar já estavam certos.

**O que mudou** (pedido por você em 13/10): o topo das cinco telas virou `<header>`, com as mesmas
classes; o botão do WhatsApp ganhou uma área à parte com nome, `<aside aria-label="WhatsApp">`, sem
sair do lugar na página nem na ordem do teclado. *Rejeitado:* pôr o botão dentro da `<main>` — ele
passaria a vir antes do rodapé na ordem do teclado e na leitura.

**Visto rodando**, no build, contra o banco de ensaio, no computador e no celular, com o relógio da
página parado: o site de quatro barbearias, o de uma fora do ar, o agendar, a área do cliente — a de
entrar e, entrando, a de dentro —, o link do horário, o portal, o 404, o cadastro e o menu do celular
aberto, 25 fotos. O axe-core acusava 19; agora, nenhuma. As fotos de antes e de depois: 23 de 25
idênticas pixel a pixel; as duas da página inicial da `vinho` mudam até entre duas fotos da mesma
versão — o carrossel da galeria carrega as fotos num momento diferente a cada vez —, e com ele
escondido saem idênticas. O CSS e o JavaScript que vão ao navegador saíram idênticos, byte a byte.
Guarda: `apps/barbearia/tests/site-em-areas.test.ts` — o que fica fora da `<main>`, numa tela do
site, está num `<header>`, `<footer>`, `<nav>` ou `<aside>`, dela ou do componente que ela usa.

⚠️ **Achado no caminho:** o Tailwind lê também os testes, e uma classe dele escrita num teste entra
no CSS do site. Foi o que fez a primeira versão do teste — um `blur` de exemplo —, e o CSS mudou;
o exemplo virou uma classe inventada.

**Visto e não mexido**, para você decidir:

- **no celular, o menu fechado só fica transparente** (`apps/barbearia/src/components/Header.astro`):
  os links dele continuam na ordem do teclado e na leitura do leitor de tela, invisíveis, e o botão
  que abre o menu não diz se ele está aberto ou fechado;
- **o carrossel dos depoimentos anda mesmo com "reduzir movimento" ligado** no celular ou no
  computador (`apps/barbearia/src/components/Testimonials.astro`) — o da galeria respeita;
- **o site de toda barbearia diz aos buscadores o mesmo horário e a mesma faixa de preço** — de
  segunda a sexta das 9h às 20h, sábado das 9h às 18h, "$$" —, qualquer que seja o dela: estão
  fixos no `apps/barbearia/src/layouts/Layout.astro`, à espera de o horário de vitrine ter
  estrutura. O Google pode usar esse horário.

---

## 3. Operação com vários clientes

### 3.1 🟠 `[DECISÃO]` Onde o app e o banco rodam

O VPS atual é compartilhado com n8n, redis e postgres. Colocar clientes pagantes ali
significa que todos caem juntos, misturados com suas coisas pessoais. Falta decidir
separação (VPS dedicado ao produto?) e plano de capacidade.

*Corrigido em 12/10/2026 — este item falava em "instâncias" e em "quantas instâncias por
máquina", do desenho de uma instância por barbearia.* Com o multi-tenant são um app, um banco
e o site de vendas para todas (`ARQUITETURA-PRODUCAO.md` §2), e a pergunta da capacidade
virou outra: quantas barbearias um processo do app e um Postgres aguentam antes de crescer a
máquina — **não medido** (`ARQUITETURA-PRODUCAO.md` §7).

### 3.2 🟠 `[TÉCNICO]` Atualizar o app — um deploy, todas as barbearias juntas

~~A arquitetura garante "uma imagem, N instâncias", mas não define **como** subir uma
versão nova em dez containers, nem o que fazer quando a migração falha em um deles e
passa nos outros. Clicar dez vezes no EasyPanel não é processo.~~ *Sem objeto desde o
multi-tenant, e corrigido em 12/10/2026 — o texto acima é do desenho de uma instância por
barbearia.*

Hoje é um deploy só: o EasyPanel constrói a imagem da `main`, e o boot aplica as migrations
antes de o servidor subir (`apps/barbearia/scripts/startup.mjs`) — se uma falha, o servidor
não sobe. Todas as barbearias ficam sempre na mesma versão, o que acaba com o problema de
cima; em troca, **uma migration que falha derruba todas de uma vez**, e não uma.

**O que falta:**

- **O verde do CI mandar no deploy** (§3.8). Hoje nada impede a `main` quebrada de ir ao ar.
- **Saber o que o EasyPanel faz quando o container novo não sobe** — se o antigo continua
  atendendo ou se os sites caem até alguém agir. **Não conferido.**
- **Migration pesada para todo mundo junto.** Uma que reescreva uma tabela grande trava todas
  as barbearias enquanto roda. As de hoje mudam estrutura ou poucas linhas; com o volume de
  muitas barbearias, não medido.

O que segura até lá: cada migration nova tem sido conferida sobre um banco parado na anterior,
como o de produção, e rodando duas vezes (`ESTADO-ATUAL.md` §8) — a 0009 e a 0013 com teste na
suíte (`apps/barbearia/tests/hover-padrao.test.ts` e `apps/barbearia/tests/fuso-por-barbearia.test.ts`).

### 3.3 🟠 `[TÉCNICO]` Backup — um só para todas as barbearias; o teste de restauração já foi feito, e sair da VPS está pronto no código desde 12/10/2026

~~O backup diário com upload off-site já funciona por instância.~~ *Corrigido em 12/10/2026 —
era do desenho de uma instância por barbearia.* O backup roda no container do app
(`apps/barbearia/scripts/backup-daemon.mjs`: um no boot e um por dia, às 03:00 no `TZ` do
container) e gera dois arquivos — o `pg_dump` do banco inteiro, com todas as barbearias, e as
fotos de todas —, guardados por 30 dias (`apps/barbearia/scripts/backup.mjs`). O envio para
fora da VPS, para um armazenamento compatível com S3, existe no código e só liga com as
variáveis `S3_*`.

⚠️ **10/10/2026: no app novo em produção, não.** As variáveis `S3_*` não foram configuradas,
e o backup fica só no disco da VPS (§2.31).

⚠️ **Correção de 13/09/2026:** este item pedia "um teste de restauração de verdade, feito
uma vez, antes do primeiro cliente pago". **Ele foi feito — duas vezes — e a seção não
tinha sido atualizada.** Em 06/09/2026 contra Postgres 16 (backup de um banco com dados,
restauração num banco vazio: voltaram as linhas, as 36 constraints de tenant sobreviveram,
as sequences continuaram de onde estavam) e de novo em 11/09/2026 contra o banco já
carregado com os 820 registros reais do Bayron. As fotos entraram no backup em 11/09 e a
restauração delas é conferida por comparação de árvore (§3.7). Registro em
`ESTADO-ATUAL.md` §4.

⚠️ **11/10/2026: o backup também voltava sem as permissões do app** — restaurado, toda tela
respondia 500. Resolvido, com o reparo para os backups antigos (§3.11).

**O que continua faltando, e só aparece com N clientes:** estrutura de pastas no bucket e
credenciais — bucket único ou um por cliente. Com banco único multi-tenant, o backup deixou
de ser por instância e virou um só, o que torna a decisão mais simples e a falha mais cara.

~~⚠️ **12/10/2026, achado lendo o código:** o envio para fora lê o arquivo inteiro na memória
antes de mandar (`Body: readFileSync(filePath)`, em `apps/barbearia/scripts/backup.mjs`). O
arquivo das fotos junta a galeria de todas as barbearias e cresce com cada uma — e roda no
mesmo container que atende os sites. Não medido, e só morde com as `S3_*` ligadas; o conserto
é mandar em partes, lendo do disco aos pedaços. **Não feito.**~~

✅ **Feito no mesmo dia, escolhido por você:** o envio vai em partes, com uma parte de 16 MiB na
memória por vez, e o arquivo de até 16 MiB num pedido só (`enviarParaS3`, em
`apps/barbearia/scripts/backup.mjs`). Parte que não sobe cancela o envio inteiro, para não deixar
parte órfã ocupando o bucket. Medido contra um S3 local, com um arquivo de 200 MB: o processo
chegava a 273 MB de memória; agora, 91 MB. E o SDK passou a mandar só o checksum que a operação
exige — o padrão da versão instalada manda um cabeçalho de checksum novo em todo envio, que
serviço compatível com S3 pode recusar. Guarda: `apps/barbearia/tests/backup-envio.test.ts`, contra
um S3 de mentira dentro da suíte. ⚠️ **Não conferido contra o Backblaze de verdade** — só contra
esse e contra o moto, um S3 local que segue o protocolo da AWS.

⚠️ **O bucket não se limpa sozinho.** Os 30 dias de `BACKUP_RETENTION_DAYS` valem para o disco da
VPS: o app apaga os arquivos velhos de lá, nunca os do bucket. Sem uma regra de ciclo de vida no
próprio bucket — apagar o que tem mais de 30 dias em `backups/` —, ele cresce para sempre, e a
conta junto. **O que falta é seu:** criar o bucket e a chave, pôr as `S3_*` no app de produção e
a regra no bucket. O passo a passo está no projeto do claude.ai, junto do resto da produção.

**Desde 12/10/2026, o painel do operador mostra o backup** (a tela de Sistema, §3.9): o último
arquivo do banco, com a idade, e o das fotos; quantos arquivos há, por quantos dias ficam e a hora
do diário, lidas das mesmas variáveis que o daemon usa; e se ele sai do servidor. Avisa quando o
último do banco tem mais de um dia e quando o backup não sai. Só quando você abre a tela.

### 3.4 🟠 `[TÉCNICO]` Monitoramento — o lado do app FEITO em 11/10/2026; falta o monitor, que é seu

Se o site de um cliente cair sábado de manhã, hoje você descobre quando ele liga. Falta
o mínimo: ping externo por instância e alerta no seu celular.

**Feito em 11/10/2026:** `GET /api/saude` (`apps/barbearia/src/pages/api/saude.ts`) responde 200
com `{"ok":true}` quando o app e o banco respondem, e 503 quando o banco falha ou demora mais de
3 segundos — banco travado também é banco fora (`apps/barbearia/src/lib/saude.ts`). Não é de
barbearia nenhuma, não diz nada além disso, e responde também a `HEAD`. Guarda:
`apps/barbearia/tests/saude.test.ts`.

**O que falta é seu:** escolher o serviço de monitoramento — há vários com plano grátis; confira
se o escolhido avisa no celular — e cadastrar dois monitores: o `/api/saude` do painel, e a
página de uma barbearia, que pega o que a saúde não vê — o certificado e o endereço. O endereço
de produção está no projeto do claude.ai.

**Desde 12/10/2026, a tela de Sistema do operador** junta o banco, as migrations, o backup, o
e-mail e a cobrança, com o que precisa de você em cima (§3.9). Ela mostra quando você abre — não
chama ninguém. O monitor continua faltando.

### 3.5 ✅ `[TÉCNICO]` Suspensão por inadimplência — FEITA em 08/10/2026

**Feita em 08/10/2026, sem tarefa agendada:** a suspensão sai do relógio — teste ou carência
vencidos (`apps/barbearia/src/lib/situacao.ts`, migration 0007). O site responde 503 com o
aviso e o WhatsApp da barbearia (`apps/barbearia/src/lib/siteForaDoAr.ts`), o painel abre só
a tela de assinatura, e nada é apagado. Religar é o status voltar a `active` — o que o
webhook da Asaas faz quando o pagamento entra (§4.14, no código desde 10/10/2026). ~~Até lá, à
mão, no `psql`~~ — desde 11/10/2026, a barbearia tirada do ar à mão e o teste que precisa de
mais dias se resolvem no painel do operador (§3.9), sem `psql`.

*Como estava:* dependia da decisão §1.3. Se a política fosse cortar, precisava de um jeito
de suspender a instância sem apagar dados e de religar em um clique.

### 3.6 ✅ `[TÉCNICO]` Exportação de dados do cliente — FEITA em 11/10/2026

*Como estava:* "Depende de §1.2. CSV de clientes e agendamentos, baixável pelo próprio dono no
painel. É resposta comercial a uma objeção de venda, não só conformidade."

**Feita em 11/10/2026**, com duas decisões suas do mesmo dia: **abre também fora do ar** — quem
saiu por falta de pagamento, por teste vencido ou por ter cancelado baixa os dados dele, pela
tela de assinatura, a única que abre nessa fase —; e **leva a data de nascimento**, com aviso na
tela, porque ela é também a senha da área do cliente. *Rejeitados por você:* só com o site no
ar; e o arquivo sem a data.

**Como ficou** (`apps/barbearia/src/lib/exportacao.ts`): em Configurações e na tela de
assinatura, "Seus dados", com dois botões — a lista de clientes (um por telefone, com o nome
mais recente, a data de nascimento, agendamentos, atendidos, faltas, desmarcados, o gasto nos
atendimentos, as reservas de produto, o primeiro e o último horário) e todos os agendamentos
(dia e hora no fuso da barbearia, serviço, barbeiro, preço, extras, situação, observações, quem
marcou). Só o dono baixa. Abre no Excel em português com dois cliques: `;` entre as colunas,
UTF-8 com BOM, dinheiro com vírgula.

⚠️ **Fórmula injetada:** o nome do cliente é digitado no site por qualquer pessoa, e a célula
que começa com `=`, `+`, `-` ou `@` vira fórmula na planilha do dono — um `=HYPERLINK(...)`
vira link plantado nela. Essas células saem com um apóstrofo na frente, que desliga a fórmula.
O link de desmarcar de cada agendamento nunca sai: é uma credencial.

Barbearia **encerrada** (status `cancelled`) não entra no painel; aí o caminho é o suporte. E o
termo ainda precisa dizer o que acontece com os dados de quem sai (§1.2).

Guarda: `apps/barbearia/tests/exportacao.test.ts` — 12 casos, com duas barbearias e uma fora do
ar, e o filtro por barbearia testado por cima do RLS: dentro da requisição o RLS esconderia uma
consulta sem ele. Contra o build: o download pelo botão, no ar e fora do ar, com o arquivo
conferido byte a byte.

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

### 3.8 🟠 `[TÉCNICO]` O CI — FEITO em 10/10/2026; falta ligar o deploy a ele

Desde 10/10 a `main` vai para produção, e nada impedia um merge quebrado de derrubar o app no
ar. Agora o GitHub roda a suíte inteira **com banco**, o build dos dois apps e — só na `main`,
só com o app verde — o deploy (`.github/workflows/testes.yml`). Teste pulado conta como falha
(`apps/barbearia/scripts/conferir-resultado-testes.mjs`): sem banco, os testes que tocam dado
de cliente pulam em silêncio e o vitest sai verde. **Não rodou no GitHub ainda** — sobe com o
seu push; o que rodou foi a suíte que ele chama, aqui, e os 11 casos de
`apps/barbearia/tests/ci.test.ts`, que reprovam o arquivo se ele perder uma dessas garantias.

**O verde só manda em alguma coisa depois de um destes dois, que são seus:**

- **A branch protegida**, exigindo o job *"App da barbearia — suíte com banco e build"* antes
  do merge na `main`. É de graça em repositório **público** e paga em privado (documentação do
  GitHub, conferida em 10/10/2026). Hoje o repositório é público — e não deveria ser
  (`CLAUDE.md`): fechado, sem plano pago, esta saída some.
- **O deploy pelo CI:** no EasyPanel, desligar o *Auto Deploy* do app e copiar a URL do
  *Deployment Trigger* para o segredo `EASYPANEL_DEPLOY_APP` do repositório. Funciona com o
  repositório fechado. Sem o segredo, o job avisa e não faz nada — o deploy continua a cargo do
  EasyPanel, como hoje.

⚠️ **A primeira execução pode ficar vermelha por motivo que aqui não aparece:** o runner do
GitHub não é este container. O `pg_dump` dos testes do backup é instalado pelo próprio job, e a
imagem do Postgres é a do `docker-compose.test.yml` — mas é a primeira vez que roda lá.

### 3.9 ✅ `[TÉCNICO]` Ver e operar as barbearias sem `psql` — o painel do operador, FEITO em 11/10/2026; as telas, em 12/10/2026

**A pergunta, sua, em 11/10:** *"como faço para ver as barbearias ativas com sites ativos?
tem algum painel?"* Não tinha. O painel de cada barbearia mostra só a dela, e a única visão do
todo era o `psql` em produção — que também era o único jeito de estender um teste, tirar do ar
(§4.16) ou religar (§3.5). **Decidido por você no mesmo dia:** um painel já com as ações, cada
uma registrada; **entrar só com a senha** — *desde 13/10/2026, também com o código do celular,
se a variável estiver ligada (abaixo)*.

**As telas, pedidas por você em 12/10** — *"um painel de respeito, parecido com a interface do
painel do barbeiro, com várias telas"*; você escolheu as cinco abaixo e as anotações. O painel
ganhou o menu do lado, como o do barbeiro (`apps/barbearia/src/layouts/OperadorLayout.astro`), e
cada tela, um endereço (`apps/barbearia/src/pages/operador/`):

| Tela | Endereço | O que mostra |
|---|---|---|
| Início | `/operador` | Quantas barbearias estão no ar, quantas pagam e a receita prevista — quem paga × R$ 100: conta, não dinheiro que entrou —; o que a Asaas confirmou no mês, cada pagamento uma vez; os cadastros dos últimos 30 dias; onde cada barbearia está, numa barra; **o que pede atenção** — o teste que acaba em 3 dias, a carência, quem cancelou e sai em 15 dias, cada um com o WhatsApp do dono ali mesmo, e os eventos da Asaas que o sistema não resolveu —; quantas passaram do teste para o cartão; os cadastros por semana; e as últimas ações |
| Barbearias | `/operador/barbearias` | A lista de 11/10, com a busca e o filtro por fase. Cada linha leva à ficha |
| A ficha | `/operador/barbearias/N` | De uma barbearia: a fase, o endereço, o fuso, o dono e o contato, a assinatura; o uso — equipe, serviços, fotos, agendamentos em 7 e 30 dias e os próximos, só contagens —; o que falta no site, pelo mesmo medidor do painel do dono (§4.4); a linha do tempo — o cadastro, o fim do teste, a carência, o primeiro agendamento, cada evento da Asaas, cada e-mail ao dono e cada ação do operador —; as ações; e as anotações |
| Cobrança | `/operador/cobranca` | Se a cobrança está ligada, e em que ambiente; as assinaturas em vigor, as atrasadas e quem está saindo; os pagamentos e as falhas do mês; os eventos que pedem olho; e tudo o que o webhook recebeu, por tipo e de 50 em 50, com o valor e o meio de pagamento — do corpo do evento, só isso: o resto traz nome, e-mail e CPF do dono, e para achar o evento na Asaas basta o id |
| Registro | `/operador/registro` | Cada entrada no painel, cada ação e cada anotação, com data, hora e IP, por tipo e por barbearia, de 50 em 50 |
| Sistema | `/operador/sistema` | O banco — se responde, quanto ocupa, com que usuário o app conecta e se ele é superusuário (§3.10) —, as migrations aplicadas contra as do build, o último backup e se ele sai do servidor (§3.3), o e-mail, a cobrança, o cadastro, os endereços e o processo. Em cima, o que precisa de você — o problema antes do aviso; os mesmos alertas aparecem no Início. **Nenhum valor de variável secreta**: só se ela existe |

**As anotações** — *"liguei dia 12, paga sexta"*, na ficha. Até 1.000 caracteres, gravadas no
mesmo registro das ações (`acao = 'anotou'`, migration 0014), com data, hora e IP. **Não se
editam nem se apagam:** a anotação errada se corrige com outra — ⚠️ decidido na implementação,
falta você confirmar. Rejeitado: uma tabela de anotações à parte, com editar e apagar —
anotação que some não serve de histórico, e seria a única coisa do painel sem registro.

**Os dois relógios:** o que é da barbearia — o fim do teste, a carência, o dia do último
agendamento — sai no fuso dela (§2.1); o que é do operador — quando ele entrou, quando o evento
chegou, o mês da receita, as semanas dos cadastros — no padrão do produto, o de Mossoró
(`apps/barbearia/src/lib/operadorTela.ts`).

**Toda tela abre pela porta.** O `src/middleware.ts` deixa o prefixo `/operador/` inteiro passar
sem barbearia — e por isso cada página começa por `exigirOperador`
(`apps/barbearia/src/lib/operador.ts`), antes de qualquer consulta: porta fechada, 404; sem
sessão, a tela de entrar, que depois volta para a tela pedida — e só para tela do painel, nunca
para endereço de fora. `apps/barbearia/tests/operador-telas.test.ts` reprova a página que não
abrir assim, e a lista das telas é fechada: tela nova entra nela de propósito.

*Até 12/10, o painel era uma página só (`apps/barbearia/src/pages/operador.astro`, que não
existe mais): a lista, a contagem por fase, os eventos que pedem olho e as últimas ações.*

**Nenhum dado de cliente de barbearia** — nome, telefone, nascimento de quem agenda — em tela
nenhuma: só contagens (`apps/barbearia/src/lib/operadorBarbearias.ts`). A guarda reprova
qualquer coluna `customer_` nos arquivos do operador.

**As três ações**, na ficha de cada barbearia, cada uma numa transação, com a linha da
barbearia travada e gravada em `acoes_do_operador` (migration 0012) na mesma transação:

- **Estender o teste** — de 1 a 60 dias, contados do último dia do teste ou de hoje, se ele já
  venceu (`fimDoTesteEstendido`, em `apps/barbearia/src/lib/situacao.ts`). Só para quem está no
  teste: quem paga não tem teste; quem foi tirada do ar à mão, reativa primeiro. A que estava
  fora do ar pelo teste volta na hora.
- **Tirar do ar** — exige digitar o endereço dela; o motivo fica no registro. O site passa a
  dizer "temporariamente indisponível" e o painel do dono abre só a assinatura, como no §3.5.
  O webhook não religa quem foi tirada à mão (`MEXE_SOZINHO`, em `apps/barbearia/src/lib/cobranca.ts`).
- **Reativar** — volta com o status que tinha, lido do registro, e com os prazos de antes: o
  relógio não parou, e o teste que venceu durante a suspensão volta vencido — a tela diz, e o
  caminho é estender. Sem registro (tirada do ar fora do painel), ele pergunta: em teste — com
  7 dias, se não havia prazo — ou em dia. ⚠️ Até 12/10, o registro podia estar gravado como
  texto, e ele perguntava mesmo com registro (§2.36).

As três valem **na hora**: a ação descarta o cache de barbearias, que segurava o status por até
30 segundos.

**Como ligar:** sem a variável `OPERADOR_SENHA_HASH`, nenhuma tela existe — 404, como qualquer
endereço inventado. Na sua máquina, `npm run operador:senha` (em `apps/barbearia`) pede a senha
duas vezes sem mostrar e imprime uma linha; ela vai para as variáveis do serviço e, se quiser o
painel no desenvolvimento, para o `.env`. Reinicie o app. O painel abre **só no endereço do
painel** (`PAINEL_URL`, ou `painel.<DOMINIO_BASE>`) — no endereço de qualquer barbearia,
`/operador` e as telas são 404. As telas de 12/10 não pedem variável nova: a 0014 é aplicada pelo
boot. O endereço de produção e o passo a passo do EasyPanel ficam no projeto do claude.ai, não
aqui: este repositório é público.

⚠️ **Os riscos — o primeiro, aceito por você:**

- **Só a senha, sem segundo fator.** Quem a tiver tira qualquer barbearia do ar e dá teste a
  quem quiser — e, desde 12/10, vê os números do negócio. O que existe em volta: hash lento
  (scrypt), no máximo 5 tentativas por IP e 20 no total a cada 15 minutos, sessão de 8 horas, e
  **toda entrada gravada com o IP** — olhe o Registro de vez em quando: uma entrada que não foi
  sua aparece ali. Trocar a senha (o hash) derruba quem estiver dentro. ~~*Rejeitado por você:* o
  segundo fator.~~ *Desde 13/10/2026, escolhido por você: o código de 6 dígitos, opcional — abaixo.
  Sem a variável ligada, este risco continua igual.*
- **O limite mora na memória do processo** (`apps/barbearia/src/lib/rateLimit.ts`): zera a
  cada deploy. E qualquer um pode gastar as 20 tentativas do total e te deixar 15 minutos sem
  entrar — a troca de segurar quem testa senhas de muitos IPs.
- **Tirar do ar não cancela a assinatura na Asaas.** Quem paga por cartão continua sendo
  cobrado até alguém cancelar lá. A tela avisa antes do botão, e o pagamento que chegar para
  barbearia tirada à mão aparece em "pedem olho" — o webhook o ignora de propósito.
- **O hash fica nas variáveis do servidor:** quem vê o EasyPanel vê o hash, e com senha fraca dá
  para adivinhar fora do servidor. O script recusa menos de 12 caracteres; use uma frase de
  quatro ou cinco palavras.
- **A lista e o Início carregam todas as barbearias de uma vez:** servem para dezenas, não para
  milhares. O Registro e a Cobrança vão de 50 em 50.

*Não feito, sugestões:* ~~o segundo fator~~ — ✅ feito em 13/10/2026, abaixo —; ~~estender a carência de quem tem a cobrança
atrasada~~ — ✅ feito em 12/10/2026, abaixo —; cancelar a assinatura na Asaas pelo próprio
painel; encerrar uma barbearia; e o alerta no celular (§3.4) — o painel mostra, mas não chama.

**12/10/2026 — estender a carência**, escolhido por você. Na ficha de quem está com a cobrança
atrasada: de 1 a 60 dias, contados do último dia da carência — ou de hoje, se ela já venceu, e
aí o site volta na hora. Fica no registro, como as outras ações.

- **O banco guarda o FIM novo**, `tenants.carencia_ate` (migration 0016); `past_due_since`
  continua dizendo quando a cobrança falhou. A fase usa o mais tarde dos dois — estender não
  encurta (`apps/barbearia/src/lib/situacao.ts`). *Rejeitado:* empurrar `past_due_since` para a
  frente — a conta daria o mesmo, e a data da falha, que a ficha mostra, passaria a mentir.
- **Vale para aquele atraso só.** Um gatilho do banco apaga a extensão quando `past_due_since`
  muda — pagou, ou atrasou de novo —, e um CHECK recusa carência estendida sem atraso. São cinco
  lugares do código que mexem no atraso; o que esquecesse de apagar deixaria a extensão de um
  atraso valendo para o seguinte.
- ⚠️ **O dono recebe de novo o e-mail "a cobrança do cartão não passou", com a data nova:** o
  aviso da carência é um por prazo, e o prazo mudou (`apps/barbearia/src/lib/avisos.ts`). Se a
  extensão acabar sem pagamento, aí sim sai "o site saiu do ar", com a data nova.
- ⚠️ **Não mexe na Asaas.** Ela continua tentando o cartão nos dias dela, e o pagamento que
  passar põe a barbearia em dia — com ou sem a extensão. Quem cancela durante a carência
  estendida fica no ar até o fim dela.

**Guarda:** `apps/barbearia/tests/carencia-estendida.test.ts` — a regra, os leitores da fase (o
cache de barbearias, o login, os avisos, a cobrança e o operador leem a extensão; o arquivo que
esquecer reprova) e o banco; e casos em `apps/barbearia/tests/operador.test.ts`,
`apps/barbearia/tests/cobranca.test.ts` e `apps/barbearia/tests/avisos.test.ts`. 18 defeitos
reintroduzidos, os 18 vermelhos. No navegador, contra o build, com a migration aplicada pelo
usuário do app sem superusuário: a barbearia fora do ar pela cobrança volta na hora — 14
conferências, no computador e no celular.

**13/10/2026 — o código de 6 dígitos**, escolhido por você: o segundo fator que tinha ficado de
fora em 11/10. Opcional, por variável: com `OPERADOR_SEGUNDO_FATOR`, a tela de entrar pede a senha
**e** o código de um aplicativo no celular (Google Authenticator, Microsoft Authenticator,
1Password…); sem ela, só a senha, como antes — e o Sistema avisa, em produção
(`apps/barbearia/src/lib/segundoFator.ts`).

- **Como liga:** `npm run operador:segundo-fator`, na sua máquina. Ele gera o segredo, mostra o QR
  code no terminal — e a chave, para digitar se o celular não ler —, **pede um código do
  aplicativo e só imprime a linha da variável se ele conferir**: QR lido errado não vira variável
  no servidor. Cole no EasyPanel e reinicie. O QR é feito no próprio repositório
  (`apps/barbearia/scripts/qr.mjs`), sem pacote de fora tocando no segredo; conferido lendo de
  volta e, em 13/10, por um leitor de fora (o jsQR): as oito máscaras, das versões 1 a 10, 72 de 72.
- **A conta:** TOTP, a da RFC 6238 — HMAC-SHA1, 6 dígitos, 30 segundos —, o padrão que todo
  aplicativo entende. Vale o código de agora e o de 30 segundos para cada lado (relógio torto).
  **O mesmo código não entra duas vezes** — o último aceito fica guardado; ⚠️ na memória do
  processo, como o limite de tentativas: um deploy esquece.
- **A resposta não diz qual dos dois errou:** "Senha ou código errado". ⚠️ Decidido na
  implementação — falta você confirmar. O log diz: "senha CERTA e código errado" é o aviso de que
  a senha vazou — troque-a. O código só é conferido com a senha certa, para um código roubado
  com a senha errada não gastar o seu.
- **A sessão nasce da porta:** ligar, trocar ou tirar a variável derruba toda sessão de operador
  aberta, como trocar a senha. E **variável fora do formato desliga o painel do operador (404)**,
  como o hash torto: quem pensa que ligou o código não pode estar, sem saber, só com a senha.
- ⚠️ **Perdeu o celular?** Rode o script de novo e troque a variável — o segredo antigo para de
  valer. Sem acesso ao EasyPanel, o painel do operador fica fechado: é o preço.

**Guarda:** `apps/barbearia/tests/segundo-fator.test.ts` — os exemplos da própria RFC, no app e no
script; a variável e a porta; a janela e o código usado; a sessão; o script de verdade, com o
código certo e com o errado; e, com banco, a rota. `apps/barbearia/tests/qr.test.ts` — o QR contra a
tabela da norma e lido de volta, máscara a máscara. No navegador, contra o build, com a variável
gerada pelo script: 12 conferências — a tela pede o código, o errado não entra, o certo entra, o
mesmo código de novo não, a variável torta dá 404, e tirá-la derruba a sessão aberta.

**Guarda:** `apps/barbearia/tests/operador.test.ts` — 40 casos (39 em 11/10; o fuso de 12/10 pôs
mais um): a senha certa e só ela, o hash do script aceito pelo app, os 404 fora do endereço e sem
a variável, o limite por IP e o total, o cookie de barbeiro que não serve de operador, a troca de
senha derrubando a sessão, cada ação mudando só a barbearia escolhida e valendo na hora, e a
lista sem dado de cliente. 32 reintroduções de defeito, as 32 vermelhas — duas só depois de
reforçar o teste: a chave do lacre separada da do painel, e reativar quem está no ar. A lista
fechada de quem roda como dono do banco ganhou um arquivo, com o motivo
(`apps/barbearia/tests/rls.test.ts`), e a de páginas públicas que não perguntam o endereço, as
quatro do operador (`apps/barbearia/tests/host-tenant.test.ts`). Contra o build: 35 conferências
no navegador — entrar, filtrar, tirar do ar e ver o site sair, reativar e ver voltar, vencer o
teste e estender, sair —, a 0012 aplicada pelo `scripts/startup.mjs` sobre um banco parado na
0011, e o 404 sem a variável. **O E2E achou um defeito que a suíte não via:** a página mandava
`Referrer-Policy: no-referrer`, e com ela o navegador manda `Origin: null` no POST de formulário —
o "Sair" era recusado pela conferência de origem (§2.30). Virou `same-origin`, que para fora dá o
mesmo.

**Guarda das telas, de 12/10:** `apps/barbearia/tests/operador-telas.test.ts` — 31 casos: a porta
em cada tela, antes de qualquer consulta, e a lista fechada delas; as rotas de `/api/operador/`
conferindo o endereço e a sessão antes de ler o corpo; nenhuma coluna de cliente nos arquivos do
operador; a volta só para tela do painel; as semanas e o mês no relógio do operador; o nome de
cada evento da Asaas; o Sistema sem valor de segredo, com o alerta grave antes do aviso; a 0014
sobre um banco parado na 0013; e, com banco, os números do Início, a Cobrança — cada pagamento e
cada falha uma vez —, a ficha, a anotação pela rota, o registro com os filtros e as páginas, e o
Sistema. As listas fechadas cresceram: as seis telas no lugar da página única
(`apps/barbearia/tests/host-tenant.test.ts`), e os números e o Sistema entre os arquivos que rodam
como dono do banco, com o motivo (`apps/barbearia/tests/rls.test.ts`). 29 reintroduções de
defeito, as 29 vermelhas — duas só depois de reforçar o teste: a ordem do "pede atenção", que os
dados do teste já traziam na ordem certa, e a guarda do JSON (§2.36). Contra o build, com o app
falando pelo usuário sem superusuário (§3.10): 64 conferências no navegador — as seis telas no
computador e no celular, entrar e voltar à tela pedida, tirar do ar, reativar achando no registro
como ela estava, estender e ver o site voltar na hora, anotar, os filtros, nenhum segredo no HTML
—, sem erro de JavaScript; e a 0014 aplicada pelo `scripts/startup.mjs` sobre um banco parado na
0013, como dono sem superusuário — rodar de novo não faz nada.

### 3.10 🟠 `[TÉCNICO]` O app fala com o banco como superusuário — a troca pronta e ensaiada em 11/10/2026; falta rodar em produção

Em produção, o `DATABASE_URL` do app é o superusuário que a imagem do Postgres cria. O RLS não
muda com isso — o caminho do dono já passava por cima dele —, mas um defeito que deixasse SQL
arbitrário chegar ao banco viraria comando com poder total: ler arquivo do servidor, mexer em
outro banco, criar usuário. O app só precisa ser **dono das tabelas** — as migrations do boot e
o `pg_dump` do backup dependem disso — e poder assumir `barbearia_app`.

**Feito:** `apps/barbearia/scripts/usuario-do-app.mjs`, para rodar uma vez no console do
container. Cria um usuário sem superusuário — a senha vem por variável de ambiente, nunca por
argumento nem na tela —, passa a ele a posse do banco, do schema e de cada tabela, e prova com a
URL nova, antes de qualquer troca, que tudo funciona. Voltar atrás é devolver o `DATABASE_URL`
antigo. O passo a passo de produção, com os nomes de lá, está no projeto do claude.ai.

⚠️ **A armadilha que o ensaio confirmou:** o acesso automático do app a toda tabela nova (a
`0003`) é, no PostgreSQL, por CRIADOR. Depois da troca, quem cria tabela é o usuário novo — e
sem repetir a regra para ele, a próxima migration criaria uma tabela trancada para o app: 500 em
toda tela que a usasse, com o deploy verde. O script repete.

**Ensaiado em 11/10/2026** no estado de produção — migrations aplicadas pelo superusuário, uma
barbearia dentro: a troca; rodar de novo sem estragar nada; o boot com a URL nova; o roteiro E2E
inteiro — e, com o servidor falando pelo usuário novo, os E2E do painel do operador, da cobrança e
da exportação, os três que mais usam o caminho do dono do banco; o backup e o provisionador com
ela; uma migration futura criando tabela que o app lê e grava; e a recusa de tudo que é de
superusuário — criar papel, ler arquivo do servidor, mudar a configuração, criar banco, rodar
programa.

⚠️ **O que muda daqui em diante:**

- Migration que precise de superusuário — extensão não confiável, papel novo — não roda mais no
  boot: `apps/barbearia/tests/usuario-do-app.test.ts` reprova as que pedirem, da 0013 em diante.
  Se uma for mesmo necessária, roda à parte, com o superusuário.
- **A migração do Bayron** recria o banco: os passos com o banco recriado rodam com o
  `DATABASE_URL` do superusuário — a `0004` só concede o papel com ele; conferido: o usuário
  novo, mesmo já membro, não pode concedê-lo a si de novo —, e o script roda de novo no fim
  (`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2).
- Banco novo: o primeiro boot é com o superusuário; o script vem depois.

Guarda: `apps/barbearia/tests/usuario-do-app.test.ts`.

### 3.11 ✅ `[TÉCNICO]` O backup restaurado voltava sem as permissões do app — RESOLVIDO em 11/10/2026

**Achado no ensaio do §3.10**, restaurando de verdade: o backup diário rodava
`pg_dump --no-privileges`. O arquivo trazia as tabelas e os dados, e nenhum GRANT. Restaurado num
banco vazio, como o próprio script ensinava, o banco voltava inteiro — e o papel do app, que é
quem lê as tabelas em toda requisição, sem acesso a nada: toda tela, 500. E o boot não via,
porque só conferia se o papel podia ser *assumido*. Num servidor novo, sem o papel na hora de
restaurar, era pior: as políticas de RLS nem eram criadas. O teste de restauração de 06/09
(`ESTADO-ATUAL.md` §4) conferiu as linhas e as constraints — não o app lendo o banco
restaurado —, e foi antes do RLS existir.

**Agora:**

- o backup leva os privilégios (`apps/barbearia/scripts/backup.mjs`);
- o boot confere que o papel do app **lê** as tabelas que toda tela usa, e que toda tabela de
  barbearia tem a rede de RLS — e recusa subir sem isso, dizendo o que rodar
  (`apps/barbearia/scripts/startup.mjs`);
- `apps/barbearia/scripts/permissoes-do-app.mjs` devolve exatamente o acesso que as migrations
  dão — o papel, as políticas, os GRANTs e as exceções —, para o banco restaurado de um backup
  antigo, ou num servidor novo.

⚠️ **Todo backup feito até 11/10/2026 é do tipo antigo:** restaurado, ele precisa do
`permissoes-do-app.mjs` — e o boot avisa.

**Ensaiado em 11/10/2026, nos três casos:** backup antigo no mesmo servidor — o boot recusa, o
reparo resolve; backup novo no mesmo servidor — sobe direto; backup novo num servidor NOVO, sem o
papel — 54 erros na restauração, o boot recusa, o reparo cria o papel e as 17 políticas. Nos três,
a matriz de permissões do papel do app — tabela por tabela, sequência por sequência, e a rede de
cada tabela — saiu igual à de um banco recém-migrado; no último, o E2E do aviso e do mapa passou
inteiro contra o banco restaurado.

Guarda: `apps/barbearia/tests/usuario-do-app.test.ts` — o boot recusando o banco sem
permissões, e o reparo devolvendo exatamente as das migrations. Migration nova que tirar acesso
do papel do app e não entrar no reparo deixa o teste vermelho.

### 3.12 ✅ `[TÉCNICO]` A imagem levava as dependências de desenvolvimento — e o provisionador nunca rodou no container — RESOLVIDO em 11/10/2026

A imagem copiava o `node_modules` inteiro do build: TypeScript, vitest, o drizzle-kit e o esbuild
antigo que vem com ele — com 4 falhas de segurança moderadas conhecidas (`npm audit`). Nada disso
roda em produção. Agora um estágio à parte do `apps/barbearia/Dockerfile` instala só as
dependências de produção, do mesmo lock: o `npm audit --omit=dev` dá zero, e o `node_modules`
ficou menor — 351 MB contra 452 MB, medido fora do Docker.

**Achado no caminho:** o provisionador (`npm run db:provisionar`) importa código de `src/lib` e
`src/db`, e o `src/` não entrava na imagem — o script **nunca rodou no container**, e o documento
de produção mandava rodá-lo lá para a prova da cobrança. Agora as duas pastas entram, e o `tsx`,
que o executa, virou dependência de produção.

**Conferido rodando** o estágio de produção simulado — só as dependências de produção, o `dist`,
os scripts e as migrations: as migrations pelo boot, o provisionador criando uma barbearia que
abre, o backup, a saúde e o roteiro E2E inteiro; e o `npm ci` do lock novo com o npm 10 e o
npm 11. *Não conferido:* um `docker build` de verdade — este ambiente não tem Docker. O primeiro
deploy é a prova, e o build fica um pouco mais longo: são dois `npm ci`.

**De carona, registrado e não mexido:** `seed-relatorio-demo.mjs` e `wipe-appointments.mjs`
importam o `better-sqlite3`, que saiu das dependências no porte para Postgres — não rodam desde
então. ✅ **Apagados em 12/10/2026**, com o `docs/WIPE-APPOINTMENTS.md`, e a exceção do
`better-sqlite3` saiu da guarda — que agora também reprova exceção sem uso.

Guarda: `apps/barbearia/tests/deploy.test.ts` — o estágio de produção; todo pacote que um script
importa em `dependencies`, com o provisionador seguido até o `src/`; e o `src/` que ele usa
dentro da imagem.

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
isto — caiu em 13/09/2026 com o §4.6. O que sobrava era o discriminador do §4.7: o portão
era `shortName === "Bayron"`, texto que o próprio cliente edita. Desde 09/10/2026 é o endereço,
`ehOBayron()` (`lib/bayron.ts`).

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

### 4.2 ✅ `[TÉCNICO]` Cor de destaque — o dono escolhe a dele, e a logo sugere desde 13/10/2026

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

~~**Falta só uma ponta, e é melhoria, não bloqueio:** extrair cores candidatas da logo no
onboarding (sugerir, nunca aplicar sozinho). Sem isso o dono digita o hex ou usa o
seletor — o que já resolve.~~

✅ **13/10/2026, escolhida por você: as cores da logo.** Em Configurações — e não no cadastro, que
não recebe logo: ela sobe depois, na mesma página —, com a logo enviada aparecem até quatro cores
tiradas dela, da mais presente para a menos (`apps/barbearia/src/lib/coresDaLogo.ts`). Ficam de
fora o fundo transparente, o que não tem cor — preto, branco, cinza, o quase-preto com um tom —,
a borda serrilhada e o tom quase igual a um já escolhido. Tocar numa só preenche o campo, pelo
mesmo caminho do seletor: a prévia e o aviso de *"clara demais"* vêm junto, e o site só muda
depois de Salvar. A conta roda no navegador, sobre a logo reduzida a 96 px. **Visto rodando**,
com uma logo dourada e preta: as sugestões foram o dourado e o vinho de um filete, o preto não;
tocar no dourado mostrou o aviso e a prévia em `#8d721b`; recarregar sem salvar não mudou nada;
salvar gravou `#8d721b`. Guarda: `apps/barbearia/tests/cores-da-logo.test.ts`.

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
- ✅ ~~`migracao-postgres/` e `migracao-tenants/`, na raiz do monorepo, estão **versionadas** e
  guardam cópias das migrations — a `0001` de lá **diverge** da que está em `drizzle/` —
  mais dois patches de 388 KB e 196 KB. Eram entregas de passo. Hoje são a armadilha de
  alguém aplicar a cópia errada. Apagar, ou mover para `docs/historico/`.~~ **Apagadas em
  12/10/2026**, escolhido por você: continuam no histórico do git, e o que apontava para elas —
  documentos, comentários de teste e a mensagem de erro de `apps/barbearia/src/lib/settings.ts` —
  passou a apontar para o lugar de hoje.

### 4.7 ✅ `[TÉCNICO]` `shortName === "Bayron"` decide o que aparece no site — RESOLVIDO em 09/10/2026

Era: dez lugares — oito componentes (`Header`, `Footer`, `Hero`, `FAQ`, `Gallery`,
`Products`, `Services` e `Testimonials`), o `layouts/Layout.astro` e o relatório impresso —
comparavam o nome curto da barbearia com o texto `"Bayron"` para decidir se mostravam o
conteúdo dele cravado no repositório: o logo empacotado, a foto do topo, os depoimentos, o FAQ,
o catálogo agrupado por categoria, a imagem de prévia (`public/og.jpg`) e a logo do relatório.
O `short_name` é editável em `/admin/configuracoes`: quem digitasse "Bayron" ali herdava o
conteúdo de outra barbearia, no site de quem está pagando. *(O título deste item dizia "oito
componentes" desde 13/09; eram dez lugares desde 27/09.)*

**Visto num navegador em 09/10/2026, contra o build anterior:** uma barbearia de endereço
`impostor`, com o nome curto "Bayron", servia o FAQ, os depoimentos, o logo, a foto do topo e a
prévia do Bayron.

**Feito:** uma função só, `ehOBayron()` (`lib/bayron.ts:23`), pelo `slug` da barbearia — que o
dono não edita e é único no banco —, chamada nos dez lugares. O cadastro passou a recusar o
endereço `bayron` (`lib/enderecosReservados.ts`): nem num banco ainda sem o Bayron alguém o
pega. O do Bayron nasce da migration 0001, não do cadastro, e não é afetado. Depois: o
impostor não recebe nada; o Bayron continua com tudo.

De carona, saíram do `src/config.ts` as constantes do Bayron que nada importava — o WhatsApp
com o número falso, o Instagram, o endereço, o mapa e o horário. Sobrou o `TOPSALAO_URL`, o
destino do botão de agendar.

Guarda: `tests/bayron-pelo-endereco.test.ts` — a regra, o endereço reservado, nenhuma
comparação de nome com "Bayron" em `src/` (com controle de que o padrão pega as formas antigas),
os dez lugares chamando a função e o `config.ts` só com o `TOPSALAO_URL`.

⚠️ **O conteúdo continua cravado no repositório.** O que mudou foi quem o recebe. Tirá-lo
de lá — o Bayron com logo, depoimentos e FAQ no banco, como qualquer barbearia — é o que faz
a função e as dez chamadas sumirem.

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

### 4.9 ✅ `[TÉCNICO]` A tela de agendar é branca quando não há serviço — RESOLVIDO em 09/10/2026

Era (visto em 15/09/2026, no site de uma barbearia recém-criada): `/agendar` renderizava
"Escolha o serviço — Passo 1 de 4" e nada embaixo — sem lista, sem aviso, sem saída. Barbearia
nova nasce sem serviço quando o dono deixa os preços em branco no cadastro, e o botão "Reservar
horário" do site levava a essa tela no primeiro minuto do teste grátis — quando o dono decide se
vai pagar.

**Feito:** sem serviço para agendar, a tela diz *"Agende pelo WhatsApp — No momento, os horários
desta barbearia são marcados direto com ela"*, com o botão do WhatsApp da barbearia, montado
pela mesma função do rodapé, com o 55 (`pages/agendar.astro:27`, `pages/agendar.astro:296`). Sem
WhatsApp cadastrado: *"Agendamento indisponível — volte em breve"*, sem link quebrado. "Sem
serviço" é o `/api/services` vazio: ele só traz serviço ativo com barbeiro ativo, então serviço
que ninguém faz também conta como nenhum.

Guarda: `tests/agendar-primeiro-minuto.test.ts` (o fonte da página); na tela, conferido num
navegador contra o build.

### 4.10 ✅ `[TÉCNICO]` A página "Como fica" do site de vendas não tem nenhuma imagem — RESOLVIDO em 09/10/2026

Era: `/demo`, o destino do link do menu e do botão "Ver como fica" do topo, mostrava quatro
recados para o desenvolvedor — *"Coloque a imagem em `public/demo/site.png`"* — no lugar das
quatro telas. Um dono de barbearia que clicasse ali fechava a aba.

**Feito:** os quatro prints, tirados em 09/10/2026 contra o build da `monorepo`, de uma
barbearia **fictícia** montada para isso — a *Barbearia Exemplo*, de Natal: três barbeiros,
sete serviços, três produtos e três meses de agenda gerados, cerca de 2 mil agendamentos entre
concluídos, faltas, cancelados e confirmados à frente. Nada do Bayron: a marca é dele, e os
depoimentos são de clientes reais (`FLUXO-COMPLETO.md`).

| Arquivo, em `apps/vendas/public/demo/` | O que mostra |
|---|---|
| `site.png` | o topo e os serviços com preço |
| `agendamento.png` | o passo do dia e do horário, só com os horários livres |
| `agenda.png` | a agenda de uma segunda cheia, no painel |
| `relatorio.png` | o relatório de setembro, um mês fechado |

Conferido servindo o build do site de vendas: as quatro carregam, nenhum recado, nenhum erro de
JavaScript. As quatro somam 206 KB, em PNG de paleta.

⚠️ **O print do site não tem foto.** A barbearia de exemplo não tem foto que se possa usar, e o
site dela sai na versão tipográfica (`PENDENCIAS-ABERTAS.md` §4.1) — enquanto o texto ao lado
promete *"suas fotos"*. Fica para a landing nova (`PENDENCIAS-ABERTAS.md` §4.15): ou muda o
texto, ou entra o print de um cliente com foto, com a autorização dele.

⚠️ **Refazer os prints** — o layout mudou, o painel ganhou tela — é remontar a barbearia de
exemplo. O que a montou e tirou os prints ficou na sessão de 09/10, fora do repositório.

### 4.11 ✅ `[TÉCNICO]` A avaliação publica "0,0" e as estrelas são enfeite — RESOLVIDO em 13/10/2026

Dois defeitos na mesma seção, vistos servindo o site em 15/09/2026.

**Publica nota zero.** Com `google_rating` vazio, a seção renderiza **"0,0 — Baseado em 0
avaliações"** com cinco estrelas douradas acesas, e emite `AggregateRating` no HTML com
`ratingValue: 0`. É a regra do §4.1.1 — *nenhuma seção meia-boca* — sendo quebrada pela
seção cujo próprio comentário no código a cita.

**As cinco estrelas não olham a nota.** `Testimonials.astro`: `Array.from({ length: 5 })`,
todas pintadas de `text-yellow-400`. Uma barbearia com 3,8 mostraria cinco estrelas
cheias. No Bayron (5.0) parece certo por coincidência.

Hoje nenhum dos dois está no ar, porque a seção inteira só aparece no site do Bayron — desde
09/10/2026 decidido pelo endereço, `ehOBayron()` (§4.7). Os dois acordam no dia em que a seção
for generalizada.

✅ **13/10/2026, escolhido por você entre as travas pequenas.** A conta saiu para
`apps/barbearia/src/lib/avaliacao.ts`: nota de 1 a 5 e pelo menos uma avaliação, ou o bloco não
aparece; e as estrelas pintam o que a nota manda — 4,8 pinta 80% da quinta —, pelo recorte do
próprio SVG. E, no caminho, três coisas da mesma seção:

- **A nota não aparecia em site nenhum fora o do Bayron**, embora Configurações tenha o bloco
  "Avaliações do Google" para todo dono e o medidor de completude dissesse *"Mostra sua nota real
  no site"*. Agora o bloco da nota vale para toda barbearia que preencher a nota e a quantidade;
  os depoimentos continuam só no site do Bayron — são dele. E o medidor pede a nota e a
  quantidade; antes bastava o link, que sozinho não mostra nada. ⚠️ **Decidido na implementação —
  falta você confirmar.**
- **O JSON-LD de nota saiu.** A seção punha no HTML a nota e os depoimentos do Google como
  `AggregateRating` e `Review`, e a regra do Google proíbe: *"Don't aggregate reviews or ratings
  from other websites"* — e página de negócio falando de si mesmo nem é elegível às estrelas na
  busca (developers.google.com/search/docs/appearance/structured-data/review-snippet, lido em
  13/10/2026). Não trazia estrela nenhuma, e arriscava uma penalidade que tira os resultados
  enriquecidos do site inteiro.
- **Configurações aceitava a nota 5,9:** o primeiro dígito ia até 5, e a casa decimal, livre.
  Agora vai até 5,0 (`FORMA_DA_NOTA`, no mesmo arquivo).

**Visto rodando**, contra o build: sem nota, a seção não aparece; com 4,8 e 127, "4,8 — Baseado em
127 avaliações", com a quinta estrela em 80% e o link do Google; o 5,9 recusado em Configurações; o
medidor deixando de pedir a nota quando ela está lá; e o site do Bayron sem nota, com os
depoimentos e sem "0,0". Guarda: `apps/barbearia/tests/avaliacao.test.ts`.

### 4.12 ✅ `[TÉCNICO]` O hover do botão padrão reprova no contraste — RESOLVIDO em 09/10/2026

Era: o `--color-teal-hover` padrão, `#0d9488`, é **mais claro** que o `--color-teal`
`#0f766e`, e o texto branco em cima caía abaixo do piso de 4,5:1 — o botão ficava legível
parado e piorava com o mouse em cima. Contradizia a regra da skill de paleta: no site da
barbearia, o hover **escurece**. Valia para toda barbearia que não escolheu cor — o Bayron
inclusive — e para o painel inteiro.

| Cor | Com branco — medido em 09/10/2026 com o `contraste()` de `lib/accent.ts` (WCAG 2.1) |
|---|---|
| `#0f766e`, o botão | 5,47:1 ✓ |
| `#0d9488`, o hover antigo | **3,74:1** ✗ |
| `#0b5f58`, o hover novo | 7,52:1 ✓ |

*Os números registrados em 15/09 — 5,24 e 3,59 — não se reproduzem; a conclusão era a mesma.*

**O hover morava em quatro lugares, e só um estava certo:** o `ACCENT_PADRAO` de
`lib/accent.ts` (`#0b5f58`), que o provisionamento de barbearia nova já usava. O token do
`global.css` (o do painel), o padrão de `lib/settings.ts` e o padrão da coluna no banco tinham o
antigo — e o site de quem não escolheu cor lê o do banco. A seção do combo na página inicial
cravava os dois hex na classe, `bg-[#0f766e] hover:bg-[#0d9488]`: no site de quem escolheu
vinho, o botão do combo continuava verde — visto no build anterior.

**Feito,** com os sete consertos do primeiro minuto, que você pediu em 09/10/2026; o tom é o que
o código já tinha como padrão. Os quatro lugares são o `ACCENT_PADRAO` (`styles/global.css:22`,
`lib/settings.ts:92`, `db/schema.ts:369`), e o botão do combo usa as cores do tema
(`components/ComboBoris.astro:63`). A **migration 0009** troca o padrão da coluna e conserta as
linhas gravadas com o par antigo exato — quem escolheu cor não é tocado. ⚠️ **Na migração da
produção ela roda depois da carga do SQLite, e é ela que conserta o Bayron**
(`ROTEIRO-MIGRACAO-PRODUCAO.md` §4.4).

Guarda: `tests/hover-padrao.test.ts` — o contraste e o "mais escuro", os quatro lugares iguais ao
`ACCENT_PADRAO`, nenhuma cor cravada em classe de `.astro` (com controle) e a 0009 contra o banco:
conserta o par antigo, em minúsculas e em maiúsculas, e a linha gravada pelo padrão antigo; não
toca o vinho nem o hover próprio de quem tem o verde; roda duas vezes.

### 4.13 ✅ `[TÉCNICO]` A cara do site no cadastro — um layout e a cor do dono, FEITO em 08/10/2026

> **Decidido em 08/10/2026: um layout no lançamento**, com **uma** cor escolhida pelo dono no
> cadastro e o fundo do layout (`PLANO-PRODUTIZACAO.md` §13). Os outros dois layouts ficam
> para quando houver clientes pagando que peçam. O resto desta seção é o desenho de três,
> mantido como registro.
>
> **Feito em 08/10/2026:** o `/cadastrar` pede a cor — oito prontas e uma livre — e a frase do
> topo, com a prévia do topo do site na cor escolhida (`JORNADA-DO-BARBEIRO.md` §2.4). Os
> outros dois layouts continuam fora, até haver cliente pagando que peça.

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

~~**Ainda falta decidir — e muda o tamanho do trabalho:**~~ — decidido em 08/10/2026: uma
cor, e o fundo do layout. As duas perguntas, como estavam:

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

### 4.14 🔴 `[TÉCNICO]` A cobrança — FEITA no código em 10/10/2026; falta a prova no sandbox

> **10/10/2026 — feita no código, NÃO testada no sandbox.** O dono cadastra o cartão no
> Checkout da Asaas pela tela de assinatura, o webhook mantém a barbearia em dia, e o cancelar
> existe. As regras moram em `apps/barbearia/src/lib/cobranca.ts`; a API, em `src/lib/asaas.ts`;
> as rotas, em `src/pages/api/asaas/webhook.ts` e `src/pages/api/admin/assinatura/`; o banco,
> na migration 0010. O desenho como ficou: `ARQUITETURA-COBRANCA-V1.md` §5.3.
>
> ⚠️ **A ordem do §6 foi invertida, por escolha sua em 10/10:** o código veio antes da prova no
> sandbox, que o §6 punha primeiro. Os eventos que o código lê são os dos exemplos da
> documentação; o que o sandbox desmentir volta para o código. Provado sem ele: **65 casos, rodados
> com banco** (`tests/cobranca.test.ts`), **19 defeitos reintroduzidos um por vez, os 19 pegos**, e
> o caminho inteiro contra o build com uma Asaas de mentira que segue a documentação — **36
> conferências**: cadastro, cartão, cancelar, reativar, fora do ar voltando pelo cartão, o
> Checkout pago que não era o último, a cobrança atrasada cancelando. A migration 0010 foi
> aplicada pelo `scripts/startup.mjs` sobre um banco parado na 0009, como o de produção: a
> barbearia que já existia ganha os campos vazios, e rodar de novo não faz nada.
>
> **O ensaio contra o build achou três defeitos que a suíte não pegava** — consertados:
>
> 1. *O mesmo cliente da Asaas em duas barbearias* — o dono com duas, se a Asaas reaproveitar o
>    cliente pelo CPF (não conferido) — quebrava o webhook a cada reentrega; e 15 falhas
>    seguidas interrompem a fila **de todas as barbearias**. Agora o cliente pode repetir; o
>    evento que só traz o cliente, nesse caso, não escolhe nenhuma e fica guardado para tratar à
>    mão; e o erro que se repetiria em toda reentrega é guardado com o motivo e responde 200.
> 2. *O Checkout pago não era o último aberto.* Quem clica duas vezes abre dois, e paga no da
>    aba que ficou na frente: o cartão ficava cadastrado sem barbearia, e o site saía do ar no
>    fim do teste com o dono pagando. A barbearia guarda os últimos 20.
> 3. *Reativar removia de novo a assinatura já removida* no cancelar — erro na Asaas e um alarme
>    falso de "faça no painel" a cada reativação. Agora lê antes, e só remove a que existe.
>
> E um que era regra: **com a cobrança atrasada não dava para cancelar** — a tela dizia que ela
> "se encerra sozinha", e não se encerra: a assinatura atrasada continua viva na Asaas e tenta o
> cartão de novo. Agora cancela, na carência e fora do ar.
>
> **Decidido na implementação — ✅ confirmado por você no mesmo dia, 10/10/2026:**
>
> 1. *Quem cancela em dia* fica no ar até o fim do período pago — o dia da cobrança que não vai
>    haver — e depois sai do ar como quem não pagou, sem carência. Nada é apagado; assinando de
>    novo, volta, e a cobrança nova começa onde a antiga acabaria: o mesmo mês não é cobrado
>    duas vezes.
> 2. *Quem cancela com a cobrança atrasada* fica só o que restava da carência, e a mensalidade
>    que falhou deixa de existir — remover a assinatura na Asaas leva junto as cobranças em
>    aberto (documentação). A dívida não é cobrada.
> 3. *Quem sai do ar pela cobrança e NÃO cancela* continua com a assinatura viva: a Asaas tenta o
>    cartão de novo nos vencimentos seguintes, e se passar o site volta sozinho. É o "pagou,
>    volta" do §1.3 — e também cobra quem foi embora sem avisar. *Rejeitado por você em 10/10:*
>    remover a assinatura depois de 30 dias fora do ar, com um e-mail antes. Fica como está —
>    então o termo tem de dizer, com todas as letras, que sair do ar não cancela (§1.2); e o
>    cancelar abre também fora do ar, para quem quiser parar.
>
> ⚠️ **As notificações da Asaas são desligadas a cada `CHECKOUT_PAID`** — a proposta 3 de
> 10/10, abaixo: quem avisa é o app. Sem o `SMTP_URL` em produção (§4.17), então, ninguém avisa
> o dono por e-mail de cobrança nenhuma; só a faixa do painel. Mais um motivo de o cadastro não
> abrir sem ele (§2.31).
>
> **O que só você faz, nesta ordem — o roteiro da prova:**
>
> 1. **As variáveis**, no app que vai receber o webhook: `ASAAS_API_KEY` (a chave do sandbox),
>    `ASAAS_WEBHOOK_TOKEN` (um segredo longo, inventado por você) e **nada** em
>    `ASAAS_AMBIENTE` — vazio é sandbox, de propósito (`apps/barbearia/.env.example`).
> 2. **Um endereço público para o webhook.** Duas saídas: o painel de produção — exige a
>    `monorepo` na `main` e uma barbearia de teste criada pelo script, com o cadastro fechado —;
>    ou a sua máquina, com `npm run dev` e um túnel (`cloudflared tunnel --url
>    http://localhost:4321` dá um endereço público sem conta; **não testado aqui**). A segunda
>    não mexe em produção. Na primeira, a barbearia de teste e o webhook apontado para a
>    produção têm de sumir antes da migração do Bayron: ela apaga e recria o banco, e a
>    barbearia 1 tem de ser o Bayron (`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2).
> 3. **O webhook no painel do sandbox** (Integrações → Webhooks): o endereço
>    `<público>/api/asaas/webhook`; o token de autenticação igual ao `ASAAS_WEBHOOK_TOKEN`; envio
>    **sequencial**; e os eventos `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED`,
>    `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`, `PAYMENT_CONFIRMED`,
>    `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` e os de estorno
>    e contestação (`PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`,
>    `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`,
>    `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`).
> 4. **O caminho:** uma barbearia no teste → *Cadastrar o cartão* → o cartão de teste da Asaas
>    na página dela → a volta. Depois: cancelar; reativar; e, no painel da Asaas, uma cobrança
>    vencida.
> 5. **Ler o que chegou:** `SELECT event, outcome, payload FROM webhook_events ORDER BY id;` — o
>    evento cru fica guardado, e é ele que responde as perguntas abaixo.
>
> **O que a prova tem de responder** — as três de 27/09, mais as que o código assumiu:
>
> - **Que evento chega no dia do cadastro, se nada é cobrado nele.** O código conta com o
>   `CHECKOUT_PAID` para pôr a barbearia em dia. Se ele só vier no vencimento, a tela fica em
>   *"a confirmação chega em instantes"*, e a barbearia segue no teste até a primeira cobrança.
> - Se o cartão é validado no cadastro, e quais dados a página pede ao titular.
> - Se o `SUBSCRIPTION_CREATED` traz o `checkoutSession` ou o `externalReference` — sem os dois,
>   a assinatura de cliente novo só se liga à barbearia pelo cliente.
> - Se o `CHECKOUT_PAID` traz o `customer`, e se a Asaas reaproveita o cliente pelo CPF.
> - O que o `GET /subscriptions/{id}` devolve de uma assinatura removida — `deleted: true`, ou
>   404: o reativar depende disso para não remover duas vezes.
> - Se o `PUT /customers/{id}` só com `notificationDisabled` desliga as notificações.
> - O endereço do Checkout do sandbox, quando a resposta não traz o `link`
>   (`linkDoCheckout`, em `src/lib/asaas.ts`).
>
> **Vigiar, enquanto não houver alerta** (§3.4): o evento que falhou de vez e o que não achou
> barbearia ficam guardados com o motivo e só aparecem no log —
> `SELECT received_at, event, outcome FROM webhook_events WHERE outcome LIKE 'erro:%' OR outcome LIKE 'sem barbearia%' OR outcome LIKE 'alerta%' ORDER BY id DESC;`.
> Cada linha é um pagamento que não mudou nada sozinho.

> **Feito em 08/10/2026:** o teste de 7 dias, a carência de 3 dias e o site fora do ar (§1.3 e
> §3.5), com a contagem no painel e a tela de assinatura (`JORNADA-DO-BARBEIRO.md` §2.9 e
> `JORNADA-DO-BARBEIRO.md` §2.10). ~~**Falta a cobrança:** a conta e o Checkout da Asaas, o
> webhook idempotente gravando `active` e `past_due`, e o cancelar~~ — no código desde 10/10,
> acima. ⚠️ **O cadastro não pode abrir antes da prova no sandbox:** sem ela, ninguém sabe se
> alguém consegue pagar, e toda barbearia que se cadastrasse sairia do ar no 11º dia.

> **10/10/2026 — reconferido por outra sessão, na documentação e na conta sandbox da Asaas:**
>
> - O **Checkout** aceita assinatura no cartão com a primeira cobrança numa data futura —
>   `chargeTypes: RECURRENT` com `subscription.nextDueDate`, o cartão digitado na página da
>   Asaas. É o que a leitura de 27/09 já dizia, de novo pela documentação: **o sandbox não foi
>   testado**, e as três perguntas abaixo continuam abertas.
> - A confirmação chega pelos eventos `CHECKOUT_PAID` e `SUBSCRIPTION_CREATED`, nunca pela URL
>   de retorno. Se o `CHECKOUT_PAID` chega num cadastro em que nada é cobrado no dia é
>   justamente a primeira das três perguntas.
> - **O que falta para testar não é o domínio.** A chave do sandbox existe desde 10/10, sem
>   permissão de saque, e já há endereço público com certificado — o do painel — para receber
>   o webhook. Falta a rota do webhook, que não existe no código.
> - O cartão cai na conta em **32 dias**; Pix e boleto, em 1 dia útil. E a taxa do cartão é
>   R$ 3,48 numa mensalidade de R$ 100, não R$ 1,99 (`ARQUITETURA-COBRANCA-V1.md` §4).
> - **A Asaas avisa o cliente sozinha:** oito notificações nascem ligadas em cada cliente,
>   inclusive ligação telefônica na cobrança vencida, e não há chave geral — só por cliente,
>   pela API. Se o app é quem avisa, o código que cria o cliente na Asaas tem que desligá-las;
>   senão o dono recebe dois avisos de cada coisa.
> - Chave de API morre sozinha: desabilitada com 3 meses sem uso, expirada com 6. A do sandbox
>   vence antes de ser usada se o código demorar.
>
> **Três decisões suas, abertas em 10/10/2026 — com a proposta de cada uma:**
>
> 1. *Cartão ou Pix Automático.* Os 32 dias não decidem: atrasam o primeiro mês uma vez, não
>    todo mês. A diferença de tarifa é de R$ 1,49 por cliente por mês. **Proposta: o cartão no
>    lançamento**, como decidido em 24/09 — dois meios são duas costuras para provar, e se o
>    Checkout aceita Pix Automático com a primeira cobrança futura ninguém conferiu.
> 2. *CNPJ antes do primeiro pagante.* **Proposta: sim.** A conta PJ da Asaas exige
>    (`ARQUITETURA-COBRANCA-V1.md` §11), os termos precisam dizer quem responde pelos dados
>    (§1.2), e há a nota fiscal. É conversa com contador — inclusive sobre o MEI, que, pelo que
>    se sabe, não cobre licença de software: confirmar com ele.
> 3. *Quem avisa o dono — o app ou a Asaas.* **Proposta: o app**, que tem os avisos do teste e
>    da cobrança desde 09/10, com as notificações da Asaas desligadas na criação de cada
>    cliente. Depende do e-mail em produção (§4.17).
>
> *10/10/2026: o código seguiu as propostas 1 e 3 — só cartão, e as notificações da Asaas
> desligadas. Decidindo diferente, muda o `apps/barbearia/src/lib/cobranca.ts`.*

> **08/10/2026** (`PLANO-PRODUTIZACAO.md` §13): o cartão é pedido **no fim do teste**, não no
> cadastro; a cobrança mora num **módulo do app da barbearia** (`ARQUITETURA-COBRANCA-V1.md`
> §2); e só há plano mensal no lançamento.

Decidido em 24/09/2026 (`PLANO-PRODUTIZACAO.md` §13). Conferido no código no mesmo dia:

- ~~**Não há data de fim.**~~ ✅ desde 08/10: a barbearia nasce `trial`, com a data gravada;
  a migration 0007 trouxe `trial` e `past_due` e as travas que recusam prazo faltando.
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
- ~~**Não há suspensão que se veja.**~~ ✅ desde 08/10: o site fora do ar mostra o aviso com o
  WhatsApp da barbearia, com 503 — não 404 (§3.5).

Depende do que acontece no oitavo dia (§1.3).

⚠️ **O webhook precisa de idempotência desde o primeiro cliente**
(`ARQUITETURA-COBRANCA-V1.md` §5.1). A Asaas reenvia o evento quando não recebe resposta,
e processar o mesmo pagamento duas vezes pode reativar uma barbearia suspensa.

~~⚠️ **Ninguém desenhou ainda onde o teste expira.**~~ Resolvido em 08/10: a cobrança é módulo
do app, e o teste expira no banco da barbearia, pelo relógio (`apps/barbearia/src/lib/situacao.ts`).
*Como estava:* o desenho de dois aplicativos
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

~~**A costura, proposta em 27/09/2026 e pendente de você**~~ — superada em 08/10: com o cartão
no fim do teste, não há `pending`; a contagem dos dias no painel existe, o botão de cancelar
não. *Como estava* (`JORNADA-DO-BARBEIRO.md` §3.1
e `JORNADA-DO-BARBEIRO.md` §3.2): a barbearia nasce `pending` antes do cartão, o webhook a
passa para `trial` com a data de fim, e uma limpeza devolve o endereço das pendentes com
mais de 24 horas. E a pergunta de onde mora o código da cobrança — o aplicativo separado
do `ARQUITETURA-COBRANCA-V1.md` §2 ou um módulo isolado no app da barbearia; a
recomendação é o módulo, registrando a reversão. Junto com o teste, o painel precisa da
contagem dos dias e do botão de cancelar.

### 4.15 🟠 `[TÉCNICO]` A landing e o `/onboarding` contam a história antiga — o rascunho no código desde 12/10/2026; falta a sua voz

> **12/10/2026 — o rascunho, no código**, escolhido por você (`apps/vendas/src/pages/index.astro`).
> ⚠️ **É rascunho: o texto é a sua voz.** O site de vendas ainda não está no ar, então nada
> disto foi publicado.
>
> - **A tese:** o site é da barbearia — o nome dela no endereço, a cor dela —, contra a página
>   dentro do aplicativo dos outros (`PLANO-PRODUTIZACAO.md` §4). A tabela ficou com as duas
>   linhas que se sustentam: o endereço (conferido em 01/09/2026, §5) e a página.
> - **O botão principal** leva ao cadastro com `CADASTRO_ABERTO`; sem ela, vira WhatsApp.
>   Embaixo do botão do topo: *"Sem cartão para começar: ele só é pedido no fim do teste."*
> - **O preço:** um plano, R$ 100/mês depois dos 7 dias, cancela pelo painel.
> - **Saíram, e pôr de volta é decisão sua:** o plano anual — o cadastro e a cobrança não o
>   vendem; a recomendação do `JORNADA-DO-BARBEIRO.md` §4 continua, oferecê-lo no painel depois
>   do 8º dia —; o *"Atendimento em Mossoró e região"*; o suporte *"com ajustes pequenos
>   inclusos"*, porque a política (§1.4) não está decidida; e a dor *"Sua barbearia não existe
>   no Google"*, que virou *"não tem um link"* — o site sozinho não põe ninguém no "perto de mim".
> - ⚠️ **Duas frases só valem com a produção configurada:** *"Backup todo dia, fora do
>   servidor"* (o Backblaze, §3.3) e *"No ar, agendando"* (o certificado dos subdomínios,
>   §2.31). O cadastro também não abre antes delas.
> - **O "Como fica"** (`apps/vendas/src/pages/demo.astro`) deixou de pedir as fotos no WhatsApp
>   para alguém montar a página.
> - **O `/acessar`** pedia o endereço do site e levava ao `/admin` dele; agora é um 302 para
>   `URL_PAINEL` (`apps/vendas/src/config.ts`), a tela de entrar do painel central. ⚠️ Em
>   produção, o site de vendas precisa de `URL_PAINEL` e `URL_CADASTRO`: sem elas, os dois
>   apontam para o `localhost`.
> - **O `/onboarding` e o `/envios` continuam.** Conferido em 12/10/2026: o SQLite da sua
>   máquina (`apps/vendas/data/produto.db`) tem 6 envios, de 30 e 31/08, nenhum respondido — 3
>   iguais, do mesmo responsável e do mesmo WhatsApp, em 9 minutos de madrugada: cara de teste
>   seu. E o site de vendas nunca esteve no ar neste projeto. Aposentar é decisão sua.
>
> Conferido no build: as duas larguras sem rolagem de lado, os 4 botões levando ao cadastro (ou
> ao WhatsApp, com o cadastro fechado), nenhum erro de JavaScript e nenhuma das frases da
> montagem na página. O que segue é o diagnóstico de 24/09, que o rascunho responde.

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

### 4.16 🟠 `[TÉCNICO]` Endereço escolhido e publicado sem revisão — os reservados FEITOS em 08/10/2026, o tirar do ar em 11/10/2026

No autoatendimento, qualquer um escolhe o endereço e o que escreve, e vai ao ar na hora
sob o seu domínio. Conferido em 24/09/2026: o provisionador só conferia se o endereço é um
rótulo de DNS válido (hoje em `lib/provisionarBarbearia.ts:250`) e se já existe (hoje em
`lib/provisionarBarbearia.ts:318`). Não havia lista de reservados.

- ✅ **Reservar — feito em 08/10/2026.** `lib/enderecosReservados.ts` lista 39: as portas
  do produto (`painel`, `admin`, `www`, `api`, `login`…), os nomes de e-mail e de
  infraestrutura que o domínio vai precisar (`mail`, `postmaster`, `ns1`…), os da cobrança,
  do atendimento e dos ambientes, e o nome do produto — lido de `NOME_PRODUTO`, não escrito
  à mão — mais o antigo, `barbearianoar`. O provisionador recusa antes de tocar o banco
  (`lib/provisionarBarbearia.ts:281`), com a mensagem no campo do endereço; vale para o
  `/cadastrar` e para o script, que usam a mesma função. `demo` ficou de fora de propósito:
  nome reservado fica proibido para você também. Vale para quem se cadastra daqui em diante
  — não confere as barbearias que já existem. Teste: `tests/enderecos-reservados.test.ts`.

  Antes disso, sem a lista, o primeiro a se cadastrar como `painel` recebia o endereço do
  seu painel.

  Conferido em 25/09/2026 como isso acontece: `resolverHost()` (`lib/tenant.ts:203-205`)
  usa o primeiro rótulo de qualquer endereço como slug, e o middleware embrulha toda
  requisição que resolve. Com uma barbearia `painel` ativa, **a raiz de `painel.<dominio>`
  passa a mostrar o site dela** — no endereço que o dono de cada barbearia digita todo dia.
  A tela de login não muda (não lê marca de barbearia nenhuma) e o login continua
  funcionando: acha o barbeiro pelo telefone, e dali em diante quem decide é a sessão.
- ✅ **Tirar do ar** o que não pode ficar sob o seu domínio — **feito em 11/10/2026**, no
  painel do operador (§3.9): digita-se o endereço da barbearia para confirmar, e o motivo fica
  registrado. *Antes:* o status `suspended` já sumia com o site, mas acioná-lo era abrir o `psql`.
- O primeiro a pegar o nome de uma barbearia de verdade, que ainda nem é cliente, fica
  com ele. Não tem conserto técnico barato; tem que caber no termo de uso (§1.2).

### 4.17 ✅ `[TÉCNICO]` Recuperação de senha — FEITA em 09/10/2026; falta o provedor de envio

> **Decidido em 08/10/2026: e-mail**, pedido no cadastro — um canal só, para a recuperação
> de senha e para os avisos de fim de teste e de cobrança (`PLANO-PRODUTIZACAO.md` §13).
>
> **Feito em 09/10/2026:** o envio (`apps/barbearia/src/lib/email.ts`), o "Esqueci minha
> senha" no login, a troca de senha derrubando as sessões abertas (§2.13), o e-mail na tela da
> equipe, o e-mail de boas-vindas e os avisos do teste e da cobrança. **Falta o provedor de
> envio:** sem ele, em produção, nada sai — e o sistema diz isso em vez de fingir que mandou.

**O que existe:**

- **"Esqueci minha senha"** — o link fica no login e leva a `/admin/esqueci`, que pede o
  WhatsApp de login e manda o link ao e-mail **gravado**. A resposta é a mesma exista o número
  ou não, e nem o tempo de resposta muda: o envio não é esperado
  (`apps/barbearia/src/pages/api/auth/esqueci.ts`). O link vale **1 hora e uma vez**; o banco
  guarda o hash do token, não o token; pedir de novo invalida o anterior; dois cliques no
  mesmo link trocam a senha uma vez só. O endereço do link sai de `PAINEL_URL` ou de
  `painel.<DOMINIO_BASE>`, **nunca do `Host` da requisição** — é o caminho do ataque conhecido
  como *password reset poisoning*, em que o e-mail legítimo leva o dono ao site de quem pediu
  (`apps/barbearia/src/lib/redefinicaoDeSenha.ts`).
- **Trocar a senha derruba as sessões abertas**, pelos três caminhos (§2.13).
- **O e-mail aparece e se troca na tela da equipe** (`/admin/barbeiros`), com aviso para o
  dono que está sem; e a tela de assinatura diz para onde vão os avisos.
- **Boas-vindas:** o cadastro manda o primeiro e-mail na hora, com o site, o painel, o
  WhatsApp de login e o fim do teste. É a pista mais cedo de um e-mail digitado errado.
- **Os avisos do teste e da cobrança** (`apps/barbearia/src/lib/avisos.ts`): 2 dias antes do
  fim do teste, no começo da carência — teste vencido ou cobrança que falhou — e quando o site
  sai do ar. Sai só o da fase de agora, um por prazo: a trava é a tabela `avisos_enviados`
  (migration 0008). O texto do meio é o mesmo parágrafo da tela de assinatura.
- **O aviso de agenda** (11/10/2026, `apps/barbearia/src/lib/avisoDeAgenda.ts`): o barbeiro do
  horário e o dono recebem um e-mail quando o cliente agenda, desmarca ou remarca pelo site; o
  dono desliga por pessoa na Equipe (§2.33). Sai na hora, pela rota do cliente — não pelo
  daemon abaixo.
- **Quem dispara os avisos** é o `scripts/avisos-daemon.mjs`, de hora em hora, lançado pelo CMD
  do Dockerfile como o daemon de backup. Ele chama `POST /api/tarefas/avisos` pela porta local,
  com um token derivado do `SESSION_SECRET` — variável nenhuma a mais para configurar. Sem o
  token, a rota responde 404.

**O transporte é SMTP, de qualquer provedor** — escolher o provedor não mexe no código. Sem
`SMTP_URL` em produção: o boot mostra o quadro "E-MAIL DESLIGADO" (`scripts/startup.mjs`), o
"Esqueci minha senha" responde que não está funcionando e a tarefa dos avisos recusa com o
motivo. No desenvolvimento, cada e-mail vira um `.txt` em `apps/barbearia/data/emails/`, que o
`.gitignore` deixa de fora — tem link de senha.

**Rejeitados, no disparo dos avisos:** o cron do EasyPanel — para app com Dockerfile ele roda
dentro do container e pede o `crond` no lugar do comando que sobe o servidor (documentação do
EasyPanel, conferida em 09/10/2026) — e um serviço de cron de fora, como o cron-job.org: mais
uma conta, e a tarefa parando sem ninguém ver.

**Escolhido na implementação, não por você — revise se quiser outro:** o aviso sai **2 dias**
antes do fim do teste; o "saiu do ar" não sai para quem está fora do ar há **mais de 7 dias**
(senão, no primeiro dia desta tarefa, toda barbearia abandonada receberia um aviso de semanas
atrás); o link vale **1 hora**; a senha nova pede **8 caracteres**, como o cadastro; e o
barbeiro da equipe também pode pedir a senha nova, se tiver e-mail.

**O que falta, nesta ordem:**

1. **Escolher o provedor de envio** e criar a conta — qualquer um que fale SMTP (Brevo,
   Amazon SES, Resend, Postmark…). Preço e limite de plano grátis **não foram conferidos**:
   olhar na hora de escolher.
2. **Os registros de DNS do envio** — SPF, DKIM e DMARC — no DNS do domínio, o da Cloudflare
   (§0). Sem eles, o e-mail cai no spam ou nem chega.
3. **As variáveis no EasyPanel:** `SMTP_URL` (ex.: `smtps://usuario:senha@smtp.provedor.com:465`)
   e `EMAIL_REMETENTE` (ex.: `Fadeline <nao-responda@fadeline.com.br>`, do domínio verificado
   no provedor). `PAINEL_URL` só se o painel não morar em `painel.<DOMINIO_BASE>`.
   `EMAIL_RESPONDER_PARA` é opcional — sem ela, quem responde o e-mail fala com ninguém.
   *Desde 13/10/2026 as quatro — e todas as outras que o app lê — estão explicadas no
   `apps/barbearia/.env.example`; até então ele não contava sete delas (`DOMINIO_BASE`,
   `PAINEL_URL`, `CADASTRO_ABERTO`, `SMTP_URL`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA` e
   `EMAIL_PASTA`). `apps/barbearia/tests/env-exemplo.test.ts` reprova variável que o código leia e o
   exemplo não conte.*
4. **Testar de um celular:** pedir a senha nova e ver o e-mail chegar na caixa de entrada,
   não no spam.

**O que ficou de fora — risco aceito, não esquecimento:**

- **Confirmar o e-mail por um link**, recomendado aqui antes. No lugar dele: o e-mail de
  boas-vindas e o e-mail à vista no painel. O que sobra: e-mail digitado errado só aparece
  quando o dono nota que não recebeu nada.
- ~~**Avisar o e-mail antigo quando o e-mail muda.** Quem roubar a sessão do dono pode trocar
  o e-mail e, depois, a senha. Hoje a troca de e-mail não avisa ninguém.~~ ✅ **Feito em
  13/10/2026**, escolhido por você. Quando o e-mail de alguém da equipe muda — ou é apagado —, o
  endereço antigo recebe o aviso: quando, por quem (o próprio acesso, ou o nome de quem trocou),
  o novo mascarado (`r***@…`) e o que fazer se não foi ele — o dono entra, põe uma senha nova na
  própria linha da Equipe, o que derruba os outros aparelhos, e volta o e-mail; o barbeiro fala
  com o dono (`apps/barbearia/src/lib/avisoDeEmailTrocado.ts`). Salvar sem mexer no e-mail não
  avisa; quem não tinha e-mail não tem a quem avisar. A Equipe diz, embaixo do campo, que o
  e-mail de agora recebe o aviso. ⚠️ Só sai de verdade com o envio de e-mail ligado — o que falta,
  acima. Visto rodando, com o e-mail em arquivo: trocado pela Equipe, o aviso foi para o
  endereço antigo, com o novo mascarado. Guarda: os casos novos de
  `apps/barbearia/tests/email-da-equipe.test.ts`.
- **Quem não tem e-mail** — o dono do Bayron, e quase toda a equipe — continua dependendo de
  alguém: o barbeiro, do dono, pela tela da equipe; o dono, de você, pelo
  `scripts/set-admin-password.mjs`. ⚠️ A regra manual continua: só troque a senha se o pedido
  vier **do próprio número de login**.

<details><summary>Como estava, até 09/10/2026</summary>

> **Decidido em 08/10/2026: e-mail**, pedido no cadastro — um canal só, para a recuperação
> de senha e para os avisos de fim de teste e de cobrança (`PLANO-PRODUTIZACAO.md` §13).
>
> **O e-mail é pedido desde 08/10/2026**, obrigatório pela web, e gravado em minúsculas em
> `barbers.email` (migration 0006). O resto — o envio, a tela "esqueci minha senha" e a troca
> derrubando as sessões abertas — ainda não existe.

Encontrado em 27/09/2026, desenhando a jornada do barbeiro (`JORNADA-DO-BARBEIRO.md` §2.2).

**Não existe "esqueci minha senha".** Quem troca a senha de um dono hoje é você, rodando
`scripts/set-admin-password.mjs` — o próprio script se apresenta como o caminho de suporte.
~~E o cadastro não pede e-mail~~ — ✅ pede desde 08/10/2026
(`apps/barbearia/src/pages/api/cadastrar.ts:81`). Quem nasceu antes, e quem nasce pelo script
de linha de comando, fica sem: a coluna aceita vazio, e o dono do Bayron é um desses.

No autoatendimento, a senha criada às pressas no cadastro é a que ele esquece, e cada
esquecimento vira um chamado — com o suporte tendo que caber em meia hora por cliente
(§1.4).

⚠️ **Até existir, a regra manual:** só troque a senha se o pedido vier **do próprio número
de login**. Qualquer um pode mandar WhatsApp dizendo ser dono de uma barbearia; o número
de login é a única prova que você tem. E trocar a senha **não derruba a sessão aberta** —
a revogação ficou de sobra da onda 1 (§6).

~~**Falta decidir o canal:**~~ — decidido em 08/10/2026: e-mail (o bloco no topo). As opções,
como estavam:

- **Código pelo WhatsApp** — é o login dele, e ele lê. Exige o serviço de envio que o
  aviso antes de cobrar também exige (§1.3).
- **Link por e-mail** — mais barato de construir, e ele pode nunca abrir. Põe um campo a
  mais no cadastro.

Recomendação: um canal só para as duas coisas, recuperação e aviso de cobrança — um para
construir e manter, não dois.

**O que falta construir, nesta ordem:** o envio de e-mail — o provedor depende do domínio
(§0); a tela "esqueci minha senha", que pede o WhatsApp de login e manda o link ao e-mail
gravado, sem dizer se o número existe; a troca de senha derrubando as sessões abertas; e um
lugar no painel para ver e trocar o e-mail — hoje não há, nem para corrigir um digitado
errado. Recomendo confirmar o e-mail por um link já no primeiro envio: a forma é conferida
no cadastro, a existência não.

</details>

---

## 5. Verificações pendentes

- ✅ **AppBarber e Trinks permitem domínio próprio?** **Não** — verificado em
  01/09/2026: eles oferecem site, mas sempre em **subdomínio deles**. Virou linha na
  tabela comparativa da página de vendas e sustenta o modelo do §1.1.
- **R$ 100/mês vende para barbearia sem sistema?** Continua sendo a maior incerteza do
  projeto inteiro, agora com margem mais apertada para errar. Só 5 conversas respondem.
- **Quantas barbearias o app e o banco aguentam na VPS?** Ela já foi comprada. *Corrigido em
  12/10/2026 — a pergunta era "quantas instâncias cabem", com `docker stats` em 5 containers,
  do desenho de uma instância por barbearia.* Com um app para todas, responde uma carga com
  dezenas de barbearias de mentira, olhando a memória e o tempo de resposta — não feita
  (`ARQUITETURA-PRODUCAO.md` §7).
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
rotas que ele não enxergava. ~~Sobra do bloco: a revogação de sessão por troca de senha~~ —
✅ feita em 09/10/2026 (§2.13). O §2.7 (foto de produto) foi feito em 24/09, com a galeria.

**Achados de 25/09/2026, ✅ já consertados — eram da onda 0:** a transação dentro da
requisição (§2.19) e a agenda do dia sem resposta (§2.20). Os dois derrubariam o dia da
migração, e nenhum aparecia na suíte. Junto, o guarda de escopo por consulta (§2.18) e a
foto de celular (§2.21). Abertos no mesmo dia, para as ondas abaixo: §2.22, §2.23 e §2.24 —
✅ os três feitos em 09/10/2026.

**Achados de 27/09/2026, no primeiro teste de ponta a ponta na máquina do dono, ✅ já
consertados:** o WhatsApp de toda barbearia nova (§2.25), o nome e o endereço do Bayron
(§2.26), a agenda do dia presa em 08:00–19:00 (§2.27) e três textos falsos (§2.28). Com eles
saíram os centavos (§2.15, do item 1 da onda 2) e os dois `+ 3` da agenda do dia (§2.11).
Os três que ficaram registrados — o `+ 3` do bloqueio, o `-180` da ocupação e o gráfico por
hora do relatório — saíram no mesmo dia, à noite, junto com um sexto lugar da conta, o calendário do
cliente (§2.11), e o ícone do Astro na aba de toda barbearia (`JORNADA-DO-BARBEIRO.md` §2.8).

**Achados de 10/10/2026, no roteiro do dono na máquina dele, ✅ já consertados:** os três links
de mapa vazios, o Instagram e o texto "sobre" sem conteúdo, o menu que levava a "Agenda do
dia" ao resumo, as reservas que não diziam ser de produto e o cadastro sem o aviso do teste
(§2.32). As quatro decisões que ficaram, você tomou em 11/10 — o aviso de agenda por e-mail e a
conferência do mapa, feitos no mesmo dia (§2.33).

**11/10/2026, à noite, o que estava na fila e não dependia de você, ✅ feito:** a exportação dos
dados, também fora do ar (§3.6); o limite por telefone na área do cliente (§2.33); a saúde para o
monitor (§3.4); a imagem sem as dependências de desenvolvimento (§3.12); e a troca do superusuário
do banco, pronta para rodar (§3.10). Achados no caminho, ✅ consertados: o backup que voltava sem as
permissões do app (§3.11), o provisionador que nunca rodou no container (§3.12) e o rodapé de
Configurações que mentia (§2.35).

**Achado de 11/10/2026, no mesmo roteiro, ✅ já consertado:** o portal de toda barbearia dizia
"Portal Bayron" (§2.34). E, pedido por você no mesmo dia, o painel do operador — ver e operar
as barbearias sem `psql` (§3.9).

**12/10/2026, escolhidos por você na véspera, ✅ feitos:** o fuso de cada barbearia — pelo
estado, editável em Configurações (§2.1), o que fecha a onda 3 abaixo —, e os documentos que
ainda descreviam uma instância por barbearia: o `ARQUITETURA-PRODUCAO.md`, reescrito, e os
§3.1, §3.2 e §3.3 deste. A exclusão do cliente a pedido, decidida na mesma conversa —
anonimizar os agendamentos dele —, ficou para depois e **não está feita** (§1.2).

**12/10/2026, pedido por você no mesmo dia, ✅ feito:** o painel do operador em seis telas, como o
do barbeiro, com as anotações na ficha (§3.9). Achado no caminho, ✅ consertado: o JSON que ia ao
banco como texto — o corpo dos eventos da Asaas e o registro do "tirar do ar" (§2.36).

**12/10/2026, escolhidos por você no mesmo dia, ✅ feitos:** o backup saindo da VPS em partes
(§3.3) — falta ligar em produção, que é seu —; o banco recusando horário duplo, o passo 7 que
faltava (§2.37); e a limpeza: as entregas antigas e os scripts da época do SQLite fora (§4.6 e
§3.12), o teste que mantém a cobrança num canto só (`ARQUITETURA-COBRANCA-V1.md` §2) e "Mover
horário" só com os horários livres (§2.27).

**12/10/2026, à noite, escolhidos por você depois da vasculhada geral, ✅ feitos:** o conferidor
de tipos zerado e no CI (§2.29); estender a carência pelo painel do operador (§3.9); e o
rascunho da landing, com o `/acessar` levando ao painel central (§4.15). O botão de apagar o
cliente a pedido (§1.2) saiu da lista, por decisão sua: *"ninguém pede isso"*.

**13/10/2026, escolhidos por você depois da explicação detalhada, ✅ feitos:** as quatro travas
pequenas — o dia da semana sem o fuso do servidor (§2.1), o `.env.example` completo (§4.17), a
sobra das 08:00–19:00 na agenda do dia (§2.27) e a nota "0,0" (§4.11) —; o aviso ao e-mail antigo
(§4.17); o conferidor no site de vendas (§2.29); as cores da logo (§4.2); o código de 6 dígitos
no painel do operador (§3.9); e o ensaio da migração do Bayron com as 17 migrations
(`ROTEIRO-MIGRACAO-PRODUCAO.md` §0.2). Achado no caminho, ✅ consertado: o encaixe manual e a
comanda no painel central (§2.38). O teste de carga ficou de fora, por escolha sua (§5).

**13/10/2026, depois, pedido por você, ✅ feito:** uma área principal por tela — duas, uma
dentro da outra, em treze telas do painel do dono, e nenhuma nas quatro de entrar (§2.39). E, em
seguida, o site: o topo de cinco telas e o botão do WhatsApp fora de qualquer área (§2.40).

**Onda 2 — antes de abrir o cadastro público.**

> ⚠️ **10/10/2026:** o app está no ar, com o cadastro fechado. Abrir é o fim desta onda, não o
> começo — o que falta está no §2.31.

> ⚠️ **08/10/2026:** o desenho mudou (`PLANO-PRODUTIZACAO.md` §13). Os itens 4 e 5 abaixo
> valem com um layout, a cor e o e-mail no cadastro, e o cartão no fim do teste.
No autoatendimento a porta abre sem ninguém olhando, então nada aqui é opcional.

*Decisões suas, que o código não substitui:* o termo aceito no cadastro, com a cláusula
da cobrança do cartão (§1.2); ~~o que acontece quando o cartão recusa (§1.3)~~; a política
de suporte escrita na tela (§1.4); o domínio (§0); ~~quantas cores o dono escolhe, e se o
fundo é dele ou do layout (§4.13)~~; e ~~o canal da recuperação de senha (§4.17)~~. Propostas
em 27/09, também suas: ~~o cartão antes de a barbearia existir, e onde mora o código da
cobrança (§4.14)~~. Os riscados foram decididos em 08/10/2026 (`PLANO-PRODUTIZACAO.md` §13);
o teste que acaba sem cartão segue os mesmos 3 dias — confirmado no mesmo dia (§1.3).
~~*Acrescentadas em 10/10/2026:* como o barbeiro fica sabendo de agendamento novo, e se a data
de nascimento continua sendo a senha do cliente~~ — decididas em 11/10/2026: e-mail, feito; e a
data de nascimento fica, e vai no termo (§2.33 e §1.2).

*Código, nesta ordem* — detalhada pelo caminho do barbeiro em
`JORNADA-DO-BARBEIRO.md` §5:

0. **Acrescentado em 27/09/2026:** a conta na Asaas e a prova no sandbox, antes de
   qualquer código da onda. É o único ponto que pode desmentir o desenho do cartão
   (`JORNADA-DO-BARBEIRO.md` §2.5). E abrir a conta não depende de código: se exigir CNPJ,
   é prazo que corre por fora (`ARQUITETURA-COBRANCA-V1.md` §11) — melhor começar já.
   *10/10/2026: a chave do sandbox existe; a prova não foi feita (§4.14). E o código da
   cobrança veio antes dela, por escolha sua no mesmo dia — o que o sandbox desmentir volta
   para o código.*
1. ~~Os dois que já mordem hoje e tinham ficado fora de todas as ondas de 15/09: os centavos
   do preço (§2.15) e o combo em qualquer dia (§2.16). Junto, os três de 25/09 que são uma
   linha cada: a semana do painel (§2.22), o login só com JSON (§2.23) e o resumo do combo
   (§2.24)~~ — ✅ os centavos em 27/09; o resto em 09/10/2026.
2. ~~O que todo cadastro encontra no primeiro minuto: a tela de agendar vazia (§4.9) e o
   passo inútil do barbeiro único (§2.2)~~ — ✅ feitos em 09/10/2026, com o hover do botão
   padrão (§4.12).
   - ~~**2b. Acrescentado em 09/10/2026:** o CSRF entre subdomínios (§2.30). Com o cadastro
     aberto, qualquer pessoa cria um subdomínio — e um XSS em qualquer um deles alcança o painel
     de todas as barbearias~~ — ✅ fechado no mesmo dia.
3. ~~Endereços reservados~~ — ✅ feitos em 08/10/2026 — ~~e um jeito de tirar do ar (§4.16)~~ —
   ✅ o painel do operador, em 11/10/2026 (§3.9).
4. ~~Os três layouts, com as cores do dono (§4.13)~~ — ✅ feito em 08/10/2026, no desenho
   do mesmo dia: um layout, com a cor e a frase do topo escolhidas no cadastro e a tela
   "o seu site está no ar" no fim (`JORNADA-DO-BARBEIRO.md` §2.4 e `JORNADA-DO-BARBEIRO.md` §2.8).
5. ~~O teste de 7 dias~~ e ~~a página de suspensão~~ — ✅ feitos em 08/10/2026, com a
   contagem dos dias no painel —, ~~a cobrança (§4.14 e §3.5) e o botão de cancelar~~ — no
   código em 10/10/2026, sem a prova no sandbox (§4.14). O cadastro não abre sem ela.
   - **5c. Acrescentado em 10/10/2026:** a tela de fim do cadastro dizia *"o seu site está no
     ar"* sem saber — ✅ agora confere antes (`JORNADA-DO-BARBEIRO.md` §2.8). E o CI, com a
     `main` indo para produção (§3.8).
   - **5b.** ~~A recuperação de senha (§4.17) e o aviso antes de cobrar (§1.3), que usam o
     mesmo canal~~ — ✅ feitos em 09/10/2026, pelo e-mail. Falta o provedor de envio, que
     depende do domínio (§4.17).
6. A landing, o `/acessar` e a aposentadoria do `/onboarding` (§4.15) — por último de
   propósito: ela descreve o produto pronto. *O rascunho e o `/acessar`, em 12/10/2026; falta
   a sua voz no texto e a decisão de aposentar o `/onboarding`.*
7. ~~A página "Como fica" (§4.10) — as imagens têm que mostrar os três layouts, então vem
   depois deles~~ — ✅ feita em 09/10/2026, com um layout só. O print do site sai sem foto, e
   o texto ao lado promete fotos: entra na landing nova (item 6).

**Onda 3 — antes do primeiro cliente fora do UTC-3. ✅ FEITA em 12/10/2026.** *(Era a onda 2
em 15/09.)* ~~As contas de offset (§2.11) e o teste de fuso passando a pegá-las~~ — ✅ feitos
em 27/09. ~~Sobra a coluna `timezone` por barbearia (§2.1)~~ — ✅ feita em 12/10/2026, em
`tenants`, pelo estado do cadastro e editável em Configurações.


0. ~~**Limpar o seed das migrations** (`PENDENCIAS-ABERTAS.md` §4.6)~~ — **sem objeto desde
   13/09/2026.** As migrations de SQLite que plantavam o nome, o endereço, os produtos e as
   227 avaliações do Bayron não existem mais no repositório; ver
   `PENDENCIAS-ABERTAS.md` §4.6. Sobrou o discriminador `shortName === "Bayron"`, que virou
   `PENDENCIAS-ABERTAS.md` §4.7 — ✅ trocado pelo endereço em 09/10/2026.
1. ~~**Decidir o login do painel** (§1.5)~~ — decidido e implementado em 09/09.
   Falta cadastrar o telefone dos barbeiros do Bayron antes do segundo cliente.
2. ~~**As duas minas** (§2.1, §2.2)~~ — o fuso (§2.1) foi centralizado em 10/09 e
   está com guarda-corpo; ~~sobrou o fuso por barbearia, que só morde no passo 6~~ — ✅ feito
   em 12/10/2026.
   ~~**Falta o wizard (§2.2)**~~ — ✅ feito em 09/10/2026.
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
