-- O teste de 7 dias e a carência de 3 — decisões do dono em 08/10/2026
-- (docs/PLANO-PRODUTIZACAO.md §13): o cartão é pedido no FIM do teste, e a
-- barbearia que não paga — no fim do teste ou numa cobrança que falha — tem 3
-- dias de carência antes de sair do ar.
--
-- ⚠️ O TEMPO NÃO É GRAVADO, É CALCULADO. Nada aqui muda de status sozinho: não
-- existe tarefa agendada que passe `trial` para `suspended` à meia-noite. O que se
-- grava é o INÍCIO de cada prazo — `trial_ends_at` e `past_due_since` —, e a fase
-- de agora (no teste, na carência, suspensa) sai de `src/lib/situacao.ts`, em cada
-- requisição. Rejeitado: um job diário mudando o status. Seria mais uma peça para
-- rodar em produção, e o dia em que ela não rodasse ninguém perceberia: a
-- barbearia ficaria de graça para sempre, ou fora do ar sem motivo.
--
-- `suspended` continua existindo, e passa a querer dizer só uma coisa: tirada do
-- ar por você, à mão (docs/PENDENCIAS-ABERTAS.md §4.16). A suspensão por falta de
-- pagamento não é status — é `trial` ou `past_due` com o prazo vencido.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at  timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS past_due_since timestamptz;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_valido;
ALTER TABLE tenants ADD CONSTRAINT tenants_status_valido
  CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled'));

-- Teste sem data de fim seria teste para sempre — e é exatamente o defeito que
-- ninguém nota, porque o site continua no ar.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_teste_tem_fim;
ALTER TABLE tenants ADD CONSTRAINT tenants_teste_tem_fim
  CHECK (status <> 'trial' OR trial_ends_at IS NOT NULL);

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_atraso_tem_inicio;
ALTER TABLE tenants ADD CONSTRAINT tenants_atraso_tem_inicio
  CHECK (status <> 'past_due' OR past_due_since IS NOT NULL);

COMMENT ON COLUMN tenants.status IS
  'trial = no teste grátis (até trial_ends_at, mais a carência). active = pagando. '
  'past_due = a cobrança falhou em past_due_since (carência, depois fora do ar). '
  'suspended = tirada do ar à mão. cancelled = saiu. A fase de agora: src/lib/situacao.ts.';
COMMENT ON COLUMN tenants.trial_ends_at IS
  'Fim do teste: meia-noite do 8º dia depois do cadastro, no fuso da barbearia. A carência começa aqui.';
COMMENT ON COLUMN tenants.past_due_since IS
  'Quando a cobrança falhou. A carência começa aqui.';

COMMIT;
