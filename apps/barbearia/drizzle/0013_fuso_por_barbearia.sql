-- 0013 — O fuso horário de cada barbearia (12/10/2026)
-- docs/PENDENCIAS-ABERTAS.md §2.1.
--
-- Até aqui o fuso era um só para o processo inteiro, a variável TZ_BARBEARIA. E um
-- processo serve todas as barbearias: com uma em Manaus e outra em Mossoró, uma das
-- duas tinha todos os horários deslocados em uma hora — o agendamento, a agenda do
-- dia, o bloqueio, os e-mails —, sem nenhum aviso na tela.
--
-- O fuso passa a ser da barbearia: nasce do estado que o dono escolhe no cadastro
-- (src/lib/timezone.ts, `fusoDoEstado`) e ele troca em Configurações.
--
-- Mora em `tenants`, e não em `settings`, de propósito: toda conta de data precisa
-- dele — inclusive fora de qualquer requisição, como a tarefa dos avisos —, e a linha
-- de `tenants` já fica em memória (src/lib/tenant.ts). Em `settings`, sob o RLS, cada
-- requisição só enxergaria o fuso da própria barbearia, e o cache das outras ficaria
-- com o padrão, errado e calado.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- A linha que já existe fica com o fuso que o processo usava até hoje: o padrão,
-- o do Bayron (Mossoró/RN). Nada muda de horário no deploy — e, se o servidor
-- rodava com outro TZ_BARBEARIA, o boot avisa (scripts/startup.mjs).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Fortaleza';

-- Os 16 fusos do Brasil, os mesmos de `FUSOS_DO_BRASIL`. Um nome errado aqui
-- derrubaria toda formatação de data da barbearia com um RangeError — o banco recusa
-- antes. `tests/fuso-por-barbearia.test.ts` confere que esta lista e a do código são
-- iguais.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_timezone_do_brasil;
ALTER TABLE tenants ADD CONSTRAINT tenants_timezone_do_brasil CHECK (timezone IN (
  'America/Noronha', 'America/Sao_Paulo', 'America/Fortaleza', 'America/Recife',
  'America/Maceio', 'America/Bahia', 'America/Araguaina', 'America/Belem',
  'America/Santarem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande',
  'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Eirunepe'
));

COMMENT ON COLUMN tenants.timezone IS
  'Fuso IANA da barbearia: os horários dela, a agenda e os e-mails (src/lib/timezone.ts). '
  'Nasce do estado no cadastro; o dono troca em Configurações.';

COMMIT;
