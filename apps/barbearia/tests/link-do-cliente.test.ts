// O que o cliente final faz pelo próprio link e pela área "Meus agendamentos" (18/10/2026).
//
//  1. Depois que o horário começa, o link só mostra: desmarcar ou remarcar é com a
//     barbearia. Até aqui o atendido ontem desmarcava hoje — o corte saía da receita e o
//     "Concluir" passava a dar erro —, e quem faltou remarcava sem contar a falta.
//  2. A sessão da área do cliente vale só na barbearia em que ele entrou. Até aqui o cookie
//     não dizia de qual era, e copiado para o site de outra mostrava os agendamentos da
//     mesma pessoa lá (`docs/PENDENCIAS-ABERTAS.md` §2.55).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { sealData } from 'iron-session';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { horarioJaComecou, RECUSA_DEPOIS_DO_INICIO } from '../src/lib/linkDoCliente';
import { CUSTOMER_SESSION_COOKIE, getCustomerSession, makeCustomerSessionCookie } from '../src/lib/customerSession';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const HOST = 'ze.fadeline.com.br';
const HORA = 60 * 60 * 1000;
let sql: ReturnType<typeof postgres>;
let desmarcar: typeof import('../src/pages/api/appointments/by-token/[token]/cancel.ts').POST;
let remarcar: typeof import('../src/pages/api/appointments/by-token/[token]/reschedule.ts').POST;

const pedido = (corpo?: unknown) => new Request(`https://${HOST}/x`, {
  method: 'POST', headers: { host: HOST, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
});

describe('a regra', () => {
  it('começou é a partir do minuto do horário', () => {
    const agora = new Date('2030-03-15T13:00:00.000Z');
    expect(horarioJaComecou('2030-03-15T13:00:00.000Z', agora)).toBe(true);
    expect(horarioJaComecou('2030-03-15T12:59:00.000Z', agora)).toBe(true);
    expect(horarioJaComecou('2030-03-15T13:01:00.000Z', agora)).toBe(false);
    expect(horarioJaComecou('não é data', agora)).toBe(false);
  });

  it('a tela do link usa a mesma regra e diz para falar com a barbearia', () => {
    const tela = readFileSync('src/pages/a/[token].astro', 'utf8');
    expect(tela).toMatch(/const jaComecou\s+= horarioJaComecou\(appt\.startsAt\);/);
    expect(tela).toMatch(/\{jaComecou \? \(/);
    expect(tela).toContain('Este horário já começou.');
  });
});

describe.skipIf(!TEM_BANCO)('o link depois do horário', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'ze', 'Cortes do Zé', 'active')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES (1, 1, 'Zé', 'ze', 'admin', 'x', true)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
    const marcar = (inicio: Date, token: string) => sql`
      INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                starts_at, ends_at, duration_minutes, price_cents, manage_token)
      VALUES (1, 1, 1, 'Cliente', '84900000000', ${inicio.toISOString()}, ${new Date(inicio.getTime() + HORA / 2).toISOString()}, 30, 4000, ${token})`;
    await marcar(new Date(Date.now() - 20 * HORA), 'token-de-ontem');
    await marcar(new Date(Date.now() - 5 * 60 * 1000), 'token-comecou');
    await marcar(new Date(Date.now() + 48 * HORA), 'token-depois');
    const { carregarTenants } = await import('../src/lib/tenant.js');
    await carregarTenants(true);
    ({ POST: desmarcar } = await import('../src/pages/api/appointments/by-token/[token]/cancel.ts'));
    ({ POST: remarcar } = await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts'));
  }, 30_000);

  afterAll(async () => {
    await sql.end();
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  it('o de ontem, não concluído: o link não desmarca — e ele continua confirmado', async () => {
    const r = await desmarcar({ params: { token: 'token-de-ontem' }, request: pedido() } as never);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toBe(RECUSA_DEPOIS_DO_INICIO);
    const [a] = await sql`SELECT status FROM appointments WHERE manage_token = 'token-de-ontem'`;
    expect(a.status).toBe('confirmed');
  });

  it('o que começou há 5 minutos: nem desmarca, nem remarca', async () => {
    expect((await desmarcar({ params: { token: 'token-comecou' }, request: pedido() } as never)).status).toBe(409);
    const r = await remarcar({ params: { token: 'token-comecou' }, request: pedido({ startsAt: new Date(Date.now() + 72 * HORA).toISOString() }) } as never);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toBe(RECUSA_DEPOIS_DO_INICIO);
  });

  it('o de depois de amanhã: desmarca normalmente', async () => {
    expect((await desmarcar({ params: { token: 'token-depois' }, request: pedido() } as never)).status).toBe(200);
  });
});

describe('a sessão do cliente vale só na barbearia dela', () => {
  const comCookie = (valor: string) => new Request(`https://${HOST}/cliente`, { headers: { cookie: `${CUSTOMER_SESSION_COOKIE}=${valor}` } });

  it('o cookie da barbearia 1 não abre a 2', async () => {
    const cookie = (await makeCustomerSessionCookie({ phone: '84999990000', birthdate: '1990-01-01', tenantId: 1 })).split(';')[0].split('=').slice(1).join('=');
    expect(await getCustomerSession(comCookie(cookie), 1)).toMatchObject({ phone: '84999990000', tenantId: 1 });
    expect(await getCustomerSession(comCookie(cookie), 2)).toBeNull();
  });

  it('o cookie de antes, sem a barbearia, não vale mais — o cliente entra de novo', async () => {
    const antigo = await sealData({ phone: '84999990000', birthdate: '1990-01-01' }, { password: process.env.SESSION_SECRET!, ttl: 3600 });
    expect(await getCustomerSession(comCookie(antigo), 1)).toBeNull();
  });

  it('a entrada grava a barbearia no cookie', () => {
    const rota = readFileSync('src/pages/api/customer/login.ts', 'utf8');
    expect(rota).toMatch(/makeCustomerSessionCookie\(\{ phone: compareKey, birthdate, tenantId: tenant\.id \}\)/);
  });
});
