export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getAvailableSlots } from '../../lib/slots.js';
import { fusoDe } from '../../lib/timezone.js';
import { tenantDoHost } from '../../lib/tenant.js';


const querySchema = z.object({
  barberId:             z.coerce.number().int().positive(),
  serviceId:            z.coerce.number().int().positive(),
  date:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD'),
  excludeAppointmentId: z.coerce.number().int().positive().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  // Endereço desconhecido não calcula horário de ninguém. Sem esta guarda a
  // requisição rodaria sem contexto de barbearia — ou seja, sem o RLS — e o
  // `barberId` da query passaria a alcançar a agenda de qualquer cliente.
  const tenant = tenantDoHost(request);
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const fuso = fusoDe(tenant);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    barberId:             url.searchParams.get('barberId'),
    serviceId:            url.searchParams.get('serviceId'),
    date:                 url.searchParams.get('date'),
    excludeAppointmentId: url.searchParams.get('excludeAppointmentId') ?? undefined,
  });

  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, serviceId, date, excludeAppointmentId } = parsed.data;

  const now        = new Date();
  const todayStr   = formatInTimeZone(now, fuso, 'yyyy-MM-dd');
  const maxDateStr = formatInTimeZone(addDays(now, 30), fuso, 'yyyy-MM-dd');

  if (date < todayStr)   return json({ error: 'Data no passado' }, 400);
  if (date > maxDateStr) return json({ error: 'Data além do limite de 30 dias' }, 400);

  try {
    const slots = await getAvailableSlots(barberId, serviceId, date, excludeAppointmentId, tenant);

    return json({
      date,
      timezone: fuso,
      slots: slots.map(s => ({
        utc:  s.toISOString(),
        time: formatInTimeZone(s, fuso, 'HH:mm'),
      })),
    });
  } catch (err) {
    console.error('[api/slots]', err);
    return json({ error: 'Erro interno ao calcular slots' }, 500);
  }
};
