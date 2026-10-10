-- 0010 — A cobrança da Asaas: os ids que ligam a barbearia à assinatura, o fim do
-- período pago de quem cancelou, e os eventos do webhook (10/10/2026).
--
-- ── O QUE ENTRA EM `tenants` ─────────────────────────────────────────────────
--
-- `asaas_customer_id`, `asaas_subscription_id`, `asaas_checkout_ids`: como cada
-- evento do webhook acha a barbearia. A Asaas não garante a ordem dos eventos, e
-- cada um traz uma chave diferente — o do Checkout traz o id dele, o da
-- assinatura traz o cliente, o da cobrança traz a assinatura. A assinatura é
-- única: duas barbearias com a mesma seriam um pagamento reativando a errada. O
-- CLIENTE NÃO: o mesmo dono pode ter duas barbearias, e o evento que só traz o
-- cliente, nesse caso, não escolhe nenhuma (`src/lib/cobranca.ts`). Achado no
-- ensaio de 10/10/2026: com o cliente único, o segundo cadastro do mesmo dono
-- quebrava o webhook a cada reentrega.
--
-- Os Checkouts são uma LISTA, os últimos 20: o dono que clica duas vezes abre
-- dois, e pode pagar no primeiro — que, guardado só o último, ficaria sem
-- barbearia, com o cartão cadastrado e o site saindo do ar no fim do teste.
--
-- `subscription_ends_at`: quem cancela continua no ar até o fim do período pago,
-- e só depois sai — sem tarefa agendada, como o teste e a carência
-- (`src/lib/situacao.ts`, migration 0007). Nulo é o caso normal.
--
-- ── `webhook_events` ─────────────────────────────────────────────────────────
--
-- O evento cru, gravado ANTES de processar e na mesma transação: a Asaas entrega
-- "pelo menos uma vez", e o mesmo pagamento processado duas vezes pode reativar
-- uma barbearia suspensa (`docs/ARQUITETURA-COBRANCA-V1.md` §5.1). A `UNIQUE` é
-- a idempotência; a resposta 200 só sai depois do COMMIT.
--
-- ⚠️ `tenant_id` aceita NULO, e é a única tabela com `tenant_id` assim: o evento
-- que não acha barbearia nenhuma fica guardado para alguém olhar, em vez de
-- sumir. Por isso ela tem a mesma política das outras (`tests/rls.test.ts`) — e
-- o papel do app não tem acesso nenhum: quem lê e grava é o webhook, como dono.
-- Linha com `tenant_id` nulo é invisível para qualquer barbearia.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS asaas_customer_id     text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS asaas_subscription_id text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS asaas_checkout_ids    text[] NOT NULL DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at  timestamptz;

CREATE INDEX        IF NOT EXISTS tenants_asaas_customer_id_idx     ON tenants (asaas_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_asaas_subscription_id_key ON tenants (asaas_subscription_id);
CREATE INDEX        IF NOT EXISTS tenants_asaas_checkout_ids_idx    ON tenants USING gin (asaas_checkout_ids);

COMMENT ON COLUMN tenants.asaas_customer_id IS
  'O cliente da barbearia na Asaas (cus_...). Gravado pelo webhook do Checkout.';
COMMENT ON COLUMN tenants.asaas_subscription_id IS
  'A assinatura em vigor na Asaas (sub_...). Trocada quando o dono cadastra outro cartão.';
COMMENT ON COLUMN tenants.asaas_checkout_ids IS
  'Os últimos 20 Checkouts criados para a barbearia: é por eles que o CHECKOUT_PAID acha quem pagou.';
COMMENT ON COLUMN tenants.subscription_ends_at IS
  'Assinatura cancelada: no ar até aqui, fora do ar depois (src/lib/situacao.ts). Nulo é o normal.';

CREATE TABLE IF NOT EXISTS webhook_events (
  tenant_id         integer REFERENCES tenants(id),
  id                serial PRIMARY KEY,
  gateway           text NOT NULL DEFAULT 'asaas',
  gateway_event_id  text NOT NULL,
  event             text NOT NULL,
  payload           jsonb NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  outcome           text,
  CONSTRAINT webhook_events_uma_vez UNIQUE (gateway, gateway_event_id)
);
CREATE INDEX IF NOT EXISTS webhook_events_tenant_id_idx ON webhook_events (tenant_id);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON webhook_events;
CREATE POLICY tenant_isolado ON webhook_events
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- A 0003 dá ao papel do app acesso a toda tabela nova (ALTER DEFAULT PRIVILEGES).
-- Esta não: só o webhook, como dono, lê e grava.
REVOKE ALL ON webhook_events FROM barbearia_app;
REVOKE ALL ON SEQUENCE webhook_events_id_seq FROM barbearia_app;

COMMIT;
