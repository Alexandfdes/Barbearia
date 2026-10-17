// A agenda do dia aberta vê o que o cliente faz pelo link (17/10/2026).
//
// A tela pergunta a cada minuto se o dia mudou (`api/admin/appointments/count.ts`) e só
// recarrega se a resposta mudar. Até aqui a resposta era a contagem e o maior
// `last_modified_at` — e o cliente que desmarca ou remarca pelo link não grava esse campo:
// a agenda aberta continuava com o horário como confirmado. Sem e-mail em produção, era a
// única forma de o dono ficar sabendo. E no dia sem nenhum agendamento, o primeiro que
// chegava nunca recarregava a tela.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
let contar: typeof import('../src/pages/api/admin/appointments/count.ts').GET;
let desmarcar: typeof import('../src/pages/api/appointments/by-token/[token]/cancel.ts').POST;
let cookieDono = '';
const DIA = '2030-03-15';

async function assinatura(): Promise<{ count: number; maxModified: string }> {
  const u = `http://painel.test/api/admin/appointments/count?date=${DIA}`;
  const r = await contar({ request: new Request(u, { headers: { cookie: cookieDono } }), url: new URL(u) } as never);
  expect(r.status).toBe(200);
  return (await r.json()) as { count: number; maxModified: string };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'bayron', 'Barbearia Bayron', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES (1, 1, 'Dono', 'dono', 'admin', 'x', true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
  await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                      starts_at, ends_at, duration_minutes, price_cents, manage_token) VALUES
    (1, 1, 1, 'Das Nove',  '84900000001', '2030-03-15T12:00:00.000Z', '2030-03-15T12:30:00.000Z', 30, 4000, 'token-das-nove'),
    (1, 1, 1, 'Das Onze',  '84900000002', '2030-03-15T14:00:00.000Z', '2030-03-15T14:30:00.000Z', 30, 4000, 'token-das-onze')`;
  const { makeSessionCookie } = await import('../src/lib/session.js');
  cookieDono = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
  const { carregarTenants } = await import('../src/lib/tenant.js');
  await carregarTenants(true);
  ({ GET: contar } = await import('../src/pages/api/admin/appointments/count.ts'));
  ({ POST: desmarcar } = await import('../src/pages/api/appointments/by-token/[token]/cancel.ts'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end();
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('a assinatura do dia muda com o que o cliente faz pelo link', () => {
  it('o cliente desmarca pelo link: a contagem é a mesma, a assinatura não', async () => {
    const antes = await assinatura();
    const host = 'bayron.fadeline.com.br';
    const r = await desmarcar({ params: { token: 'token-das-nove' }, request: new Request(`https://${host}/x`, { method: 'POST', headers: { host } }) } as never);
    expect(r.status).toBe(200);
    const depois = await assinatura();
    expect(depois.count).toBe(antes.count);
    expect(depois.maxModified).not.toBe(antes.maxModified);
  });

  it('o cliente remarca pelo link no mesmo dia — só o horário muda, como grava o reagendar sem editor', async () => {
    const antes = await assinatura();
    await sql`UPDATE appointments SET starts_at = '2030-03-15T19:00:00.000Z', ends_at = '2030-03-15T19:30:00.000Z' WHERE manage_token = 'token-das-onze'`;
    expect((await assinatura()).maxModified).not.toBe(antes.maxModified);
  });

  it('o status muda sozinho — qualquer caminho que só troque o status — e a assinatura muda', async () => {
    const antes = await assinatura();
    await sql`UPDATE appointments SET status = 'completed' WHERE manage_token = 'token-das-onze'`;
    expect((await assinatura()).maxModified).not.toBe(antes.maxModified);
  });

  it('nada mudou: a assinatura é a mesma', async () => {
    expect((await assinatura()).maxModified).toBe((await assinatura()).maxModified);
  });
});

describe('a tela', () => {
  it('a primeira resposta marca o ponto de partida por um sinal próprio — não pela assinatura vazia do dia sem ninguém', () => {
    const tela = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');
    expect(tela).toMatch(/if \(!temPontoDePartida\) \{\s*temPontoDePartida = true;/);
    expect(tela).not.toMatch(/if \(!lastKnownMod && lastKnownCount === initialCount\)/);
  });
});
