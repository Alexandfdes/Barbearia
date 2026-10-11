-- 0011 — O aviso de agenda por e-mail e o ponto do mapa conferido pelo dono
-- (11/10/2026). As duas decisões do mesmo dia, depois do roteiro do dono na máquina
-- dele (docs/PENDENCIAS-ABERTAS.md §2.33).
--
-- Idempotente: pode rodar duas vezes sem erro. Nenhuma tabela nova — as duas
-- colunas entram em tabelas que já têm `tenant_id`, RLS e a política de sempre.

BEGIN;

-- ── 1. Quem recebe o e-mail do que o cliente muda na agenda ──────────────────
--
-- Até aqui nada avisava o barbeiro: o cliente agendava, desmarcava ou remarcava
-- pelo site, e ele só sabia abrindo o painel (src/lib/avisoDeAgenda.ts). Recebe o
-- barbeiro do horário, se tiver e-mail, e o dono — que vê a barbearia toda.
--
-- Nasce LIGADO para todo mundo, inclusive para quem já existe: é para isso que o
-- aviso foi feito. Quem não quiser, o dono desliga na tela da Equipe.
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS avisar_agendamentos boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN barbers.avisar_agendamentos IS
  'Recebe e-mail quando um cliente agenda, desmarca ou remarca pelo site (src/lib/avisoDeAgenda.ts).';

-- ── 2. O ponto do mapa que o dono conferiu ───────────────────────────────────
--
-- O mapa do site e a rota saem de uma busca no Google — o endereço digitado, ou a
-- busca que o dono escreveu (src/lib/mapa.ts). Endereço ambíguo cai em outro lugar:
-- no roteiro de 10/10, "nova betania, natal" caiu em Mossoró, e ninguém via.
--
-- Guarda o TEXTO da busca conferida, não um "sim": mudou o endereço, mudou a busca,
-- e o painel pergunta de novo sozinho. Nulo é "nunca conferiu".
ALTER TABLE settings ADD COLUMN IF NOT EXISTS mapa_conferido text;
COMMENT ON COLUMN settings.mapa_conferido IS
  'A busca do mapa que o dono confirmou no painel. Diferente da busca de agora: o painel pergunta de novo.';

COMMIT;
