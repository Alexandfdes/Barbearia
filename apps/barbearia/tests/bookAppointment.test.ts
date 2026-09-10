// Teste de INTEGRAÇÃO: usa um PostgreSQL real.
//
// Portado do SQLite em memória em 06/09/2026 (passo 3.5). O porte para Postgres
// não tinha portado os testes: eles usavam `sqlite`, que `db/index.ts` não
// exporta mais, e chamavam `bookAppointment` como função síncrona.
//
// Precisa de um Postgres de verdade — não dá para simular o advisory lock nem a
// transação. Sem `DATABASE_URL` a suíte é PULADA em vez de falhar, para que
// `npm test` continue rodando numa máquina sem banco.
//
//   createdb barbearia_test
//   DATABASE_URL='postgres://.../barbearia_test' npx vitest run
//
// ⚠️ Recria o schema do zero a cada rodada. Aponte para um banco de TESTE.
import { describe, it, expect, beforeAll } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TZ = 'America/Fortaleza';
const DATE = '2030-03-15';                                   // data futura fixa
const WEEKDAY = new Date(Date.UTC(2030, 2, 15, 12)).getUTCDay(); // dia da semana de 15/03/2030
const OTHER_DATE = '2030-03-16';                             // dia seguinte (sem expediente)
const SPLIT_DATE = '2030-03-18';                             // dia com DOIS turnos
const SPLIT_WEEKDAY = new Date(Date.UTC(2030, 2, 18, 12)).getUTCDay();

/**
 * Acha o SQL da migration. O `0000_init_postgres.sql` vive em
 * `migracao-postgres/` até o passo 2 ser aplicado, quando é copiado para
 * `drizzle/` — ver o §2 do `migracao-postgres/LEIA-ME.md`. Procurar nos dois
 * lugares evita o ENOENT críptico de quem roda o teste antes dessa cópia.
 */
const TEM_BANCO = Boolean(process.env.DATABASE_URL);

// ⚠️ Esta suíte roda DROP SCHEMA. A guarda recusa qualquer banco cujo nome não
// termine em _test — apontar DATABASE_URL para produção apagaria a barbearia.
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

type BookFn = typeof import('../src/lib/bookAppointment')['bookAppointment'];
let bookAppointment: BookFn;
let sqlConn: typeof import('../src/db/index')['sqlConn'];

const at = (time: string, date = DATE) => fromZonedTime(`${date}T${time}:00`, TZ);
const base = {
  barberId: 1, serviceId: 1,
  customerName: 'João', customerPhone: '84999990000',
  customerBirthdate: '1990-01-01', createdBy: 'customer' as const,
};

beforeAll(async () => {
  if (!TEM_BANCO) return;

  // Conexão própria para o schema: as migrations trazem BEGIN/COMMIT, e o
  // driver recusa transação explícita num pool com mais de uma conexão.
  const migrador = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(migrador);
  await migrador.end();

  ({ sqlConn } = await import('../src/db/index'));

  // Banco de teste nasce vazio e a 0001 não cria tenant sem dados para
  // backfillar (`PENDENCIAS-ABERTAS.md` §4.6) — então o teste cria o seu.
  await sqlConn`INSERT INTO tenants (slug, business_name)
                VALUES ('bayron','Barbearia Bayron') ON CONFLICT DO NOTHING`;
  const [{ id: tid }] = await sqlConn`SELECT id FROM tenants WHERE slug = 'bayron'`;

  await sqlConn`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active)
                VALUES (1, ${tid}, 'Teste', 'teste', 'barber', 'x', true)`;
  await sqlConn`INSERT INTO services (id, tenant_id, name, slug, price_cents, active)
                VALUES (1, ${tid}, 'Corte', 'corte', 4500, true)`;
  await sqlConn`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active)
                VALUES (${tid}, 1, 1, 30, true)`;
  // Expediente só no weekday da DATE: 09:00–18:00
  await sqlConn`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
                VALUES (${tid}, 1, ${WEEKDAY}, '09:00', '18:00')`;
  // SPLIT_WEEKDAY tem dois turnos
  await sqlConn`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
                VALUES (${tid}, 1, ${SPLIT_WEEKDAY}, '09:00', '12:00')`;
  await sqlConn`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
                VALUES (${tid}, 1, ${SPLIT_WEEKDAY}, '14:00', '18:00')`;

  // As sequências continuam em 1 depois dos inserts com id explícito.
  await sqlConn`SELECT setval('barbers_id_seq',  (SELECT MAX(id) FROM barbers))`;
  await sqlConn`SELECT setval('services_id_seq', (SELECT MAX(id) FROM services))`;

  ({ bookAppointment } = await import('../src/lib/bookAppointment'));
});

describe.skipIf(!TEM_BANCO)('bookAppointment (integração com Postgres)', () => {
  it('cria um agendamento válido dentro do expediente', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('10:00') });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manageToken).toBeTruthy();
      expect(r.priceCents).toBe(4500);
      expect(r.durationMinutes).toBe(30);
      expect(r.status).toBe('confirmed');
    }
  });

  it('rejeita conflito de horário (409)', async () => {
    const ok = await bookAppointment({ ...base, startsAt: at('14:00') });
    expect(ok.ok).toBe(true);
    const conflict = await bookAppointment({ ...base, startsAt: at('14:15') });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.httpStatus).toBe(409);
  });

  it('idempotência: mesma chave não cria duplicado', async () => {
    const params = { ...base, startsAt: at('11:00'), idempotencyKey: 'chave-unica-123' };
    const first  = await bookAppointment(params);
    const second = await bookAppointment(params);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.id).toBe(first.id);
      expect(second.manageToken).toBe(first.manageToken);
    }
  });

  it('conflito não deixa resto: nada gravado quando dá 409', async () => {
    const antes = await sqlConn`SELECT count(*)::int AS n FROM appointments`;
    const r = await bookAppointment({ ...base, startsAt: at('14:10') });
    expect(r.ok).toBe(false);
    const depois = await sqlConn`SELECT count(*)::int AS n FROM appointments`;
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('rejeita horário fora do expediente (400)', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('19:00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('rejeita dia em que o barbeiro não trabalha (400)', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('10:00', OTHER_DATE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('rejeita barbeiro/serviço inexistente (404)', async () => {
    const r = await bookAppointment({ ...base, serviceId: 999, startsAt: at('12:00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(404);
  });

  it('armazena o telefone normalizado (só dígitos), mesmo recebendo com máscara', async () => {
    const r = await bookAppointment({ ...base, customerPhone: '+55 (84) 91234-5678', startsAt: at('16:00') });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const rows = await sqlConn`SELECT customer_phone FROM appointments WHERE id = ${Number(r.id)}`;
      expect(rows[0].customer_phone).toBe('84912345678');
    }
  });

  it('rejeita telefone com menos de 10 dígitos (400)', async () => {
    const r = await bookAppointment({ ...base, customerPhone: '9123-4567', startsAt: at('17:00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('dia com dois turnos: aceita slot no segundo turno', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('15:00', SPLIT_DATE) });
    expect(r.ok).toBe(true);
  });

  it('dia com dois turnos: rejeita slot no intervalo entre turnos (400)', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('12:30', SPLIT_DATE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('todo agendamento nasce com tenant_id', async () => {
    const rows = await sqlConn`SELECT count(*)::int AS n FROM appointments WHERE tenant_id IS NULL`;
    expect(rows[0].n).toBe(0);
  });
});
