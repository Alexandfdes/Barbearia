-- 0020 — O site novo vai ao ar depois da sua aprovação; e o operador troca o e-mail do dono (05/11/2026).
--
-- ── 1. O SITE NOVO ESPERA A APROVAÇÃO ────────────────────────────────────────
--
-- Com o cadastro aberto e o certificado curinga, a página de um estranho iria ao ar sob o
-- domínio do produto em minutos, sem ninguém ver. Se uma delas for golpe, quem paga é o
-- domínio inteiro — nos filtros de e-mail e nos alertas do navegador —, e com ele o site de
-- todo cliente (revisão de 05/11/2026). Decisão do dono em 05/11/2026: nos primeiros meses,
-- o site de quem se cadastra pela web só abre depois que o operador olhar e aprovar.
--
-- `site_aprovado_em` nulo = esperando. O painel funciona inteiro; o endereço do site mostra
-- "em preparação", sem nada que a pessoa escreveu (src/lib/previaDoSite.ts).
--
-- ⚠️ O PADRÃO É `now()`, E É DE PROPÓSITO. As que já existem nascem aprovadas — estão no ar
-- hoje. E o que cria barbearia fora do cadastro pela web — o `npm run db:provisionar`, que é
-- você criando à mão, e os testes — também. Só o `/cadastrar` grava nulo
-- (`provisionarBarbearia`, com `esperaAprovacao`), e `tests/aprovacao-do-site.test.ts` confere
-- que ele é o único INSERT em `tenants` do código.
--
-- ── 2. O REGISTRO ACEITA AS DUAS AÇÕES NOVAS ─────────────────────────────────
--
-- 'aprovou-site' e 'trocou-email-do-dono'. A segunda é a saída de quem esqueceu a senha com
-- o e-mail errado ou não confirmado: o "esqueci" só manda para e-mail confirmado (0019), e a
-- saída até aqui era SQL no console do servidor (revisão de 05/11/2026, 🟠 5).
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS site_aprovado_em timestamptz DEFAULT now();
COMMENT ON COLUMN tenants.site_aprovado_em IS
  'Quando o operador aprovou o site. Nulo: em preparação — o painel funciona, o endereço não mostra o site (src/lib/previaDoSite.ts).';

ALTER TABLE acoes_do_operador DROP CONSTRAINT IF EXISTS acoes_do_operador_acao_valida;
ALTER TABLE acoes_do_operador ADD CONSTRAINT acoes_do_operador_acao_valida
  CHECK (acao IN ('entrou', 'estendeu-teste', 'estendeu-carencia', 'suspendeu', 'reativou', 'anotou',
                  'liberou-telefones', 'aprovou-site', 'trocou-email-do-dono'));

COMMENT ON TABLE acoes_do_operador IS
  'O que o operador fez no painel /operador: entrou, estendeu o teste ou a carência, tirou do ar, reativou, anotou, liberou os telefones da equipe, aprovou o site, trocou o e-mail do dono (src/lib/operadorBarbearias.ts).';

COMMIT;
