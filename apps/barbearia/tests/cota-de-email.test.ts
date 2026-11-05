// Os dois caminhos que gastavam o dia de e-mail de todas as barbearias (05/11/2026,
// `docs/PENDENCIAS-ABERTAS.md` §2.66), pela rota de verdade:
//
//  - remarcar pelo link do cliente, que qualquer pessoa ganha agendando uma vez no site, não tinha
//    limite nenhum, e cada remarcação manda e-mail ao barbeiro e ao dono — 20 remarcações, 40
//    e-mails, em menos de um segundo;
//  - criar barbeiro com e-mail manda uma confirmação por barbeiro, e criar barbeiro não tem limite.
//
// O orçamento em si está em `tests/orcamento-de-email.test.ts`.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';
process.env.PAINEL_URL ??= 'http://painel.test';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FUSO = 'America/Fortaleza';
const HOST = 'ze.fadeline.com.br';
const DIA_MS = 24 * 60 * 60 * 1000;
/** Um dia a `n` dias de hoje, no calendário da barbearia — longe o bastante para nada ter começado. */
const dia = (n: number) => formatInTimeZone(new Date(Date.now() + n * DIA_MS), FUSO, 'yyyy-MM-dd');
const iso = (d: string, hora: string) => fromZonedTime(`${d}T${hora}:00`, FUSO).toISOString();
const meiaHora = (k: number) => `${String(8 + Math.floor(k / 2)).padStart(2, '0')}:${k % 2 ? '30' : '00'}`;

let sql: ReturnType<typeof postgres>;
let rota: typeof import('../src/pages/api/appointments/by-token/[token]/reschedule.ts');
let email: typeof import('../src/lib/email.ts');

async function remarcar(token: string, startsAt: string, ip: string) {
  const r = await rota.POST({
    params: { token },
    request: new Request(`https://${HOST}/x`, {
      method: 'POST',
      headers: { host: HOST, 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ startsAt }),
    }),
  } as never);
  return { status: r.status, corpo: (await r.json()) as { error?: string } };
}

async function marcar(token: string, d: string, hora: string) {
  const inicio = iso(d, hora);
  const fim = new Date(new Date(inicio).getTime() + 30 * 60 * 1000).toISOString();
  await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
              starts_at, ends_at, duration_minutes, price_cents, manage_token)
            VALUES (1, 2, 1, 'Cliente', '84900000000', ${inicio}, ${fim}, 30, 4000, ${token})`;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status, timezone) VALUES
              (1, 'ze', 'Cortes do Zé', 'active', ${FUSO}),
              (2, 'vintage', 'Barbearia Vintage', 'active', ${FUSO})`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email, email_confirmado_em) VALUES
              (1, 1, 'Ana',   'ana',   'admin',  'x', true, '84999990001', 'ana@ze.test',   now()),
              (2, 1, 'Pedro', 'pedro', 'barber', 'x', true, '84999990002', 'pedro@ze.test', now()),
              (3, 2, 'Dona',  'dona',  'admin',  'x', true, '84999990003', NULL, NULL)`;
  await sql`SELECT setval('barbers_id_seq', 10)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
  await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES (1, 2, 1, 30, true)`;
  for (let d = 0; d < 7; d++) {
    await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES (1, 2, ${d}, '08:00', '18:00')`;
  }
  const tenantMod = await import('../src/lib/tenant.ts');
  await tenantMod.carregarTenants(true);
  rota = await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts');
  email = await import('../src/lib/email.ts');
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end();
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

beforeEach(() => {
  if (!TEM_BANCO) return;
  email.zerarOrcamentoDeEmail();
  email.caixaDeSaida.length = 0;
});

