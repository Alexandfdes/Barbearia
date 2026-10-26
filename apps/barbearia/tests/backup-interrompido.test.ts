// O backup interrompido no meio não conta como bom — varredura de 26/10/2026, nº 14.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O `pg_dump` e o `tar` gravavam direto no nome final. Um redeploy no meio do backup
// (o `docker stop` mata o processo) deixava no disco um `.sql.gz` truncado com o nome
// de um bom. Ele contava como o mais recente: o backup do boot era pulado por 12 horas
// (`skipIfFresherThanMs`) e a tela de Sistema o mostrava como o último. Reproduzido com
// `kill -9` na varredura.
//
// Agora o arquivo em gravação termina em `.parcial` e só ganha o nome final depois de
// terminar bem. Os casos abaixo usam um `pg_dump` e um `tar` de mentira no PATH — o que
// se testa é o que o script faz com o arquivo, não o dump —, e por isso rodam sem banco.
// O caso do `kill -9` mata de verdade um processo que está fazendo backup.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NO_WINDOWS = process.platform === 'win32';
const SCRIPT = resolve(__dirname, '../scripts/backup.mjs');
const DIA = 24 * 60 * 60 * 1000;

let raiz: string;
let pastaBackup: string;
let bin: string;

function falsos() {
  bin = join(raiz, 'bin');
  mkdirSync(bin, { recursive: true });
  // Escreve uma linha, espera FAKE_SLEEP segundos (se houver) e sai com FAKE_EXIT.
  writeFileSync(join(bin, 'pg_dump'),
    '#!/bin/sh\necho "-- dump de mentira"\n[ -n "$FAKE_SLEEP" ] && sleep "$FAKE_SLEEP"\nexit ${FAKE_EXIT:-0}\n');
  // `tar -czf <destino> -C <raiz> .` — grava no destino e sai com FAKE_TAR_EXIT.
  writeFileSync(join(bin, 'tar'), '#!/bin/sh\necho fotos > "$2"\nexit ${FAKE_TAR_EXIT:-0}\n');
  chmodSync(join(bin, 'pg_dump'), 0o755);
  chmodSync(join(bin, 'tar'), 0o755);
}

/** `backup.mjs` lê o ambiente no topo do módulo: recarrega a cada caso. */
async function carregar(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs(); // o ambiente do carregamento anterior não vaza para este
  vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
  vi.stubEnv('BACKUP_DIR', pastaBackup);
  vi.stubEnv('DATABASE_URL', 'postgres://ninguem@127.0.0.1:1/de-mentira');
  vi.stubEnv('UPLOAD_ROOT', join(raiz, 'sem-fotos'));
  for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return await import('../scripts/backup.mjs');
}

const nomes = () => readdirSync(pastaBackup).sort();

/** Um arquivo de backup com a idade pedida. */
function antigo(nome: string, idadeMs: number) {
  const p = join(pastaBackup, nome);
  writeFileSync(p, 'velho');
  const t = new Date(Date.now() - idadeMs);
  utimesSync(p, t, t);
  return p;
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'bkinterrompido-'));
  pastaBackup = join(raiz, 'backups');
  mkdirSync(pastaBackup, { recursive: true });
  falsos();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(raiz, { recursive: true, force: true });
});

