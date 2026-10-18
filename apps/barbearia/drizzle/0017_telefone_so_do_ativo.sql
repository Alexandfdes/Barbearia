-- 0017 — O telefone de login fica preso só enquanto o barbeiro está ATIVO (18/10/2026).
--
-- Até aqui o índice `barbers_phone_uq` (migration 0002) valia para todo barbeiro, ativo
-- ou não, e o telefone não se editava: o barbeiro desligado da barbearia A não entrava na
-- B nem cadastrava a dele, o número digitado errado ficava errado para sempre, e quem
-- fazia o teste grátis cadastrava o WhatsApp de outra pessoa e o prendia
-- (docs/PENDENCIAS-ABERTAS.md §2.54). Decisão do dono: "deixe evitável".
--
-- Agora o mesmo telefone pode estar em várias linhas — no máximo UMA ativa. O login e o
-- "esqueci a senha" acham o barbeiro ativo; reativar alguém cujo número já é de outro
-- barbeiro ativo é recusado pelo índice, e a tela diz o que fazer. O dono edita o
-- telefone na Equipe.
--
-- Nada aqui pede superusuário: o dono da tabela cria e apaga o índice dela.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS barbers_phone_ativo_uq
  ON barbers (phone)
  WHERE phone IS NOT NULL AND active;

DROP INDEX IF EXISTS barbers_phone_uq;

-- O login busca por telefone em toda tentativa, inclusive as que falham: com o índice
-- único só das linhas ativas, a busca pelo telefone de quem foi desligado varreria a
-- tabela. Este cobre as duas.
CREATE INDEX IF NOT EXISTS barbers_phone_idx ON barbers (phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN barbers.phone IS
  'Telefone de login, só dígitos (10 ou 11), normalizado por lib/phone.ts. Único no mundo entre os barbeiros ATIVOS (barbers_phone_ativo_uq, migration 0017): é o que identifica a barbearia no login do painel central.';

COMMIT;
