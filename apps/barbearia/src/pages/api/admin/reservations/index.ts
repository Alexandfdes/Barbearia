export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { reservations } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

// Lista todas as reservas para o admin (pendentes primeiro, mais novas no topo).
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const rows = await db.select().from(reservations).where(eq(reservations.tenantId, tenant.id));
  const rank: Record<string, number> = { pending: 0, fulfilled: 1, cancelled: 2 };
  rows.sort((a, b) => (rank[a.status] - rank[b.status]) || b.createdAt.localeCompare(a.createdAt));
  return json(rows);
};
