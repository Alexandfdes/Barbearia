-- 0021 — A versão do termo de uso aceita no cadastro, gravada junto da barbearia (10/11/2026).
--
-- Decidido em 24/09/2026 (`docs/PENDENCIAS-ABERTAS.md` §1.2): sem ninguém no caminho do
-- autoatendimento, o termo de uso e o aviso de privacidade têm de ser aceitos na tela de cadastro,
-- com a versão aceita gravada junto da barbearia. Esta migration é só o lugar onde isso fica.
--
-- ⚠️ NULO É O NORMAL HOJE. O texto final ainda não existe — o rascunho espera o advogado, fora
-- deste repositório —, e enquanto `VERSAO_DOS_TERMOS` (`src/lib/termos.ts`) for nula o cadastro não
-- pede aceite e nada é gravado aqui. As barbearias que já existem, e as que você cria à mão
-- (`npm run db:provisionar`), também ficam nulas: não aceitaram nada pela tela.
--
-- As duas colunas andam juntas: versão sem data, ou data sem versão, o banco recusa.
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS termos_versao text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS termos_aceitos_em timestamptz;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_termos_juntos;
ALTER TABLE tenants ADD CONSTRAINT tenants_termos_juntos
  CHECK ((termos_versao IS NULL) = (termos_aceitos_em IS NULL));

COMMENT ON COLUMN tenants.termos_versao IS
  'A versão do termo de uso e do aviso de privacidade aceita no cadastro (src/lib/termos.ts). Nulo: não aceitou nada pela tela.';
COMMENT ON COLUMN tenants.termos_aceitos_em IS
  'Quando o dono marcou o aceite, no cadastro pela web. Nulo junto com termos_versao.';

COMMIT;
