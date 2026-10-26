export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq, lt } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { appointments, appointmentItems, services } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';
import { limiteParaConcluir, RECUSA_CONCLUIR_ANTES } from '../../../../../lib/fecharAtendimento.js';
import { fusoDe } from '../../../../../lib/timezone.js';

// Extras da "comanda": serviços adicionais feitos no balcão (ex.: barba além do corte).
// priceCents vem do fechamento (permite ajuste/desconto); o nome é snapshot do serviço.
const completeSchema = z.object({
  extras: z.array(z.object({
    serviceId:  z.number().int().positive(),
    priceCents: z.number().int().nonnegative().max(1_000_000),
  })).max(20).optional(),
});

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  // Body é opcional (concluir sem extras mantém o comportamento antigo).
  let extras: { serviceId: number; priceCents: number }[] = [];
  const raw = await request.text();
  if (raw.trim()) {
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { return json({ error: 'JSON inválido' }, 400); }
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
    extras = parsed.data.extras ?? [];
  }

  const appt = await first(db
    .select({ id: appointments.id, status: appointments.status, barberId: appointments.barberId, startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id))));

  if (!appt) return json({ error: 'Não encontrado' }, 404);
  if (session.role !== 'admin' && appt.barberId !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (appt.status !== 'confirmed') {
    return json({ error: `Não pode concluir (status: ${appt.status})` }, 409);
  }
  const fuso = fusoDe(tenant);
  const agora = new Date();
  const limite = limiteParaConcluir(fuso, agora);
  if (appt.startsAt >= limite) return json({ error: RECUSA_CONCLUIR_ANTES }, 409);

  // Resolve nome (snapshot) e valida cada serviço extra antes de gravar.
  const items: { serviceId: number; name: string; priceCents: number }[] = [];
  for (const ex of extras) {
    const svc = await first(db.select({ id: services.id, name: services.name })
      .from(services).where(and(eq(services.id, ex.serviceId), eq(services.tenantId, tenant.id))));
    if (!svc) return json({ error: `Serviço ${ex.serviceId} não encontrado` }, 400);
    items.push({ serviceId: svc.id, name: svc.name, priceCents: ex.priceCents });
  }

  // ⚠️ O `await` NÃO É DECORAÇÃO. Sem ele a rota responde ok:true antes de a
  // transação terminar: se ela falhar, o erro vira rejeição não tratada e a tela
  // do barbeiro já disse "pronto" sobre algo que não foi gravado.
  //
  // ⚠️ A condição de status vai NO UPDATE, e a transação para se ele não pegar a
  // linha (26/10/2026). Antes, a rota conferia `confirmed` na leitura acima e o
  // UPDATE não repetia: dois "concluir" ao mesmo tempo (o dono no balcão e o
  // barbeiro no celular) passavam os dois, e os extras entravam em dobro na receita.
  const fechou = await db.transaction(async (tx) => {
    const feitos = await tx.update(appointments)
      .set({
        status:           'completed',
        lastModifiedById: session.barberId,
        lastModifiedAt:   new Date().toISOString(),
      })
      .where(and(eq(appointments.id, id), eq(appointments.tenantId, tenant.id),
        eq(appointments.status, 'confirmed'), lt(appointments.startsAt, limite)))
      .returning({ id: appointments.id });
    if (feitos.length === 0) return false;

    // ⚠️ O horário NÃO muda (decisão do dono, 26/10/2026): concluído mais cedo, o
    // agendamento continua no horário marcado, e a vaga continua ocupada.

    for (const it of items) {
      await tx.insert(appointmentItems)
        .values({ tenantId: tenant.id, appointmentId: id, serviceId: it.serviceId,
                  name: it.name, priceCents: it.priceCents });
    }
    return true;
  });
  if (!fechou) return json({ error: 'Este horário já foi fechado, ou mudou enquanto você fechava. Atualize a agenda.' }, 409);

  return json({ ok: true });
};
