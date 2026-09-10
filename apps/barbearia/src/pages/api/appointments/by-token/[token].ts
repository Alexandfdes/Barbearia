export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../db/index.js';
import { appointments, barbers, services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSettings, waUrl } from '../../../../lib/settings.js';
import { tenantDoHost } from '../../../../lib/tenant.js';
import { TZ } from '../../../../lib/timezone.js';


export const GET: APIRoute = async ({ params, request }) => {
  const tenant = tenantDoHost(request);
  const { token } = params;
  if (!token) return json({ error: 'Token inválido' }, 400);

  try {
    const rows = await db
      .select({
        id:              appointments.id,
        manageToken:     appointments.manageToken,
        status:          appointments.status,
        startsAt:        appointments.startsAt,
        endsAt:          appointments.endsAt,
        durationMinutes: appointments.durationMinutes,
        priceCents:      appointments.priceCents,
        customerName:    appointments.customerName,
        cancelledAt:     appointments.cancelledAt,
        cancelledBy:     appointments.cancelledBy,
        barberId:        barbers.id,
        barberName:      barbers.name,
        barberSlug:      barbers.slug,
        serviceId:       services.id,
        serviceName:     services.name,
        serviceSlug:     services.slug,
      })
      .from(appointments)
      .innerJoin(barbers, eq(barbers.id, appointments.barberId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.manageToken, token), eq(appointments.tenantId, tenant.id)));

    if (rows.length === 0) return json({ error: 'Agendamento não encontrado' }, 404);

    const appt = rows[0];
    const startsAtDate = new Date(appt.startsAt);
    const dateLocal = formatInTimeZone(startsAtDate, TZ, 'dd/MM/yyyy');
    const timeLocal = formatInTimeZone(startsAtDate, TZ, 'HH:mm');

    const s = await getSettings();
    const whatsappText = s.whatsappNumber
      ? `Olá! Agendei *${appt.serviceName}* com *${appt.barberName}* no dia *${dateLocal}* às *${timeLocal}*.`
      : null;
    const whatsappUrl = whatsappText ? waUrl(whatsappText, s) : null;

    return json({
      id:              appt.id,
      manageToken:     appt.manageToken,
      status:          appt.status,
      startsAt:        appt.startsAt,
      endsAt:          appt.endsAt,
      dateLocal,
      timeLocal,
      durationMinutes: appt.durationMinutes,
      priceCents:      appt.priceCents,
      customerName:    appt.customerName,
      cancelledAt:     appt.cancelledAt,
      cancelledBy:     appt.cancelledBy,
      barber:  { id: appt.barberId,  name: appt.barberName,  slug: appt.barberSlug },
      service: { id: appt.serviceId, name: appt.serviceName, slug: appt.serviceSlug },
      whatsappUrl,
    });
  } catch (err) {
    console.error('[api/appointments/by-token GET]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
