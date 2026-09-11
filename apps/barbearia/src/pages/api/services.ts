export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { services, barberServices, barbers } from '../../db/schema.js';
import { json } from '../../lib/api.js';
import { tenantDoHost } from '../../lib/tenant.js';

export const GET: APIRoute = async ({ request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  try {
    const rows = await db
      .select({
        serviceId:       services.id,
        serviceName:     services.name,
        serviceSlug:     services.slug,
        priceCents:      services.priceCents,
        barberId:        barbers.id,
        barberName:      barbers.name,
        barberSlug:      barbers.slug,
        durationMinutes: barberServices.durationMinutes,
      })
      .from(services)
      .innerJoin(barberServices, eq(barberServices.serviceId, services.id))
      .innerJoin(barbers, eq(barbers.id, barberServices.barberId))
      .where(and(     and(
          eq(services.active, true),
          eq(barberServices.active, true),
          eq(barbers.active, true)
        )
     , eq(services.tenantId, tenant.id)))
      .orderBy(services.id, barbers.id);

    // Agrupa barbeiros por serviço
    const map = new Map<number, {
      id: number; name: string; slug: string; priceCents: number;
      barbers: { id: number; name: string; slug: string; durationMinutes: number }[];
    }>();

    for (const row of rows) {
      if (!map.has(row.serviceId)) {
        map.set(row.serviceId, {
          id: row.serviceId,
          name: row.serviceName,
          slug: row.serviceSlug,
          priceCents: row.priceCents,
          barbers: [],
        });
      }
      map.get(row.serviceId)!.barbers.push({
        id: row.barberId,
        name: row.barberName,
        slug: row.barberSlug,
        durationMinutes: row.durationMinutes,
      });
    }

    return json([...map.values()]);
  } catch (err) {
    console.error('[api/services]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
