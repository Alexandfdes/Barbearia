export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../db/index.js';
import { appointments, barbers, timeOff } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

const TZ = 'America/Fortaleza';

const createSchema = z.object({
  barberId: z.number().int().positive().nullable().optional(),
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data inválida'),
  endsAt:   z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data inválida'),
  reason:   z.string().max(200).optional(),
});

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const baseQuery = db
    .select({
      id:        timeOff.id,
      barberId:  timeOff.barberId,
      barberName: barbers.name,
      startsAt:  timeOff.startsAt,
      endsAt:    timeOff.endsAt,
      reason:    timeOff.reason,
      createdAt: timeOff.createdAt,
    })
    .from(timeOff)
    .leftJoin(barbers, eq(barbers.id, timeOff.barberId));

  const rows = session.role === 'admin'
    ? await baseQuery.orderBy(timeOff.startsAt)
    : await baseQuery
        .where(and(or(eq(timeOff.barberId, session.barberId), isNull(timeOff.barberId)), eq(timeOff.tenantId, tenant.id)))
        .orderBy(timeOff.startsAt);

  const now = new Date();
  return json(rows.map(r => ({
    ...r,
    barberName:    r.barberName ?? 'Todos',
    dateLabel:     formatInTimeZone(new Date(r.startsAt), TZ, 'dd/MM'),
    startsAtLocal: formatInTimeZone(new Date(r.startsAt), TZ, 'HH:mm'),
    endsAtLocal:   formatInTimeZone(new Date(r.endsAt),   TZ, 'HH:mm'),
    isPast:        new Date(r.endsAt) < now,
  })));
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { barberId: reqBarberId, startsAt, endsAt, reason } = parsed.data;

  const effectiveBarberId: number | null =
    session.role === 'admin' ? (reqBarberId ?? null) : session.barberId;

  if (new Date(startsAt) >= new Date(endsAt)) {
    return json({ error: 'Horário de início deve ser antes do fim' }, 400);
  }

  // Rejeita bloqueio inteiramente no passado. Intervalo que ainda está em curso
  // (começou mas não terminou) é permitido — ex: bloquear o almoço já começado.
  if (new Date(endsAt) <= new Date()) {
    return json({ error: 'Esse intervalo já passou' }, 400);
  }

  const startsIso = new Date(startsAt).toISOString();
  const endsIso   = new Date(endsAt).toISOString();

  // Não permite bloquear em cima de agendamento confirmado.
  // barberId null (feriado p/ todos) conflita com qualquer barbeiro.
  const overlap = and(
    eq(appointments.status, 'confirmed'),
    lt(appointments.startsAt, endsIso),
    gt(appointments.endsAt, startsIso),
  );
  const conflictRows = await db
    .select({
      customerName: appointments.customerName,
      startsAt:     appointments.startsAt,
    })
    .from(appointments)
    .where(and(
      effectiveBarberId !== null
        ? and(overlap, eq(appointments.barberId, effectiveBarberId))
        : overlap
    , eq(appointments.tenantId, tenant.id)))
    .orderBy(appointments.startsAt);

  if (conflictRows.length > 0) {
    return json({
      error: 'Há cliente agendado nesse intervalo',
      conflicts: conflictRows.map(c => ({
        customerName: c.customerName,
        timeLocal:    formatInTimeZone(new Date(c.startsAt), TZ, 'HH:mm'),
      })),
    }, 409);
  }

  const result = await db.insert(timeOff).values({ tenantId: tenant.id,
    barberId:  effectiveBarberId,
    startsAt:  startsIso,
    endsAt:    endsIso,
    reason:    reason ?? null,
    createdBy: session.barberId,
  }).returning({ id: timeOff.id });

  return json({ ok: true, id: result[0].id }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const idParam = url.searchParams.get('id');
  const id = parseInt(idParam ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const rows = await db
    .select({ id: timeOff.id, barberId: timeOff.barberId })
    .from(timeOff)
    .where(and(eq(timeOff.id, id), eq(timeOff.tenantId, tenant.id)));

  if (rows.length === 0) return json({ error: 'Não encontrado' }, 404);

  if (session.role !== 'admin' && rows[0].barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  await db.delete(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.tenantId, tenant.id)));
  return json({ ok: true });
};
