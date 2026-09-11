export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { services } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { tenantDoHost } from '../../../lib/tenant.js';

// Preços públicos do catálogo (fonte da verdade para a landing).
// Lista TODOS os serviços ativos — sem o filtro de barber_services, pois aqui
// importa o catálogo institucional, não quem oferece cada serviço.
export const GET: APIRoute = async ({ request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  try {
    const rows = await db
      .select({ slug: services.slug, priceCents: services.priceCents })
      .from(services)
      .where(and(eq(services.active, true), eq(services.tenantId, tenant.id)));
    return json(rows);
  } catch (err) {
    console.error('[api/services/prices]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
