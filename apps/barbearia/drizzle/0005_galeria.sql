-- A galeria do site — o carrossel "Portfólio" — passa a ser de cada barbearia.
--
-- ── O QUE ERA, O QUE PASSA A SER ─────────────────────────────────────────────
--
-- Até aqui o carrossel era uma pasta do repositório (`src/assets/fotos-videos`),
-- lida em tempo de build, e só aparecia no site do Bayron: as fotos eram dele, e
-- mostrá-las em outra barbearia seria exibir o trabalho de terceiros como próprio.
--
-- Agora cada dono sobe as fotos pelo painel (`/admin/galeria`), e o site mostra a
-- seção a partir de 3 fotos (`src/lib/galeria.ts`). As fotos do Bayron entram
-- nesta tabela pelo `scripts/importar-galeria-bayron.mjs` — passo do
-- `ROTEIRO-MIGRACAO-PRODUCAO.md`, não desta migration: migration é SQL, e gerar
-- as variantes WebP precisa do sharp.
--
-- ── O NOME E AS COLUNAS ──────────────────────────────────────────────────────
--
-- O nome é o que o `ARQUITETURA-PRODUTO-V1.md` D6 decidiu em 27/08. As colunas
-- não são as de lá: `alt` ficou de fora (o texto alternativo é montado sozinho, e
-- campo que o dono não preenche vira campo vazio) e `active` também (tirar uma
-- foto da galeria é removê-la — ninguém pediu "esconder"). Entraram `tenant_id`,
-- que em 27/08 ainda não existia no produto, e `widths`.
--
-- ── O QUE MORA ONDE ──────────────────────────────────────────────────────────
--
-- O arquivo mora no volume, na pasta que `pastaDeMidia('galeria', tenant)` monta.
-- A tabela guarda o endereço público do original (`urlDeMidia`), as larguras de
-- WebP que existem ao lado dele — o srcset só lista o que existe — e a ordem.

BEGIN;

CREATE TABLE IF NOT EXISTS gallery_images (
  tenant_id   integer NOT NULL REFERENCES tenants(id),
  id          serial PRIMARY KEY,
  path        text NOT NULL,
  widths      integer[] NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

-- Toda leitura é "as fotos DESTA barbearia, na ordem".
CREATE INDEX IF NOT EXISTS gallery_images_tenant_sort_idx ON gallery_images (tenant_id, sort_order);

-- ── A rede do banco — a mesma das doze tabelas da 0003 ───────────────────────
--
-- ⚠️ Tabela nova com `tenant_id` e SEM política é o furo que o RLS existe para
-- impedir, e nada avisaria: toda consulta que já filtra por barbearia devolve o
-- mesmo resultado com e sem política. `tests/rls.test.ts` agora confere que toda
-- tabela com `tenant_id` tem a política — inclusive as que vierem depois desta.
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolado ON gallery_images;
CREATE POLICY tenant_isolado ON gallery_images
  FOR ALL
  TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int);

-- Os DEFAULT PRIVILEGES da 0003 já dariam acesso — mas só para tabela criada pelo
-- MESMO usuário que rodou a 0003. Explícito não custa e não depende disso.
GRANT SELECT, INSERT, UPDATE, DELETE ON gallery_images TO barbearia_app;
GRANT USAGE, SELECT ON SEQUENCE gallery_images_id_seq TO barbearia_app;

COMMIT;
