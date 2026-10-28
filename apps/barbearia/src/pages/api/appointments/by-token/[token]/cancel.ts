export const prerender = false;

import type { APIRoute } from 'astro';
import { eq, and, gt } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { appointments } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { tenantDoHost } from '../../../../../lib/tenant.js';
import { avisarMudancaNaAgenda } from '../../../../../lib/avisoDeAgenda.js';
import { RECUSA_DEPOIS_DO_INICIO } from '../../../../../lib/linkDoCliente.js';

export const POST: APIRoute = async ({ params, request }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  const { token } = params;
  if (!token) return json({ error: 'Token inválido' }, 400);

  try {
    // Desmarca e confere NUM comando só: o `UPDATE` só pega o agendamento ainda
    // confirmado, e o que ele devolve diz se foi ESTE pedido que desmarcou. Até
    // 11/10/2026 era um `SELECT` do status e depois o `UPDATE`: dois cliques ao
    // mesmo tempo podiam passar os dois pela conferência e responder os dois
    // "desmarcado" — com o aviso ao barbeiro (`lib/avisoDeAgenda.ts`), seriam
    // dois e-mails.
    const desmarcados = await db.update(appointments)
      .set({
        status:      'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer',
      })
      .where(and(
        eq(appointments.manageToken, token),
        eq(appointments.status, 'confirmed'),
        eq(appointments.tenantId, tenant.id),
        // Só antes de o horário começar (`lib/linkDoCliente.ts`). `starts_at` é o texto do
        // `toISOString()`, e o texto em ISO compara na ordem do tempo.
        gt(appointments.startsAt, new Date().toISOString()),
      ))
      .returning({ id: appointments.id });

    if (desmarcados.length === 0) {
      // Nada desmarcado: ou o token não existe nesta barbearia, ou o horário já
      // não está confirmado. As mesmas respostas de antes.
      const atual = await first(db
        .select({ status: appointments.status, inicio: appointments.startsAt })
        .from(appointments)
        .where(and(eq(appointments.manageToken, token), eq(appointments.tenantId, tenant.id))));
      if (!atual) return json({ error: 'Agendamento não encontrado' }, 404);
      if (atual.status === 'confirmed') return json({ error: RECUSA_DEPOIS_DO_INICIO }, 409);
      return json({ error: `Agendamento não pode ser cancelado (status: ${atual.status})` }, 409);
    }

    // O barbeiro e o dono ficam sabendo que o horário ficou livre (11/10/2026).
    await avisarMudancaNaAgenda({ tenant, tipo: 'desmarcado', agendamentoId: desmarcados[0].id });

    return json({ ok: true, message: 'Agendamento cancelado' });
  } catch (err) {
    console.error('[api/appointments/by-token/cancel POST]', err);
    return json({ error: 'Erro interno ao cancelar' }, 500);
  }
};
