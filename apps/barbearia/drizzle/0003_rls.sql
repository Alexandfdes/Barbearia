-- Passo 5.1 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9: o BANCO passa a
-- recusar que uma barbearia veja os dados de outra.
--
-- ── O QUE MUDA, EM UMA FRASE ─────────────────────────────────────────────────
--
-- Hoje o que separa a barbearia A da barbearia B é DISCIPLINA: as 54 rotas
-- foram escopadas uma a uma e `tests/escopo-rotas.test.ts` vigia isso. Funciona
-- enquanto ninguém errar. Depois desta migration, uma consulta que esqueça o
-- `WHERE tenant_id` não devolve a linha errada — devolve NENHUMA.
--
-- A diferença é entre "nós tomamos cuidado" e "não tem como acontecer". Num
-- produto que guarda nome, telefone e data de nascimento dos clientes de
-- terceiros, essa diferença é o que se responde quando alguém pergunta.
--
-- ── COMO O TENANT CHEGA AQUI ─────────────────────────────────────────────────
--
-- Pela variável de sessão `app.tenant_id`, que o app grava na conexão a cada
-- requisição (`src/lib/contextoTenant.ts`).
--
-- ⚠️ `current_setting('app.tenant_id', true)` devolve NULL quando ninguém
-- gravou. Comparar qualquer coisa com NULL dá NULL, que não é verdadeiro — então
-- **conexão sem tenant não vê nada**. É de propósito: uma política que liberasse
-- tudo quando a variável estivesse vazia não seria rede nenhuma, seria um buraco
-- com formato de rede. O modo de falhar é ficar cego, nunca ver demais.
--
-- ⚠️ O `NULLIF(..., '')` não é enfeite. Depois de um `RESET app.tenant_id` a
-- variável não volta a ser NULL: ela vira STRING VAZIA. E `''::int` não devolve
-- NULL, **estoura** ("invalid input syntax for type integer"). Numa conexão
-- reaproveitada do pool, a política sem o NULLIF trocaria "não vê nada" por
-- "erro no meio da página". Continua fechado, mas quebrado é diferente de cego.
--
-- ── POR QUE UM PAPEL SEPARADO ────────────────────────────────────────────────
--
-- O dono da tabela IGNORA row level security (é assim que o Postgres funciona,
-- e não é bug: senão o dono não conseguiria mais fazer manutenção). O app
-- conecta com o dono, então as políticas abaixo não valeriam para ele.
--
-- Por isso existe `barbearia_app`: um papel SEM login, que o app assume com
-- `SET ROLE` a cada requisição e larga no fim. Uma credencial só no `.env`, e
-- ainda assim as consultas do app rodam sob as políticas.
--
-- É também o que mantém as migrations, `scripts/carregar-sqlite.mjs` e
-- `scripts/provisionar.mts` funcionando: eles NÃO fazem `SET ROLE`, continuam
-- sendo o dono e continuam enxergando todas as barbearias — que é exatamente o
-- que uma ferramenta de manutenção precisa.

BEGIN;

-- ── O papel do app ───────────────────────────────────────────────────────────
--
-- NOLOGIN de propósito: ninguém se conecta como ele. Ele só é assumido por quem
-- já entrou com a credencial do dono. Sem senha para vazar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app') THEN
    CREATE ROLE barbearia_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO barbearia_app;

-- Só o que o app faz. Nada de DDL: quem muda schema é migration, e migration
-- roda como dono.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app;

-- Tabela criada por migration futura já nasce acessível ao app. Sem isto, a
-- primeira rota a usar a tabela nova quebraria com "permission denied" em
-- produção, depois do deploy, e não no teste.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app;

-- ⚠️ `tenants` fica FORA das políticas, e com SELECT apenas.
--
-- É a tabela de roteamento: o app precisa ler a lista inteira para descobrir de
-- QUEM é a requisição — antes de saber o tenant, não dá para filtrar por ele.
-- Proteger esta tabela criaria um ovo-e-galinha em que ninguém entra.
--
-- O que ela expõe é slug, domínio e status. Não tem dado de cliente.
REVOKE INSERT, UPDATE, DELETE ON tenants FROM barbearia_app;

-- `schema_migrations` é do migrador, não do app.
--
-- Condicional porque essa tabela NÃO vem de migration: quem a cria é o próprio
-- `scripts/startup.mjs`, antes de aplicar qualquer arquivo. Quem monta o schema
-- só com os .sql — a suíte de testes faz isso — não a tem, e um REVOKE direto
-- derrubaria a montagem inteira com "relation does not exist".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
    REVOKE ALL ON schema_migrations FROM barbearia_app;
  END IF;
END $$;

-- ── As políticas ─────────────────────────────────────────────────────────────
--
-- Uma por tabela com `tenant_id`, todas iguais: a linha só existe se for da
-- barbearia gravada na conexão.
--
-- `USING` filtra o que é lido (e o que UPDATE/DELETE conseguem alcançar).
-- `WITH CHECK` filtra o que é gravado: sem ele, um INSERT poderia plantar uma
-- linha no tenant de outra barbearia — invisível para quem gravou e visível
-- para a vítima.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'appointment_items', 'appointments', 'barber_services', 'barbers',
    'combos', 'product_sales', 'products', 'reservations',
    'services', 'settings', 'time_off', 'working_hours'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolado ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolado ON %I
        FOR ALL
        TO barbearia_app
        USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
    $f$, t);
    RAISE NOTICE 'RLS ligado em %', t;
  END LOOP;
END $$;

COMMIT;
