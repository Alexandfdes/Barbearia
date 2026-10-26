// O que a varredura de 26/10/2026 achou no painel do dono — cada caso roda a rota
// como em produção, dentro de `comTenant`.
//
// - o serviço novo nascia sem barbeiro nenhum, e o site não o oferecia;
// - dois "concluir" ao mesmo tempo lançavam os extras em dobro;
// - "faltou" e "concluído" valiam para horário de semana que vem;
// - o barbeiro comum reescrevia o cliente nos agendamentos dos colegas;
// - a data de nascimento 31/02 passava e trancava o cliente para fora;
// - o portal do cliente entrava em redirecionamento sem fim.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import type { Tenant } from '../src/lib/tenant.js';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { somarDias } from '../src/lib/calendario.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const MIN = 60_000;
const daqui = (minutos: number) => new Date(Date.now() + minutos * MIN).toISOString();

describe.skipIf(!TEM_BANCO)('o painel, com banco', () => {
  let sql: ReturnType<typeof postgres>;
  let dbmod: typeof import('../src/db/index.js');
  let A: Tenant;
  const cookies: Record<string, string> = {};
  type Rota = (contexto: never) => Promise<Response>;
  const rotas: Record<string, Rota> = {};

  const doPainel = async (rota: Rota, quem: string, metodo: string, caminho: string,
    params: Record<string, string> = {}, corpo?: unknown) => {
    const url = `http://painel.test${caminho}`;
    const request = new Request(url, {
      method: metodo,
      headers: { host: 'painel.test', cookie: cookies[quem], 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return dbmod.comTenant(A, () => rota({ request, params, url: new URL(url) } as never));
  };

  let proximoId = 100;
  const agendar = async (barbeiro: number, inicio: string, telefone = '84988880001', status = 'confirmed') => {
    const id = ++proximoId;
    await sql`INSERT INTO appointments (id, tenant_id, barber_id, service_id, customer_name, customer_phone,
                customer_birthdate, starts_at, ends_at, duration_minutes, price_cents, status, manage_token)
              VALUES (${id}, 1, ${barbeiro}, 1, 'Cliente', ${telefone}, '1990-05-10', ${inicio},
                ${new Date(Date.parse(inicio) + 30 * MIN).toISOString()}, 30, 5000, ${status}, ${'tk-fechar-' + id})`;
    return id;
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'barbearia-a', 'A', 'active'), (2, 'barbearia-b', 'B', 'active')`;
    await sql`SELECT setval('tenants_id_seq', 2)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dono de A', 'dono-a', 'admin', 'x', true, '84990000001'),
      (2, 1, 'Barbeiro de A', 'barbeiro-a', 'barber', 'x', true, '84990000002'),
      (3, 1, 'Desligado de A', 'desligado-a', 'barber', 'x', false, '84990000003'),
      (4, 2, 'Dono de B', 'dono-b', 'admin', 'x', true, '84990000004')`;
    await sql`SELECT setval('barbers_id_seq', 4)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
      (1, 1, 'Corte', 'corte', 5000, true), (2, 1, 'Barba', 'barba', 3000, true)`;
    await sql`SELECT setval('services_id_seq', 2)`;
    await sql`SELECT setval('appointments_id_seq', 1000)`;

    dbmod = await import('../src/db/index.js');
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    A = tenant.tenantPorIdMesmoForaDoAr(1)!;
    rotas.servico = (await import('../src/pages/api/admin/services/index.ts')).POST as Rota;
    rotas.concluir = (await import('../src/pages/api/admin/appointments/[id]/complete.ts')).POST as Rota;
    rotas.falta = (await import('../src/pages/api/admin/appointments/[id]/no-show.ts')).POST as Rota;
    rotas.cliente = (await import('../src/pages/api/admin/appointments/[id]/customer.ts')).PATCH as Rota;
    rotas.encaixe = (await import('../src/pages/api/admin/appointments/index.ts')).POST as Rota;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const valor = (c: string) => c.split(';')[0];
    cookies.dono = valor(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
    cookies.barbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  it('o serviço novo nasce ligado a cada barbeiro ATIVO — senão o site não o oferece', async () => {
    const r = await doPainel(rotas.servico, 'dono', 'POST', '/api/admin/services', {}, { name: 'Pigmentação', priceCents: 4500 });
    expect(r.status).toBe(201);
    const { id } = await r.json();
    const ligados = await sql<{ barber_id: number; duration_minutes: number; active: boolean }[]>`
      SELECT barber_id, duration_minutes, active FROM barber_services WHERE service_id = ${id} ORDER BY barber_id`;
    expect(ligados).toEqual([
      { barber_id: 1, duration_minutes: 30, active: true },
      { barber_id: 2, duration_minutes: 30, active: true },
    ]);
  });

  it('dois "concluir" ao mesmo tempo: um passa, e o extra entra UMA vez', async () => {
    const id = await agendar(2, daqui(-60));
    const respostas = await Promise.all([1, 2, 3].map(() => doPainel(rotas.concluir, 'dono', 'POST',
      `/api/admin/appointments/${id}/complete`, { id: String(id) }, { extras: [{ serviceId: 2, priceCents: 3000 }] })));
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM appointment_items WHERE appointment_id = ${id}`;
    expect(n).toBe(1);
  });

  // ── Concluir: qualquer hora do MESMO dia, no fuso da barbearia (decisão do dono,
  // 26/10/2026) — e o horário marcado nunca muda.
  const fimDeHoje = () => {
    const hoje = formatInTimeZone(new Date(), A.fuso, 'yyyy-MM-dd');
    return fromZonedTime(`${somarDias(hoje, 1)}T00:00:00`, A.fuso).getTime();
  };
  const horario = async (id: number) => (await sql<{ starts_at: string; ends_at: string; status: string }[]>`
    SELECT starts_at, ends_at, status FROM appointments WHERE id = ${id}`)[0];
  const concluir = (id: number) => doPainel(rotas.concluir, 'dono', 'POST', `/api/admin/appointments/${id}/complete`, { id: String(id) });
  let barbeiroNovo = 10;
  const novoBarbeiro = async () => {
    const id = ++barbeiroNovo;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone)
              VALUES (${id}, 1, ${'Barbeiro ' + id}, ${'barbeiro-' + id}, 'barber', 'x', true, ${'8499100' + String(id).padStart(4, '0')})`;
    return id;
  };

  it('concluir um horário de amanhã é recusado; o de hoje, não', async () => {
    const b = await novoBarbeiro();
    const amanha = await agendar(b, new Date(fimDeHoje() + 60 * MIN).toISOString());
    const r = await concluir(amanha);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/outro dia/);
    expect((await horario(amanha)).status).toBe('confirmed');
  });

  it('concluído antes da hora (o cliente veio cedo): fica no horário MARCADO, e a vaga continua ocupada', async () => {
    const sobra = fimDeHoje() - Date.now();
    if (sobra < 70 * MIN) return; // perto da meia-noite não há "mais tarde hoje" — o caso não se aplica
    const b = await novoBarbeiro();
    const marcado = new Date(Date.now() + Math.min(120 * MIN, sobra - 35 * MIN)).toISOString();
    const id = await agendar(b, marcado);
    const antes = await horario(id);
    expect((await concluir(id)).status).toBe(200);
    const h = await horario(id);
    expect(h.status).toBe('completed');
    expect([h.starts_at, h.ends_at]).toEqual([antes.starts_at, antes.ends_at]);
    // A vaga não abriu: o banco recusa outro cliente no mesmo horário do mesmo barbeiro.
    await expect(agendar(b, marcado, '84977779999')).rejects.toThrow(/appointments_sem_horario_duplo/);
  });

  it('concluído no meio do horário: o horário também não muda', async () => {
    const b = await novoBarbeiro();
    const id = await agendar(b, daqui(-10));
    const antes = await horario(id);
    expect((await concluir(id)).status).toBe(200);
    const h = await horario(id);
    expect([h.starts_at, h.ends_at]).toEqual([antes.starts_at, antes.ends_at]);
  });

  it('falta: só depois de o horário começar — e duas ao mesmo tempo passam uma vez', async () => {
    const futuro = await agendar(1, daqui(10));
    const r = await doPainel(rotas.falta, 'dono', 'POST', `/api/admin/appointments/${futuro}/no-show`, { id: String(futuro) });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/ainda não começou/);
    const [{ status }] = await sql`SELECT status FROM appointments WHERE id = ${futuro}`;
    expect(status).toBe('confirmed');

    const passado = await agendar(1, daqui(-60));
    const duas = await Promise.all([1, 2].map(() => doPainel(rotas.falta, 'dono', 'POST',
      `/api/admin/appointments/${passado}/no-show`, { id: String(passado) })));
    expect(duas.map((x) => x.status).sort()).toEqual([200, 409]);
    const [{ status: depois }] = await sql`SELECT status FROM appointments WHERE id = ${passado}`;
    expect(depois).toBe('no_show');
  });

  it('o barbeiro comum corrige o cliente só nos agendamentos DELE; o dono, em todos', async () => {
    const tel = '84977770001';
    const doBarbeiro = await agendar(2, daqui(-300), tel, 'completed');
    const doDono = await agendar(1, daqui(-200), tel, 'completed');
    const corpo = (nome: string) => ({ customerName: nome, customerPhone: tel, customerBirthdate: '1990-05-10' });

    const r = await doPainel(rotas.cliente, 'barbeiro', 'PATCH', `/api/admin/appointments/${doBarbeiro}/customer`,
      { id: String(doBarbeiro) }, corpo('Nome do Barbeiro'));
    expect(r.status).toBe(200);
    expect((await r.json()).updated).toBe(1);
    const nomes = async () => Object.fromEntries((await sql<{ id: number; customer_name: string }[]>`
      SELECT id, customer_name FROM appointments WHERE id IN (${doBarbeiro}, ${doDono})`).map((l) => [l.id, l.customer_name]));
    expect(await nomes()).toEqual({ [doBarbeiro]: 'Nome do Barbeiro', [doDono]: 'Cliente' });

    const d = await doPainel(rotas.cliente, 'dono', 'PATCH', `/api/admin/appointments/${doDono}/customer`,
      { id: String(doDono) }, corpo('Nome do Dono'));
    expect((await d.json()).updated).toBe(2);
    expect(await nomes()).toEqual({ [doBarbeiro]: 'Nome do Dono', [doDono]: 'Nome do Dono' });
  });

  it('data de nascimento que não existe (31/02) é recusada — na correção e no encaixe', async () => {
    const id = await agendar(1, daqui(-500), '84977770002', 'completed');
    const r = await doPainel(rotas.cliente, 'dono', 'PATCH', `/api/admin/appointments/${id}/customer`,
      { id: String(id) }, { customerName: 'Cliente', customerPhone: '84977770002', customerBirthdate: '2000-02-31' });
    expect(r.status).toBe(400);
    const [{ customer_birthdate }] = await sql`SELECT customer_birthdate FROM appointments WHERE id = ${id}`;
    expect(customer_birthdate).toBe('1990-05-10');

    const e = await doPainel(rotas.encaixe, 'dono', 'POST', '/api/admin/appointments', {}, {
      barberId: 1, serviceId: 1, customerName: 'Novo', customerPhone: '84977770003',
      customerBirthdate: '2000-02-31', startsAt: daqui(24 * 60),
    });
    expect(e.status).toBe(400);
    expect((await e.json()).error).toMatch(/nascimento inválida/);
  });
});

describe('o que a tela faz', () => {
  it('o portal do cliente apaga o cookie quando a sessão não acha agendamento — senão entra em loop com o entrar', () => {
    const pagina = readFileSync('src/pages/cliente/index.astro', 'utf8');
    const ramo = pagina.slice(pagina.indexOf('if (rows.length === 0)'));
    expect(ramo.slice(0, 300)).toMatch(/clearCustomerSessionCookie\(\)/);
    // E o entrar continua mandando quem tem sessão para o portal — é o outro lado do loop.
    expect(readFileSync('src/pages/cliente/entrar.astro', 'utf8')).toMatch(/redirect\('\/cliente'\)/);
  });

  it('marcar falta pede confirmação antes de chamar a rota, como o cancelar', () => {
    const pagina = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');
    const ramo = pagina.slice(pagina.indexOf("if (action === 'no-show')"));
    expect(ramo.indexOf('showConfirm(')).toBeGreaterThan(-1);
    expect(ramo.indexOf('showConfirm(')).toBeLessThan(ramo.indexOf('/no-show`'));
    // E quem disse "não" para ali.
    const desistiu = ramo.search(/if \(!\w+\) return;/);
    expect(desistiu).toBeGreaterThan(ramo.indexOf('showConfirm('));
    expect(desistiu).toBeLessThan(ramo.indexOf('/no-show`'));
  });
});

describe('o limite do concluído — com o relógio cravado', () => {
  let limite: typeof import('../src/lib/fecharAtendimento.js')['limiteParaConcluir'];
  const FUSO = 'America/Fortaleza'; // UTC−3

  beforeAll(async () => {
    ({ limiteParaConcluir: limite } = await import('../src/lib/fecharAtendimento.js'));
  });

  it('o limite é a meia-noite que encerra o dia de HOJE no fuso da barbearia, não no UTC', () => {
    // 22:00 em Fortaleza é 01:00 UTC do dia seguinte: o dia ainda é o 26.
    expect(limite(FUSO, new Date('2026-10-27T01:00:00.000Z'))).toBe('2026-10-27T03:00:00.000Z');
    expect(limite('America/Rio_Branco', new Date('2026-10-27T01:00:00.000Z'))).toBe('2026-10-27T05:00:00.000Z');
  });

});
