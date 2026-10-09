-- A recuperação de senha e os avisos por e-mail — decisão do dono em 08/10/2026:
-- o canal é o e-mail, pedido no cadastro desde a 0006 (docs/PLANO-PRODUTIZACAO.md
-- §13, docs/PENDENCIAS-ABERTAS.md §4.17).
--
-- Três coisas, e as duas tabelas novas com a mesma rede das outras (RLS e a
-- política `tenant_isolado`): tests/rls.test.ts reprova tabela com `tenant_id` sem
-- ela.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- ── 1. Trocar a senha derruba as sessões abertas ─────────────────────────────
--
-- A sessão é um cookie lacrado, sem registro no servidor: até aqui, trocar a
-- senha não tirava ninguém de dentro, por até 30 dias (docs/PENDENCIAS-ABERTAS.md
-- §2.13). Agora o cookie carrega quando foi emitido, e a sessão emitida ANTES da
-- última troca de senha deixa de valer (`src/lib/session.ts`). Nulo = nunca
-- trocou, e toda sessão vale — ninguém é derrubado no dia em que isto entra.
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS senha_trocada_em timestamptz;
COMMENT ON COLUMN barbers.senha_trocada_em IS
  'Última troca de senha. Sessão emitida antes disto não vale (src/lib/session.ts).';

-- ── 2. Os pedidos de "esqueci minha senha" ───────────────────────────────────
--
-- ⚠️ O token NÃO é guardado — só o hash dele. Quem lesse esta tabela (um backup
-- esquecido, um dump de suporte) não conseguiria trocar a senha de ninguém.
-- Vale uma hora e uma vez só.
CREATE TABLE IF NOT EXISTS redefinicoes_de_senha (
  tenant_id   integer NOT NULL REFERENCES tenants(id),
  id          serial PRIMARY KEY,
  barber_id   integer NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expira_em   timestamptz NOT NULL,
  usada_em    timestamptz,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  -- A parede de verdade, como nas outras: o pedido não aponta para barbeiro de
  -- outra barbearia nem por engano.
  CONSTRAINT redefinicoes_de_senha_barbeiro_fkey
    FOREIGN KEY (barber_id, tenant_id) REFERENCES barbers (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS redefinicoes_de_senha_tenant_id_idx ON redefinicoes_de_senha (tenant_id);

-- ── 3. Os avisos já mandados ─────────────────────────────────────────────────
--
-- A tarefa de avisos roda de hora em hora (src/lib/avisos.ts). O que impede o
-- dono de receber o mesmo e-mail 24 vezes por dia é esta trava: um aviso por
-- barbearia, por tipo, por prazo. `referencia` é o prazo do aviso — o fim do
-- teste, o fim da carência —, então um prazo novo é um aviso novo.
CREATE TABLE IF NOT EXISTS avisos_enviados (
  tenant_id   integer NOT NULL REFERENCES tenants(id),
  id          serial PRIMARY KEY,
  tipo        text NOT NULL,
  referencia  timestamptz NOT NULL,
  enviado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avisos_enviados_uma_vez UNIQUE (tenant_id, tipo, referencia)
);
CREATE INDEX IF NOT EXISTS avisos_enviados_tenant_id_idx ON avisos_enviados (tenant_id);

-- ── A rede do banco — a mesma da 0003 e da 0005 ──────────────────────────────
ALTER TABLE redefinicoes_de_senha ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON redefinicoes_de_senha;
CREATE POLICY tenant_isolado ON redefinicoes_de_senha
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

ALTER TABLE avisos_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON avisos_enviados;
CREATE POLICY tenant_isolado ON avisos_enviados
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

GRANT SELECT, INSERT, UPDATE, DELETE ON redefinicoes_de_senha, avisos_enviados TO barbearia_app;
GRANT USAGE, SELECT ON SEQUENCE redefinicoes_de_senha_id_seq, avisos_enviados_id_seq TO barbearia_app;

COMMIT;
