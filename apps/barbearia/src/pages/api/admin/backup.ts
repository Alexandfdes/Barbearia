export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { tenantDaSessao, TENANT_UNICO } from '../../../lib/tenant.js';

/**
 * GET /api/admin/backup — baixa um backup consistente do banco, gerado na hora.
 * Restrito ao admin. Serve como off-site manual: baixe e guarde fora do servidor.
 *
 * ── O que mudou na migração pro Postgres ────────────────────────────────────
 * No SQLite isto era `sqlite.backup(dest)`: a API de backup online, que copia o
 * arquivo do banco de forma consistente mesmo com escrita acontecendo. Não
 * existe equivalente no Postgres — o análogo é `pg_dump`, que roda como
 * processo separado e devolve SQL em vez de um arquivo de banco.
 *
 * Consequências práticas, que valem estar aqui e não só na documentação:
 *  · O download agora é um `.sql` (restaura com `psql`), não um `.db`.
 *  · `pg_dump` precisa estar instalado no container do app. Se não estiver, a
 *    rota responde 500 com essa causa explícita em vez de falhar sem motivo.
 *  · Um dump grande passa inteiro pela memória do processo, como antes. Vale
 *    enquanto for uma barbearia; a rotina automática de backup é operacional
 *    (cron no servidor, `ARQUITETURA-PRODUCAO.md`), não esta rota.
 */

/**
 * Traduz a DATABASE_URL para as variáveis PG* que a libpq lê.
 *
 * Passar a URL como argumento (`pg_dump "postgres://user:senha@..."`) funciona,
 * mas argv é legível por qualquer processo da máquina via `ps` — a senha do
 * banco vazaria para qualquer um com shell no servidor. Por env não vaza.
 */
function ambienteDoPostgres(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST:     u.hostname,
    PGPORT:     u.port || '5432',
    PGUSER:     decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

/** Espera o `pg_dump` terminar. Rejeita com o stderr — é onde o Postgres explica a falha. */
function rodarPgDump(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'pg_dump',
      ['--no-owner', '--no-privileges', '--format=plain', '--file', dest],
      { env: ambienteDoPostgres(url), stdio: ['ignore', 'ignore', 'pipe'] },
    );

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += String(d); });

    proc.on('error', (err) => {
      reject(
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? new Error('pg_dump não está instalado no servidor do app (pacote postgresql-client).')
          : err,
      );
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump saiu com código ${code}: ${stderr.trim() || 'sem detalhes'}`));
    });
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Apenas admin' }, 403);

  // ⚠️ Trava deliberada. Um `pg_dump` traz o banco INTEIRO. Enquanto houver uma
  // barbearia por banco isso é o backup dela; no dia em que o mesmo Postgres
  // servir várias, este mesmo download entregaria os dados de todas para o
  // admin de uma só — a pior falha de isolamento possível no produto.
  //
  // Quando o passo 3 do `ARQUITETURA-MULTI-TENANT-V1.md` §9 introduzir a tabela
  // `tenants`, `tenantDaSessao` deixa de devolver TENANT_UNICO e esta rota passa
  // a responder 501 sozinha, em vez de vazar em silêncio. A versão multi-tenant
  // precisa exportar só as linhas do tenant, não usar `pg_dump`.
  const tenant = tenantDaSessao(session);
  if (tenant.id !== TENANT_UNICO.id) {
    return json({
      error: 'Backup por download ainda não existe no modo multi-barbearia. Use o backup do servidor.',
    }, 501);
  }

  const url = process.env.DATABASE_URL;
  if (!url) return json({ error: 'DATABASE_URL não configurado' }, 500);

  const dir  = mkdtempSync(join(tmpdir(), 'bkp-'));
  const dest = join(dir, 'backup.sql');
  try {
    await rodarPgDump(url, dest);
    const buf = readFileSync(dest);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="${tenant.slug}-backup-${stamp}.sql"`,
        'Content-Length': String(buf.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/admin/backup]', err);
    const detalhe = err instanceof Error ? err.message : 'erro desconhecido';
    return json({ error: `Falha ao gerar backup: ${detalhe}` }, 500);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
