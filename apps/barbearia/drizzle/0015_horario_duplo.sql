-- 0015 — O banco recusa dois agendamentos do mesmo barbeiro no mesmo horário (12/10/2026)
-- docs/ARQUITETURA-MULTI-TENANT-V1.md §9, passo 7; docs/PENDENCIAS-ABERTAS.md §2.37.
--
-- Até aqui quem garantia era o código: o agendamento e o reagendamento entram numa
-- fila por barbeiro (`pg_advisory_xact_lock`) e conferem o conflito antes de gravar
-- (src/lib/bookAppointment.ts e src/lib/reagendar.ts). Funciona enquanto todo
-- caminho que grava horário passar pelos dois. Um caminho novo que esqueça — ou um
-- defeito na conferência — marcaria dois clientes na mesma cadeira, sem erro.
-- Agora o próprio banco recusa: a fila continua, e é ela que dá a mensagem boa; a
-- trava é o que segura se ela falhar.
--
-- A REGRA é a mesma da conferência do código: mesmo barbeiro, agendamento confirmado
-- ou concluído, intervalos que se cruzam — [início, fim), então um que termina às
-- 10:30 e outro que começa às 10:30 não se cruzam. Cancelado e falta não ocupam.
--
-- ── OS HORÁRIOS SÃO TEXTO ────────────────────────────────────────────────────────
--
-- `starts_at` e `ends_at` são texto ISO em UTC ('2026-10-12T13:00:00.000Z'), herança
-- do SQLite — o formato do `toISOString()`, que é como todo o app grava. A trava
-- precisa do instante, e a conversão de texto para instante não é aceita num índice:
-- o Postgres a chama de "estável", porque um texto SEM fuso depende do TimeZone da
-- conexão. `instante_utc` faz a mesma conversão declarada "imutável" — e isso só é
-- verdade porque o texto sempre traz o 'Z': o instante não depende de quem lê. A
-- regra `appointments_horario_utc` é o que torna isso verdade daqui em diante.
--
-- Trocar as colunas para `timestamptz` seria o certo no papel; custaria mexer em
-- cada consulta que compara horário como texto, para o mesmo resultado. Rejeitado.
--
-- ── O QUE JÁ ESTAVA NO BANCO ─────────────────────────────────────────────────────
--
-- Um banco com agendamentos sobrepostos de antes da trava não aceitaria a trava, e o
-- boot pararia: todas as barbearias fora do ar por causa do histórico de uma. O SQLite
-- da máquina de desenvolvimento tem 7 pares, de maio e junho de 2026 — cada um, um
-- agendamento de verdade e um fictício do gerador de demonstração, que gravava sem
-- conferir conflito. Em vez de parar, a trava passa a valer a partir do fim do último
-- par sobreposto. O histórico fica como estava, e daí em diante o banco recusa. O boot
-- diz desde quando (scripts/startup.mjs). Sem nenhum par — o caso de um banco novo —,
-- vale para tudo.
--
-- Do mesmo jeito, horário gravado fora do formato não para o boot: a regra do
-- formato entra valendo só para o que for gravado daqui em diante, e esses
-- agendamentos ficam fora da trava. Mas o Postgres confere a regra em toda linha
-- que muda: um desses não aceita mais cancelar nem concluir até o horário ser
-- corrigido. O boot conta quantos são. Não há nenhum no SQLite da máquina de
-- desenvolvimento.
--
-- Sem extensão: a igualdade de barbeiro vai como `int4range(barber_id, barber_id,
-- '[]')`, que o índice GiST compara sem o `btree_gist`.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- O instante de um texto ISO em UTC. "Imutável" porque o texto traz o 'Z' — a
-- regra abaixo garante.
CREATE OR REPLACE FUNCTION instante_utc(texto text) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT texto::timestamptz $$;

COMMENT ON FUNCTION instante_utc(text) IS
  'O instante de um texto ISO em UTC (''2026-10-12T13:00:00.000Z''). Imutável só porque o texto traz o Z — a regra appointments_horario_utc garante (migration 0015).';

-- O formato do toISOString(), e o fim depois do começo.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_horario_utc;
ALTER TABLE appointments ADD CONSTRAINT appointments_horario_utc CHECK (
  starts_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND ends_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  AND ends_at > starts_at
) NOT VALID;

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_sem_horario_duplo;

DO $$
DECLARE
  iso CONSTANT text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$';
  bem_formados text;
  pares integer;
  corte text;
BEGIN
  -- A regra do formato vale para as linhas que já existem quando todas passam.
  IF NOT EXISTS (
    SELECT 1 FROM appointments
     WHERE NOT (starts_at ~ iso AND ends_at ~ iso AND ends_at > starts_at)
  ) THEN
    ALTER TABLE appointments VALIDATE CONSTRAINT appointments_horario_utc;
  END IF;

  bem_formados := format('starts_at ~ %L AND ends_at ~ %L AND ends_at > starts_at', iso, iso);

  -- Os pares que já se sobrepõem — e o fim do último deles. A comparação é de texto,
  -- de propósito: no formato fixo, a ordem do texto é a do tempo, e uma linha fora do
  -- formato não derruba a conta (converter um texto torto para instante dá erro).
  SELECT count(*), max(greatest(a.ends_at, b.ends_at)) INTO pares, corte
    FROM appointments a
    JOIN appointments b ON b.barber_id = a.barber_id AND b.id > a.id
   WHERE a.status IN ('confirmed', 'completed') AND b.status IN ('confirmed', 'completed')
     AND a.starts_at ~ iso AND a.ends_at ~ iso AND a.ends_at > a.starts_at
     AND b.starts_at ~ iso AND b.ends_at ~ iso AND b.ends_at > b.starts_at
     AND a.starts_at < b.ends_at AND b.starts_at < a.ends_at;

  EXECUTE format($q$
    ALTER TABLE appointments ADD CONSTRAINT appointments_sem_horario_duplo
      EXCLUDE USING gist (
        int4range(barber_id, barber_id, '[]') WITH =,
        tstzrange(instante_utc(starts_at), instante_utc(ends_at), '[)') WITH &&
      ) WHERE (status IN ('confirmed', 'completed') AND %s%s)
  $q$, bem_formados, CASE WHEN pares > 0 THEN format(' AND starts_at >= %L', corte) ELSE '' END);
END $$;

COMMENT ON CONSTRAINT appointments_sem_horario_duplo ON appointments IS
  'O mesmo barbeiro não tem dois agendamentos confirmados ou concluídos que se cruzam. Se o banco já tinha pares sobrepostos, vale a partir do fim do último (migration 0015).';

COMMIT;
