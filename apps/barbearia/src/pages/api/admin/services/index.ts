export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barberServices, barbers, services } from '../../../../db/schema.js';
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
  durationMinutes: z.number().int().min(5).max(480).optional(),
});

/** A duração com que o serviço novo nasce para cada barbeiro — editável na mesma tela. */
const DURACAO_PADRAO_DO_SERVICO_NOVO = 30;

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
  const durationMinutes = parsed.data.durationMinutes ?? DURACAO_PADRAO_DO_SERVICO_NOVO;
  let slug = slugify(name);

  // Garantir slug único
  const existing = await db.select({ slug: services.slug }).from(services)
    .where(and(eq(services.slug, slug), eq(services.tenantId, tenant.id)));
  if (existing.length > 0) slug = `${slug}-${Date.now()}`;

  // ⚠️ O serviço nasce JÁ LIGADO a cada barbeiro ativo (26/10/2026). O site e as
  // vagas só oferecem o serviço que algum barbeiro faz (`barber_services`), e até
  // então o serviço novo nascia sem ninguém: o painel dizia "criado" e o site não o
  // mostrava — até cada barbeiro achar o "eu ofereço" e salvar, sem nada avisar.
  // O catálogo sugerido e o cadastro de barbeiro já ligavam; só esta rota não.
  const criado = await db.transaction(async (tx) => {
    const [servico] = await tx.insert(services).values({ tenantId: tenant.id, name, slug, priceCents })
      .returning({ id: services.id });
    const ativos = await tx.select({ id: barbers.id }).from(barbers)
      .where(and(eq(barbers.tenantId, tenant.id), eq(barbers.active, true)));
    if (ativos.length > 0) {
      await tx.insert(barberServices).values(ativos.map((b) => ({
        tenantId: tenant.id, barberId: b.id, serviceId: servico.id, durationMinutes, active: true,
      })));
    }
    return { id: servico.id, barbeiros: ativos.length };
  });
  return json({ ok: true, id: criado.id, slug, barbeiros: criado.barbeiros }, 201);
};
