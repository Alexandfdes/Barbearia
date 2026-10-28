-- 0012 — O registro do que o operador faz no painel dele (11/10/2026).
--
-- O painel do operador (`/operador`, `src/lib/operador.ts`) lista as barbearias e
-- age sobre elas: estende o teste, tira do ar, reativa. Antes dele, essas três
-- coisas eram `psql` à mão em produção (docs/PENDENCIAS-ABERTAS.md §3.9).
--
-- ── POR QUE GRAVAR CADA AÇÃO ─────────────────────────────────────────────────
--
-- Duas razões, e a segunda é a que decide:
--
--  1. Saber depois quem tirou a barbearia do ar, quando e por quê. Com uma pessoa
--     só operando, parece dispensável; no primeiro "meu site saiu do ar sozinho",
--     não é.
--  2. O REATIVAR precisa saber como a barbearia estava antes. Tirar do ar grava
--     `status = 'suspended'` por cima do status de antes — teste, em dia ou
--     atrasada —, e só este registro guarda qual era. Sem ele, reativar seria
--     chutar: "em dia" daria o produto de graça a quem estava no teste.
--
-- A entrada no painel também é gravada (`acao = 'entrou'`, sem barbearia): é o
-- que mostra uma entrada que não foi sua, se a senha vazar. As tentativas erradas
-- vão só para o log — gravá-las deixaria quem testa senhas encher a tabela.
--
-- ── A MESMA REDE DAS OUTRAS ──────────────────────────────────────────────────
--
-- `tenant_id` aceita NULO (a entrada no painel não é de barbearia nenhuma), como
-- em `webhook_events`, e pelo mesmo motivo ganha a mesma política — a que
-- `tests/rls.test.ts` exige em toda tabela com `tenant_id`. E, como lá, o papel do
-- app não tem acesso nenhum: quem lê e grava é o painel do operador, como dono.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

CREATE TABLE IF NOT EXISTS acoes_do_operador (
  tenant_id  integer REFERENCES tenants(id),
  id         serial PRIMARY KEY,
  acao       text NOT NULL,
  -- O que a ação precisa para ser entendida depois: o status de antes, os dias
  -- estendidos, o motivo digitado.
  detalhe    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  criada_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acoes_do_operador DROP CONSTRAINT IF EXISTS acoes_do_operador_acao_valida;
ALTER TABLE acoes_do_operador ADD CONSTRAINT acoes_do_operador_acao_valida
  CHECK (acao IN ('entrou', 'estendeu-teste', 'suspendeu', 'reativou'));

CREATE INDEX IF NOT EXISTS acoes_do_operador_tenant_id_idx ON acoes_do_operador (tenant_id, criada_em DESC);

COMMENT ON TABLE acoes_do_operador IS
  'O que o operador fez no painel /operador: entrou, estendeu o teste, tirou do ar, reativou (src/lib/operadorBarbearias.ts).';

ALTER TABLE acoes_do_operador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON acoes_do_operador;
CREATE POLICY tenant_isolado ON acoes_do_operador
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- A 0003 dá ao papel do app acesso a toda tabela nova (ALTER DEFAULT PRIVILEGES).
-- Esta não: só o painel do operador, como dono, lê e grava.
REVOKE ALL ON acoes_do_operador FROM barbearia_app;
REVOKE ALL ON SEQUENCE acoes_do_operador_id_seq FROM barbearia_app;

COMMIT;
