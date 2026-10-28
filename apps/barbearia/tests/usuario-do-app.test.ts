// O app sem superusuário, e o banco restaurado que volta inteiro
// (`docs/PENDENCIAS-ABERTAS.md` §3.10 e §3.11 — 11/10/2026).
//
// ── O QUE ISTO PROTEGE ───────────────────────────────────────────────────────
//
//  1. `scripts/usuario-do-app.mjs` troca o superusuário do app por um usuário dono
//     das tabelas — sem superusuário, membro de `barbearia_app` —, e o boot, as
//     migrations e o RLS continuam funcionando com ele.
//  2. Migration nova não pode pedir superusuário: depois da troca, quem roda as
//     migrations no boot é esse usuário, e ela falharia no meio do deploy.
//  3. O banco restaurado de um backup sem os privilégios (todo backup até
//     11/10/2026) não sobe em silêncio com o site em 500: o boot recusa, e
//     `scripts/permissoes-do-app.mjs` devolve EXATAMENTE o acesso que as migrations
//     dão — conferido permissão por permissão contra um banco recém-migrado.
//
// O ensaio inteiro — produção com barbearia dentro, a troca, o app no ar, o backup
// restaurado no mesmo servidor e num servidor novo sem o papel — foi feito à parte,
// contra o build, e está registrado no PENDENCIAS. Aqui ficam as travas.
//
// Precisa de Postgres e de um usuário que crie banco e papel (o dos testes é
// superusuário). Sem DATABASE_URL, só as guardas de texto.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

/** O que só superusuário faz — e o boot, sem ele, não consegue. */
const PEDE_SUPERUSUARIO: [string, RegExp][] = [
  ['criar ou mudar papel', /\b(CREATE|ALTER|DROP)\s+ROLE\b/i],
  ['dar papel a alguém', /\bGRANT\s+\w+\s+TO\b(?![^;]*\bON\b)/i],
  ['configuração do servidor', /\bALTER\s+SYSTEM\b/i],
  ['programa do sistema', /\bCOPY\b[^;]*\bPROGRAM\b/i],
  ['linguagem nova', /\bCREATE\s+(OR\s+REPLACE\s+)?(TRUSTED\s+)?LANGUAGE\b/i],
  // Extensão "confiável" o dono do banco cria sozinho; as outras, não.
  ['extensão que não é confiável', /\bCREATE\s+EXTENSION\b(?![^;]*\b(btree_gist|btree_gin|citext|cube|dict_int|fuzzystrmatch|hstore|intarray|isn|lo|ltree|pgcrypto|pg_trgm|seg|tablefunc|tcn|tsm_system_rows|tsm_system_time|unaccent|uuid-ossp|plpgsql)\b)/i],
];

/** As migrations até a 0012 rodaram com o superusuário, e a 0003 e a 0004 precisam dele. */
const ULTIMA_COM_SUPERUSUARIO = '0012';

