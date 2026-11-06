// O ensaio de restauração — `scripts/ensaiar-restauracao.mjs` (05/11/2026).
//
// POR QUE ESTE TESTE EXISTE
//
// Backup que nunca foi restaurado é suposição, e o script que o ensaia é o que diz "voltou
// inteiro". Se ele mentir — passar com uma foto faltando, ou restaurar por cima do banco de
// produção —, é pior que não ter ensaio. Estes casos seguram que ele:
//
//  - restaura um backup DE VERDADE (o do `scripts/backup.mjs`) num banco à parte e passa;
//  - recusa o destino que é o banco de `DATABASE_URL`, e o banco que já tem tabelas;
//  - acha cada foto que o banco cita no arquivo das fotos — e acusa a que falta.
//
// A parte que restaura precisa de Postgres, `pg_dump` e `psql`; sem eles, é pulada.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, recriarSchema } from './migrations.js';
import { caminhoQueFoge, entradaDaFoto, entradasDoTar, mesmoBanco } from '../scripts/ensaiar-restauracao.mjs';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const existe = (programa: string) => spawnSync(programa, ['--version'], { stdio: 'ignore' }).status === 0;
const TEM_CLIENTE = existe('pg_dump') && existe('psql');

describe('as regras do ensaio', () => {
  it('o mesmo banco é o mesmo servidor, porta e nome — usuário e senha não mudam o destino', () => {
    expect(mesmoBanco('postgres://a:b@localhost:5432/x', 'postgres://c:d@127.0.0.1/x')).toBe(true);
    expect(mesmoBanco('postgres://a:b@db.interno:5432/x', 'postgres://a:b@db.interno:5433/x')).toBe(false);
    expect(mesmoBanco('postgres://a:b@localhost/x', 'postgres://a:b@localhost/x_ensaio')).toBe(false);
    expect(mesmoBanco('postgres://a:b@DB.Interno/x', 'postgres://a:b@db.interno/x')).toBe(true);
    expect(mesmoBanco('não é endereço', 'postgres://a:b@localhost/x')).toBe(false);
  });

  it('o endereço de cada foto vira o caminho dentro do arquivo — a barbearia 1 no formato antigo', () => {
    const um = { id: 1, slug: 'principal' };
    const nova = { id: 7, slug: 'nova' };
    expect(entradaDaFoto('/api/media/logo/l.webp', um)).toBe('logo/l.webp');
    expect(entradaDaFoto('/api/media/nova/galeria/g.webp?v=2', nova)).toBe('nova/galeria/g.webp');
    expect(entradaDaFoto('/api/products/image/p.webp', um)).toBe('products/p.webp');
    expect(entradaDaFoto('/api/products/image/p.webp', nova)).toBe('nova/products/p.webp');
    expect(entradaDaFoto('https://instagram.com/x.jpg', nova)).toBeNull();
    expect(entradaDaFoto('/api/media/', nova)).toBeNull();
    expect(entradaDaFoto(null, nova)).toBeNull();
  });

  it('a lista do tar: sem o "./", sem as pastas — e o caminho que sairia da pasta', () => {
    expect(entradasDoTar('./\n./logo/\n./logo/l.webp\nnova/galeria/g.webp\n')).toEqual(['logo/l.webp', 'nova/galeria/g.webp']);
    expect(caminhoQueFoge('/data/uploads/logo/l.webp')).toBe(true);
    expect(caminhoQueFoge('../fora.webp')).toBe(true);
    expect(caminhoQueFoge('nova/../../fora.webp')).toBe(true);
    expect(caminhoQueFoge('nova/galeria/g.webp')).toBe(false);
  });
});

