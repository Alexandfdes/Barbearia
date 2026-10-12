-- 0016 — A carência estendida pelo operador (12/10/2026).
--
-- O painel do operador estendia o teste, e não a carência: o dono com a cobrança
-- atrasada que pedia "pago sexta" saía do ar no fim dos 3 dias, ou o operador o
-- tirava do ar à mão e reativava depois — mexendo no status para dar um prazo
-- (docs/PENDENCIAS-ABERTAS.md §3.9, "Não feito, sugestões").
--
-- ── O FIM NOVO, NÃO UM COMEÇO FALSO ──────────────────────────────────────────
--
-- `past_due_since` continua dizendo quando a cobrança falhou. A extensão grava o
-- FIM da carência, em `carencia_ate`, e a fase de agora (src/lib/situacao.ts) usa
-- o mais tarde dos dois: os 3 dias contados de `past_due_since`, ou `carencia_ate`.
-- Rejeitado: empurrar `past_due_since` para a frente. A conta daria o mesmo, mas a
-- data em que a cobrança falhou — que a ficha do operador mostra — passaria a mentir.
--
-- ── A EXTENSÃO VALE PARA AQUELE ATRASO ───────────────────────────────────────
--
-- Pagou, `past_due_since` volta a vazio; atrasou de novo, ganha outra data. Nos
-- dois casos a extensão de antes não vale mais — e quem a apaga é o banco, no
-- gatilho abaixo. Cinco lugares do código mexem em `past_due_since` (o webhook da
-- Asaas, o cancelar, o reativar do operador); o que esquecesse de apagar deixaria a
-- carência estendida de um atraso valendo para o seguinte. O CHECK diz o mesmo do
-- outro lado: carência estendida só existe com atraso.
--
-- Nada aqui pede superusuário: o dono da tabela cria a função e o gatilho dela
-- (tests/usuario-do-app.test.ts).
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS carencia_ate timestamptz;

COMMENT ON COLUMN tenants.carencia_ate IS
  'Fim da carência estendido pelo operador. Vale para o atraso de past_due_since: o gatilho '
  'tenants_carencia_cai_com_o_atraso apaga quando past_due_since muda. A fase de agora: src/lib/situacao.ts.';

CREATE OR REPLACE FUNCTION carencia_cai_com_o_atraso() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.past_due_since IS DISTINCT FROM OLD.past_due_since THEN
    NEW.carencia_ate := NULL;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION carencia_cai_com_o_atraso() IS
  'A carência estendida (tenants.carencia_ate) vale para um atraso só: some quando past_due_since muda (migration 0016).';

DROP TRIGGER IF EXISTS tenants_carencia_cai_com_o_atraso ON tenants;
CREATE TRIGGER tenants_carencia_cai_com_o_atraso
  BEFORE UPDATE OF past_due_since ON tenants
  FOR EACH ROW EXECUTE FUNCTION carencia_cai_com_o_atraso();

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_carencia_so_com_atraso;
ALTER TABLE tenants ADD CONSTRAINT tenants_carencia_so_com_atraso
  CHECK (carencia_ate IS NULL OR past_due_since IS NOT NULL);

ALTER TABLE acoes_do_operador DROP CONSTRAINT IF EXISTS acoes_do_operador_acao_valida;
ALTER TABLE acoes_do_operador ADD CONSTRAINT acoes_do_operador_acao_valida
  CHECK (acao IN ('entrou', 'estendeu-teste', 'estendeu-carencia', 'suspendeu', 'reativou', 'anotou'));

COMMENT ON TABLE acoes_do_operador IS
  'O que o operador fez no painel /operador: entrou, estendeu o teste ou a carência, tirou do ar, reativou, anotou (src/lib/operadorBarbearias.ts).';

COMMIT;
