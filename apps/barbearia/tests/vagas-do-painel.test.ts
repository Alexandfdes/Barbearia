// O encaixe manual da agenda do dia — as vagas e os serviços pela rota do PAINEL.
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026 a agenda do dia pedia os serviços e as vagas às rotas PÚBLICAS
// (`/api/services`, `/api/slots`), que acham a barbearia pelo endereço. O painel é central
// (`painel.<DOMINIO_BASE>`): para elas, ele não é barbearia nenhuma, e a resposta era 404.
// O "Novo agendamento" ficava sem serviço e sem horário, e a comanda sem os serviços
// extras — em toda barbearia (`docs/PENDENCIAS-ABERTAS.md` §2.38). Achado no navegador.
//
// A parte da rota precisa de Postgres; a que lê as telas, não.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import type { Tenant } from '../src/lib/tenant.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** As rotas que acham a barbearia pelo endereço — as do site, nunca do painel. */
const DO_SITE = /\/api\/(services|slots|barbers|products|combos|working-hours|appointments|reservations)\b/;

describe('as telas do painel não pedem nada às rotas do site', () => {
  const telas = [...globSync('src/pages/admin/**/*.astro'), 'src/layouts/AdminLayout.astro']
    .map((c) => c.split(sep).join('/')).sort();

  it('o glob achou as telas (guarda contra passar em silêncio)', () => {
    expect(telas.length).toBeGreaterThan(10);
    expect(telas).toContain('src/pages/admin/dia/[date].astro');
  });

  it('nenhum fetch nem callApi do painel vai para uma rota que acha a barbearia pelo endereço', () => {
    const achados = telas.flatMap((c) =>
      [...readFileSync(c, 'utf8').matchAll(/(?:fetch|callApi)\(\s*['`]([^'`]+)['`]/g)]
        .map((m) => m[1])
        .filter((caminho) => DO_SITE.test(caminho) && !caminho.startsWith('/api/admin/'))
        .map((caminho) => `${c}: ${caminho}`)
    );
    expect(achados).toEqual([]);
  });

  it('controle: o padrão pega o que a agenda do dia fazia', () => {
    for (const antigo of ["fetch('/api/services')", 'fetch(`/api/slots?barberId=${b}`)']) {
      const caminho = /\(\s*['`]([^'`]+)['`]/.exec(antigo)![1];
      expect(DO_SITE.test(caminho) && !caminho.startsWith('/api/admin/'), antigo).toBe(true);
    }
  });
});

describe.skipIf(!TEM_BANCO)('GET /api/admin/slots — a barbearia vem da sessão', () => {
  let sql: ReturnType<typeof postgres>;
  let GET: typeof import('../src/pages/api/admin/slots.ts')['GET'];
  let SERVICOS: typeof import('../src/pages/api/admin/services/index.ts')['GET'];
  let dbmod: typeof import('../src/db/index.js');
  let A: Tenant;
  const cookies: Record<string, string> = {};
  const DIA = formatInTimeZone(addDays(new Date(), 7), 'America/Fortaleza', 'yyyy-MM-dd');

  const doPainel = async (rota: typeof GET, t: Tenant, cookie: string, caminho: string) => {
    const url = `http://painel.test${caminho}`;
    const request = new Request(url, { headers: { host: 'painel.test', cookie } });
    return dbmod.comTenant(t, async () => rota({ request, url: new URL(url) } as never));
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'barbearia-a', 'A', 'active'), (2, 'barbearia-b', 'B', 'active')`;
    await sql`SELECT setval('tenants_id_seq', 2)`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
      (1, 1, 'A', 'A', '5584999990000', 'R. A, 1', 'Mossoró/RN'), (2, 2, 'B', 'B', '5584999990001', 'R. B, 2', 'Natal/RN')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dono de A', 'dono-a', 'admin', 'x', true, '84990000001'),
      (2, 1, 'Barbeiro de A', 'barbeiro-a', 'barber', 'x', true, '84990000002'),
      (3, 2, 'Dono de B', 'dono-b', 'admin', 'x', true, '84990000003')`;
    await sql`SELECT setval('barbers_id_seq', 3)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
      (1, 1, 'Corte de A', 'corte', 4000, true), (2, 2, 'Corte de B', 'corte', 5000, true)`;
    await sql`SELECT setval('services_id_seq', 2)`;
    await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES
      (1, 1, 1, 30, true), (1, 2, 1, 30, true), (2, 3, 2, 30, true)`;
    for (const [t, b] of [[1, 1], [1, 2], [2, 3]]) {
      for (let dia = 0; dia < 7; dia++) {
        await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES (${t}, ${b}, ${dia}, '09:00', '12:00')`;
      }
    }
    dbmod = await import('../src/db/index.js');
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    A = tenant.tenantPorIdMesmoForaDoAr(1)!;
    ({ GET } = await import('../src/pages/api/admin/slots.ts'));
    ({ GET: SERVICOS } = await import('../src/pages/api/admin/services/index.ts'));
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const valor = (c: string) => c.split(';')[0];
    cookies.donoA = valor(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
    cookies.barbeiroA = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  it('o dono pede as vagas de um barbeiro dele, no painel central: vêm, no fuso dela', async () => {
    const r = await doPainel(GET, A, cookies.donoA, `/api/admin/slots?barberId=2&serviceId=1&date=${DIA}`);
    expect(r.status).toBe(200);
    const corpo = await r.json() as { timezone: string; slots: { time: string; utc: string }[] };
    expect(corpo.timezone).toBe('America/Fortaleza');
    expect(corpo.slots[0].time).toBe('09:00');
    expect(corpo.slots.map((s) => s.time)).toContain('11:30');
  });

  it('o barbeiro, que só atende, também — a agenda dele tem o encaixe', async () => {
    const r = await doPainel(GET, A, cookies.barbeiroA, `/api/admin/slots?barberId=2&serviceId=1&date=${DIA}`);
    expect(r.status).toBe(200);
  });

  it('o barbeiro de OUTRA barbearia não existe para ela — nem pedindo o id dele', async () => {
    const r = await doPainel(GET, A, cookies.donoA, `/api/admin/slots?barberId=3&serviceId=2&date=${DIA}`);
    expect(r.status).toBe(404);
    expect(JSON.stringify(await r.json())).not.toContain('09:00');
  });

  it('sem sessão: 401 — o painel não calcula vaga para quem não entrou', async () => {
    const r = await doPainel(GET, A, '', `/api/admin/slots?barberId=2&serviceId=1&date=${DIA}`);
    expect(r.status).toBe(401);
  });

  it('as regras do dia são as da rota do site: nem o passado, nem além de 30 dias', async () => {
    const ontem = formatInTimeZone(addDays(new Date(), -1), 'America/Fortaleza', 'yyyy-MM-dd');
    const longe = formatInTimeZone(addDays(new Date(), 40), 'America/Fortaleza', 'yyyy-MM-dd');
    expect((await doPainel(GET, A, cookies.donoA, `/api/admin/slots?barberId=2&serviceId=1&date=${ontem}`)).status).toBe(400);
    expect((await doPainel(GET, A, cookies.donoA, `/api/admin/slots?barberId=2&serviceId=1&date=${longe}`)).status).toBe(400);
    expect((await doPainel(GET, A, cookies.donoA, '/api/admin/slots?barberId=2&serviceId=1&date=amanha')).status).toBe(400);
  });

  it('os serviços do encaixe e da comanda: os dela, com o preço — e não os da outra', async () => {
    const r = await doPainel(SERVICOS, A, cookies.donoA, '/api/admin/services');
    expect(r.status).toBe(200);
    const lista = await r.json() as { id: number; name: string; priceCents: number }[];
    expect(lista.map((s) => [s.id, s.name, s.priceCents])).toEqual([[1, 'Corte de A', 4000]]);
  });
});
