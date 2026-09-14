-- Criar o papel `barbearia_app` NÃO BASTA para o app conseguir assumi-lo.
--
-- ── O DEFEITO, E POR QUE ELE SE ESCONDEU ─────────────────────────────────────
--
-- A `0003` cria `barbearia_app` e o app faz `SET ROLE barbearia_app` a cada
-- requisição (`src/db/index.ts`, `comTenant()`). Só que `SET ROLE` exige **ser
-- membro do papel**. Superusuário pode assumir qualquer papel — e todo o
-- desenvolvimento e todos os ensaios rodaram conectados como `postgres`.
--
-- Em Postgres gerenciado o usuário do `DATABASE_URL` costuma NÃO ser
-- superusuário. Aí o resultado seria:
--
--     ERROR:  permission denied to set role "barbearia_app"
--
-- em **toda** requisição, depois de a migration ter passado. O pior formato de
-- falha que existe: deploy verde, migration ok, site respondendo 500.
--
-- ⚠️ E não basta ter criado o papel. Conferido contra Postgres 16.13 em
-- 13/09/2026, com um usuário comum `CREATEROLE`:
--
--     CREATE ROLE bapp_t NOLOGIN;   -> CREATE ROLE
--     SET ROLE bapp_t;              -> ERROR: permission denied to set role
--
-- Quem cria com `CREATEROLE` recebe ADMIN OPTION, que permite **conceder** o
-- papel — não assumi-lo. O `GRANT` abaixo é o que fecha o buraco, e depois dele
-- a mesma sequência passa.
--
-- ── POR QUE MIGRATION NOVA E NÃO EDITAR A 0003 ───────────────────────────────
--
-- `scripts/startup.mjs` decide o que aplicar comparando o hash do arquivo:
-- migration já aplicada que muda de conteúdo só gera aviso e NÃO roda de novo.
-- Editar a `0003` consertaria banco novo e deixaria os bancos existentes —
-- desenvolvimento e teste — com o defeito, calados.

BEGIN;

-- Idempotente: `GRANT` repetido não erra. `current_user` porque é exatamente o
-- usuário do `DATABASE_URL` que vai precisar assumir o papel em produção.
DO $$
BEGIN
  EXECUTE format('GRANT barbearia_app TO %I', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION
    E'\n\n  O usuário "%" não pode assumir o papel barbearia_app, e sem isso NENHUMA\n'
     '  requisição funciona (o app faz SET ROLE a cada uma).\n\n'
     '  Isso acontece quando o papel foi criado por OUTRO usuário: só quem tem\n'
     '  ADMIN OPTION sobre ele pode conceder.\n\n'
     '  Peça a quem administra o Postgres:\n\n'
     '      GRANT barbearia_app TO %;\n',
    current_user, current_user;
END $$;

-- Prova, aqui e agora, que o que o app faz a cada requisição funciona neste
-- banco com ESTE usuário. Sem isto, o erro só apareceria no primeiro acesso
-- depois do deploy — com o site já publicado e a barbearia já fora do ar.
DO $$
BEGIN
  SET LOCAL ROLE barbearia_app;
  PERFORM 1;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SET ROLE barbearia_app falhou mesmo depois do GRANT: % (%)', SQLERRM, SQLSTATE;
END $$;

-- ⚠️ O RESET NÃO É ZELO — sem ele a migration derruba a própria migração.
--
-- `SET LOCAL ROLE` dentro de um bloco `DO` vale até o FIM DA TRANSAÇÃO, não até o
-- fim do bloco. E quem controla a transação aqui é `scripts/startup.mjs`: ele
-- tira o BEGIN/COMMIT do arquivo e grava `schema_migrations` na MESMA
-- transação. Sem o reset, esse INSERT roda como `barbearia_app` — que a 0003
-- revoga dessa tabela de propósito — e a migração morre com
-- "permission denied for table schema_migrations".
--
-- Reproduzido em 13/09/2026 rodando o passo 4.4 do roteiro de verdade. No
-- `psql` o defeito NÃO aparece (cada arquivo tem o próprio COMMIT), e na suíte
-- de testes também não (ela aplica o arquivo inteiro e não grava migration).
-- Só aparecia no caminho real, no meio da janela, com o site fora do ar.
RESET ROLE;

COMMIT;
