# Precificação — dados verificados e economia unitária

> **Revisado em 01/09/2026**: mensalidade baixada de R$ 180 para **R$ 100** e meta
> reduzida de 15 para **10 clientes**. As versões anteriores (28/08 e 30/08) estão
> resumidas no §1 como histórico — não como recomendação.
>
> Preços de concorrente e de infraestrutura foram conferidos direto nas páginas
> oficiais nas datas indicadas. As contas de margem foram recalculadas para R$ 100.
>
> ⚠️ **24/09/2026: não existe mais implantação.** O cadastro virou autoatendimento,
> com 7 dias grátis (`PLANO-PRODUTIZACAO.md` §13). Deixam de valer a frase "a montagem
> do site está inclusa" (§2) e a premissa das 3,5h (§5). **O preço não mudou.** O que
> passa a decidir a conta é quantos dos que testam pagam — número que ainda não existe.

---

## 1. Histórico dos preços que já existiram

Registro, não recomendação.

| Quando | Modelo | O que aconteceu |
|---|---|---|
| 24/05/2026 | R$ 2.500 de entrada + R$ 180/mês | `orcamentos/entrega-bayron-v5.docx`. **Recusado** — motivo declarado: preço e "o TopSalão já resolvia" |
| 30/08/2026 | R$ 180/mês, sem taxa de entrada | O plano anual substituiu o setup como instrumento de caixa |
| **01/09/2026** | **R$ 100/mês, sem taxa de entrada** | **Vigente.** Ver §2 |

O v5 também traz cláusulas que continuam valendo e que o `PENDENCIAS-ABERTAS.md`
ainda lista como abertas: garantia de 60 dias, aviso prévio de 30 dias para cancelar,
e suspensão após 15 dias de atraso com um aviso por escrito. **Antes de "decidir"
inadimplência ou suporte, ler o v5** — já tem texto redigido.

## 2. Decisão vigente

| Plano | Valor | Observação |
|---|---|---|
| **Mensal** | **R$ 100/mês** | Cancelamento com aviso de 30 dias |
| **Anual, à vista** | **R$ 1.000/ano** | Paga 10 meses, usa 12. Sai por R$ 83/mês |

Sem taxa de instalação: a montagem do site está inclusa. ⚠️ *Desde 24/09 não há
montagem: o dono monta sozinho (ver o topo).*

**Meta: 10 clientes** = R$ 1.000/mês de receita bruta.

## 3. Concorrentes — verificado em 28/08 e 30/08/2026

| Produto | Preço | Cobertura |
|---|---|---|
| Trinks | **R$ 76,00/mês** | 1–2 profissionais |
| AppBarber | **R$ 79,90/mês** | 1 profissional (R$ 109,90 para 2–5) |
| Booksy | **R$ 99,99/mês** | Plano único |
| TopSalão | ~R$ 40/mês | O que o Bayron pagava — **não verificado**, SSL quebrado |

**A R$ 100 você está exatamente no preço do Booksy** e acima de Trinks e AppBarber.
O argumento deixa de ser "custa mais porque entrega mais" e passa a ser **"custa o
mesmo e entrega mais"** — que é mais fácil de defender numa conversa.

> ✅ **Resolvido em 01/09/2026:** os concorrentes **oferecem site, mas sempre em
> subdomínio deles**. Isso confirma o eixo de diferenciação e virou linha na tabela
> comparativa da página de vendas. A dúvida que estava aberta desde 30/08 fechou.

Referência do outro eixo: site institucional simples custa R$ 1.000–2.500 com
freelancer e R$ 2.500–5.000 com agência.

## 4. Infraestrutura — verificado em 28/08/2026

| Item | Valor |
|---|---|
| Hostinger KVM2 (8 GB, 2 vCPU) | R$ 43,99 promo / **R$ 77,99 renovação** |
| Domínio .com.br (Registro.br) | **R$ 40,00/ano** |

VPS já comprada. A premissa é que as 10 instâncias cabem nela — **ainda não medido**
(`docker stats` com 5 containers resolve).

Com subdomínio incluso (§6), o custo de domínio **sai da conta base**: só entra quando
o cliente opta por domínio próprio, e nesse caso é ele quem paga.

## 5. Economia unitária a R$ 100

Premissas: R$ 40/h de valor-hora, 3,5h de implantação, rateio de 12 instâncias por VPS
(infra de R$ 10,83 por cliente/mês).

