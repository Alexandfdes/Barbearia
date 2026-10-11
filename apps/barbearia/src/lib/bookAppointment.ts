import { randomBytes } from 'node:crypto';
import { addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { and, eq, sql } from 'drizzle-orm';
import { db, first } from '../db/index.js';
import { barbers, barberServices, products, services, workingHours } from '../db/schema.js';
import { tenantAtual, type Tenant } from './tenant.js';
import { normalizePhone } from './phone.js';
import { applyDiscountPct } from './combo.js';
import { TZ } from './timezone.js';


function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getDay();
}

/**
 * Erro interno usado para abortar a transação com um resultado de negócio.
 *
 * O Drizzle só faz ROLLBACK quando o callback da transação lança. Como conflito
 * de horário é resposta 409 e não exceção, ele viaja como este objeto e é
 * traduzido de volta para `BookResult` logo fora da transação.
 */
class ConflitoDeHorario extends Error {
  constructor(readonly httpStatus: number, readonly motivo: string) {
    super(motivo);
  }
}

export interface BookParams {
  barberId:          number;
  serviceId:         number;
  customerName:      string;
  customerPhone:     string;
  /** 'YYYY-MM-DD' — opcional; quando barbeiro cria pelo admin pode não ter */
  customerBirthdate: string | null;
  startsAt:          Date;
  createdBy:         'customer' | 'barber';
  /** Idempotência: cliente passa chave única por tentativa pra evitar duplo booking. */
  idempotencyKey?:   string | null;
  /**
   * Combo do dia: quando presente, o produto vira item da comanda e o desconto
   * (discountPct, definido pelo barbeiro no combo) é aplicado no servidor sobre o
   * serviço E o produto. O endpoint resolve isso a partir do comboId — o cliente
   * nunca envia preço nem desconto.
   */
  combo?:            { productSlug: string; discountPct: number } | null;
  /**
   * De quem é este agendamento. Vem do resolvedor (`tenantAtual()`), NUNCA do
   * corpo da requisição — ver a skill `barbearia-multi-tenant`.
   */
  tenant?:           Tenant;
}

export type BookResult =
  | { ok: true;  id: number | bigint; manageToken: string; status: string;
      startsAt: string; endsAt: string; durationMinutes: number; priceCents: number;
      customerName: string; barberName: string; serviceName: string;
      /**
       * Gravado AGORA — `false` quando a mesma chave de idempotência devolve o que
       * já existia. É o que impede o aviso ao barbeiro de sair duas vezes pelo
       * duplo clique (`lib/avisoDeAgenda.ts`).
       */
      criado: boolean }
  | { ok: false; httpStatus: number; error: string };