describe.skipIf(!TEM_BANCO)('remarcar pelo link', () => {
  it('20 remarcações seguidas: 3 passam, 6 e-mails saem, e o resto ouve o porquê', async () => {
    const D = dia(4);
    await marcar('tk-rajada', D, '09:00');
    const status: number[] = [];
    let recusa = '';
    for (let i = 0; i < 20; i++) {
      const r = await remarcar('tk-rajada', iso(D, i % 2 === 0 ? '10:00' : '09:00'), '10.0.0.1');
      status.push(r.status);
      if (r.status === 429) recusa = r.corpo.error ?? '';
    }
    expect(status.slice(0, 3)).toEqual([200, 200, 200]);
    expect(status.slice(3).every((s) => s === 429)).toBe(true);
    expect(recusa).toBe(rota.RECUSA_DO_LIMITE_DO_HORARIO);
    await new Promise((r) => setTimeout(r, 200));
    expect(email.caixaDeSaida).toHaveLength(6);
    expect(new Set(email.caixaDeSaida.map((e) => `${e.tipo}:${e.barbearia}`))).toEqual(new Set(['agenda:1']));
  });

  it('a recusada não gasta a vez: o cliente que tenta horário ocupado continua podendo remarcar', async () => {
    const D = dia(5);
    await marcar('tk-ocupado', D, '11:00');
    await marcar('tk-tentativa', D, '09:00');
    for (let i = 0; i < 5; i++) expect((await remarcar('tk-tentativa', iso(D, '11:00'), '10.0.0.2')).status).toBe(409);
    for (const h of ['12:00', '13:00', '14:00']) expect((await remarcar('tk-tentativa', iso(D, h), '10.0.0.2')).status).toBe(200);
    expect((await remarcar('tk-tentativa', iso(D, '15:00'), '10.0.0.2')).status).toBe(429);
  });

  it('remarcar para o mesmo horário não muda nada, não avisa e não gasta a vez', async () => {
    const D = dia(6);
    await marcar('tk-mesmo', D, '14:00');
    for (let i = 0; i < 4; i++) expect((await remarcar('tk-mesmo', iso(D, '14:00'), '10.0.0.3')).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(email.caixaDeSaida).toHaveLength(0);
    for (const h of ['15:00', '16:00', '17:00']) expect((await remarcar('tk-mesmo', iso(D, h), '10.0.0.3')).status).toBe(200);
    expect((await remarcar('tk-mesmo', iso(D, '14:00'), '10.0.0.3')).status).toBe(429);
  });

  it('do mesmo aparelho, 10 por hora, somando todos os links; outro aparelho continua', async () => {
    const D = dia(7);
    const D2 = dia(14);
    for (let k = 0; k < 11; k++) await marcar(`tk-aparelho-${k}`, D, meiaHora(k));
    for (let k = 0; k < 10; k++) {
      expect((await remarcar(`tk-aparelho-${k}`, iso(D2, meiaHora(k)), '10.0.0.4')).status).toBe(200);
    }
    const r = await remarcar('tk-aparelho-10', iso(D2, meiaHora(10)), '10.0.0.4');
    expect(r.status).toBe(429);
    expect(r.corpo.error).toMatch(/Muitas remarcações deste aparelho/);
    // A recusa do aparelho não gastou a vez do horário: de outro aparelho, as três continuam lá.
    for (const k of [10, 11, 12]) {
      expect((await remarcar('tk-aparelho-10', iso(D2, meiaHora(k)), '10.0.0.5')).status).toBe(200);
    }
    expect((await remarcar('tk-aparelho-10', iso(D2, meiaHora(13)), '10.0.0.5')).status).toBe(429);
  });

  it('pedidos ao mesmo tempo: não passam mais que 3', async () => {
    const D = dia(8);
    await marcar('tk-junto', D, '08:00');
    const rs = await Promise.all(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']
      .map((h) => remarcar('tk-junto', iso(D, h), '10.0.0.6')));
    expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(3);
    expect(rs.filter((r) => r.status === 429).length).toBeGreaterThanOrEqual(3);
  });
});

describe.skipIf(!TEM_BANCO)('criar barbeiro com e-mail', () => {
  it('a barbearia que cria barbeiros em série não passa da parte dela — o resto não sai, e o link some', async () => {
    const LIMITE_ANTES = process.env.EMAIL_LIMITE_DIARIO;
    process.env.EMAIL_LIMITE_DIARIO = '20'; // 2 de senha e confirmação por barbearia
    try {
      const { makeSessionCookie } = await import('../src/lib/session.js');
      const cookie = (await makeSessionCookie({ barberId: 3, role: 'admin', tenantId: 2 })).split(';')[0];
      const { POST: criar } = await import('../src/pages/api/admin/barbers/index.ts');
      const { comTenant } = await import('../src/db/index.js');
      const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null, fuso: FUSO };
      const ids: number[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await comTenant(VINTAGE, async () => criar({ request: new Request('http://painel.test/api/admin/barbers', {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Fulano ${i}`, phone: `8497000000${i}`, role: 'barber', password: 'senha-de-teste-1', email: 'vitima@exemplo.com' }),
        }) } as never));
        expect(r.status).toBe(201);
        ids.push(((await r.json()) as { id: number }).id);
      }
      await new Promise((r) => setTimeout(r, 300));
      const paraAVitima = email.caixaDeSaida.filter((e) => e.para === 'vitima@exemplo.com');
      expect(paraAVitima).toHaveLength(2);
      expect(paraAVitima.every((e) => e.tipo === 'seguranca' && e.barbearia === 2)).toBe(true);
      // O que não saiu não deixa link no banco: a tela não diz "mandamos".
      const { comLinkValido } = await import('../src/lib/confirmacaoDeEmail.js');
      expect((await comLinkValido(2, ids)).size).toBe(2);
    } finally {
      if (LIMITE_ANTES === undefined) delete process.env.EMAIL_LIMITE_DIARIO;
      else process.env.EMAIL_LIMITE_DIARIO = LIMITE_ANTES;
    }
  }, 60_000);
});
