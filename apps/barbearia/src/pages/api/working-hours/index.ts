export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { workingHours } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { tenantDoHost } from '../../../lib/tenant.js';

// Leitura pública: o wizard de agendamento usa para saber em quais dias da semana
// o barbeiro trabalha (e desabilitar os dias sem registro). Horário de
// funcionamento não é dado sensível.
export const GET: APIRoute = async ({ url, request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const barberId = parseInt(url.searchParams.get('barber') ?? '', 10);
  if (isNaN(barberId)) return json({ error: 'Parâmetro "barber" inválido' }, 400);

  const rows = await db
    .select({
      weekday:   workingHours.weekday,
      startTime: workingHours.startTime,
      endTime:   workingHours.endTime,
    })
    .from(workingHours)
    .where(and(eq(workingHours.barberId, barberId), eq(workingHours.tenantId, tenant.id)))
    .orderBy(workingHours.weekday);

  return json(rows);
};
