-- 0018 — O operador libera os telefones da equipe de uma barbearia fora do ar (26/10/2026).
--
-- Desde a 0017 o telefone de login é único só entre os barbeiros ATIVOS. Mas a barbearia
-- que sai do ar — teste abandonado, cobrança vencida, cancelada — continua com a equipe
-- ativa: o dono fora do ar só alcança a tela de assinatura, e ninguém conseguia desligar
-- os barbeiros dele. O funcionário de um teste abandonado não entrava na equipe de outra
-- barbearia, nem cadastrava a dele: "Este WhatsApp já é o login de outro barbeiro". Só
-- pelo `psql` (achado na varredura de 26/10/2026).
--
-- A ação nova do painel do operador desliga a equipe — menos o dono — de uma barbearia
-- fora do ar, e fica registrada. Esta migration só aceita o nome dela no registro.
--
-- Nada aqui pede superusuário. Idempotente: pode rodar duas vezes sem erro.

BEGIN;

ALTER TABLE acoes_do_operador DROP CONSTRAINT IF EXISTS acoes_do_operador_acao_valida;
ALTER TABLE acoes_do_operador ADD CONSTRAINT acoes_do_operador_acao_valida
  CHECK (acao IN ('entrou', 'estendeu-teste', 'estendeu-carencia', 'suspendeu', 'reativou', 'anotou', 'liberou-telefones'));

COMMENT ON TABLE acoes_do_operador IS
  'O que o operador fez no painel /operador: entrou, estendeu o teste ou a carência, tirou do ar, reativou, anotou, liberou os telefones da equipe de uma barbearia fora do ar (src/lib/operadorBarbearias.ts).';

COMMIT;
