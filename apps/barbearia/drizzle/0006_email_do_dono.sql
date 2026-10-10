-- O e-mail de quem entra no painel — decisão de 08/10/2026
-- (docs/PLANO-PRODUTIZACAO.md §13): é por ele que vão a recuperação de senha e
-- os avisos do fim do teste e da cobrança. O WhatsApp continua sendo o LOGIN; o
-- e-mail é só o canal.
--
-- ⚠️ ANULÁVEL, como o telefone na 0002. Os barbeiros que já existem não têm, e
-- inventar um seria pior que deixar vazio. O cadastro passa a pedir; quem entrou
-- antes vai ser pedido no painel.
--
-- Sem índice único, de propósito: o login é o telefone, e a recuperação começa
-- por ele — o e-mail só diz para onde mandar. O dono de duas barbearias com o
-- mesmo e-mail não confunde nada.

BEGIN;

ALTER TABLE barbers ADD COLUMN IF NOT EXISTS email text;

-- A aplicação já guarda minúsculo e confere o formato; a trava é a segunda
-- parede, para o que chegar por fora dela (script, psql).
ALTER TABLE barbers DROP CONSTRAINT IF EXISTS barbers_email_formato;
ALTER TABLE barbers ADD CONSTRAINT barbers_email_formato
  CHECK (email IS NULL OR (length(email) <= 254 AND email = lower(email) AND email LIKE '%_@_%._%'));

COMMENT ON COLUMN barbers.email IS
  'Para onde vão a recuperação de senha e os avisos (teste, cobrança). Minúsculo. Não é login: o login é o telefone.';

COMMIT;
