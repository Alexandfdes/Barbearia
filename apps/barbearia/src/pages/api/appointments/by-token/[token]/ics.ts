export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../../../../../db/index.js';
import { appointments, barbers, services } from '../../../../../db/schema.js';
import { getSettings } from '../../../../../lib/settings.js';
import { enderecoPublicoDe, tenantDoHost } from '../../../../../lib/tenant.js';
import { fusoDe } from '../../../../../lib/timezone.js';

function toIcsDate(isoStr: string): string {
  return new Date(isoStr).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

export const GET: APIRoute = async ({ params, request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return new Response('Not found', { status: 404 });
  const fuso = fusoDe(tenant);
  const { token } = params;
  if (!token) return new Response(null, { status: 400 });

  const rows = await db
    .select({
      id:           appointments.id,
      status:       appointments.status,
      startsAt:     appointments.startsAt,
      endsAt:       appointments.endsAt,
      customerName: appointments.customerName,
      barberName:   barbers.name,
      serviceName:  services.name,
    })
    .from(appointments)
    .innerJoin(barbers,  eq(barbers.id,  appointments.barberId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(and(eq(appointments.manageToken, token), eq(appointments.tenantId, tenant.id)));

  if (rows.length === 0) return new Response(null, { status: 404 });

  const appt = rows[0];
  if (appt.status !== 'confirmed') return new Response(null, { status: 410 });

  const now      = toIcsDate(new Date().toISOString());
  const start    = toIcsDate(appt.startsAt);
  const end      = toIcsDate(appt.endsAt);
  // ⚠️ O endereço é o da barbearia do agendamento. Até 27/09/2026 era uma
  // constante com o domínio do Bayron: o convite de calendário de todo cliente do
  // produto levava para o site dele, onde o link do agendamento não existe.
  const endereco = enderecoPublicoDe(tenant, new URL(request.url).origin);
  const uid      = `appointment-${appt.id}@${new URL(endereco).host}`;
  const url      = `${endereco}/a/${token}`;
  const s = await getSettings();
  const summary  = icsEscape(`${appt.serviceName} com ${appt.barberName} — ${s.businessName}`);
  const location = icsEscape(`${s.addressStreet} — ${s.addressCity}`);
  const description = icsEscape(`Cliente: ${appt.customerName}\nLink: ${url}`);
  const filename = `agendamento-${formatInTimeZone(new Date(appt.startsAt), fuso, 'yyyyMMdd-HHmm')}.ics`;

  const CRLF = '\r\n';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `PRODID:-//${s.businessName}//Agendamento//PT-BR`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    foldLine(`SUMMARY:${summary}`),
    foldLine(`LOCATION:${location}`),
    foldLine(`DESCRIPTION:${description}`),
    foldLine(`URL:${url}`),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return new Response(lines.join(CRLF) + CRLF, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};
