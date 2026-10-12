-- 0014 — As anotações do operador, e o JSON que ficava gravado como texto (12/10/2026).
--
-- O painel do operador ganhou telas — Início, Barbearias e a ficha de cada uma,
-- Cobrança, Registro e Sistema — e, na ficha, um campo para anotar o que se
-- combinou com o dono: "liguei dia 12, paga sexta" (decisão do dono em
-- 12/10/2026, docs/PENDENCIAS-ABERTAS.md §3.9).
--
-- ── 1. A ANOTAÇÃO MORA NO MESMO REGISTRO DAS AÇÕES ───────────────────────────
--
-- Em `acoes_do_operador` (0012), como `acao = 'anotou'` e o texto em `detalhe`, e
-- não numa tabela nova:
--
--  · ela é uma coisa que o operador fez, com data, hora e IP — o formato de lá;
--  · só se acrescenta: não se edita nem se apaga, como o resto do registro. A
--    anotação errada se corrige com outra anotação, e as duas ficam;
--  · a rede já está montada na 0012: RLS, e o papel do app sem acesso nenhum.
--
-- ── 2. O JSON GRAVADO COMO STRING ────────────────────────────────────────────
--
-- Achado ao escrever as telas: `${JSON.stringify(x)}::jsonb` pelo `sqlConn`
-- gravava uma STRING JSON — `"{\"statusAnterior\":\"active\"}"` — sempre que o
-- Drizzle ainda não tinha tocado o pool no processo. O driver serializa de novo o
-- parâmetro tipado jsonb; o Drizzle troca esse serializador quando é usado pela
-- primeira vez. O painel do operador e o webhook da Asaas não passam pelo
-- Drizzle no começo da requisição, e podem ser a primeira coisa depois de um
-- deploy. Gravado assim, o reativar não achava como a barbearia estava antes
-- (`detalhe->>'statusAnterior'`), e o valor do pagamento (`payload->'payment'`)
-- sumia das telas. O código passou a mandar `::text::jsonb`
-- (tests/jsonb-parametro.test.ts); aqui, as linhas antigas viram objeto. A que não
-- for JSON válido fica como está — melhor que derrubar o boot por uma linha.
--
-- Nenhum dos dois passos pede superusuário: quem é dono da tabela troca a regra
-- dela e as linhas dela (tests/usuario-do-app.test.ts).
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE acoes_do_operador DROP CONSTRAINT IF EXISTS acoes_do_operador_acao_valida;
ALTER TABLE acoes_do_operador ADD CONSTRAINT acoes_do_operador_acao_valida
  CHECK (acao IN ('entrou', 'estendeu-teste', 'suspendeu', 'reativou', 'anotou'));

COMMENT ON TABLE acoes_do_operador IS
  'O que o operador fez no painel /operador: entrou, estendeu o teste, tirou do ar, reativou, anotou (src/lib/operadorBarbearias.ts).';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, detalhe #>> '{}' AS texto FROM acoes_do_operador WHERE jsonb_typeof(detalhe) = 'string' LOOP
    BEGIN
      UPDATE acoes_do_operador SET detalhe = r.texto::jsonb WHERE id = r.id AND jsonb_typeof(r.texto::jsonb) = 'object';
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END LOOP;
  FOR r IN SELECT id, payload #>> '{}' AS texto FROM webhook_events WHERE jsonb_typeof(payload) = 'string' LOOP
    BEGIN
      UPDATE webhook_events SET payload = r.texto::jsonb WHERE id = r.id AND jsonb_typeof(r.texto::jsonb) = 'object';
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END LOOP;
END
$$;

COMMIT;
