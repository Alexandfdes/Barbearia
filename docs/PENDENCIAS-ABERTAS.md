# Pendências em aberto

> Registro vivo do que ainda **não** está definido. Atualizado: 2026-09-01.
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

## 2. Minas no código (verificadas)

### 2.1 🔴 `[TÉCNICO]` Timezone escrito em 19 arquivos

`America/Fortaleza` aparece **22 vezes em 19 arquivos de `src/`** como constante de
código, não lida do ambiente. O `.env.example` tem `TZ`, mas só
`scripts/backup-daemon.mjs` respeita (`process.env.TZ ?? ...`); o resto ignora.

Hoje você escapa por coincidência: Fortaleza é UTC-3 sem horário de verão, igual a São
Paulo, Recife, Salvador e Rio. **Manaus e Cuiabá são UTC-4; o Acre é UTC-5.** Vender
para lá gera horário errado em silêncio — o pior tipo de defeito possível num sistema de
agendamento, porque ninguém percebe até o cliente chegar na hora errada.

Correção: uma constante única lida de `process.env.TZ`, substituindo as 22 ocorrências.
É barato agora e caríssimo de descobrir com cliente pagando.

### 2.2 🟠 `[TÉCNICO]` Wizard obriga escolher barbeiro mesmo havendo um só

`src/pages/agendar.astro:303` — "Escolha o barbeiro" é o passo 2 de 4, sempre.
Verificado: **não existe lógica de pular** quando há um único barbeiro ativo.

O alvo é barbearia pequena sem sistema — boa parte é de um profissional só. Hoje o
cliente dele faz um passo inútil e o wizard anuncia "4 passos" quando são 3. Atrito bobo
no ponto mais sensível do funil.

Correção: pular o passo e ajustar o contador quando `barbers.length === 1`.

### 2.3 🟠 `[TÉCNICO]` O projeto do site do produto não tem controle de versão

`C:\DEV\produto` tem `.gitignore` mas **não é repositório git** — verificado em
30/08/2026. A página de vendas, o formulário de onboarding, a caixa de entrada dos
envios e a autenticação estão todos sem histórico. Um `Remove-Item` errado apaga tudo
sem volta.

Correção: `git init` e um primeiro commit. Cinco minutos.

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

---

## 4. Especificações que faltam escrever

### 4.1 🔴 `[TÉCNICO]` Tela inicial sem fotos

Regra acordada: **nenhuma seção meia-boca** — ou tem conteúdo, ou não é renderizada.
Galeria vazia some, depoimentos vazios somem, produtos somem (a maioria das barbearias
não vende nada). Sobra um site mínimo de quatro blocos que já é respeitável: topo,
serviços, localização e rodapé.

O que exige desenho de verdade é o **topo sem foto**: hoje é foto grande com
escurecimento; sem foto vira retângulo preto. A saída acordada é uma segunda versão
tipográfica — fundo escuro, brilho na cor de destaque, nome em serifada grande, frase e
botão — tratada como escolha de design e não como falha.

⚠️ **Ficou mais urgente com o provisionamento automático.** A promessa nova é que o
cliente pague e já veja a plataforma na cor dele. Se ele pagar e cair num retângulo
preto, a promessa quebra no primeiro minuto.

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

### 4.4 🔴 `[TÉCNICO]` Medidor de completude no painel — pré-requisito do preço

"Seu site está 70% completo — faltam fotos da galeria e o texto sobre a barbearia."
Empurra o dono a preencher sozinho e reduz suporte. Falta definir os itens e os pesos.

⚠️ **Subiu de 🟠 para 🔴 em 01/09/2026.** É uma das duas alavancas que derrubam a hora
de suporte, e a R$ 100 isso decide se existe margem (§1.4 e `PRECIFICACAO.md` §5.1).

### 4.5 🟠 `[DECISÃO]` Catálogo de serviços padrão do template

Alguém precisa sentar e escrever serviço por serviço, com preço sugerido, o catálogo de
uma barbearia brasileira típica. Não dá para reaproveitar os 20 serviços do Bayron: são
os dele, com os preços dele. Mesmo vale para o FAQ padrão e para os textos
institucionais de exemplo.

---

## 5. Verificações pendentes

- ✅ **AppBarber e Trinks permitem domínio próprio?** **Não** — verificado em
  01/09/2026: eles oferecem site, mas sempre em **subdomínio deles**. Virou linha na
  tabela comparativa da página de vendas e sustenta o modelo do §1.1.
- **R$ 100/mês vende para barbearia sem sistema?** Continua sendo a maior incerteza do
  projeto inteiro, agora com margem mais apertada para errar. Só 5 conversas respondem.
- **Quantas instâncias cabem na VPS?** Ela já foi comprada e a premissa é que as 10
  cabem. `docker stats` com 5 containers confirma ou desmente numa tarde.
- **Restauração de backup** (§3.3), uma vez, antes do primeiro cliente pago.

---

## 6. Ordem sugerida

1. **`git init` no projeto do produto** (§2.3). Cinco minutos, evita perda total.
2. **As duas minas** (§2.1, §2.2). Baratas agora, caras com cliente pagando.
3. **Registrar o domínio** (§0). Nome escolhido sem domínio registrado é nome de outra pessoa amanhã.
4. **Tela sem fotos** (§4.1). É o que o cliente vê no minuto seguinte ao pagamento.
   A cor de destaque (§4.2) já está feita.
4b. **Política de suporte e medidor de completude** (§1.4, §4.4). A R$ 100 eles decidem
   se existe margem — deixaram de ser melhoria.
5. **Contrato e política de inadimplência** (§1.2, §1.3). Antes do primeiro real entrar.
6. Operação (§3.x) — pode esperar o **segundo** cliente, não o décimo.
