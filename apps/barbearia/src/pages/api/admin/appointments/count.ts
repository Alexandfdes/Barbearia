export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { fromZonedTime } from 'date-fns-tz';
import { tenantDaSessao, type Tenant } from '../../../../lib/tenant.js';

/**
 * GET /api/admin/appointments/count?date=YYYY-MM-DD[&barber=N]
 *
 * Resposta leve usada pelo auto-refresh da timeline:
 * { ok: true, count: N, maxModified: "<iso>" }
 *
 * count: total de appointments no dia (todos os status) com o filtro de barbeiro.
 * maxModified: maior valor de COALESCE(last_modified_at, created_at) — pra
 *              detectar mudanças mesmo se a contagem não mudou (ex: notes editadas).
 */

const TZ = 'America/Fortaleza';

/**
 * Uma consulta só: `barberId` nulo desliga o filtro dentro do próprio SQL.
 * Evita duas versões do mesmo agregado que precisam ser editadas em par.
 *
 * `AS "maxModified"` entre aspas porque o Postgres, ao contrário do SQLite,
 * derruba maiúsculas de identificadores não citados — sem as aspas a coluna
 * chegaria como `maxmodified` e o auto-refresh da timeline nunca detectaria
 * mudança.
 */
function contar(barberId: number | null, startIso: string, endIso: string, tenant: Tenant) {
  return first(db.execute<{ c: string; maxModified: string }>(sql`
    SELECT COUNT(*) AS c,
           COALESCE(MAX(COALESCE(last_modified_at, created_at)), '') AS "maxModified"
      FROM appointments
     WHERE tenant_id = ${tenant.id}
       AND starts_at >= ${startIso} AND starts_at < ${endIso}
       AND (${barberId}::int IS NULL OR barber_id = ${barberId}::int)
  `));
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Parâmetro date obrigatório' }, 400);
  }

  let barberFilter: number | null = null;
  if (session.role === 'admin') {
    const b = url.searchParams.get('barber');
    if (b) {
      const n = parseInt(b, 10);
      if (!isNaN(n)) barberFilter = n;
    }
  } else {
    barberFilter = session.barberId;
  }

  const startIso = fromZonedTime(`${date}T00:00:00`, TZ).toISOString();
  const endIso   = fromZonedTime(`${date}T23:59:59`, TZ).toISOString();

  const r = await contar(barberFilter, startIso, endIso, tenant);
  return json({ ok: true, count: Number(r?.c ?? 0), maxModified: r?.maxModified ?? '' });
};