| Cenário | Suporte | Custo total | Margem | × 10 clientes |
|---|---|---|---|---|
| 1,5h de suporte/mês | R$ 60,00 | R$ 70,83 | **R$ 29,17** | R$ 292 |
| 1,0h de suporte/mês | R$ 40,00 | R$ 50,83 | R$ 49,17 | R$ 492 |
| **0,5h de suporte/mês** | R$ 20,00 | R$ 30,83 | **R$ 69,17** | **R$ 692** |

Implantação: 3,5h custam R$ 140 e a margem de caixa é R$ 89,17 → **paga em 1,6 mês**
(era 0,8 mês a R$ 180). Continua saudável.

⚠️ *Histórico desde 24/09/2026: sem implantação, esses R$ 140 por cliente saem da conta.
O §5.1 continua valendo inteiro — no autoatendimento, o que o dono não aprende na tela
vira mensagem para você.*

### 5.1 🔴 O suporte deixou de ser detalhe e virou a condição do preço

A R$ 180, 1,5h de suporte por cliente cabia com folga. **A R$ 100 ela come 60% da
mensalidade.**

E o número que decide a questão: a **R$ 110/h**, que é o valor-hora honesto de serviço
e não o de salário disfarçado, R$ 100 com 1,5h de suporte dá **prejuízo de R$ 75,83 por
cliente por mês**. A mesma conta com 0,5h dá lucro de R$ 34,17.

> **R$ 100 fecha se, e somente se, o suporte cair para cerca de meia hora por cliente
> por mês.** Não é uma meta de eficiência — é a condição de existir margem.

Consequência direta para o roadmap: **o medidor de completude no painel e a política de
suporte escrita saem de "🟠 pode esperar" e viram pré-requisito do preço.** São os dois
itens que fazem o barbeiro resolver sozinho em vez de mandar mensagem no sábado.

### 5.2 O que a redução custou

| | R$ 180/mês | R$ 100/mês |
|---|---|---|
| Receita ano 1 por cliente | R$ 2.160 | **R$ 1.200** |
| Margem mensal (1,5h de suporte) | R$ 109,17 | **R$ 29,17** (−73%) |
| Margem mensal (0,5h de suporte) | R$ 149,17 | R$ 69,17 |
| Meta de 10 clientes rende (1,5h) | R$ 1.092/mês | **R$ 292/mês** |
| Meta de 10 clientes rende (0,5h) | R$ 1.492/mês | **R$ 692/mês** |
| Caixa no dia da venda (anual) | R$ 1.800 | **R$ 1.000** |

### 5.3 O que continua valendo das versões anteriores

**A infra é ruído; o suporte é quase todo o custo variável.** A R$ 100 isso deixa de ser
observação e vira o eixo da viabilidade — a infra é 11% do custo, o suporte é 65%.

**Não baixar mais.** Abaixo de R$ 100 você entra na faixa do Trinks e do AppBarber sem
nada que compense, e a margem a 1,5h de suporte já seria negativa.

## 6. Domínio — decidido em 01/09/2026

**Subdomínio nosso incluso; domínio próprio como opção paga pelo cliente.**

- Todo cliente entra em `barbeariax.fadeline.com.br`, sem custo e sem trabalho:
  DNS curinga mais Traefik emitindo certificado por host.
- Quem quiser domínio próprio paga o registro (R$ 40/ano) no CPF/CNPJ dele, e você
  aponta e opera como responsável técnico.

Por que não incluir o domínio próprio: a R$ 100 de mensalidade, R$ 40/ano do próprio
bolso é meio mês de margem por cliente, e quem cancela no mês 2 leva o registro junto.

Por que não abandonar o domínio próprio: é justamente o que os concorrentes **não**
fazem (§3). Oferecer como opção preserva o diferencial sem comprar o custo.

A página de vendas foi corrigida em 01/09 nos **quatro** lugares que prometiam o domínio
como incluso: o card "Um site seu", o item do plano, e as duas perguntas do FAQ.

## 7. O que continua aberto

| Item | Situação |
|---|---|
| **R$ 100/mês vende para barbearia sem sistema?** | Continua sendo a maior incerteza do projeto. Só 5 conversas respondem. |
| Quantas instâncias cabem na VPS | `docker stats` com 5 containers. Assume-se que 10 cabem. |
| Quantas barbearias existem em Mossoró | A meta de 10 não depende mais desse número, mas ele diz se dá para crescer. |
| Teste de restauração de backup | Adiado por decisão de 01/09. **Deveria acontecer antes do primeiro cliente pagante.** |
