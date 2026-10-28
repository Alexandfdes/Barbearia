export const prerender = false;

import type { APIRoute } from 'astro';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { formatInTimeZone } from 'date-fns-tz';
import { sql } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { tenantDaSessao } from '../../../lib/tenant.js';
import { fusoDe } from '../../../lib/timezone.js';

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

  const tenant = tenantDaSessao(session);
  const fuso = fusoDe(tenant);

  // ⚠️ TRAVA DELIBERADA, E A CONDIÇÃO JÁ ESTEVE ERRADA AQUI.
  //
  // `pg_dump` traz o banco INTEIRO: sem `--table`, sem `WHERE`, e com a
  // credencial de dono das tabelas, que ignora o RLS. Ele só é o backup DESTA
  // barbearia enquanto ela for a única linha de `tenants`.
  //
  // A versão anterior comparava `tenant.id !== TENANT_UNICO.id`, acreditando que
  // isso passaria a barrar sozinho quando a tabela `tenants` existisse. É o
  // contrário: `TENANT_UNICO.id` é 1, e 1 é o tenant de backfill — o único
  // cliente em produção. A trava barrava todas as barbearias MENOS a que existe.
  //
  // A condição certa não é sobre QUEM pede: é sobre o que o arquivo contém.
  // Uma linha em `tenants` ⇒ o dump é só desta barbearia. Duas ⇒ entregaria
  // nome, telefone e data de nascimento dos clientes de todas, mais o hash de
  // senha dos donos delas. Consultamos o banco, e não o cache de tenants, porque
  // um cache velho em outro processo diria "uma" depois da segunda já existir.
  //
  // A versão multi-tenant precisa exportar só as linhas do tenant (COPY com
  // WHERE), não `pg_dump` — `PENDENCIAS-ABERTAS.md` §2.8.
  const contagem = await first(db.execute<{ n: string }>(sql`SELECT COUNT(*) AS n FROM tenants`));
  const quantas = Number(contagem?.n ?? 0);
  if (quantas !== 1) {
    console.warn(`[api/admin/backup] recusado: ${quantas} barbearias no banco (tenant ${tenant.slug})`);
    return json({
      error: 'O download de backup não funciona com mais de uma barbearia no mesmo banco, '
           + 'porque o arquivo sairia com os dados de todas. Use o backup do servidor.',
    }, 501);
  }

  const url = process.env.DATABASE_URL;
  if (!url) return json({ error: 'DATABASE_URL não configurado' }, 500);

  const dir  = mkdtempSync(join(tmpdir(), 'bkp-'));
  const dest = join(dir, 'backup.sql');
  try {
    await rodarPgDump(url, dest);
    const buf = readFileSync(dest);
    // Data no fuso da barbearia, não em UTC: backup tirado às 22h em Fortaleza
    // sairia com a data de amanhã no nome do arquivo.
    const stamp = formatInTimeZone(new Date(), fuso, 'yyyy-MM-dd');
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
