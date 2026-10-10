export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barbers, barberServices, services } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { CATALOGO_SUGERIDO } from '../../../../lib/catalogoSugerido.js';

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Cria o catálogo sugerido — `PENDENCIAS-ABERTAS.md` §4.5.
 *
 * Os serviços entram INATIVOS e com preço zero. O porquê está em
 * `lib/catalogoSugerido.ts`, e resumido: preço sugerido que o dono não reparou
 * vira o preço no site dele.
 *
 * Cada serviço já sai vinculado aos barbeiros ativos, com a duração sugerida.
 * Sem esse vínculo o serviço existe e **não é agendável** — `api/services.ts`
 * junta `services` com `barber_services`, e serviço sem barbeiro não aparece.
 * Criar o serviço sem o vínculo seria entregar meia solução para o mesmo
 * problema de tela em branco.
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);
  const tenant = tenantDaSessao(session);

  // ⚠️ Só em barbearia sem serviço nenhum.
  //
  // Não é conveniência: é a regra que impede este endpoint de virar o §4.6 de
  // novo. Rodar duas vezes, ou rodar num catálogo já montado, empurraria oito
  // serviços que o dono não pediu para o meio dos dele — e ele descobriria pelo
  // site.
  const jaTem = await db.select({ id: services.id }).from(services)
    .where(eq(services.tenantId, tenant.id)).limit(1);

  if (jaTem.length > 0) {
    return json({
      error: 'Esta barbearia já tem serviços cadastrados. O catálogo sugerido só entra numa lista vazia.',
    }, 409);
  }

  const ativos = await db.select({ id: barbers.id }).from(barbers)
    .where(and(eq(barbers.tenantId, tenant.id), eq(barbers.active, true)));

  let criados = 0;

  for (const sugerido of CATALOGO_SUGERIDO) {
    const [servico] = await db.insert(services).values({
      tenantId:   tenant.id,
      name:       sugerido.nome,
      slug:       slugify(sugerido.nome),
      priceCents: 0,
      active:     false,
    }).returning({ id: services.id });

    if (ativos.length > 0) {
      await db.insert(barberServices).values(
        ativos.map((b) => ({
          tenantId:        tenant.id,
          barberId:        b.id,
          serviceId:       servico.id,
          durationMinutes: sugerido.minutos,
          active:          true,
        })),
      );
    }
    criados++;
  }

  return json({ ok: true, criados, barbeiros: ativos.length }, 201);
};