describe.skipIf(NO_WINDOWS)('o backup em gravação não tem o nome de bom', () => {
  it('enquanto o dump roda, só existe o .parcial; no fim, só o nome final', async () => {
    const mod = await carregar({ FAKE_SLEEP: '1' });
    const rodando = mod.runBackup();

    // Espera o arquivo aparecer e olha a pasta NO MEIO do dump.
    let meio: string[] = [];
    for (let i = 0; i < 50 && meio.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
      meio = nomes();
    }
    expect(meio).toHaveLength(1);
    expect(meio[0]).toMatch(/\.sql\.gz\.parcial$/);
    expect(mod.newestBackupAgeMs()).toBe(Infinity);

    const r = (await rodando) as { dest: string };
    expect(nomes()).toEqual([r.dest.split('/').pop()]);
    expect(r.dest).toMatch(/\.sql\.gz$/);
    expect(mod.newestBackupAgeMs()).toBeLessThan(60_000);
  });

  it('o dump que falha não deixa nem o nome final nem o .parcial', async () => {
    const mod = await carregar({ FAKE_EXIT: '1' });
    await expect(mod.runBackup()).rejects.toThrow(/pg_dump saiu com código 1/);
    expect(nomes()).toEqual([]);
  });

  it('o backup antes das migrations segue a mesma regra', async () => {
    const mod = await carregar({ FAKE_EXIT: '1' });
    await expect(mod.backupDoBanco('antes-da-0018')).rejects.toThrow(/pg_dump/);
    expect(nomes()).toEqual([]);

    const ok = await carregar();
    const r = await ok.backupDoBanco('antes-da-0018');
    expect(r.dest).toMatch(/-antes-da-0018\.sql\.gz$/);
    expect(nomes()).toEqual([r.dest.split('/').pop()]);
  });

  it('as fotos: tar que falha não deixa arquivo; tar que termina ganha o nome final', async () => {
    const fotos = join(raiz, 'uploads');
    mkdirSync(fotos, { recursive: true });
    writeFileSync(join(fotos, 'logo.webp'), 'x');

    const falha = await carregar({ UPLOAD_ROOT: fotos, FAKE_TAR_EXIT: '2' });
    const r1 = (await falha.runBackup()) as { fotos: string | null; erroFotos: string | null };
    expect(r1.fotos).toBeNull();
    expect(r1.erroFotos).toMatch(/tar saiu com código 2/);
    expect(nomes().filter((n) => /fotos|parcial/.test(n))).toEqual([]);

    rmSync(pastaBackup, { recursive: true });
    mkdirSync(pastaBackup);
    const ok = await carregar({ UPLOAD_ROOT: fotos });
    const r2 = (await ok.runBackup()) as { fotos: string };
    expect(r2.fotos).toMatch(/-fotos\.tar\.gz$/);
    expect(existsSync(r2.fotos)).toBe(true);
    expect(nomes().filter((n) => n.endsWith('.parcial'))).toEqual([]);
  });

  it('kill -9 no meio: o que sobra não conta como recente, e o backup do boot não é pulado', async () => {
    // Um processo de verdade fazendo backup, morto como o `docker stop` mata.
    const filho = spawn(process.execPath, ['--input-type=module', '-e',
      `const m = await import(${JSON.stringify('file://' + SCRIPT)}); await m.runBackup();`], {
      env: {
        ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_DIR: pastaBackup,
        DATABASE_URL: 'postgres://ninguem@127.0.0.1:1/de-mentira', UPLOAD_ROOT: join(raiz, 'sem-fotos'),
        FAKE_SLEEP: '30', S3_ENDPOINT: '', S3_BUCKET: '',
      },
      detached: true, stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 200 && nomes().length === 0; i++) await new Promise((r) => setTimeout(r, 25));
      expect(nomes()).toHaveLength(1);
      process.kill(-filho.pid!, 'SIGKILL'); // o grupo: o node e o pg_dump de mentira
      await new Promise((r) => filho.once('exit', r));
    } finally {
      try { process.kill(-filho.pid!, 'SIGKILL'); } catch { /* já morreu */ }
    }

    expect(nomes()[0]).toMatch(/\.sql\.gz\.parcial$/);
    const mod = await carregar();
    expect(mod.newestBackupAgeMs()).toBe(Infinity);
    const r = (await mod.runBackup({ skipIfFresherThanMs: 12 * 60 * 60 * 1000 })) as { skipped: boolean; dest: string };
    expect(r.skipped).toBe(false);
    expect(r.dest).toMatch(/\.sql\.gz$/);
  }, 20_000);
});

describe.skipIf(NO_WINDOWS)('a retenção', () => {
  it('apaga o .parcial abandonado (mais de 6 h) e deixa o recente', async () => {
    const velho = antigo('barbearia_2026-10-01-03-00-00.sql.gz.parcial', 7 * 60 * 60 * 1000);
    const novo = antigo('barbearia_2026-10-26-03-00-00.sql.gz.parcial', 60 * 60 * 1000);
    const mod = await carregar();
    const r = (await mod.runBackup()) as { removed: number };
    expect(existsSync(velho)).toBe(false);
    expect(existsSync(novo)).toBe(true);
    expect(r.removed).toBe(1);
  });

  it('BACKUP_RETENTION_DAYS=0 não apaga o que tem menos de 30 dias — nem o recém-feito', async () => {
    const dezDias = antigo('barbearia_2026-10-16-03-00-00.sql.gz', 10 * DIA);
    const mod = await carregar({ BACKUP_RETENTION_DAYS: '0' });
    const r = (await mod.runBackup()) as { dest: string; removed: number };
    expect(existsSync(r.dest)).toBe(true);
    expect(existsSync(dezDias)).toBe(true);
    expect(r.removed).toBe(0);
  });

  it('BACKUP_RETENTION_DAYS que não é número vale 30 — antes, nada nunca era apagado', async () => {
    const quarenta = antigo('barbearia_2026-09-16-03-00-00.sql.gz', 40 * DIA);
    const fotos40 = antigo('barbearia_2026-09-16-03-00-00-fotos.tar.gz', 40 * DIA);
    const vinte = antigo('barbearia_2026-10-06-03-00-00.sql.gz', 20 * DIA);
    const mod = await carregar({ BACKUP_RETENTION_DAYS: 'trinta' });
    await mod.runBackup();
    expect(existsSync(quarenta)).toBe(false);
    expect(existsSync(fotos40)).toBe(false);
    expect(existsSync(vinte)).toBe(true);
  });

  it('um prazo válido continua valendo', async () => {
    const tresDias = antigo('barbearia_2026-10-23-03-00-00.sql.gz', 3 * DIA);
    const mod = await carregar({ BACKUP_RETENTION_DAYS: '2' });
    await mod.runBackup();
    expect(existsSync(tresDias)).toBe(false);
  });
});
