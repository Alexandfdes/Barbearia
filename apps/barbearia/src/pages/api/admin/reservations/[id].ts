export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { reservations, productSales } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

// PATCH — { action: 'fulfill' | 'cancel' }.
// fulfill: marca como retirada E cria uma venda de produto (entra no faturamento
// do barbeiro que atendeu). cancel: marca como cancelada.
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const action = (body as { action?: string })?.action;
  if (action !== 'fulfill' && action !== 'cancel') return json({ error: 'Ação inválida' }, 400);

  const r = await first(db.select().from(reservations).where(and(eq(reservations.id, id), eq(reservations.tenantId, tenant.id))));
  if (!r) return json({ error: 'Reserva não encontrada' }, 404);
  if (r.status !== 'pending') {
    return json({ error: `Reserva já ${r.status === 'fulfilled' ? 'retirada' : 'cancelada'}` }, 409);
  }

  const now = new Date().toISOString();

  if (action === 'cancel') {
    await db.update(reservations)
      .set({ status: 'cancelled', handledById: session.barberId, handledAt: now })
      .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenant.id)));
    return json({ ok: true });
  }

  // fulfill — atômico: marca retirada + registra a venda no faturamento.
  db.transaction(async (tx) => {
    await tx.update(reservations)
      .set({ status: 'fulfilled', handledById: session.barberId, handledAt: now })
      .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenant.id)));
    await tx.insert(productSales).values({ tenantId: tenant.id,
      barberId:    session.barberId,
      name:        r.productName,
      quantity:    r.quantity,
      priceCents:  r.priceCents * r.quantity,
      soldAt:      now,
      createdById: session.barberId,
    });
  });

  return json({ ok: true });
};
