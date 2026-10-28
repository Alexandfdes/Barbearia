// O backup do banco ANTES de aplicar migration nova (`scripts/startup.mjs`, 17/10/2026).
//
// ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
//
// O CMD do Dockerfile roda as migrations e só depois lança o daemon do backup — cujo
// backup de boot vem DEPOIS delas, e é pulado se houver um com menos de 12 horas.
// Com um banco para todas as barbearias, a volta de uma migration que estragasse dado
// era o backup das 03:00. Agora o boot de produção faz o dump antes de mudar o banco,
// e não migra sem ele.
//
// Estes casos rodam o boot de verdade, num processo à parte, como o deploy roda.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
const TEM_PGDUMP = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;

/** O boot de verdade. `env` por cima do ambiente do teste; o resto, igual ao deploy. */
function boot(env: Record<string, string | undefined>, ...args: string[]) {
  const r = spawnSync(process.execPath, ['scripts/startup.mjs', ...args], {
    env: { ...process.env, TZ_BARBEARIA: undefined, ...env }, encoding: 'utf8',
  });
  return { status: r.status, saida: `${r.stdout}${r.stderr}` };
}

const TODAS = listarMigrations();
const ULTIMA = TODAS[TODAS.length - 1];
const PENULTIMA = TODAS[TODAS.length - 2];

describe('o boot, lido', () => {
  it('o backup de antes vem antes do laço que aplica as migrations', () => {
    const s = readFileSync('scripts/startup.mjs', 'utf8');
    const chamada = s.indexOf('await backupAntesDasMigrations(pendentes');
    const laco = s.indexOf('for (const nome of arquivos)');
    expect(chamada).toBeGreaterThan(0);
    expect(laco).toBeGreaterThan(chamada);
  });

  it('a variável de escape está no .env.example, explicada', () => {
    expect(readFileSync('.env.example', 'utf8')).toMatch(/MIGRAR_SEM_BACKUP=1/);
  });
});

