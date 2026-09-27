export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barberServices, services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const createSchema = z.object({
  name:       z.string().min(2).max(100),
  priceCents: z.number().int().positive(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const includeInactive = url.searchParams.get('all') === 'true' && session.role === 'admin';

  // Inativos só para o dono que pediu. Só os desta barbearia, sempre — fora do
  // ramo, para nenhum esquecê-lo.
  const filtroServicos = and(
    eq(services.tenantId, tenant.id),
    includeInactive ? undefined : eq(services.active, true),
  );

  const baseQuery = db
    .select({
      id:         services.id,
      name:       services.name,
      slug:       services.slug,
      priceCents: services.priceCents,
      active:     services.active,
      bsActive:   barberServices.active,
      bsDuration: barberServices.durationMinutes,
    })
    .from(services)
    .leftJoin(
      barberServices,
      and(eq(barberServices.serviceId, services.id), eq(barberServices.barberId, session.barberId))
    )
    .where(filtroServicos);

  const rows = await baseQuery.orderBy(services.name);

  return json(rows);
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, priceCents } = parsed.data;
  let slug = slugify(name);

  // Garantir slug único
  const existing = await db.select({ slug: services.slug }).from(services)
    .where(and(eq(services.slug, slug), eq(services.tenantId, tenant.id)));
  if (existing.length > 0) slug = `${slug}-${Date.now()}`;

  const [criado] = await db.insert(services).values({ tenantId: tenant.id, name, slug, priceCents })
    .returning({ id: services.id });
  return json({ ok: true, id: criado.id, slug }, 201);
};
