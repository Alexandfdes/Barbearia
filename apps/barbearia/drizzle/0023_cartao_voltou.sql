-- 0023 — A volta do dono do Checkout da Asaas, com o cartão cadastrado (23/11/2026).
--
-- Revisada e aprovada pelo dono em 25/11/2026, junto com a janela de 48 horas.
--
-- Quem confirma o cartão é o webhook (CHECKOUT_PAID), nunca a volta. Mas, com a fila do webhook
-- parada — no sandbox, em 23/11/2026, ela parou com 2 falhas e a confirmação atrasou horas —, só a
-- URL (`?cartao=ok`) sabia que ele tinha voltado: saindo da tela, o painel, a faixa e os e-mails
-- voltavam a pedir o cartão, e cadastrar de novo criava uma SEGUNDA assinatura
-- (`docs/PENDENCIAS-ABERTAS.md` §4.14). Esta coluna guarda a volta.
--
-- Não muda a situação de ninguém: só o que o painel diz e se ele abre outro Checkout
-- (`esperaDoCartao`, em `src/lib/assinatura.ts`). Gravada pela tela de assinatura na volta, se a
-- barbearia ainda não está em dia (`registrarVoltaDoCartao`, em `src/lib/cobranca.ts`); apagada
-- quando ela fica em dia pelo webhook, e quando o dono abre um Checkout novo.
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro. As barbearias que já
-- existem ficam com nulo — o normal.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cartao_voltou_em timestamptz;

COMMENT ON COLUMN tenants.cartao_voltou_em IS
  'Quando o dono voltou do Checkout da Asaas com o cartão cadastrado (?cartao=ok) e a confirmação do webhook ainda não tinha chegado. Nulo: não voltou, ou já confirmou.';

COMMIT;
