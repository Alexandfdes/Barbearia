export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { addDays, addMinutes } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../../db/index.js';
import { appointments, workingHours } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { reagendarAtomicamente } from '../../../../../lib/reagendar.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';
import { TZ } from '../../../../../lib/timezone.js';


const bodySchema = z.object({
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const newStart = new Date(parsed.data.startsAt);

  // Limites de janela (admin pode reagendar com mais flexibilidade — janela maior)
  const now        = new Date();
  const todayStr   = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 90), TZ, 'yyyy-MM-dd');
  const newDateStr = formatInTimeZone(newStart, TZ, 'yyyy-MM-dd');

  if (newDateStr < todayStr)    return json({ error: 'Data no passado' }, 400);
  if (newDateStr > maxDateStr)  return json({ error: 'Data além do limite (90 dias)' }, 400);

  const apptRows = await db
    .select({
      id:              appointments.id,
      barberId:        appointments.barberId,
      durationMinutes: appointments.durationMinutes,
      status:          appointments.status,
    })
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id)));

  if (apptRows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

  const appt = apptRows[0];

  // Barbeiro comum só pode reagendar os próprios; admin pode todos
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  if (appt.status !== 'confirmed') {
    return json({ error: `Não é possível reagendar (status: ${appt.status})` }, 409);
  }

  const newEnd = addMinutes(newStart, appt.durationMinutes);

  // Expediente do barbeiro
  const dow = weekdayOf(newDateStr);
  const whRows = await db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, appt.barberId), eq(workingHours.weekday, dow), eq(workingHours.tenantId, tenant.id)));

  if (whRows.length === 0) {
    return json({ error: 'Barbeiro não trabalha nesse dia' }, 400);
  }

  // O slot precisa caber inteiro em ALGUMA janela do dia (manhã + tarde etc.).
  const fitsAnyWindow = whRows.some(wh => {
    const open  = fromZonedTime(`${newDateStr}T${wh.startTime}:00`, TZ);
    const close = fromZonedTime(`${newDateStr}T${wh.endTime}:00`,   TZ);
    return newStart >= open && newEnd <= close;
  });

  if (!fitsAnyWindow) {
    return json({ error: 'Horário fora do expediente do barbeiro' }, 400);
  }

  const newStartIso = newStart.toISOString();
  const newEndIso   = newEnd.toISOString();

  try {
    const r = await reagendarAtomicamente({
      tenantId:      tenant.id,
      appointmentId: appt.id,
      barberId:      appt.barberId,
      newStartIso,
      newEndIso,
      editorId:      session.barberId,
    });

    if (!r.ok) {
      const mensagens = {
        conflito_agendamento: 'Conflito com outro agendamento',
        conflito_bloqueio:    'Horário bloqueado',
        status_mudou:         'Agendamento não pôde ser atualizado',
      };
      return json({ error: mensagens[r.motivo] }, r.httpStatus);
    }

    return json({
      ok: true,
      startsAt:  newStartIso,
      endsAt:    newEndIso,
      dateLocal: formatInTimeZone(newStart, TZ, 'dd/MM/yyyy'),
      timeLocal: formatInTimeZone(newStart, TZ, 'HH:mm'),
    });
  } catch (err) {
    console.error('[api/admin/appointments/:id/reschedule POST]', err);
    return json({ error: 'Erro interno ao reagendar' }, 500);
  }
};
