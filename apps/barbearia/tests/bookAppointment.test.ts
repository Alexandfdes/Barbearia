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
const LATE_DATE = '2030-03-19';                              // dia com expediente NOTURNO
const LATE_WEEKDAY = new Date(Date.UTC(2030, 2, 19, 12)).getUTCDay();

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
  // LATE_WEEKDAY fecha às 22h — barbearia que atende à noite existe, e é nessa
  // faixa que a data lida em UTC já virou o dia seguinte.
  await sqlConn`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
                VALUES (${tid}, 1, ${LATE_WEEKDAY}, '18:00', '22:00')`;

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

  // ⚠️ ESTE TESTE FALHA COM A VERSÃO ANTERIOR DO CÓDIGO, e é por isso que existe.
  //
  // `bookAppointment` lia a data com `startsAt.toISOString()`, que é UTC. Às 21h
  // em Fortaleza o instante já é 00h do dia seguinte em UTC, então o código
  // buscava o expediente do DIA ERRADO e devolvia 400 num horário que o
  // `/api/slots` tinha acabado de oferecer. O cliente preenchia tudo e levava
  // "Horário fora do expediente" sem explicação.
  //
  // Em Manaus (UTC-4) isso começa às 20h; no Acre (UTC-5), às 19h.
  it('aceita a última hora do dia — a data vem do fuso da barbearia, não de UTC', async () => {
    const inicio = at('21:00', LATE_DATE);
    // Prova do que está em jogo: em UTC este instante já é o dia seguinte.
    expect(inicio.toISOString().slice(0, 10)).not.toBe(LATE_DATE);

    const r = await bookAppointment({ ...base, startsAt: inicio });
    expect(r.ok, r.ok ? '' : `recusou com ${r.httpStatus}: ${r.error}`).toBe(true);
  });

  it('continua recusando depois do fechamento do expediente noturno (400)', async () => {
    const r = await bookAppointment({ ...base, startsAt: at('22:30', LATE_DATE) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(400);
  });

  it('agenda do jeito que roda em produção: dentro de comTenant, com o papel restrito', async () => {
    // ⚠️ Até 25/09/2026 isto estourava "this.client.begin is not a function": a
    // conexão reservada por `comTenant` não sabia abrir transação, e o
    // agendamento é uma. Todos os casos acima chamam `bookAppointment` FORA da
    // requisição, no pool do dono — por isso a suíte ficava verde. Ver
    // `tests/transacao-na-requisicao.test.ts`.
    const { comTenant } = await import('../src/db/index');
    const [{ id: tid }] = await sqlConn`SELECT id FROM tenants WHERE slug = 'bayron'`;
    const tenant = { id: Number(tid), slug: 'bayron', status: 'active', domain: null };

    // 13:00 está livre: os casos acima ocupam 10h, 11h, 14h e 16h.
    const r = await comTenant(tenant, () => bookAppointment({ ...base, startsAt: at('13:00') }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const [linha] = await sqlConn`SELECT tenant_id FROM appointments WHERE id = ${r.id}`;
      expect(Number(linha.tenant_id)).toBe(Number(tid));
    }
  });

  it('todo agendamento nasce com tenant_id', async () => {
    const rows = await sqlConn`SELECT count(*)::int AS n FROM appointments WHERE tenant_id IS NULL`;
    expect(rows[0].n).toBe(0);
  });
});

/**
 * Outro caminho grava SEM passar pela fila do barbeiro — e segura a transação
 * aberta. A conferência do app não enxerga a linha (ainda não confirmada) e segue
 * até gravar; quem decide, então, é a trava do banco (migration 0015). Só solta a
 * outra transação depois de ver o app parado na trava, esperando por ela: assim o
 * caso prova a trava, e não a conferência.
 */
async function gravadoSemAFila<T>(inicio: Date, token: string, acao: () => Promise<T>): Promise<T> {
  const outro = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const olho = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  let liberar = () => {};
  try {
    const [{ id: tid }] = await sqlConn`SELECT id FROM tenants WHERE slug = 'bayron'`;
    const segura = new Promise<void>((r) => { liberar = r; });
    let gravou = () => {};
    const gravado = new Promise<void>((r) => { gravou = r; });
    const transacao = outro.begin(async (tx) => {
      await tx`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                         starts_at, ends_at, duration_minutes, price_cents, manage_token)
               VALUES (${tid}, 1, 1, 'Sem a fila', '84999991111', ${inicio.toISOString()},
                       ${new Date(inicio.getTime() + 30 * 60_000).toISOString()}, 30, 4500, ${token})`;
      gravou();
      await segura;
    });
    await gravado;

    let terminou = false;
    const resultado = acao().then((v) => ({ v }), (e: unknown) => ({ e })).finally(() => { terminou = true; });
    const limite = Date.now() + 10_000;
    for (;;) {
      const [{ n }] = await olho`SELECT count(*)::int AS n FROM pg_stat_activity
                                  WHERE datname = current_database()
                                    AND wait_event_type = 'Lock' AND wait_event = 'transactionid'`;
      if (n > 0 || terminou) break;
      if (Date.now() > limite) throw new Error('o app não chegou à gravação em 10 s');
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(terminou, 'o app respondeu antes de chegar à gravação: quem segurou foi a conferência, não a trava').toBe(false);
    liberar();
    await transacao;
    const r = await resultado;
    if ('e' in r) throw r.e;
    return r.v;
  } finally {
    liberar();
    await outro.end({ timeout: 5 });
    await olho.end({ timeout: 5 });
  }
}

describe.skipIf(!TEM_BANCO)('a trava do banco atrás da fila (migration 0015)', () => {
  it('agendar: quem gravou sem a fila ganha, e o app responde o mesmo 409 — não um 500', async () => {
    const r = await gravadoSemAFila(at('15:00'), 'tk-sem-fila-1', () => bookAppointment({ ...base, startsAt: at('15:15') }));
    expect(r).toEqual({ ok: false, httpStatus: 409, error: 'Horário não está mais disponível' });
    const [{ n }] = await sqlConn`SELECT count(*)::int AS n FROM appointments
                                   WHERE barber_id = 1 AND starts_at >= ${at('15:00').toISOString()}
                                     AND starts_at < ${at('16:00').toISOString()}`;
    expect(n).toBe(1);
  });

  it('remarcar: o mesmo — o conflito de sempre, não um 500', async () => {
    const { reagendarAtomicamente } = await import('../src/lib/reagendar');
    const marcado = await bookAppointment({ ...base, startsAt: at('09:00') });
    expect(marcado.ok).toBe(true);
    if (!marcado.ok) return;
    const [{ id: tid }] = await sqlConn`SELECT id FROM tenants WHERE slug = 'bayron'`;
    const r = await gravadoSemAFila(at('12:00'), 'tk-sem-fila-2', () => reagendarAtomicamente({
      tenantId: Number(tid), appointmentId: Number(marcado.id), barberId: 1, editorId: null,
      newStartIso: at('12:15').toISOString(), newEndIso: new Date(at('12:15').getTime() + 30 * 60_000).toISOString(),
    }));
    expect(r).toEqual({ ok: false, httpStatus: 409, motivo: 'conflito_agendamento' });
    const [linha] = await sqlConn`SELECT starts_at FROM appointments WHERE id = ${Number(marcado.id)}`;
    expect(linha.starts_at).toBe(at('09:00').toISOString());
  });
});
