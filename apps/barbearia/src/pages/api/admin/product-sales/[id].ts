export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { productSales } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

// Remove uma venda de produto (correção de lançamento manual).
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const sale = await first(db.select({ id: productSales.id, barberId: productSales.barberId })
    .from(productSales).where(and(eq(productSales.id, id), eq(productSales.tenantId, tenant.id))));
  if (!sale) return json({ error: 'Venda não encontrada' }, 404);

  // Barbeiro só apaga as próprias vendas; admin apaga qualquer uma.
  if (session.role !== 'admin' && sale.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  await db.delete(productSales).where(and(eq(productSales.id, id), eq(productSales.tenantId, tenant.id)));
  return json({ ok: true });
};