export async function bookAppointment(params: BookParams): Promise<BookResult> {
  const { barberId, serviceId, customerName, customerBirthdate, startsAt, createdBy } = params;
  const idempotencyKey = params.idempotencyKey ?? null;
  const tenant = params.tenant ?? tenantAtual();

  // Telefone é armazenado SEMPRE normalizado (só dígitos, 10-11). Ponto único
  // de escrita — cobre booking público e manual do admin.
  const customerPhone = normalizePhone(params.customerPhone);
  if (!customerPhone) {
    return { ok: false, httpStatus: 400, error: 'Telefone inválido — informe DDD + número' };
  }

  // Curto-circuito: se já existe agendamento com essa chave, retorna ele em vez de criar.
  if (idempotencyKey) {
    const existing = await first(db.execute<{
      id: number; manage_token: string; status: string; starts_at: string; ends_at: string;
      duration_minutes: number; price_cents: number; customer_name: string;
      barber_name: string; service_name: string;
    }>(sql`
      SELECT a.id, a.manage_token, a.status, a.starts_at, a.ends_at,
             a.duration_minutes, a.price_cents, a.customer_name,
             b.name AS barber_name, s.name AS service_name
      FROM appointments a
      INNER JOIN barbers  b ON b.id = a.barber_id
      INNER JOIN services s ON s.id = a.service_id
      WHERE a.tenant_id = ${tenant.id}
        AND a.idempotency_key = ${idempotencyKey}
    `));
    if (existing) {
      return {
        ok: true,
        id: existing.id,
        manageToken: existing.manage_token,
        status: existing.status,
        startsAt: existing.starts_at,
        endsAt: existing.ends_at,
        durationMinutes: existing.duration_minutes,
        priceCents: existing.price_cents,
        customerName: existing.customer_name,
        barberName: existing.barber_name,
        serviceName: existing.service_name,
        criado: false,
      };
    }
  }

  const bsRows = await db
    .select({
      durationMinutes: barberServices.durationMinutes,
      priceCents:      services.priceCents,
      barberName:      barbers.name,
      serviceName:     services.name,
      serviceSlug:     services.slug,
    })
    .from(barberServices)
    .innerJoin(services, eq(services.id, barberServices.serviceId))
    .innerJoin(barbers,  eq(barbers.id,  barberServices.barberId))
    .where(and(
      eq(barberServices.barberId,  barberId),
      eq(barberServices.serviceId, serviceId),
      eq(barberServices.active,    true),
      eq(barbers.active,           true),
      eq(services.active,          true),
      eq(barberServices.tenantId,  tenant.id),
    ));

  if (bsRows.length === 0) {
    return { ok: false, httpStatus: 404, error: 'Barbeiro ou serviço não encontrado' };
  }

  const { durationMinutes, priceCents, barberName, serviceName } = bsRows[0];

  // Combo do dia: valida o produto e calcula preços com o desconto do combo
  // no servidor (cliente nunca envia valor). O produto vira item da comanda.
  const combo = params.combo ?? null;
  let finalPriceCents = priceCents;
  let comboItem: { name: string; priceCents: number } | null = null;
  let notes: string | null = null;
  if (combo) {
    const pct = combo.discountPct;
    // Produto vem do banco (tabela products) — precisa existir e estar ativo.
    const product = await first(db
      .select({ name: products.name, priceCents: products.priceCents })
      .from(products)
      .where(and(eq(products.slug, combo.productSlug), eq(products.active, true),
                 eq(products.tenantId, tenant.id))));
    if (!product) {
      return { ok: false, httpStatus: 400, error: 'Produto do combo inválido' };
    }
    finalPriceCents = applyDiscountPct(priceCents, pct);
    comboItem = { name: product.name, priceCents: applyDiscountPct(product.priceCents, pct) };
    notes = `🎁 Combo do dia — produto para retirar na barbearia: ${product.name}. ${pct}% OFF aplicado (serviço + produto).`;
  }

  const endsAt  = addMinutes(startsAt, durationMinutes);

  // ⚠️ A DATA VEM DO FUSO DA BARBEARIA, NUNCA DE UTC. ISTO JÁ FOI UM DEFEITO REAL.
  //
  // `startsAt` é um instante. `toISOString()` devolve a data em UTC, que a partir
  // das 21h em Fortaleza (20h em Manaus, 19h no Acre) JÁ É O DIA SEGUINTE.
  // Com a data errada, `dow` vira o dia da semana errado, o expediente buscado é
  // o do dia errado e a janela abaixo é montada no dia errado — o horário escolhido
  // fica sempre antes da abertura e o cliente recebe "Horário fora do expediente"
  // na última hora do dia, sem log e sem explicação.
  //
  // `/api/slots` oferece o horário porque faz a conversão certa; só a criação
  // errava. Os dois caminhos de reagendamento recebem `dateStr` pronto e por isso
  // nunca tiveram o problema.
  const dateStr = formatInTimeZone(startsAt, TZ, 'yyyy-MM-dd');
  const dow     = weekdayOf(dateStr);

  const whRows = await db
    .select()
    .from(workingHours)
    .where(and(eq(workingHours.barberId, barberId), eq(workingHours.weekday, dow),
               eq(workingHours.tenantId, tenant.id)));

  if (whRows.length === 0) {
    return { ok: false, httpStatus: 400, error: 'Barbeiro não trabalha nesse dia' };
  }

  // O slot precisa caber inteiro dentro de ALGUMA janela de expediente do dia.
  // (O schema permite mais de uma janela por dia — ex: turno manhã + tarde.)
  const fitsAnyWindow = whRows.some(wh => {
    const open  = fromZonedTime(`${dateStr}T${wh.startTime}:00`, TZ);
    const close = fromZonedTime(`${dateStr}T${wh.endTime}:00`,   TZ);
    return startsAt >= open && endsAt <= close;
  });

  if (!fitsAnyWindow) {
    return { ok: false, httpStatus: 400, error: 'Horário fora do expediente' };
  }

  const startsAtIso = startsAt.toISOString();
  const endsAtIso   = endsAt.toISOString();
  const manageToken = randomBytes(18).toString('base64url');

  try {
    const novoId = await db.transaction(async (tx) => {
      // Equivalente ao `BEGIN IMMEDIATE` do SQLite: serializa as reservas do
      // MESMO barbeiro, para que duas requisições simultâneas não passem as
      // duas pela checagem de conflito abaixo. O lock cai sozinho no fim da
      // transação. A garantia definitiva vem da exclusion constraint
      // (`ARQUITETURA-MULTI-TENANT-V1.md` §9, passo 7) — isto é o que segura
      // até lá, e continua barato depois.
      // `barbers.id` é serial global: dois tenants nunca compartilham o mesmo
      // id, então o lock por barbeiro continua correto sem entrar o tenant.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${barberId})`);

      const apptConflict = Number((await first(tx.execute<{ c: string }>(sql`
        SELECT COUNT(*) AS c FROM appointments
        WHERE tenant_id = ${tenant.id}
          AND barber_id = ${barberId} AND status IN ('confirmed','completed')
          AND starts_at < ${endsAtIso} AND ends_at > ${startsAtIso}
      `)))?.c ?? 0);
      if (apptConflict > 0) {
        throw new ConflitoDeHorario(409, 'Horário não está mais disponível');
      }

      const offConflict = Number((await first(tx.execute<{ c: string }>(sql`
        SELECT COUNT(*) AS c FROM time_off
        WHERE tenant_id = ${tenant.id}
          AND (barber_id = ${barberId} OR barber_id IS NULL)
          AND starts_at < ${endsAtIso} AND ends_at > ${startsAtIso}
      `)))?.c ?? 0);
      if (offConflict > 0) {
        throw new ConflitoDeHorario(409, 'Horário bloqueado');
      }

      const inserido = await first(tx.execute<{ id: number }>(sql`
        INSERT INTO appointments
          (tenant_id, barber_id, service_id, customer_name, customer_phone, customer_birthdate,
           starts_at, ends_at, duration_minutes, price_cents,
           manage_token, created_by, idempotency_key, notes)
        VALUES (${tenant.id}, ${barberId}, ${serviceId}, ${customerName}, ${customerPhone},
                ${customerBirthdate}, ${startsAtIso}, ${endsAtIso}, ${durationMinutes},
                ${finalPriceCents}, ${manageToken}, ${createdBy}, ${idempotencyKey}, ${notes})
        RETURNING id
      `));
      const id = inserido!.id;

      // Produto do combo entra como item da comanda na MESMA transação.
      if (comboItem) {
        await tx.execute(sql`
          INSERT INTO appointment_items (tenant_id, appointment_id, service_id, name, price_cents)
          VALUES (${tenant.id}, ${id}, NULL, ${comboItem.name}, ${comboItem.priceCents})
        `);
      }

      return id;
    });

    return {
      ok: true,
      id: novoId,
      manageToken,
      status: 'confirmed',
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      durationMinutes,
      priceCents: finalPriceCents,
      customerName,
      barberName,
      serviceName,
      criado: true,
    };
  } catch (err) {
    if (err instanceof ConflitoDeHorario) {
      return { ok: false, httpStatus: err.httpStatus, error: err.motivo };
    }
    throw err;
  }
}
