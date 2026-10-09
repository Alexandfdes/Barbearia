// O desconto do combo vale nos dias que o dono marcou (`PENDENCIAS-ABERTAS.md`
// §2.16) — a parede do servidor, que o link editado à mão não contorna.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// `api/appointments/index.ts` resolvia o combo conferindo o id, o `active` e a
// barbearia — e não o `weekdays`, que é justamente o que diz em que dias o combo
// existe. O dono criava "Combo de segunda, 20% OFF"; quem tivesse o link marcava
// numa sexta e levava os 20%, sobre o serviço e o produto. O link circula no
// WhatsApp, o desconto de segunda vira permanente, e o relatório mostra como
// receita normal.
//
// ── QUAL DIA CONTA ───────────────────────────────────────────────────────────
//
// O do HORÁRIO marcado, na barbearia — não o dia em que o cliente agenda.
// "Combo de segunda" é desconto para encher a segunda: quem abre o link numa
// sexta pode marcar para segunda. Rejeitado: o dia do agendamento, que deixaria
// quem abre o link na segunda marcar com desconto para a sexta cheia.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { TZ } from '../src/lib/timezone';
import { diaDaSemana, somarDias } from '../src/lib/calendario';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const HOST = 'combo-teste.test';
const SEGUNDA_BIT = 1 << 1;
let sql: ReturnType<typeof postgres>;
let POST: typeof import('../src/pages/api/appointments/index.ts').POST;
let ip = 0;

// Os dias de teste: a próxima segunda que esteja ao menos dois dias à frente, e os
// vizinhos dela. Precisam cair nos próximos 30 dias — a rota recusa além disso.
const hoje = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
let segunda = somarDias(hoje, 2);
while (diaDaSemana(segunda) !== 1) segunda = somarDias(segunda, 1);
const domingo = somarDias(segunda, -1);
const terca = somarDias(segunda, 1);

/** Um horário NA BARBEARIA, como o `/api/slots` oferece. */
const as = (dia: string, hora: string) => fromZonedTime(`${dia}T${hora}:00`, TZ).toISOString();

async function agendar(startsAt: string, comboId?: number) {
  ip += 1;
  const endereco = `10.16.0.${ip}`;
  const request = new Request(`http://${HOST}/api/appointments`, {
    method: 'POST',
    headers: { host: HOST, 'content-type': 'application/json', 'x-forwarded-for': endereco },
    body: JSON.stringify({
      barberId: 1, serviceId: 1,
      customerName: 'Cliente do Combo', customerPhone: `849900000${String(ip).padStart(2, '0')}`,
      customerBirthdate: '1990-05-20', startsAt,
      ...(comboId ? { comboId } : {}),
    }),
  });
  const r = await POST({ request, clientAddress: endereco } as never);
  return { status: r.status, corpo: await r.json() as { error?: string; id?: number; priceCents?: number } };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'combo-teste', 'Combo Teste', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active)
            VALUES (1, 1, 'Dono', 'dono', 'admin', 'x', true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active)
            VALUES (1, 1, 'Corte', 'corte', 4000, true)`;
  await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active)
            VALUES (1, 1, 1, 30, true)`;
  // Expediente todos os dias até as 23h: é depois das 21h que o dia em UTC já
  // virou o seguinte, e é aí que a conta do dia errado apareceria.
  for (let d = 0; d < 7; d++) {
    await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
              VALUES (1, 1, ${d}, '08:00', '23:00')`;
  }
  await sql`INSERT INTO products (id, tenant_id, name, slug, price_cents, active)
            VALUES (1, 1, 'Pomada', 'pomada', 3000, true)`;
  await sql`INSERT INTO combos (id, tenant_id, name, service_id, product_id, discount_pct, weekdays, active) VALUES
              (1, 1, 'Combo de segunda', 1, 1, 20, ${SEGUNDA_BIT}, true),
              (2, 1, 'Combo sem dia',    1, 1, 20, 0,              true)`;
  await sql`SELECT setval('barbers_id_seq', 10)`;
  await sql`SELECT setval('services_id_seq', 10)`;
  await sql`SELECT setval('products_id_seq', 10)`;
  await sql`SELECT setval('combos_id_seq', 10)`;

  const tenant = await import('../src/lib/tenant.js');
  await tenant.carregarTenants(true);
  ({ POST } = await import('../src/pages/api/appointments/index.ts'));
}, 60_000);

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

describe.skipIf(!TEM_BANCO)('o combo vale no dia do horário, na barbearia', () => {
  it('controle: os dias de teste são o que dizem ser', () => {
    expect([diaDaSemana(domingo), diaDaSemana(segunda), diaDaSemana(terca)]).toEqual([0, 1, 2]);
  });

  it('combo de segunda, horário de terça: recusado, e nada gravado', async () => {
    const antes = (await sql`SELECT count(*)::int AS n FROM appointments`)[0].n;
    const r = await agendar(as(terca, '10:00'), 1);
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/combo/i);
    expect((await sql`SELECT count(*)::int AS n FROM appointments`)[0].n).toBe(antes);
  });

  it('combo de segunda, horário de segunda: aceito, com o desconto no serviço e no produto', async () => {
    const r = await agendar(as(segunda, '10:00'), 1);
    expect(r.status).toBe(201);
    const [a] = await sql`SELECT price_cents FROM appointments WHERE id = ${r.corpo.id!}`;
    expect(a.price_cents).toBe(3200);
    const [item] = await sql`SELECT price_cents FROM appointment_items WHERE appointment_id = ${r.corpo.id!}`;
    expect(item.price_cents).toBe(2400);
  });

  it('segunda 21h30 na barbearia, que já é terça em UTC: vale', async () => {
    // O dia é lido no fuso da barbearia. Lido em UTC, seria terça e recusaria.
    expect(formatInTimeZone(as(segunda, '21:30'), 'UTC', 'yyyy-MM-dd')).toBe(terca);
    expect((await agendar(as(segunda, '21:30'), 1)).status).toBe(201);
  });

  it('domingo 21h30 na barbearia, que já é segunda em UTC: não vale', async () => {
    expect(formatInTimeZone(as(domingo, '21:30'), 'UTC', 'yyyy-MM-dd')).toBe(segunda);
    expect((await agendar(as(domingo, '21:30'), 1)).status).toBe(400);
  });

  it('combo sem dia nenhum marcado não vale em dia nenhum', async () => {
    expect((await agendar(as(segunda, '11:00'), 2)).status).toBe(400);
  });

  it('sem combo, a terça agenda normalmente — a regra é do combo', async () => {
    const r = await agendar(as(terca, '11:00'));
    expect(r.status).toBe(201);
    expect(r.corpo.priceCents).toBe(4000);
  });
});
