export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { barbers, workingHours } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

// Validação de cada entrada de horário
const daySchema = z.object({
  weekday:   z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
}).refine(d => d.startTime < d.endTime, {
  message: 'Horário de início deve ser antes do fim',
});

const putSchema = z.object({
  barberId: z.number().int().positive(),
  // Até 2 turnos por dia (manhã + tarde) × 7 dias = 14 janelas.
  hours:    z.array(daySchema).max(14),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const barberIdParam = url.searchParams.get('barberId');
  if (!barberIdParam) return json({ error: 'barberId obrigatório' }, 400);

  const barberId = parseInt(barberIdParam, 10);
  if (isNaN(barberId)) return json({ error: 'barberId inválido' }, 400);

  // Barbeiro só pode ver os próprios horários
  if (session.role !== 'admin' && session.barberId !== barberId) {
    return json({ error: 'Acesso negado' }, 403);
  }

  const rows = await db.select({
    id:        workingHours.id,
    weekday:   workingHours.weekday,
    startTime: workingHours.startTime,
    endTime:   workingHours.endTime,
  })
    .from(workingHours)
    .where(and(eq(workingHours.barberId, barberId), eq(workingHours.tenantId, tenant.id)))
    .orderBy(workingHours.weekday);

  return json({ barberId, hours: rows });
};

export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const { barberId, hours } = parsed.data;

  // Barbeiro só pode editar os próprios horários
  if (session.role !== 'admin' && session.barberId !== barberId) {
    return json({ error: 'Acesso negado' }, 403);
  }

  // Verifica se o barbeiro existe
  const barberExists = await db.select({ id: barbers.id })
    .from(barbers).where(and(eq(barbers.id, barberId), eq(barbers.tenantId, tenant.id)));
  if (barberExists.length === 0) {
    return json({ error: 'Barbeiro não encontrado' }, 404);
  }

  // Permite múltiplas janelas por dia (ex.: manhã + tarde), desde que não se
  // sobreponham dentro do mesmo dia. slots.ts e bookAppointment já tratam N janelas.
  const byDay = new Map<number, { startTime: string; endTime: string }[]>();
  for (const h of hours) {
    const arr = byDay.get(h.weekday) ?? [];
    arr.push(h);
    byDay.set(h.weekday, arr);
  }
  const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  for (const [wd, wins] of byDay) {
    const sorted = [...wins].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        return json({ error: `${WD[wd]}: os turnos não podem se sobrepor` }, 400);
      }
    }
  }

  // Replace atômico: deleta os antigos e insere os novos.
  //
  // Tudo pelo `tx`, nunca pelo `db`: o `db` pega OUTRA conexão do pool, então
  // um delete no `tx` e um insert no `db` rodariam em transações diferentes —
  // o barbeiro poderia ficar sem nenhum horário se o insert falhasse.
  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(and(eq(workingHours.barberId, barberId), eq(workingHours.tenantId, tenant.id)));

    // Insere os novos (se houver — dias desabilitados simplesmente não são enviados)
    if (hours.length > 0) {
      await tx.insert(workingHours).values(hours.map(h => ({
        tenantId:  tenant.id,
        barberId,
        weekday:   h.weekday,
        startTime: h.startTime,
        endTime:   h.endTime,
      })));
    }
  });

  return json({ ok: true, barberId, saved: hours.length });
};
