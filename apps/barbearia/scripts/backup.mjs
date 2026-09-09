/**
 * Backup do Postgres via `pg_dump`.
 *
 * Uso: node scripts/backup.mjs
 * Env: DATABASE_URL (obrigatória)
 *      BACKUP_DIR (default /data/backups)
 *      BACKUP_RETENTION_DAYS (default 30)
 *      S3_* (opcional, upload off-site)
 *
 * ── O que mudou no porte para Postgres ──────────────────────────────────────
 * Era `sqlite.backup(dest)`: a API de backup online do SQLite, que copia o
 * arquivo do banco de forma consistente mesmo com escrita acontecendo. No
 * Postgres o análogo é `pg_dump`, que roda como processo separado e devolve
 * SQL comprimido em vez de um arquivo de banco.
 *
 * Três consequências práticas:
 *
 *  1. O arquivo agora é `.sql.gz`, não `.db`. Restaura com
 *     `gunzip -c arquivo.sql.gz | psql "$DATABASE_URL"`.
 *  2. **`pg_dump` precisa estar instalado na imagem do app.** Sem ele o backup
 *     falha. Este script confere na primeira execução e diz isso na cara, em
 *     vez de morrer com "command not found".
 *  3. A retenção passou a olhar `.sql.gz`. Backups `.db` antigos, de antes do
 *     porte, são deixados em paz de propósito — são a única cópia daquele
 *     período e apagá-los seria destruir histórico.
 *
 * ⚠️ Este script roda no daemon (`backup-daemon.mjs`), lançado pelo CMD do
 * Dockerfile. Se ele quebrar, o backup diário para **em silêncio**. É o que
 * `PENDENCIAS-ABERTAS.md` §3.3 chama de "backup que não existe".
 */
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const BACKUP_DIR     = process.env.BACKUP_DIR ?? '/data/backups';
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
const SUFIXO         = '.sql.gz';

/** Idade (ms) do backup mais recente, ou Infinity se não houver nenhum. */
export function newestBackupAgeMs() {
  try {
    const ages = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(SUFIXO))
      .map((f) => Date.now() - statSync(join(BACKUP_DIR, f)).mtimeMs);
    return ages.length ? Math.min(...ages) : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Roda `pg_dump` e escreve o resultado comprimido em `dest`.
 *
 * O stderr é acumulado: `pg_dump` que falha no meio deixaria um `.sql.gz`
 * truncado, e um backup truncado é pior que nenhum — parece que existe. Por
 * isso o arquivo só é considerado válido com código de saída 0, e o chamador
 * apaga o parcial quando não é.
 */
function pgDumpPara(dest, url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('pg_dump', ['--no-owner', '--no-privileges', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let erro = '';
    proc.stderr.on('data', (d) => { erro += d.toString(); });

    // Os dois listeners entram AGORA, antes de qualquer await.
    //
    // ⚠️ Registrar o `close` só depois que a pipeline resolve não funciona: o
    // processo pode já ter terminado, e aí o listener nunca dispara. Foi assim
    // que a primeira versão deste arquivo devolveu "backup criado" para um
    // `pg_dump` que nem tinha conseguido conectar — 20 bytes de gzip vazio
    // apresentados como sucesso. Backup que mente é pior que backup ausente.
    const saida = new Promise((ok, falha) => {
      proc.on('error', (e) => {
        falha(new Error(
          e.code === 'ENOENT'
            ? 'pg_dump não encontrado. Instale o cliente do Postgres na imagem ' +
              '(Debian/Ubuntu: apt-get install -y postgresql-client; Alpine: apk add postgresql-client).'
            : e.message
        ));
      });
      proc.on('close', (codigo) => {
        if (codigo === 0) ok();
        else falha(new Error(`pg_dump saiu com código ${codigo}: ${erro.trim() || '(sem mensagem)'}`));
      });
    });

    const gravou = pipeline(proc.stdout, createGzip(), createWriteStream(dest));

    // Espera as DUAS: escrever o arquivo inteiro e o processo sair com 0.
    Promise.all([gravou, saida]).then(() => resolve(), reject);
  });
}

/**
 * Cria um backup consistente e apaga os antigos. Retorna o caminho criado.
 * opts.skipIfFresherThanMs: não faz nada se já existe backup mais novo que isso
 * (evita enxurrada de backups num restart-loop do container).
 */
export async function runBackup(opts = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definido.');

  mkdirSync(BACKUP_DIR, { recursive: true });

  if (opts.skipIfFresherThanMs && newestBackupAgeMs() < opts.skipIfFresherThanMs) {
    return { dest: null, removed: 0, skipped: true };
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dest = join(BACKUP_DIR, `barbearia_${stamp}${SUFIXO}`);

  try {
    await pgDumpPara(dest, url);
  } catch (erro) {
    // Arquivo parcial é pior que arquivo nenhum: parece backup e não é.
    try { unlinkSync(dest); } catch { /* nunca chegou a existir */ }
    throw erro;
  }

  // Retenção: só mexe nos .sql.gz. Os .db de antes do porte ficam.
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const f of readdirSync(BACKUP_DIR)) {
    if (!f.endsWith(SUFIXO)) continue;
    const p = join(BACKUP_DIR, f);
    if (statSync(p).mtimeMs < cutoff) { unlinkSync(p); removed++; }
  }

  const uploaded = await maybeUploadToS3(dest);

  return { dest, removed, skipped: false, uploaded };
}

/**
 * Upload off-site opcional (S3-compatível, ex: Backblaze B2).
 * Ativa somente se S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY existirem.
 * Falha de upload NÃO derruba o backup local — loga e segue.
 */
async function maybeUploadToS3(filePath) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return false;

  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    // Backblaze mostra o endpoint sem esquema; o SDK exige URL completa.
    const endpoint = /^https?:\/\//.test(S3_ENDPOINT) ? S3_ENDPOINT : `https://${S3_ENDPOINT}`;
    const client = new S3Client({
      endpoint,
      region: S3_REGION ?? 'us-east-1',
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
      forcePathStyle: true,
    });
    await client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `backups/${basename(filePath)}`,
      Body: readFileSync(filePath),
      ContentType: 'application/gzip',
    }));
    console.log(`✓ Upload off-site: s3://${S3_BUCKET}/backups/${basename(filePath)}`);
    return true;
  } catch (err) {
    console.error('✕ Upload off-site falhou (backup local preservado):', err.message);
    return false;
  }
}

// Execução direta via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup()
    .then(({ dest, removed }) => {
      console.log(`✓ Backup criado: ${dest}${removed ? ` (${removed} antigos removidos)` : ''}`);
    })
    .catch((err) => {
      console.error('✕ Backup falhou:', err.message);
      process.exit(1);
    });
}
