export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { products } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { tenantDoHost } from '../../../lib/tenant.js';

// Lista pública dos produtos ATIVOS — usada pelos cards da landing, pelo combo
// (wizard de agendamento) e pelo modal de venda de produto no admin.
export const GET: APIRoute = async ({ request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const rows = await db
    .select({
      id:        products.id,
      slug:      products.slug,
      name:      products.name,
      shortDesc: products.shortDesc,
      priceCents: products.priceCents,
      image:     products.image,
    })
    .from(products)
    .where(and(eq(products.active, true), eq(products.tenantId, tenant.id)))
    .orderBy(products.sortOrder, products.id);

  return json(rows);
};