const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('migration nova não pede superusuário', () => {
  it('controle: o critério pega cada tipo — e deixa passar o que o dono das tabelas faz', () => {
    const pega = (s: string) => PEDE_SUPERUSUARIO.filter(([, r]) => r.test(s)).map(([n]) => n);
    expect(pega('CREATE ROLE intruso;')).toEqual(['criar ou mudar papel']);
    expect(pega('GRANT barbearia_app TO fulano;')).toEqual(['dar papel a alguém']);
    expect(pega('ALTER SYSTEM SET work_mem = 1;')).toEqual(['configuração do servidor']);
    expect(pega("COPY t TO PROGRAM 'id';")).toEqual(['programa do sistema']);
    expect(pega('CREATE EXTENSION pg_stat_statements;')).toEqual(['extensão que não é confiável']);
    expect(pega('CREATE EXTENSION IF NOT EXISTS btree_gist;')).toEqual([]);
    expect(pega('GRANT SELECT ON t TO barbearia_app; REVOKE ALL ON t FROM barbearia_app;')).toEqual([]);
    expect(pega('CREATE TABLE t (id int); ALTER TABLE t ENABLE ROW LEVEL SECURITY;')).toEqual([]);
  });

  it(`nenhuma migration depois da ${ULTIMA_COM_SUPERUSUARIO} faz o que só o superusuário faz`, () => {
    const novas = readdirSync('drizzle').filter((f) => f.endsWith('.sql') && f.slice(0, 4) > ULTIMA_COM_SUPERUSUARIO);
    const problemas = novas.flatMap((f) => {
      const sql = semComentarios(readFileSync(join('drizzle', f), 'utf8'));
      return PEDE_SUPERUSUARIO.filter(([, r]) => r.test(sql)).map(([n]) => `${f}: ${n}`);
    });
    expect(problemas, 'com o app sem superusuário, o boot não aplica isto — rode à parte, com o superusuário').toEqual([]);
  });

  it('o backup leva os privilégios — sem `--no-privileges`, que devolvia um banco que ninguém lê', () => {
    const fonte = readFileSync('scripts/backup.mjs', 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(fonte).toMatch(/spawn\('pg_dump', \['--no-owner', url\]/);
    expect(fonte).not.toMatch(/--no-privileges/);
  });
});

describe.skipIf(!TEM_BANCO)('a troca de usuário e o banco restaurado, num banco à parte', () => {
  // O corpo do `describe` roda mesmo quando ele é pulado: sem banco, uma URL qualquer.
  const URL_DOS_TESTES = process.env.DATABASE_URL ?? 'postgres://sem-banco@localhost/sem_banco_test';
  const base = new URL(URL_DOS_TESTES);
  const nomeBase = decodeURIComponent(base.pathname.slice(1)).replace(/_test$/i, '');
  const BANCO = `${nomeBase}_usuario_test`;
  const USUARIO = 'barbearia_teste_app';
  const SENHA = `senha-de-teste-${Date.now()}-com-folga`;
  const urlDe = (usuario: string | null, senha: string | null) => {
    const u = new URL(URL_DOS_TESTES);
    u.pathname = `/${BANCO}`;
    if (usuario) { u.username = usuario; u.password = senha ?? ''; }
    return u.toString();
  };
  const SUPER = urlDe(null, null);
  const APP = urlDe(USUARIO, SENHA);
  let admin: ReturnType<typeof postgres>;

  const rodar = (script: string, env: Record<string, string | undefined>) => {
    const r = spawnSync(process.execPath, [script, ...(script.endsWith('startup.mjs') ? ['--so-migrations'] : [])], {
      env: { ...process.env, ...env }, encoding: 'utf8',
    });
    return { status: r.status, saida: `${r.stdout}${r.stderr}` };
  };

  /** Quem pode o quê: o papel do app em cada tabela e sequência, e a rede de cada tabela. */
  async function matriz(url: string): Promise<string[]> {
    const c = postgres(url, { max: 1, onnotice: () => {} });
    try {
      const linhas = await c<{ l: string }[]>`
        SELECT c.relname || ':' || p || ':' || has_table_privilege('barbearia_app', c.oid, p) AS l
          FROM pg_class c CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
        UNION ALL
        SELECT c.relname || ':' || p || ':' || has_sequence_privilege('barbearia_app', c.oid, p)
          FROM pg_class c CROSS JOIN unnest(ARRAY['USAGE','SELECT']) p
         WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
        UNION ALL
        SELECT 'rls:' || c.relname || ':' || c.relrowsecurity || ':' ||
               (SELECT count(*) FROM pg_policies x WHERE x.schemaname = 'public' AND x.tablename = c.relname AND x.policyname = 'tenant_isolado')
          FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
        ORDER BY 1`;
      return linhas.map((x) => x.l);
    } finally {
      await c.end({ timeout: 5 });
    }
  }

  beforeAll(async () => {
    exigirBancoDeTeste(SUPER);
    admin = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${USUARIO}`);
    await admin.unsafe(`CREATE DATABASE ${BANCO}`);
    // O estado de produção: todas as migrations aplicadas pelo superusuário, pelo boot.
    const boot = rodar('scripts/startup.mjs', { DATABASE_URL: SUPER });
    expect(boot.status, boot.saida).toBe(0);
  }, 120_000);

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${BANCO} WITH (FORCE)`);
    await admin.unsafe(`DROP ROLE IF EXISTS ${USUARIO}`);
    await admin.end({ timeout: 5 });
  });

  it('o boot confere que o papel do app LÊ as tabelas e que toda tabela de barbearia tem a rede', () => {
    const r = rodar('scripts/startup.mjs', { DATABASE_URL: SUPER });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/lê as tabelas, e toda tabela de barbearia tem a rede de RLS/);
  }, 60_000);

  it('o banco restaurado sem os privilégios: o boot RECUSA — e o reparo devolve exatamente o das migrations', async () => {
    const recemMigrado = await matriz(SUPER);
    expect(recemMigrado.length).toBeGreaterThan(100);

    // O que a restauração de um backup antigo — ou num servidor novo — deixa.
    const c = postgres(SUPER, { max: 1, onnotice: () => {} });
    await c.unsafe('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM barbearia_app');
    await c.unsafe('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM barbearia_app');
    await c.unsafe('DROP POLICY tenant_isolado ON gallery_images');
    await c.unsafe('ALTER TABLE combos DISABLE ROW LEVEL SECURITY');
    await c.end({ timeout: 5 });

    const recusado = rodar('scripts/startup.mjs', { DATABASE_URL: SUPER });
    expect(recusado.status).toBe(1);
    expect(recusado.saida).toMatch(/barbearia_app sem leitura em: appointments, barbers, services, settings, tenants/);
    expect(recusado.saida).toMatch(/Sem RLS ou sem a política tenant_isolado: combos, gallery_images/);
    expect(recusado.saida).toMatch(/node scripts\/permissoes-do-app\.mjs/);

    const reparo = rodar('scripts/permissoes-do-app.mjs', { DATABASE_URL: SUPER });
    expect(reparo.status, reparo.saida).toBe(0);
    expect(await matriz(SUPER)).toEqual(recemMigrado);
    expect(rodar('scripts/startup.mjs', { DATABASE_URL: SUPER }).status).toBe(0);
    // E de novo não muda nada.
    expect(rodar('scripts/permissoes-do-app.mjs', { DATABASE_URL: SUPER }).status).toBe(0);
    expect(await matriz(SUPER)).toEqual(recemMigrado);
  }, 120_000);

  it('a troca: o usuário novo é dono de tudo, sem superusuário — e a senha não aparece na tela', async () => {
    const r = rodar('scripts/usuario-do-app.mjs', { DATABASE_URL: SUPER, DATABASE_URL_APP: APP });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/✓ a URL nova entra como barbearia_teste_app, sem superusuário/);
    expect(r.saida).toMatch(/✓ tabela criada por ele, numa migration futura, já nasce acessível ao app/);
    expect(r.saida).not.toContain(SENHA);

    const c = postgres(APP, { max: 1, onnotice: () => {} });
    try {
      const [eu] = await c`SELECT current_user AS nome, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super`;
      expect(eu).toEqual({ nome: USUARIO, super: false });
      const [{ alheias }] = await c`
        SELECT count(*)::int AS alheias FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'S') AND pg_get_userbyid(relowner) <> current_user`;
      expect(alheias).toBe(0);
      await expect(c`CREATE ROLE intruso_do_teste`).rejects.toThrow(/permission denied/);
    } finally {
      await c.end({ timeout: 5 });
    }
    // O mesmo acesso de antes, para o papel do app.
    expect(await matriz(APP)).toEqual(await matriz(SUPER));
  }, 120_000);

  it('com a URL nova, o boot sobe — e uma migration nova, rodada por ele, nasce acessível ao app', async () => {
    const boot = rodar('scripts/startup.mjs', { DATABASE_URL: APP });
    expect(boot.status, boot.saida).toBe(0);
    expect(boot.saida).toMatch(/barbearia_teste_app pode assumir barbearia_app/);

    const c = postgres(APP, { max: 1, onnotice: () => {} });
    try {
      await c.unsafe('CREATE TABLE IF NOT EXISTS prova_tabela_nova (id int)');
      const [{ pode }] = await c`SELECT has_table_privilege('barbearia_app', 'prova_tabela_nova', 'INSERT') AS pode`;
      expect(pode).toBe(true);
      await c.unsafe('DROP TABLE prova_tabela_nova');
    } finally {
      await c.end({ timeout: 5 });
    }
  }, 60_000);

  it('rodar a troca de novo não estraga nada', () => {
    const r = rodar('scripts/usuario-do-app.mjs', { DATABASE_URL: SUPER, DATABASE_URL_APP: APP });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/já existia — senha e atributos conferidos/);
  }, 60_000);

  it('recusa sem mexer: sem o superusuário, outro banco na URL nova, senha curta', () => {
    const semSuper = rodar('scripts/usuario-do-app.mjs', { DATABASE_URL: APP, DATABASE_URL_APP: urlDe('outro_teste_app', SENHA) });
    expect(semSuper.status).toBe(1);
    expect(semSuper.saida).toMatch(/não é superusuário/);
    const outroBanco = new URL(APP);
    outroBanco.pathname = '/outro_banco_test';
    const r2 = rodar('scripts/usuario-do-app.mjs', { DATABASE_URL: SUPER, DATABASE_URL_APP: outroBanco.toString() });
    expect(r2.status).toBe(1);
    expect(r2.saida).toMatch(/outro servidor ou outro banco/);
    const r3 = rodar('scripts/usuario-do-app.mjs', { DATABASE_URL: SUPER, DATABASE_URL_APP: urlDe(USUARIO, 'curta') });
    expect(r3.status).toBe(1);
    expect(r3.saida).toMatch(/20 caracteres/);
  }, 60_000);

  it.skipIf(!TEM_PGDUMP)('o backup, feito pelo usuário novo, leva os GRANTs ao papel do app', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'backup-usuario-'));
    try {
      const r = spawnSync(process.execPath, ['scripts/backup.mjs'], {
        env: { ...process.env, DATABASE_URL: APP, BACKUP_DIR: pasta, UPLOAD_ROOT: join(pasta, 'uploads') }, encoding: 'utf8',
      });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      const arquivo = readdirSync(pasta).find((f) => f.endsWith('.sql.gz'))!;
      const dump = gunzipSync(readFileSync(join(pasta, arquivo))).toString('utf8');
      expect(dump).toMatch(/^GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public\.settings TO barbearia_app;$/m);
      expect(dump).toMatch(/^GRANT SELECT ON TABLE public\.tenants TO barbearia_app;$/m);
      expect(dump).not.toMatch(/ON TABLE public\.webhook_events TO barbearia_app/);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }, 60_000);
});
