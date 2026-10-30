-- 0019 — O e-mail só recebe alguma coisa depois de confirmado (30/10/2026).
--
-- Até aqui, o e-mail que o dono digitava no cadastro, ou que ele digitava para a equipe,
-- recebia na hora a senha nova, os avisos de agendamento e os do teste e da cobrança — com
-- o remetente do produto e com nomes que quem se cadastra escolhe. Digitado errado, o link
-- de senha nova ia para um estranho, que ficava com o painel. Digitado de propósito, o
-- endereço de outra pessoa recebia e-mail nosso com o texto de quem cadastrou
-- (docs/PENDENCIAS-ABERTAS.md §2.61 e §2.64).
--
-- Agora só sai e-mail para endereço confirmado, menos um: o próprio pedido de
-- confirmação, que não leva nada digitado (src/lib/confirmacaoDeEmail.ts).
--
-- O e-mail que já existe nasce NÃO confirmado: ninguém provou que ele chega. Em produção,
-- em 30/10/2026, há uma barbearia só, de teste.
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- ── 1. Quando o e-mail de agora foi confirmado ───────────────────────────────
--
-- Nulo = não confirmado. Trocar o e-mail volta para nulo (api/admin/barbers/[id].ts).
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS email_confirmado_em timestamptz;
COMMENT ON COLUMN barbers.email_confirmado_em IS
  'Quando o e-mail de agora foi confirmado pelo link. Nulo: não confirmado, e nada sai para ele (src/lib/confirmacaoDeEmail.ts).';

-- ── 2. Os links de confirmação ───────────────────────────────────────────────
--
-- Como a senha nova (0008): guarda o HASH do token, nunca o token. `email` é o endereço
-- para onde o link foi: o link confirma ESSE endereço, e morre se o e-mail do barbeiro
-- mudar depois.
CREATE TABLE IF NOT EXISTS confirmacoes_de_email (
  tenant_id   integer NOT NULL REFERENCES tenants(id),
  id          serial PRIMARY KEY,
  barber_id   integer NOT NULL,
  email       text NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usada_em    timestamptz,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT confirmacoes_de_email_barbeiro_fkey
    FOREIGN KEY (barber_id, tenant_id) REFERENCES barbers (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS confirmacoes_de_email_tenant_id_idx ON confirmacoes_de_email (tenant_id);
CREATE INDEX IF NOT EXISTS confirmacoes_de_email_barbeiro_idx ON confirmacoes_de_email (tenant_id, barber_id);

-- ── A rede do banco — a mesma da 0008 ────────────────────────────────────────
ALTER TABLE confirmacoes_de_email ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON confirmacoes_de_email;
CREATE POLICY tenant_isolado ON confirmacoes_de_email
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

GRANT SELECT, INSERT, UPDATE, DELETE ON confirmacoes_de_email TO barbearia_app;
GRANT USAGE, SELECT ON SEQUENCE confirmacoes_de_email_id_seq TO barbearia_app;

COMMIT;
