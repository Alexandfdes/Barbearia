---
name: barbearia-cobranca
description: "Regras da cobrança pela Asaas no Fadeline — o webhook, os eventos, o cancelar e o que nunca automatizar. Use ao mexer em src/lib/cobranca.ts, src/lib/asaas.ts, no webhook, na tela de assinatura ou no que o operador vê da cobrança."
---

# Cobrança pela Asaas — o que já custou dinheiro, ou quase

O webhook é a **única** coisa que muda a situação de uma barbearia sozinha. Cada defeito dele é
alguém pagando e saindo do ar, ou alguém sem pagar e ficando. Onde mora:

| O quê | Onde |
|---|---|
| As regras (o que cada evento faz, o cancelar, o Checkout) | `apps/barbearia/src/lib/cobranca.ts` |
| A API da Asaas (`pedir`, com prazo) | `apps/barbearia/src/lib/asaas.ts` |
| A rota do webhook (token, 200 × 500) | `apps/barbearia/src/pages/api/asaas/webhook.ts` |
| O desenho | `docs/ARQUITETURA-COBRANCA-V1.md` §5 |
| O que falta provar no sandbox | `docs/PENDENCIAS-ABERTAS.md` §4.14 |

## 1. A documentação da Asaas não é o sandbox

**O código foi escrito pelos exemplos da documentação, e o sandbox ainda não foi testado.** Tudo
o que a documentação diz e o código assume vira pergunta no `docs/PENDENCIAS-ABERTAS.md` §4.14 — e o
que o sandbox desmentir volta para o código. Fato conferido na documentação vai com a data
("conferido em 17/10/2026"), nunca de memória.

Os três que já viraram defeito, conferidos na documentação em 17/10/2026:

- **No cartão, o `PAYMENT_RECEIVED` chega ~32 dias depois do `PAYMENT_CONFIRMED`** — depois do
  vencimento seguinte. Nunca trate "chegou um pagamento" como "a cobrança atual foi paga": até
  17/10, o aviso da mensalidade do mês passado tirava do atraso quem não pagou este. Atrasada, a
  barbearia só sai do atraso quando é paga a cobrança que FALHOU (`cobrancasQueFalharamSemPagar`).
  A contestação ganha também volta como pagamento.
- **A Asaas gera cada cobrança 40 dias antes do vencimento**, e o `nextDueDate` da assinatura é o
  da próxima a GERAR. Logo depois de pagar, ele já está um mês à frente do que foi pago.
- **Remover a assinatura apaga as cobranças pendentes e vencidas dela.**

## 2. O webhook

1. **O evento é gravado cru antes de tudo**, na mesma transação, e o id dele é único: a Asaas
   entrega "pelo menos uma vez". Repetido, não faz nada.
2. **200 ou 500 decide a fila de todas as barbearias.** 15 falhas seguidas interrompem a fila do
   webhook inteiro; a Asaas guarda os avisos por 14 dias e reenvia ao reativar (Integrações →
   Webhooks). Erro do próprio evento — que se repetiria em toda reentrega — fica guardado com o
   motivo e responde 200. Banco fora ou erro de programa: 500, e a fila parar é o certo.
3. **O token é comparado em tempo constante**, e sem `ASAAS_WEBHOOK_TOKEN` a rota recusa tudo.
4. **Barbearia tirada do ar à mão não é mexida por evento nenhum** (`MEXE_SOZINHO`).
5. **Só conta a cobrança da assinatura em vigor:** a de uma antiga, removida quando o cartão foi
   trocado, não atrasa ninguém.

## 3. O que nunca se automatiza

**Dinheiro devolvido** — estorno e contestação — é alerta, nunca mudança sozinha. E todo desfecho
que diz "tratar à mão" começa por um de `DESFECHOS_QUE_PEDEM_OLHO`
(`apps/barbearia/src/lib/operadorBarbearias.ts`): é a lista que o Início e a Cobrança do operador
leem. Até 17/10/2026 eram duas cópias da regra, sem o `alerta`, e a contestação não aparecia em tela
nenhuma. O `tests/cobranca.test.ts` reprova desfecho "à mão" fora da lista.

**Na dúvida entre duas barbearias, não escolha.** O mesmo cliente da Asaas pode ser de duas
barbearias do mesmo dono: o evento ambíguo fica guardado para o operador. E nada que remove na
Asaas — assinatura, cobrança — pode agir sobre "todas as do cliente".

## 4. As armadilhas do código

- **Data em SQL cru vai como texto ISO e volta como texto** (`comoData`): o Drizzle desliga a
  conversão de data do driver na conexão inteira.
- **JSON em SQL cru: `${JSON.stringify(x)}::text::jsonb`**, nunca só `::jsonb`.
- **Tela ou rota de barbearia não importa a cobrança**, nem por um arquivo do meio
  (`tests/cobranca-isolada.test.ts`).
- **Chamada à Asaas numa tela tem prazo** (o do operador, 4 s) e mora na tela, não na função que
  monta os números — senão os testes daquela função chamam a Asaas de verdade.
- **A chave da Asaas não aparece em erro, log nem tela.** Os testes procuram por ela.
- **Nos testes, a Asaas é de mentira** — a `fetch` trocada, como em `tests/cobranca.test.ts`. Nunca
  o sandbox de verdade numa suíte.

## 5. Antes de dizer que está pronto

- [ ] O caso de dois eventos fora de ordem, e do mesmo evento repetido, está na suíte?
- [ ] O caso que paga uma cobrança DIFERENTE da que falhou?
- [ ] Desfecho novo que pede mão está na lista do "pede olho"?
- [ ] O que a documentação disse e o código assumiu virou pergunta no `docs/PENDENCIAS-ABERTAS.md` §4.14?
- [ ] O conserto foi desfeito e o caso certo ficou vermelho (skill `barbearia-provar-o-teste`)?
