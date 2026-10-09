-- O hover do par padrão de cores — docs/PENDENCIAS-ABERTAS.md §4.12, 09/10/2026.
--
-- O botão do site é preenchimento escuro com texto BRANCO, e o hover tem que
-- escurecer (src/lib/accent.ts). O par padrão — o de toda barbearia que não
-- escolheu cor, o Bayron inclusive — tinha o hover MAIS CLARO que o botão:
-- #0d9488, 3,74:1 com branco, abaixo do piso de 4,5:1. O botão era legível parado
-- e piorava com o mouse em cima.
--
-- O novo é o ACCENT_PADRAO.hover de src/lib/accent.ts, #0b5f58 (7,52:1), que o
-- provisionamento de barbearia nova já gravava. Duas coisas:
--
--   1. o padrão da coluna, para linha nova sem cor;
--   2. as linhas com o par padrão ANTIGO, exato. Quem escolheu cor no painel ou no
--      cadastro tem o hover derivado da cor dele e não é tocado.
--
-- ⚠️ Na migração da produção (docs/ROTEIRO-MIGRACAO-PRODUCAO.md), esta migration
-- roda DEPOIS da carga do SQLite: é ela que conserta a linha do Bayron, que chega
-- com o hover antigo.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE settings ALTER COLUMN accent_hover SET DEFAULT '#0b5f58';

UPDATE settings
   SET accent_hover = '#0b5f58'
 WHERE lower(accent_color) = '#0f766e'
   AND lower(accent_hover) = '#0d9488';

COMMIT;
