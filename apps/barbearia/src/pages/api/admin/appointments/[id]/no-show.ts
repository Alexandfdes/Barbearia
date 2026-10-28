export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';
import { limiteParaFalta, RECUSA_FALTA_ANTES } from '../../../../../lib/fecharAtendimento.js';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = await db
    .select({ id: appointments.id, status: appointments.status, barberId: appointments.barberId, startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

  if (rows.length === 0) return json({ error: 'Não encontrado' }, 404);

  const appt = rows[0];
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (appt.status !== 'confirmed') {
    return json({ error: `Não pode marcar no-show (status: ${appt.status})` }, 409);
  }
  const limite = limiteParaFalta();
  if (appt.startsAt > limite) return json({ error: RECUSA_FALTA_ANTES }, 409);

  // A condição vai no UPDATE, não só na leitura acima: dois pedidos ao mesmo tempo,
  // ou um cancelamento do cliente no meio, não podem passar os dois.
  const feitos = await db.update(appointments)
    .set({
      status:           'no_show',
      lastModifiedById: session.barberId,
      lastModifiedAt:   new Date().toISOString(),
    })
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id),
      eq(appointments.status, 'confirmed'), lte(appointments.startsAt, limite)))
    .returning({ id: appointments.id });
  if (feitos.length === 0) return json({ error: 'Este horário mudou enquanto você marcava. Atualize a agenda.' }, 409);

  return json({ ok: true });
};
