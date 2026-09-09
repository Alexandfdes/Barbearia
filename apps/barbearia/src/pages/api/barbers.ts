export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { barbers } from '../../db/schema.js';
import { json } from '../../lib/api.js';
import { tenantDoHost } from '../../lib/tenant.js';

export const GET: APIRoute = async ({ request }) => {
  const tenant = tenantDoHost(request);
  try {
    const result = await db
      .select({ id: barbers.id, name: barbers.name, slug: barbers.slug })
      .from(barbers)
      .where(and(eq(barbers.active, true), eq(barbers.tenantId, tenant.id)))
      .orderBy(barbers.id);

    return json(result);
  } catch (err) {
    console.error('[api/barbers]', err);
    return json({ error: 'Erro interno' }, 500);
  }
};
