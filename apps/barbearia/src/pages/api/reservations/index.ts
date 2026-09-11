export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { products, reservations } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { normalizePhone } from '../../../lib/phone.js';
import { tenantDoHost } from '../../../lib/tenant.js';

const bodySchema = z.object({
  productId:     z.number().int().positive(),
  quantity:      z.number().int().min(1).max(20),
  customerName:  z.string().trim().min(2).max(100),
  customerPhone: z.string().min(8).max(25),
});

// Reserva pública de produto (cliente reserva pra retirar na barbearia).
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const ip = getClientIp(request, clientAddress);

  const ipRl = checkRateLimit(`reservation-ip:${ip}`, { maxTries: 10 });
  if (!ipRl.ok) return json({ error: `Muitas reservas deste dispositivo. Tente em ${ipRl.retryAfterSecs}s.` }, 429);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const phone = normalizePhone(parsed.data.customerPhone);
  if (!phone) return json({ error: 'Telefone inválido — informe DDD + número' }, 400);

  const phoneRl = checkRateLimit(`reservation-phone:${ip}:${phone.slice(-11)}`, { maxTries: 5 });
  if (!phoneRl.ok) return json({ error: 'Muitas reservas para este telefone. Tente mais tarde.' }, 429);

  const product = await first(db
    .select({ id: products.id, name: products.name, priceCents: products.priceCents, active: products.active })
    .from(products).where(and(eq(products.id, parsed.data.productId), eq(products.tenantId, tenant.id))));
  if (!product || !product.active) return json({ error: 'Produto indisponível' }, 400);

  await db.insert(reservations).values({ tenantId: tenant.id,
    productId:     product.id,
    productName:   product.name,
    priceCents:    product.priceCents,
    quantity:      parsed.data.quantity,
    customerName:  parsed.data.customerName.trim(),
    customerPhone: phone,
  });

  return json({ ok: true }, 201);
};
