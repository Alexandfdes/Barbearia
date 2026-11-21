export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = await db
    .select({ id: appointments.id, status: appointments.status, barberId: appointments.barberId })
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

  if (rows.length === 0) return json({ error: 'Não encontrado' }, 404);

  const appt = rows[0];
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (appt.status !== 'confirmed') {
    return json({ error: `Não pode cancelar (status: ${appt.status})` }, 409);
  }

  const now = new Date().toISOString();
  // A condição está no UPDATE, e agora a resposta também a lê (21/11/2026): com dois pedidos ao mesmo
  // tempo, o segundo não mudava nada e ainda dizia "ok" — como o cancelar do link do cliente já faz.
  const feitos = await db.update(appointments)
    .set({
      status:           'cancelled',
      cancelledAt:      now,
      cancelledBy:      session.role === 'admin' ? 'admin' : 'barber',
      lastModifiedById: session.barberId,
      lastModifiedAt:   now,
    })
    .where(and(eq(appointments.id, id), eq(appointments.status, 'confirmed'), eq(appointments.tenantId, tenant.id)))
    .returning({ id: appointments.id });
  if (feitos.length === 0) return json({ error: 'Este horário já não está confirmado. Atualize a agenda.' }, 409);

  return json({ ok: true });
};