describe.skipIf(!TEM_BANCO || !TEM_PGDUMP)('com banco: o backup antes das migrations', () => {
  let sql: postgres.Sql;
  let pasta: string;
  const aplicadas = async () =>
    (await sql<{ nome: string }[]>`SELECT nome FROM schema_migrations ORDER BY nome`).map((r) => r.nome);
  const arquivos = () => readdirSync(pasta).sort();

  /** O banco como o deploy anterior o deixou: tudo menos a última, e uma barbearia dentro. */
  async function bancoDaVespera() {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const r = boot({ NODE_ENV: 'test' }, `--ate=${PENULTIMA.slice(0, 4)}`);
    expect(r.status, r.saida).toBe(0);
    await sql`INSERT INTO tenants (id, slug, business_name) VALUES (1, 'da-vespera', 'Barbearia da Véspera')`;
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  });
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'backup-antes-'));
  });
  afterAll(async () => {
    // Schema vazio no fim: quem precisa de tabela monta o seu (`recriarSchema`), e os
    // que não montam — o backup, a saúde — não dependem de tabela nenhuma.
    if (sql) {
      await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await sql.end({ timeout: 5 });
    }
  });

  it('em produção, com migration pendente: o dump sai antes — com o banco de antes — e a migration roda depois', async () => {
    await bancoDaVespera();
    const r = boot({ NODE_ENV: 'production', BACKUP_DIR: pasta });
    expect(r.status, r.saida).toBe(0);
    const nomes = arquivos();
    expect(nomes, r.saida).toHaveLength(1);
    expect(nomes[0]).toMatch(new RegExp(`^barbearia_\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-antes-da-${ULTIMA.slice(0, 4)}\\.sql\\.gz$`));
    expect(r.saida).toMatch(/✓ backup antes das migrations: .*antes-da-/);

    // O que está DENTRO do arquivo é o banco de antes: a barbearia, a penúltima
    // registrada, e a última ainda não.
    const dump = gunzipSync(readFileSync(join(pasta, nomes[0]))).toString('utf8');
    expect(dump).toMatch(/da-vespera/);
    expect(dump).toContain(PENULTIMA);
    expect(dump).not.toContain(ULTIMA);

    // E a migration rodou depois dele.
    expect(await aplicadas()).toContain(ULTIMA);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);

  it('se o backup falha, o boot para e NENHUMA migration é aplicada', async () => {
    await bancoDaVespera();
    // Uma "pasta" que é arquivo: o mkdir dentro dela falha.
    const arquivo = join(pasta, 'nao-e-pasta');
    writeFileSync(arquivo, 'x');
    const r = boot({ NODE_ENV: 'production', BACKUP_DIR: join(arquivo, 'backups') });
    expect(r.status, r.saida).toBe(1);
    expect(r.saida).toMatch(/SEM O BACKUP DE ANTES — NENHUMA MIGRATION FOI APLICADA/);
    expect(r.saida).toContain(ULTIMA);
    expect(r.saida).toMatch(/MIGRAR_SEM_BACKUP=1/);
    // Nem a mensagem genérica de migration que falhou: o motivo já foi dito.
    expect(r.saida).not.toMatch(/Migration falhou/);
    expect(await aplicadas()).not.toContain(ULTIMA);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);

  it('migration que falha: o boot reiniciando em ciclo NÃO grava um backup por volta (27/10/2026)', async () => {
    // O orquestrador reinicia o container sem parar quando o boot sai com erro. Antes,
    // cada volta tirava mais um dump do banco inteiro, e a retenção só roda no daemon —
    // que nesse ciclo nunca sobe: com dado de verdade, enchia o disco da VPS.
    await bancoDaVespera();
    // Uma migration que falha, sem depender de qual é a última: o registro dela em
    // schema_migrations — na mesma transação — é recusado.
    await sql.unsafe(`
      CREATE FUNCTION recusa_migration() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'migration de teste falhou'; END $$;
      CREATE TRIGGER recusa BEFORE INSERT ON schema_migrations
        FOR EACH ROW EXECUTE FUNCTION recusa_migration();`);
    const voltas = [1, 2, 3].map(() => boot({ NODE_ENV: 'production', BACKUP_DIR: pasta }));
    for (const v of voltas) expect(v.status, v.saida).toBe(1);
    expect(arquivos(), voltas.map((v) => v.saida).join('\n')).toHaveLength(1);
    expect(voltas[1].saida).toMatch(/reaproveitado/);
    expect(await aplicadas()).not.toContain(ULTIMA);

    // Consertado o motivo, o boot seguinte migra com o mesmo backup de antes.
    await sql.unsafe('DROP TRIGGER recusa ON schema_migrations; DROP FUNCTION recusa_migration();');
    const ok = boot({ NODE_ENV: 'production', BACKUP_DIR: pasta });
    expect(ok.status, ok.saida).toBe(0);
    expect(arquivos()).toHaveLength(1);
    expect(await aplicadas()).toContain(ULTIMA);
    rmSync(pasta, { recursive: true, force: true });
  }, 90_000);

  it('MIGRAR_SEM_BACKUP=1: migra sem o backup, e diz isso', async () => {
    await bancoDaVespera();
    const arquivo = join(pasta, 'nao-e-pasta');
    writeFileSync(arquivo, 'x');
    const r = boot({ NODE_ENV: 'production', BACKUP_DIR: join(arquivo, 'backups'), MIGRAR_SEM_BACKUP: '1' });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/MIGRAR_SEM_BACKUP=1: 1 migration\(s\) vão rodar SEM o backup de antes/);
    expect(await aplicadas()).toContain(ULTIMA);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);

  it('nada pendente: nenhum backup — o boot de todo dia não enche a pasta', async () => {
    await bancoDaVespera();
    expect(boot({ NODE_ENV: 'production', BACKUP_DIR: pasta }).status).toBe(0);
    const depoisDoPrimeiro = arquivos();
    const r = boot({ NODE_ENV: 'production', BACKUP_DIR: pasta });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/Banco já estava em dia/);
    // Pela saída, e não só pela pasta: dois boots no mesmo segundo dariam o mesmo nome
    // de arquivo, e um backup a mais passaria despercebido (visto desfazendo o conserto).
    expect(r.saida).not.toMatch(/backup antes das migrations/);
    expect(arquivos()).toEqual(depoisDoPrimeiro);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);

  it('banco novo, sem migration nenhuma: nada a guardar', async () => {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const r = boot({ NODE_ENV: 'production', BACKUP_DIR: pasta });
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/banco novo: sem backup antes das migrations/);
    expect(arquivos()).toEqual([]);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);

  it('fora de produção, e no --so-migrations do npm run dev: sem backup, sem erro', async () => {
    await bancoDaVespera();
    const dev = boot({ NODE_ENV: 'test', BACKUP_DIR: pasta });
    expect(dev.status, dev.saida).toBe(0);
    expect(arquivos()).toEqual([]);

    await bancoDaVespera();
    const soMigrations = boot({ NODE_ENV: 'production', BACKUP_DIR: pasta }, '--so-migrations');
    expect(soMigrations.status, soMigrations.saida).toBe(0);
    expect(arquivos()).toEqual([]);
    expect(await aplicadas()).toContain(ULTIMA);
    rmSync(pasta, { recursive: true, force: true });
  }, 60_000);
});
