import { db } from '../db/index.js';
import { barberServices, barbers, workingHours, appointments, timeOff } from '../db/schema.js';
import { eq, and, or, isNull, lt, gt, ne } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';
import { computeAvailableSlots } from './slotsCore.js';
import { fusoDe } from './timezone.js';
import { diaDaSemana } from './calendario.js';
import { tenantAtual, type Tenant } from './tenant.js';


/** Combina "YYYY-MM-DD" + "HH:MM" no fuso DA BARBEARIA e devolve Date UTC */
function localToUtc(dateStr: string, timeStr: string, fuso: string): Date {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, fuso);
}

/**
 * Retorna os horários disponíveis para um barbeiro/serviço/data.
 * Faz a leitura do banco e delega o cálculo para computeAvailableSlots (puro).
 * @param barberId             ID do barbeiro
 * @param serviceId            ID do serviço
 * @param dateStr              Data "YYYY-MM-DD", no calendário da barbearia
 * @param excludeAppointmentId Ignora esse appointment no cálculo (reagendamento)
 * @param tenant               De quem é a agenda. Vem do resolvedor, nunca da query.
 *
 * ⚠️ AS CINCO CONSULTAS DESTE ARQUIVO FILTRAM POR TENANT, e isso não é redundante
 * com o RLS. `barberId` e `serviceId` chegam pela query string de uma rota
 * pública: sem filtro na aplicação, a única parede entre `?barberId=<id de outra
 * barbearia>` e a agenda dela é o RLS. A regra da casa é duas paredes — consulta
 * sem filtro tem que estar errada nos dois níveis (skill `barbearia-multi-tenant`).
 */
export async function getAvailableSlots(
  barberId: number,
  serviceId: number,
  dateStr: string,
  excludeAppointmentId?: number,
  tenant: Tenant = tenantAtual()
): Promise<Date[]> {
  const bsRows = await db
    .select({ durationMinutes: barberServices.durationMinutes })
    .from(barberServices)
    .where(
      and(
        eq(barberServices.barberId, barberId),
        eq(barberServices.serviceId, serviceId),
        eq(barberServices.active, true),
        eq(barberServices.tenantId, tenant.id)
      )
    );

  if (bsRows.length === 0) return [];

  // Barbeiro desligado não tem vaga — nem para remarcar com ele pelo link. Até 17/10/2026
  // só o serviço do barbeiro era conferido, e o cliente remarcava com quem não trabalha
  // mais lá (`tests/agenda-revisao.test.ts`).
  const ativo = await db.select({ id: barbers.id }).from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.tenantId, tenant.id), eq(barbers.active, true)));
  if (ativo.length === 0) return [];

  // Remarcar: a duração é a do AGENDAMENTO, que é a que vai ser gravada. Com a do serviço,
  // que o dono pode ter mudado depois, a tela oferecia vaga que o gravar recusava — e
  // escondia vaga que serviria.
  let duration = bsRows[0].durationMinutes;
  if (excludeAppointmentId) {
    const [proprio] = await db.select({ minutos: appointments.durationMinutes }).from(appointments)
      .where(and(eq(appointments.id, excludeAppointmentId), eq(appointments.tenantId, tenant.id)));
    if (proprio) duration = proprio.minutos;
  }

  const dow = diaDaSemana(dateStr);
  const whRows = await db
    .select()
    .from(workingHours)
    .where(
      and(
        eq(workingHours.barberId, barberId),
        eq(workingHours.weekday, dow),
        eq(workingHours.tenantId, tenant.id)
      )
    );

  if (whRows.length === 0) return [];

  // O schema permite mais de uma janela de expediente por dia (ex: manhã + tarde).
  // Calcula slots por janela e junta tudo ordenado.
  const allSlots: Date[] = [];
  for (const wh of whRows) {
    allSlots.push(...(await slotsForWindow(tenant, barberId, dateStr, wh.startTime, wh.endTime, duration, excludeAppointmentId)));
  }
  return [...new Map(allSlots.map(s => [s.getTime(), s])).values()]
    .sort((a, b) => a.getTime() - b.getTime());
}

async function slotsForWindow(
  tenant: Tenant,
  barberId: number,
  dateStr: string,
  startTime: string,
  endTime: string,
  duration: number,
  excludeAppointmentId?: number
): Promise<Date[]> {
  const open  = localToUtc(dateStr, startTime, fusoDe(tenant));
  const close = localToUtc(dateStr, endTime, fusoDe(tenant));
  const openIso  = open.toISOString();
  const closeIso = close.toISOString();

  const apptWhere = excludeAppointmentId
    ? and(
        eq(appointments.tenantId, tenant.id),
        eq(appointments.barberId, barberId),
        // Sobreposição, não "começa dentro": o agendamento que começou antes da janela e
        // atravessa a abertura também ocupa (o dono mudou o expediente depois dele).
        lt(appointments.startsAt, closeIso),
        gt(appointments.endsAt, openIso),
        or(
          eq(appointments.status, 'confirmed'),
          eq(appointments.status, 'completed')
        ),
        ne(appointments.id, excludeAppointmentId)
      )
    : and(
        eq(appointments.tenantId, tenant.id),
        eq(appointments.barberId, barberId),
        // Sobreposição, não "começa dentro": o agendamento que começou antes da janela e
        // atravessa a abertura também ocupa (o dono mudou o expediente depois dele).
        lt(appointments.startsAt, closeIso),
        gt(appointments.endsAt, openIso),
        or(
          eq(appointments.status, 'confirmed'),
          eq(appointments.status, 'completed')
        )
      );

  const apptRows = await db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(apptWhere);
  const appts = apptRows.map(r => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }));

  const offRows = await db
    .select({ startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
    .from(timeOff)
    .where(
      and(
        eq(timeOff.tenantId, tenant.id),
        or(eq(timeOff.barberId, barberId), isNull(timeOff.barberId)),
        lt(timeOff.startsAt, closeIso),
        gt(timeOff.endsAt, openIso)
      )
    );
  const offs = offRows.map(r => ({ startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) }));

  return computeAvailableSlots({ open, close, durationMinutes: duration, appts, offs });
}
