-- Passo 3 de docs/ARQUITETURA-MULTI-TENANT-V1.md §9:
-- introduzir `tenants`, dar `tenant_id` às 12 tabelas e recompor as constraints.
--
-- Esta migration NÃO liga RLS. A ordem do §9 é deliberada: escopar as rotas
-- (passo 4) vem ANTES de ligar o RLS (passo 5), porque com RLS ligado antes uma
-- consulta sem filtro devolve zero linhas em silêncio e o erro passa
-- despercebido no desenvolvimento.
--
-- Idempotente: pode rodar duas vezes sem erro.

BEGIN;

-- ---------------------------------------------------------------- 1. tenants
CREATE TABLE IF NOT EXISTS tenants (
  id            serial PRIMARY KEY,
  slug          text NOT NULL UNIQUE,          -- barbeariax.barbearianoar.com.br
  domain        text UNIQUE,                   -- domínio próprio, quando houver
  business_name text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_valido CHECK (status IN ('active','suspended','cancelled'))
);

COMMENT ON COLUMN tenants.domain IS
  'Domínio próprio do cliente. NULL = usa só o subdomínio (o padrão; ver PRECIFICACAO.md §6).';
COMMENT ON COLUMN tenants.status IS
  'suspended = inadimplente, dados preservados. cancelled = saiu.';

-- Tenant de backfill: os dados que já existem no banco são todos da Bayron.
--
-- ⚠️ Só é criado quando HÁ dados para backfillar. Num banco novo — barbearia
-- recém-provisionada — criar 'bayron' faria o cliente nascer com o subdomínio
-- e o nome de outra barbearia (`PENDENCIAS-ABERTAS.md` §4.6). Banco vazio sai
-- daqui sem nenhum tenant, e quem cria o dele é o provisionamento.
INSERT INTO tenants (slug, business_name)
SELECT 'bayron', 'Barbearia Bayron'
WHERE EXISTS (SELECT 1 FROM barbers)
   OR EXISTS (SELECT 1 FROM settings)
   OR EXISTS (SELECT 1 FROM appointments)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------- 2. tenant_id nas 12 tabelas
DO $$
DECLARE
  t text;
  tid int;
  tabelas text[] := ARRAY[
    'barbers','services','products','barber_services','combos','working_hours',
    'time_off','appointments','appointment_items','product_sales','reservations','settings'
  ];
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = 'bayron';

  FOREACH t IN ARRAY tabelas LOOP
    -- nullable primeiro, para poder preencher o que já existe
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id integer', t);
    -- `tid` é NULL em banco novo: não há dados nem tenant de backfill. O UPDATE
    -- é pulado, e o SET NOT NULL passa porque a tabela está vazia.
    IF tid IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET tenant_id = %s WHERE tenant_id IS NULL', t, tid);
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);

    -- a chave estrangeira e o índice, se ainda não existirem
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('%s_tenant_id_fkey', t) AND conrelid = t::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id)',
        t, format('%s_tenant_id_fkey', t));
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)',
                   format('%s_tenant_id_idx', t), t);
  END LOOP;
END $$;

-- --------------------------- 3. UNIQUE de slug vira composta com tenant_id
-- Sem isso, duas barbearias não podem ter um barbeiro "bayron" nem um serviço
-- "corte-social". Verificado no banco em 06/09: são exatamente estas três.
ALTER TABLE barbers  DROP CONSTRAINT IF EXISTS barbers_slug_unique;
ALTER TABLE barbers  DROP CONSTRAINT IF EXISTS barbers_slug_key;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_slug_unique;
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_slug_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_unique;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS barbers_tenant_slug_uq  ON barbers  (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS services_tenant_slug_uq ON services (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_slug_uq ON products (tenant_id, slug);

-- appointments.manage_token CONTINUA único global, de propósito: é o token
-- anônimo do link /a/{token} e precisa ser único no mundo.

-- settings deixa de ser linha única (id = 1) e passa a ser uma por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS settings_tenant_uq ON settings (tenant_id);

-- ⚠️ E o `id` precisa de sequência. No SQLite settings era a linha fixa id = 1,
-- então a coluna nasceu `integer NOT NULL` sem default. Com uma linha por tenant,
-- o INSERT do segundo tenant falharia com "null value in column id".
-- Verificado em 06/09/2026 contra o banco: era exatamente esse o erro.
CREATE SEQUENCE IF NOT EXISTS settings_id_seq OWNED BY settings.id;
SELECT setval('settings_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM settings), 1));
ALTER TABLE settings ALTER COLUMN id SET DEFAULT nextval('settings_id_seq');

-- ------------------- 4. Chaves estrangeiras compostas: a parede de verdade
-- Sem isto, nada impede um agendamento do tenant 1 apontar para um barbeiro do
-- tenant 2. O RLS não pega: ele filtra pelo tenant_id da própria linha, que está
-- certo — o que está errado é para quem ela aponta. Com a FK composta o banco
-- recusa sozinho, sem depender de o código lembrar.
--
-- Os nomes das constraints antigas são DESCOBERTOS no catálogo, não escritos à
-- mão: o Drizzle nomeia como `<tabela>_<coluna>_<pai>_id_fk` e isso pode mudar
-- entre versões. Uma tentativa anterior com nomes chutados falhou em silêncio,
-- deixando a FK antiga viva ao lado da nova.

DO $$
DECLARE
  pais text[] := ARRAY['barbers','services','products','appointments'];
  p text;
  r record;
  nova text;
BEGIN
  -- 4.1 cada pai precisa de UNIQUE (id, tenant_id) para poder ser referenciado
  FOREACH p IN ARRAY pais LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('%s_id_tenant_uq', p) AND conrelid = p::regclass
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (id, tenant_id)',
                     p, format('%s_id_tenant_uq', p));
    END IF;
  END LOOP;

  -- 4.2 troca cada FK de uma coluna por uma composta com tenant_id
  FOR r IN
    SELECT c.conname AS antiga,
           c.conrelid::regclass::text AS filha,
           a.attname  AS col,
           c.confrelid::regclass::text AS pai
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND array_length(c.conkey, 1) = 1              -- só as de uma coluna
      AND c.confrelid::regclass::text = ANY(pais)     -- que apontam para tabela com tenant
  LOOP
    nova := format('%s_%s_tenant_fkey', r.filha, r.col);
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.filha, r.antiga);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I, tenant_id) REFERENCES %I (id, tenant_id)',
      r.filha, nova, r.col, r.pai);
    RAISE NOTICE 'FK composta: %.% -> % (era %)', r.filha, r.col, r.pai, r.antiga;
  END LOOP;
END $$;

COMMIT;