describe.skipIf(!TEM_BANCO || !TEM_CLIENTE)('o ensaio, de verdade', () => {
  let sql: ReturnType<typeof postgres>;
  let raiz = '';
  let dump = '';
  let fotos = '';
  const principal = process.env.DATABASE_URL!;
  const ensaio = (() => {
    const u = new URL(principal);
    u.pathname = `/${u.pathname.slice(1)}_ensaio`;
    return u.toString();
  })();
  const nomeDoEnsaio = decodeURIComponent(new URL(ensaio).pathname.slice(1));
  const banco = () => sql.unsafe(`DROP DATABASE IF EXISTS "${nomeDoEnsaio}"`).then(() => sql.unsafe(`CREATE DATABASE "${nomeDoEnsaio}"`));

  const rodar = (args: string[], destino = ensaio) => spawnSync('node', ['scripts/ensaiar-restauracao.mjs', ...args], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: principal, ENSAIO_DATABASE_URL: destino },
    timeout: 60_000,
  });

  beforeAll(async () => {
    sql = postgres(principal, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    // O registro das migrations, como o boot deixa em produção (`scripts/startup.mjs`).
    await sql`CREATE TABLE schema_migrations (nome text PRIMARY KEY, hash text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`;
    for (const f of listarMigrations()) await sql`INSERT INTO schema_migrations (nome, hash) VALUES (${f}, 'x')`;
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'principal', 'Principal', 'active'), (2, 'nova', 'Nova', 'active')`;
    await sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city, logo_path) VALUES
                (1, 'Principal', 'Principal', '5584999990001', 'Rua A, 1', 'Natal/RN', '/api/media/logo/l1.webp'),
                (2, 'Nova', 'Nova', '5584999990002', 'Rua B, 2', 'Natal/RN', '/api/media/nova/logo/l2.webp')`;
    await sql`INSERT INTO gallery_images (tenant_id, path, sort_order) VALUES (2, '/api/media/nova/galeria/g1.webp', 1)`;
    await sql`INSERT INTO products (tenant_id, slug, name, price_cents, image) VALUES (2, 'pomada', 'Pomada', 2500, '/api/products/image/p1.webp')`;

    raiz = mkdtempSync(join(tmpdir(), 'ensaio-'));
    const uploads = join(raiz, 'uploads');
    for (const [pasta, arquivo] of [['logo', 'l1.webp'], ['nova/logo', 'l2.webp'], ['nova/galeria', 'g1.webp'], ['nova/products', 'p1.webp']]) {
      mkdirSync(join(uploads, pasta), { recursive: true });
      writeFileSync(join(uploads, pasta, arquivo), arquivo);
    }
    mkdirSync(join(raiz, 'backups'), { recursive: true });
    vi.resetModules();
    vi.stubEnv('BACKUP_DIR', join(raiz, 'backups'));
    vi.stubEnv('UPLOAD_ROOT', uploads);
    const backup = await import('../scripts/backup.mjs');
    const r = (await backup.runBackup()) as { dest: string; fotos: string };
    vi.unstubAllEnvs();
    dump = r.dest;
    fotos = r.fotos;
  }, 60_000);

  afterAll(async () => {
    await sql?.unsafe(`DROP DATABASE IF EXISTS "${nomeDoEnsaio}"`);
    await sql?.end({ timeout: 5 });
    if (raiz) rmSync(raiz, { recursive: true, force: true });
  });

  it('restaura o backup do backup.mjs num banco à parte, e passa — banco, rede e as 4 fotos', async () => {
    await banco();
    const r = rodar([`--banco=${dump}`, `--fotos=${fotos}`]);
    expect(r.stdout).toMatch(/✓ é um dump inteiro/);
    expect(r.stdout).toContain(`✓ migrations: ${listarMigrations().length}, a última ${listarMigrations().at(-1)}`);
    expect(r.stdout).toMatch(/✓ 2 barbearia\(s\)/);
    expect(r.stdout).toMatch(/✓ o RLS ligado em toda tabela com tenant_id/);
    expect(r.stdout).toMatch(/✓ as 4 foto\(s\) que o banco cita estão no arquivo/);
    expect(r.stdout).toMatch(/✓ O ensaio passou/);
    expect(r.status).toBe(0);
  }, 60_000);

  it('recusa o banco que já tem tabelas — e o de DATABASE_URL, mesmo com outro usuário', () => {
    const cheio = rodar([`--banco=${dump}`]);
    expect(cheio.status).toBe(1);
    expect(cheio.stderr).toMatch(/não está vazio/);
    const u = new URL(principal);
    u.username = 'outro';
    u.password = 'outra';
    const producao = rodar([`--banco=${dump}`], u.toString());
    expect(producao.status).toBe(1);
    expect(producao.stderr).toMatch(/mesmo banco que DATABASE_URL/);
  });

  it('não passa o dump cortado, nem o que restaura com erro no meio', async () => {
    const texto = gunzipSync(readFileSync(dump)).toString('utf8');
    const cortado = join(raiz, 'cortado.sql.gz');
    writeFileSync(cortado, gzipSync(texto.slice(0, Math.floor(texto.length / 2))));
    await banco();
    const r1 = rodar([`--banco=${cortado}`]);
    expect(r1.stdout).toMatch(/✗ não termina como dump do pg_dump/);
    expect(r1.status).toBe(1);

    // Inteiro no fim, mas com um comando que falha no meio: sem `ON_ERROR_STOP`, o psql seguiria
    // e sairia com 0 — e um banco pela metade passaria por restaurado.
    const meio = texto.indexOf('CREATE TABLE');
    const quebrado = join(raiz, 'quebrado.sql.gz');
    writeFileSync(quebrado, gzipSync(`${texto.slice(0, meio)}SELECT * FROM tabela_que_nao_existe;\n${texto.slice(meio)}`));
    await banco();
    const r2 = rodar([`--banco=${quebrado}`]);
    expect(r2.stderr).toMatch(/psql saiu com/);
    expect(r2.status).toBe(1);
  }, 60_000);

  it('acusa a tabela com tenant_id sem a rede do RLS', async () => {
    // Uma tabela nova que esqueceu a política: o dump a leva assim, e o ensaio tem de dizer.
    await sql`CREATE TABLE sem_rede (tenant_id integer REFERENCES tenants(id))`;
    try {
      mkdirSync(join(raiz, 'backups2'), { recursive: true });
      vi.resetModules();
      vi.stubEnv('BACKUP_DIR', join(raiz, 'backups2'));
      vi.stubEnv('UPLOAD_ROOT', join(raiz, 'uploads'));
      const backup = await import('../scripts/backup.mjs');
      const novo = (await backup.runBackup()) as { dest: string };
      vi.unstubAllEnvs();
      await banco();
      const r = rodar([`--banco=${novo.dest}`]);
      expect(r.stdout).toMatch(/✗ tabela com tenant_id sem RLS: sem_rede/);
      expect(r.status).toBe(1);
    } finally {
      await sql`DROP TABLE IF EXISTS sem_rede`;
    }
  }, 60_000);

  it('acusa a foto que o banco cita e o arquivo não tem', async () => {
    await banco();
    const uploads = join(raiz, 'uploads');
    unlinkSync(join(uploads, 'nova', 'galeria', 'g1.webp'));
    const semUma = join(raiz, 'sem-uma-fotos.tar.gz');
    expect(spawnSync('tar', ['-czf', semUma, '-C', uploads, '.']).status).toBe(0);
    const r = rodar([`--banco=${dump}`, `--fotos=${semUma}`]);
    expect(r.stdout).toMatch(/✗ 1 de 4 foto\(s\) citada\(s\) no banco não estão no arquivo — ex\.: nova: nova\/galeria\/g1\.webp/);
    expect(r.status).toBe(1);
  }, 60_000);
});
