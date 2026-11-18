-- 0022 — Promoções em horários ociosos (17/11/2026).
--
-- A barbearia tem horários vazios. Uma promoção num deles só compensa se trouxer cliente
-- novo bastante para cobrir o desconto dado a quem já viria pagando o preço cheio. O painel
-- calcula o desconto MÁXIMO que ainda mantém o lucro (src/lib/promocoes.ts) e mostra ao
-- dono; o dono escolhe e ativa. Nada se ativa sozinho (docs/PENDENCIAS-ABERTAS.md §2.72).
--
-- Quatro coisas:
--   1. o custo do produto, que entra na conta — sem ele, a promoção do combo fica bloqueada;
--   2. quantos clientes novos a barbearia supõe que uma promoção traz (g, de 2 a 6);
--   3. a tabela das promoções;
--   4. no agendamento, qual promoção deu o desconto.
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- ── 1. O custo do produto ────────────────────────────────────────────────────
--
-- Em centavos. Nulo = o dono não informou, e a promoção do combo com esse produto fica
-- bloqueada, com o aviso na tela. Nunca vai para o site: as rotas públicas listam as
-- colunas (src/pages/api/products/index.ts, src/pages/api/combos/index.ts).
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_cents integer;
COMMENT ON COLUMN products.cost_cents IS
  'Quanto o produto custa à barbearia, em centavos. Nulo: não informado — a promoção do combo fica bloqueada (src/lib/promocoesDaBarbearia.ts). Só o dono vê.';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_custo_valido;
ALTER TABLE products ADD CONSTRAINT products_custo_valido
  CHECK (cost_cents IS NULL OR cost_cents >= 0);

-- ── 2. Quantos clientes novos uma promoção traz (g) ─────────────────────────
--
-- Uma premissa, não uma medida: o padrão é 4, e o dono escolhe entre 2 e 6. Medir de
-- verdade é o próximo passo (docs/PENDENCIAS-ABERTAS.md §2.72).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS promo_clientes_novos integer NOT NULL DEFAULT 4;
COMMENT ON COLUMN settings.promo_clientes_novos IS
  'Quantos clientes novos a barbearia supõe que uma promoção traz a um horário (g, de 2 a 6). Entra no desconto máximo (src/lib/promocoes.ts).';
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_promo_clientes_novos_valido;
ALTER TABLE settings ADD CONSTRAINT settings_promo_clientes_novos_valido
  CHECK (promo_clientes_novos BETWEEN 2 AND 6);

-- ── 3. As promoções ──────────────────────────────────────────────────────────
--
-- Uma linha por promoção de um combo, num dia da semana e numa faixa de horário, no fuso
-- da barbearia. A faixa vai em minutos desde a meia-noite local (13:00 = 780), as faixas
-- de src/lib/occupancy.ts.
--
-- Desativar não apaga: grava `desativada_em`, e o registro fica. Ativar de novo cria
-- outra linha. Duas ATIVAS no mesmo combo, dia e faixa, o banco recusa
-- (`promocoes_uma_ativa_por_faixa`) — dois cliques ao mesmo tempo não passam os dois.
--
-- A FK do combo é composta, como todas (0001), e por isso `combos` ganha o seu
-- UNIQUE (id, tenant_id). Apagar o combo leva junto as promoções dele (CASCADE): o combo
-- se apaga de verdade (src/pages/api/admin/combos/[id].ts), e promoção de combo que não
-- existe não tem o que vender. O agendamento feito com ela guarda o preço que pagou.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'combos_id_tenant_uq' AND conrelid = 'combos'::regclass
  ) THEN
    ALTER TABLE combos ADD CONSTRAINT combos_id_tenant_uq UNIQUE (id, tenant_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS promocoes (
  tenant_id      integer NOT NULL REFERENCES tenants(id),
  id             serial PRIMARY KEY,
  combo_id       integer NOT NULL,
  dia_da_semana  integer NOT NULL,
  inicio_min     integer NOT NULL,
  fim_min        integer NOT NULL,
  desconto_pct   integer NOT NULL,
  ativa          boolean NOT NULL DEFAULT false,
  ativada_por    integer,
  ativada_em     timestamptz,
  desativada_em  timestamptz,
  criada_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promocoes_combo_fkey
    FOREIGN KEY (combo_id, tenant_id) REFERENCES combos (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT promocoes_ativada_por_fkey
    FOREIGN KEY (ativada_por, tenant_id) REFERENCES barbers (id, tenant_id)
);
COMMENT ON TABLE promocoes IS
  'Promoções de combo em horário ocioso, ativadas pelo dono (src/lib/promocoesDaBarbearia.ts).';

ALTER TABLE promocoes DROP CONSTRAINT IF EXISTS promocoes_dia_valido;
ALTER TABLE promocoes ADD CONSTRAINT promocoes_dia_valido CHECK (dia_da_semana BETWEEN 0 AND 6);
ALTER TABLE promocoes DROP CONSTRAINT IF EXISTS promocoes_faixa_valida;
ALTER TABLE promocoes ADD CONSTRAINT promocoes_faixa_valida
  CHECK (inicio_min >= 0 AND fim_min <= 1440 AND inicio_min < fim_min);
-- O mesmo teto do desconto do combo (src/pages/api/admin/combos/index.ts).
ALTER TABLE promocoes DROP CONSTRAINT IF EXISTS promocoes_desconto_valido;
ALTER TABLE promocoes ADD CONSTRAINT promocoes_desconto_valido CHECK (desconto_pct BETWEEN 1 AND 90);
-- Ativa sem quem ativou e quando é ativa sem registro.
ALTER TABLE promocoes DROP CONSTRAINT IF EXISTS promocoes_ativa_tem_autor;
ALTER TABLE promocoes ADD CONSTRAINT promocoes_ativa_tem_autor
  CHECK (NOT ativa OR (ativada_por IS NOT NULL AND ativada_em IS NOT NULL));

CREATE INDEX IF NOT EXISTS promocoes_tenant_id_idx ON promocoes (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS promocoes_uma_ativa_por_faixa
  ON promocoes (tenant_id, combo_id, dia_da_semana, inicio_min) WHERE ativa;

ALTER TABLE promocoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON promocoes;
CREATE POLICY tenant_isolado ON promocoes
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);
GRANT SELECT, INSERT, UPDATE, DELETE ON promocoes TO barbearia_app;
GRANT USAGE, SELECT ON SEQUENCE promocoes_id_seq TO barbearia_app;

-- ── 4. Qual promoção deu o desconto do agendamento ──────────────────────────
--
-- Nulo: nenhuma. Serve para duas coisas: o link do cliente não leva o desconto para fora
-- da faixa ao remarcar (src/pages/api/appointments/by-token/[token]/reschedule.ts), e,
-- depois, medir quantos clientes as promoções trouxeram de verdade.
--
-- Sem chave estrangeira, de propósito: apagar o combo apaga as promoções dele (acima), e
-- uma FK aqui travaria esse apagar com agendamento antigo. O agendamento guarda o preço
-- que pagou; o número fica como registro.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS promocao_id integer;
COMMENT ON COLUMN appointments.promocao_id IS
  'A promoção (promocoes.id) que deu o desconto deste agendamento. Nulo: nenhuma. Sem FK: a promoção some com o combo, e o preço gravado continua.';

COMMIT;
