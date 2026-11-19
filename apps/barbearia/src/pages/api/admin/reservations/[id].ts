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

  // A condição `pending` vai no próprio UPDATE (19/11/2026), não só na leitura acima: dois cliques,
  // ou o dono e o barbeiro ao mesmo tempo, passavam os dois — a venda entrava em dobro no faturamento,
  // e o cancelar que corria junto deixava a reserva cancelada com a venda lançada (`CLAUDE.md`).
  const jaFeita = () => json({ error: 'Esta reserva já foi retirada ou cancelada. Atualize a tela.' }, 409);
  const pendente = and(eq(reservations.id, id), eq(reservations.tenantId, tenant.id), eq(reservations.status, 'pending'));

  if (action === 'cancel') {
    const feitas = await db.update(reservations)
      .set({ status: 'cancelled', handledById: session.barberId, handledAt: now })
      .where(pendente)
      .returning({ id: reservations.id });
    return feitas.length > 0 ? json({ ok: true }) : jaFeita();
  }

  // fulfill — atômico: marca retirada + registra a venda no faturamento.
  // ⚠️ O `await` NÃO É DECORAÇÃO. Sem ele a rota responde ok:true antes de a
  // transação terminar: se ela falhar, o erro vira rejeição não tratada e a tela
  // do barbeiro já disse "pronto" sobre algo que não foi gravado.
  const marcou = await db.transaction(async (tx) => {
    const feitas = await tx.update(reservations)
      .set({ status: 'fulfilled', handledById: session.barberId, handledAt: now })
      .where(pendente)
      .returning({ id: reservations.id });
    if (feitas.length === 0) return false; // outro pedido chegou antes: nada de venda
    await tx.insert(productSales).values({ tenantId: tenant.id,
      barberId:    session.barberId,
      name:        r.productName,
      quantity:    r.quantity,
      priceCents:  r.priceCents * r.quantity,
      soldAt:      now,
      createdById: session.barberId,
    });
    return true;
  });

  return marcou ? json({ ok: true }) : jaFeita();
};
