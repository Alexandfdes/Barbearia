export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { fusoDe } from '../../../../lib/timezone.js';

/**
 * GET /api/admin/appointments/calendar?month=YYYY-MM[&barber=N]
 *
 * Retorna { days: { "YYYY-MM-DD": qty, ... } } com a contagem de agendamentos
 * (confirmed + completed) por dia, no fuso da barbearia, no mês solicitado.
 *
 * Barbeiro não-admin só vê os próprios agendamentos.
 */

/**
 * Agrupa por dia local da barbearia.
 *
 * O SQLite fazia `datetime(starts_at, '-3 hours')` — subtração fixa. Aqui a
 * conversão usa a zona nomeada: `starts_at` é TEXT com ISO em UTC, então o cast
 * para timestamptz e o `AT TIME ZONE` dão o horário local de verdade. Fortaleza
 * não tem horário de verão, então o resultado é o mesmo hoje; a diferença é que
 * a consulta continua certa fora de Fortaleza — e desde 12/10/2026 a zona É a
 * coluna da barbearia (`tenants.timezone`, `fusoDe`).
 *
 * ⚠️ A zona é PARÂMETRO, não texto interpolado. `AT TIME ZONE ${fuso}` com o valor
 * vindo do driver é uma bind, não concatenação — o fuso vem do banco e da
 * configuração do dono, e isto continua sendo consulta preparada.
 */
function porDia(tenantId: number, fuso: string, barberId: number | null, month: string) {
  return db.execute<{ day_local: string; qty: string }>(sql`
    SELECT
      to_char((starts_at::timestamptz) AT TIME ZONE ${fuso}, 'YYYY-MM-DD') AS day_local,
      COUNT(*) AS qty
    FROM appointments
    WHERE tenant_id = ${tenantId}
      AND status IN ('confirmed', 'completed')
      AND to_char((starts_at::timestamptz) AT TIME ZONE ${fuso}, 'YYYY-MM') = ${month}
      AND (${barberId}::int IS NULL OR barber_id = ${barberId}::int)
    GROUP BY day_local
  `);
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const month = url.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: 'Parâmetro month obrigatório (YYYY-MM)' }, 400);
  }

  // Barbeiro não-admin sempre vê só os próprios. Admin pode filtrar opcionalmente.
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

  const rows = await porDia(tenant.id, fusoDe(tenant), barberFilter, month);

  const days: Record<string, number> = {};
  for (const r of rows) days[r.day_local] = Number(r.qty);

  return json({ ok: true, month, days });
};
