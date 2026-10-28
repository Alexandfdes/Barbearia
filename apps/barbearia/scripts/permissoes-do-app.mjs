/**
 * Devolve ao papel `barbearia_app` o acesso que as migrations dão — e a rede de
 * RLS, se ela faltar. Para o banco RESTAURADO de um backup (11/10/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §3.11). Idempotente: rodar num banco em dia não muda nada.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────────
 *
 * Até 11/10/2026 o backup diário rodava `pg_dump --no-privileges`: o arquivo
 * trazia as tabelas e os dados, e nenhum GRANT. Restaurado, o banco voltava
 * inteiro — e o papel do app, que é quem lê as tabelas em toda requisição
 * (`comTenant`, em `src/db/index.ts`), sem acesso a nada. Toda tela, 500. E o
 * boot não via: ele só conferia se o papel podia ser ASSUMIDO. Achado no ensaio da
 * troca do usuário do banco, restaurando de verdade. Todo backup feito até essa
 * data é assim.
 *
 * E num servidor NOVO, onde o papel ainda não existe, a restauração falha também
 * nas políticas de RLS (`CREATE POLICY ... TO barbearia_app`) — as tabelas voltam
 * com o RLS ligado e sem política nenhuma: o app não enxerga nada.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────
 *
 *   gunzip -c barbearia_<data>.sql.gz | psql "$DATABASE_URL"   (num banco vazio)
 *   node scripts/permissoes-do-app.mjs
 *
 * Com o `DATABASE_URL` de quem restaurou — que ficou dono das tabelas. Servidor
 * novo, sem o papel: rode com o superusuário, que é quem pode criá-lo.
 *
 * ⚠️ As exceções abaixo — o que o papel do app NÃO pode — repetem as das
 * migrations (0003, 0010, 0012). Migration nova que tirar acesso do papel entra
 * aqui também; `tests/usuario-do-app.test.ts` compara, permissão por permissão,
 * o banco reparado com o recém-migrado, e reprova a diferença.
 */
import postgres from 'postgres';

/** O que as migrations tiram do papel do app — e de onde vem cada uma. */
const EXCECOES = [
  ['REVOKE INSERT, UPDATE, DELETE ON TABLE tenants FROM barbearia_app', '0003: o app só lê a tabela de barbearias'],
  ['REVOKE ALL ON TABLE schema_migrations FROM barbearia_app', '0003: o registro das migrations é do boot'],
  ['REVOKE ALL ON TABLE webhook_events FROM barbearia_app', '0010: só o webhook, como dono'],
  ['REVOKE ALL ON SEQUENCE webhook_events_id_seq FROM barbearia_app', '0010'],
  ['REVOKE ALL ON TABLE acoes_do_operador FROM barbearia_app', '0012: só o painel do operador, como dono'],
  ['REVOKE ALL ON SEQUENCE acoes_do_operador_id_seq FROM barbearia_app', '0012'],
];

const POLITICA = `FOR ALL TO barbearia_app
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int)`;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n✗ DATABASE_URL não definido.\n');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const feito = [];
  await sql.begin(async (tx) => {
    const [eu] = await tx`SELECT current_user AS nome, rolsuper FROM pg_roles WHERE rolname = current_user`;

    if ((await tx`SELECT 1 FROM pg_roles WHERE rolname = 'barbearia_app'`).length === 0) {
      if (!eu.rolsuper) {
        throw new Error('o papel barbearia_app não existe neste servidor, e só o superusuário cria papel. Rode este script com ele.');
      }
      await tx.unsafe('CREATE ROLE barbearia_app NOLOGIN');
      feito.push('papel barbearia_app criado');
    }
    // Superusuário assume qualquer papel sem concessão; usuário comum precisa ser
    // membro — e só quem administra o papel concede. Aqui só se confere.
    if (!eu.rolsuper) {
      const [{ membro }] = await tx`SELECT pg_has_role(current_user, 'barbearia_app', 'MEMBER') AS membro`;
      if (!membro) {
        throw new Error(`${eu.nome} não pode assumir barbearia_app. Peça ao superusuário: GRANT barbearia_app TO ${eu.nome};`);
      }
    }

    // A rede: RLS ligado e a política em toda tabela com `tenant_id` — a mesma
    // forma em todas, como `tests/rls.test.ts` exige.
    const comTenant = await tx`
      SELECT c.relname, c.relrowsecurity AS rls,
             EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
                       AND p.policyname = 'tenant_isolado') AS politica
        FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       ORDER BY 1`;
    for (const t of comTenant) {
      const nome = (await tx`SELECT quote_ident(${t.relname}) AS q`)[0].q;
      if (!t.rls) {
        await tx.unsafe(`ALTER TABLE ${nome} ENABLE ROW LEVEL SECURITY`);
        feito.push(`RLS ligado em ${t.relname}`);
      }
      if (!t.politica) {
        await tx.unsafe(`CREATE POLICY tenant_isolado ON ${nome} ${POLITICA}`);
        feito.push(`política tenant_isolado criada em ${t.relname}`);
      }
    }

    // O acesso — o mesmo que a 0003 dá, com as exceções das migrations depois.
    await tx.unsafe('GRANT USAGE ON SCHEMA public TO barbearia_app');
    await tx.unsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO barbearia_app');
    await tx.unsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO barbearia_app');
    for (const [cmd] of EXCECOES) await tx.unsafe(cmd);
    feito.push(`acesso de barbearia_app conferido em ${comTenant.length} tabela(s) de barbearia, com ${EXCECOES.length} exceção(ões)`);

    // E a tabela que as próximas migrations criarem, criadas por este usuário.
    await tx.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barbearia_app');
    await tx.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO barbearia_app');
  });
  for (const f of feito) console.log(`✓ ${f}`);
  console.log('✓ pronto: o boot do app vai conferir de novo ao subir.');
} catch (erro) {
  console.error(`\n✗ Nada foi mudado: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
