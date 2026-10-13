export const prerender = false;

/**
 * As vagas de um barbeiro num dia, para o PAINEL — o "Novo agendamento" da agenda do dia.
 *
 * ⚠️ Até 13/10/2026 a agenda do dia pedia as vagas à rota PÚBLICA (`/api/slots`), e os
 * serviços também (`/api/services`). As duas acham a barbearia pelo ENDEREÇO — e o painel
 * é central (`painel.<DOMINIO_BASE>`), não é endereço de barbearia nenhuma: a resposta era
 * 404, e o encaixe manual ficava sem serviço e sem horário, em toda barbearia. A comanda
 * (fechar o atendimento com serviço extra) também ficava sem a lista. Achado no navegador,
 * conferindo a agenda (`docs/PENDENCIAS-ABERTAS.md` §2.38).
 *
 * Aqui a barbearia vem da sessão (`tenantDaSessao`), como em toda rota do painel. As regras
 * do dia são as da rota pública: de hoje a 30 dias, no fuso da barbearia.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { barbers } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { getAvailableSlots } from '../../../lib/slots.js';
import { tenantDaSessao } from '../../../lib/tenant.js';
import { fusoDe } from '../../../lib/timezone.js';

const querySchema = z.object({
  barberId:             z.coerce.number().int().positive(),
  serviceId:            z.coerce.number().int().positive(),
  date:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD'),
  excludeAppointmentId: z.coerce.number().int().positive().optional(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  const fuso = fusoDe(tenant);

  const parsed = querySchema.safeParse({
    barberId:             url.searchParams.get('barberId'),
    serviceId:            url.searchParams.get('serviceId'),
    date:                 url.searchParams.get('date'),
    excludeAppointmentId: url.searchParams.get('excludeAppointmentId') ?? undefined,
  });
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const { barberId, serviceId, date, excludeAppointmentId } = parsed.data;

  // O barbeiro é desta barbearia? O RLS já esconderia a agenda de outra; a resposta
  // certa, ainda assim, é "não existe".
  const barbeiro = await first(db.select({ id: barbers.id }).from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.tenantId, tenant.id))));
  if (!barbeiro) return json({ error: 'Barbeiro não encontrado' }, 404);

  const agora = new Date();
  if (date < formatInTimeZone(agora, fuso, 'yyyy-MM-dd')) return json({ error: 'Data no passado' }, 400);
  if (date > formatInTimeZone(addDays(agora, 30), fuso, 'yyyy-MM-dd')) return json({ error: 'Data além do limite de 30 dias' }, 400);

  try {
    const vagas = await getAvailableSlots(barberId, serviceId, date, excludeAppointmentId, tenant);
    return json({
      date,
      timezone: fuso,
      slots: vagas.map((s) => ({ utc: s.toISOString(), time: formatInTimeZone(s, fuso, 'HH:mm') })),
    });
  } catch (erro) {
    console.error('[api/admin/slots]', erro);
    return json({ error: 'Erro interno ao calcular as vagas' }, 500);
  }
};
