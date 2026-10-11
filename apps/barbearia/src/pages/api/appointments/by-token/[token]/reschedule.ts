export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { addDays, addMinutes } from 'date-fns';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../../db/index.js';
import { appointments, workingHours } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { reagendarAtomicamente } from '../../../../../lib/reagendar.js';
import { tenantDoHost } from '../../../../../lib/tenant.js';
import { avisarMudancaNaAgenda } from '../../../../../lib/avisoDeAgenda.js';
import { TZ } from '../../../../../lib/timezone.js';


const bodySchema = z.object({
  startsAt: z.string().refine(s => !isNaN(new Date(s).getTime()), 'Data/hora inválida'),
});

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

export const POST: APIRoute = async ({ params, request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const { token } = params;
  if (!token) return json({ error: 'Token inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const newStart = new Date(parsed.data.startsAt);

  // Limites de janela
  const now        = new Date();
  const todayStr   = formatInTimeZone(now, TZ, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 30), TZ, 'yyyy-MM-dd');
  const newDateStr = formatInTimeZone(newStart, TZ, 'yyyy-MM-dd');

  if (newStart < now)           return json({ error: 'Não é possível reagendar para o passado' }, 400);
  if (newDateStr < todayStr)    return json({ error: 'Data no passado' }, 400);
  if (newDateStr > maxDateStr)  return json({ error: 'Data além do limite de 30 dias' }, 400);

  // Busca o agendamento
  const apptRows = await db
    .select({
      id:              appointments.id,
      barberId:        appointments.barberId,
      durationMinutes: appointments.durationMinutes,
      status:          appointments.status,
      startsAt:        appointments.startsAt,
    })
    .from(appointments)
    .where(and(eq(appointments.manageToken, token), eq(appointments.tenantId, tenant.id)));

  if (apptRows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

  const appt = apptRows[0];
  if (appt.status !== 'confirmed') {
    return json({ error: `Não é possível reagendar (status: ${appt.status})` }, 409);
  }

  // Calcula novo fim
  const newEnd = addMinutes(newStart, appt.durationMinutes);

  // Verifica expediente do barbeiro pra esse dia da semana
  const dow = weekdayOf(newDateStr);
  const whRows = await db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, appt.barberId), eq(workingHours.weekday, dow), eq(workingHours.tenantId, tenant.id)));

  if (whRows.length === 0) {
    return json({ error: 'Barbeiro não trabalha nesse dia' }, 400);
  }

  // O slot precisa caber inteiro em ALGUMA janela do dia (o dia pode ter mais de
  // um turno: manhã + tarde). Mesma regra do bookAppointment.
  const fitsAnyWindow = whRows.some(wh => {
    const open  = fromZonedTime(`${newDateStr}T${wh.startTime}:00`, TZ);
    const close = fromZonedTime(`${newDateStr}T${wh.endTime}:00`,   TZ);
    return newStart >= open && newEnd <= close;
  });

  if (!fitsAnyWindow) {
    return json({ error: 'Horário fora do expediente' }, 400);
  }

  const newStartIso = newStart.toISOString();
  const newEndIso   = newEnd.toISOString();

  // Transação atômica com re-check de conflitos
  try {
    // `editorId: null` — quem reagenda aqui é o cliente pelo link, não um
    // barbeiro logado; `last_modified_by_id` referencia barbers e ficaria órfão.
    const r = await reagendarAtomicamente({
      tenantId:      tenant.id,
      appointmentId: appt.id,
      barberId:      appt.barberId,
      newStartIso,
      newEndIso,
      editorId:      null,
    });

    if (!r.ok) {
      const mensagens = {
        conflito_agendamento: 'Horário não está mais disponível',
        conflito_bloqueio:    'Horário bloqueado',
        status_mudou:         'Agendamento não pode mais ser reagendado',
      };
      return json({ error: mensagens[r.motivo] }, r.httpStatus);
    }

    // O barbeiro e o dono ficam sabendo do horário novo — e do antigo, que ficou
    // livre (11/10/2026, `lib/avisoDeAgenda.ts`). Remarcar para o mesmo horário
    // não muda nada, e não avisa.
    if (appt.startsAt !== newStartIso) {
      await avisarMudancaNaAgenda({ tenant, tipo: 'remarcado', agendamentoId: appt.id, inicioAnterior: appt.startsAt });
    }

    return json({
      ok: true,
      startsAt:  newStartIso,
      endsAt:    newEndIso,
      dateLocal: formatInTimeZone(newStart, TZ, 'dd/MM/yyyy'),
      timeLocal: formatInTimeZone(newStart, TZ, 'HH:mm'),
    });
  } catch (err) {
    console.error('[api/appointments/by-token/reschedule POST]', err);
    return json({ error: 'Erro interno ao reagendar' }, 500);
  }
};
