// O fuso de cada barbearia (`PENDENCIAS-ABERTAS.md` §2.1 — feito em 12/10/2026).
//
// ── O QUE ISTO PROTEGE ───────────────────────────────────────────────────────
//
// Um processo atende todas as barbearias. Uma em Mossoró (UTC−3) e outra em
// Manaus (UTC−4), no MESMO processo, ao mesmo tempo — cada uma com a hora dela:
//
//  · os horários livres: "09:00" é 12:00 UTC numa e 13:00 UTC na outra;
//  · o agendamento confere o expediente no fuso dela: o último horário de Manaus,
//    no instante dele, já é depois de fechar em Mossoró;
//  · a agenda do dia junta os agendamentos pelo dia DELA;
//  · o e-mail do agendamento diz a hora dela;
//  · o teste grátis e a carência acabam na meia-noite dela, e o painel do operador
//    mostra as datas no calendário dela;
//  · o cadastro tira o fuso do estado — e, sem estado, não cria;
//  · Configurações troca o fuso só da barbearia da sessão, e o site muda na hora;
//  · o banco recusa fuso fora da lista, e a lista do banco é a do código;
//  · a 0013 sobre um banco parado na 0012 deixa as barbearias que existiam no fuso
//    de antes, e roda duas vezes sem erro.
//
// Sem DATABASE_URL, só as listas e as contas de data.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { sql as consulta } from 'drizzle-orm';
import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, migrationSql, recriarSchema } from './migrations.js';
import {
  ESTADOS, FUSOS_DO_BRASIL, TZ_PADRAO, deslocamento, ehFusoDoBrasil, fusoDe, fusoDoEstado,
} from '../src/lib/timezone';
import { fimDaCarencia, fimDoTeste, situacaoDe, ultimoDia } from '../src/lib/situacao';
import type { Tenant } from '../src/lib/tenant';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FORTALEZA = 'America/Fortaleza';
const MANAUS = 'America/Manaus';
const CUIABA = 'America/Cuiaba';

// ── As listas ───────────────────────────────────────────────────────────────

describe('os fusos e os estados (`lib/timezone.ts`)', () => {
  it('os 27 estados, cada um com um dos 16 fusos', () => {
    const ufs = ESTADOS.map((e) => e.uf);
    expect([...ufs].sort()).toEqual([
      'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
      'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
    ]);
    for (const e of ESTADOS) expect(ehFusoDoBrasil(e.fuso), e.uf).toBe(true);
    expect(new Set(FUSOS_DO_BRASIL.map((f) => f.id)).size).toBe(16);
  });

  it('os estados fora do UTC−3 caem no fuso deles — é o defeito que isto conserta', () => {
    expect(fusoDoEstado('AM')).toBe(MANAUS);
    expect(fusoDoEstado('RR')).toBe('America/Boa_Vista');
    expect(fusoDoEstado('RO')).toBe('America/Porto_Velho');
    expect(fusoDoEstado('MT')).toBe(CUIABA);
    expect(fusoDoEstado('MS')).toBe('America/Campo_Grande');
    expect(fusoDoEstado('AC')).toBe('America/Rio_Branco');
    expect(fusoDoEstado('RN')).toBe(FORTALEZA);
    expect(fusoDoEstado('SP')).toBe('America/Sao_Paulo');
    expect(fusoDoEstado(' rn ')).toBe(FORTALEZA);
    expect(fusoDoEstado('XX')).toBeNull();
    expect(fusoDoEstado('')).toBeNull();
    expect(fusoDoEstado(undefined)).toBeNull();
  });

  it('os 16 existem neste Node, e o deslocamento da tela sai do Intl', () => {
    const dia = new Date('2026-10-12T15:00:00Z');
    for (const f of FUSOS_DO_BRASIL) {
      expect(() => formatInTimeZone(dia, f.id, 'HH:mm'), f.id).not.toThrow();
    }
    expect(deslocamento('America/Noronha', dia)).toBe('UTC−2');
    expect(deslocamento(FORTALEZA, dia)).toBe('UTC−3');
    expect(deslocamento(MANAUS, dia)).toBe('UTC−4');
    expect(deslocamento('America/Rio_Branco', dia)).toBe('UTC−5');
  });

  it('`fusoDe`: o da barbearia; sem fuso, o padrão; fuso estranho, o padrão — sem RangeError', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(fusoDe({ fuso: MANAUS })).toBe(MANAUS);
      expect(fusoDe({ fuso: null })).toBe(TZ_PADRAO);
      expect(fusoDe(null)).toBe(TZ_PADRAO);
      expect(fusoDe({ fuso: 'America/Manus' })).toBe(TZ_PADRAO);
      expect(fusoDe({ fuso: 'America/Manus' })).toBe(TZ_PADRAO);
      expect(fusoDe({ fuso: 'Europe/Lisbon' })).toBe(TZ_PADRAO);
      // Avisa uma vez por nome, e não a cada data formatada.
      expect(erro.mock.calls.filter(([m]) => String(m).includes('America/Manus'))).toHaveLength(1);
    } finally {
      erro.mockRestore();
    }
  });

  it('a lista do banco (o CHECK da 0013) é a do código, e o padrão da coluna também', () => {
    const migracao = readFileSync('drizzle/0013_fuso_por_barbearia.sql', 'utf8');
    const check = /CHECK \(timezone IN \(([\s\S]*?)\)\)/.exec(migracao)?.[1] ?? '';
    const noBanco = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(noBanco.sort()).toEqual(FUSOS_DO_BRASIL.map((f) => f.id).sort());
    expect(migracao).toContain(`DEFAULT '${TZ_PADRAO}'`);
  });
});

// ── As contas de data ───────────────────────────────────────────────────────

describe('os prazos acabam na meia-noite DA BARBEARIA (`lib/situacao.ts`)', () => {
  it('o teste grátis: meia-noite do 8º dia — uma hora mais tarde em Manaus', () => {
    const cadastro = new Date('2026-10-08T21:28:00-03:00'); // 20:28 em Manaus, o mesmo dia
    expect(fimDoTeste(cadastro, FORTALEZA).toISOString()).toBe('2026-10-16T03:00:00.000Z');
    expect(fimDoTeste(cadastro, MANAUS).toISOString()).toBe('2026-10-16T04:00:00.000Z');
    expect(ultimoDia(fimDoTeste(cadastro, MANAUS), MANAUS)).toBe('15/10');
  });

  it('o dia do cadastro é o dela: 00:30 em Mossoró ainda é a véspera em Manaus', () => {
    const cadastro = new Date('2026-10-09T03:30:00Z'); // 00:30 de 09/10 / 23:30 de 08/10
    expect(ultimoDia(fimDoTeste(cadastro, FORTALEZA), FORTALEZA)).toBe('16/10');
    expect(ultimoDia(fimDoTeste(cadastro, MANAUS), MANAUS)).toBe('15/10');
  });

  it('a carência também — e a barbearia sai do ar na meia-noite dela', () => {
    const cadastro = new Date('2026-10-08T21:28:00-03:00');
    const testeAte = fimDoTeste(cadastro, MANAUS);
    expect(fimDaCarencia(testeAte, MANAUS).toISOString()).toBe('2026-10-19T04:00:00.000Z');
    // 00:30 de 19/10 em Mossoró é 23:30 de 18/10 em Manaus: lá, ainda na carência —
    // até a meia-noite DELA.
    const agora = new Date('2026-10-19T03:30:00Z');
    expect(situacaoDe({ status: 'trial', testeAte, fuso: MANAUS }, agora))
      .toEqual({ fase: 'carencia', motivo: 'teste', ate: new Date('2026-10-19T04:00:00.000Z') });
    expect(situacaoDe({ status: 'trial', testeAte: fimDoTeste(cadastro, FORTALEZA), fuso: FORTALEZA }, agora).fase)
      .toBe('suspensa');
    // Meia hora depois da meia-noite de Manaus, fora do ar lá também.
    expect(situacaoDe({ status: 'trial', testeAte, fuso: MANAUS }, new Date('2026-10-19T04:30:00Z')).fase).toBe('suspensa');
  });
});

// ── Com banco: duas barbearias, dois fusos, um processo ─────────────────────

describe.skipIf(!TEM_BANCO)('com banco: Mossoró e Manaus no mesmo processo', () => {
  let sql: ReturnType<typeof postgres>;
  let tenant: typeof import('../src/lib/tenant.js');
  let dbmod: typeof import('../src/db/index.js');
  const cookies: Record<string, string> = {};
  let MOSSORO: Tenant;
  let MANAUS_T: Tenant;

  /** Uma data daqui a uma semana: futura nos dois fusos, dentro dos 30 dias da rota. */
  const DIA = formatInTimeZone(addDays(new Date(), 7), MANAUS, 'yyyy-MM-dd');
  /** Uma data longe, para o agendamento (`bookAppointment` não tem o limite da rota). */
  const D = '2030-03-15';
  const valorDe = (setCookie: string) => setCookie.split(';')[0];

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    // Mossoró fica com o padrão da coluna; Manaus, com o dela.
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'mossoro', 'Barbearia de Mossoró', 'active')`;
    // O teste da 3 acaba à meia-noite de 16/03 em Manaus — 04:00 UTC.
    await sql`INSERT INTO tenants (id, slug, business_name, status, timezone, trial_ends_at) VALUES
      (2, 'manaus', 'Barbearia de Manaus', 'active', ${MANAUS}, NULL),
      (3, 'manaus-no-teste', 'Teste em Manaus', 'trial', ${MANAUS}, '2030-03-16T04:00:00Z')`;
    await sql`SELECT setval('tenants_id_seq', 3)`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
      (1, 1, 'Barbearia de Mossoró', 'Mossoró', '5584999990000', 'R. A, 1', 'Mossoró/RN'),
      (2, 2, 'Barbearia de Manaus', 'Manaus', '5592999990000', 'R. B, 2', 'Manaus/AM')`;
    await sql`SELECT setval('settings_id_seq', 2)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email) VALUES
      (1, 1, 'Dono de Mossoró', 'dono-mossoro', 'admin', 'x', true, '84990000001', 'dono@mossoro.test'),
      (2, 1, 'Barbeiro de Mossoró', 'barbeiro-mossoro', 'barber', 'x', true, '84990000002', NULL),
      (3, 2, 'Dono de Manaus', 'dono-manaus', 'admin', 'x', true, '92990000001', 'dono@manaus.test')`;
    // O e-mail confirmado: só ele recebe (lib/confirmacaoDeEmail.ts). O não confirmado está em
    // tests/confirmacao-de-email.test.ts.
    await sql`UPDATE barbers SET email_confirmado_em = now() WHERE email IS NOT NULL`;
    await sql`SELECT setval('barbers_id_seq', 3)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
      (1, 1, 'Corte', 'corte', 4000, true), (2, 2, 'Corte', 'corte', 4000, true)`;
    await sql`SELECT setval('services_id_seq', 2)`;
    await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES
      (1, 1, 1, 30, true), (2, 3, 2, 30, true)`;
    // O mesmo expediente nas duas, todo dia: 09:00 às 18:00 — no relógio de cada uma.
    for (const [t, b] of [[1, 1], [2, 3]]) {
      for (let dia = 0; dia < 7; dia++) {
        await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time)
                  VALUES (${t}, ${b}, ${dia}, '09:00', '18:00')`;
      }
    }

    dbmod = await import('../src/db/index.js');
    tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    MOSSORO = tenant.tenantPorIdMesmoForaDoAr(1)!;
    MANAUS_T = tenant.tenantPorIdMesmoForaDoAr(2)!;

    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookies.donoMossoro = valorDe(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
    cookies.barbeiroMossoro = valorDe(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
    cookies.donoManaus = valorDe(await makeSessionCookie({ barberId: 3, role: 'admin', tenantId: 2 }));
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  const fusoNoBanco = async (id: number) =>
    (await sql`SELECT timezone FROM tenants WHERE id = ${id}`)[0].timezone as string;

  /** `/api/slots` como o site chama: pelo endereço da barbearia, dentro do contexto dela. */
  const slotsDoSite = async (slug: string, t: Tenant, barberId: number, serviceId: number, data: string) => {
    const { GET } = await import('../src/pages/api/slots.ts');
    const url = `http://${slug}.test/api/slots?barberId=${barberId}&serviceId=${serviceId}&date=${data}`;
    const r = await dbmod.comTenant(t, async () => GET({ request: new Request(url, { headers: { host: `${slug}.test` } }) } as never));
    return { status: r.status, corpo: await r.json() as { timezone: string; slots: { utc: string; time: string }[] } };
  };

  /** Uma rota do painel, com o cookie de quem está logado e a barbearia da sessão no contexto. */
  const doPainel = async <R extends (ctx: never) => Response | Promise<Response>>(
    rota: R, t: Tenant, cookie: string, caminho: string, init: RequestInit = {},
  ) => {
    const url = `http://painel.test${caminho}`;
    const request = new Request(url, { ...init, headers: { host: 'painel.test', cookie, ...(init.headers ?? {}) } });
    return dbmod.comTenant(t, async () => rota({ request, url: new URL(url) } as never));
  };

  it('o cache de barbearias traz o fuso de cada uma — Mossoró com o padrão da coluna', () => {
    expect(MOSSORO.fuso).toBe(FORTALEZA);
    expect(MANAUS_T.fuso).toBe(MANAUS);
  });

  it('os horários livres: o mesmo expediente, uma hora de diferença no instante', async () => {
    const mossoro = await slotsDoSite('mossoro', MOSSORO, 1, 1, DIA);
    const manaus = await slotsDoSite('manaus', MANAUS_T, 3, 2, DIA);
    expect(mossoro.status).toBe(200);
    expect(manaus.status).toBe(200);
    expect(mossoro.corpo.timezone).toBe(FORTALEZA);
    expect(manaus.corpo.timezone).toBe(MANAUS);

    // Na tela, as duas mostram 09:00 a 17:30...
    for (const r of [mossoro, manaus]) {
      expect(r.corpo.slots[0].time).toBe('09:00');
      expect(r.corpo.slots.at(-1)!.time).toBe('17:30');
    }
    // ...e, no relógio do mundo, Manaus abre uma hora depois.
    expect(mossoro.corpo.slots[0].utc).toBe(fromZonedTime(`${DIA}T09:00:00`, FORTALEZA).toISOString());
    expect(manaus.corpo.slots[0].utc).toBe(fromZonedTime(`${DIA}T09:00:00`, MANAUS).toISOString());
    expect(Date.parse(manaus.corpo.slots[0].utc) - Date.parse(mossoro.corpo.slots[0].utc)).toBe(60 * 60 * 1000);
  });

  it('o agendamento confere o expediente no fuso dela', async () => {
    const { bookAppointment } = await import('../src/lib/bookAppointment.js');
    const cliente = { customerName: 'Cliente', customerPhone: '84999990000', customerBirthdate: '1990-01-01', createdBy: 'customer' as const };
    const agendar = (t: Tenant, barberId: number, serviceId: number, startsAt: Date) =>
      dbmod.comTenant(t, () => bookAppointment({ ...cliente, tenant: t, barberId, serviceId, startsAt }));

    // 17:30 em Manaus — 21:30 UTC: o último horário de lá.
    const ultimoDeManaus = fromZonedTime(`${D}T17:30:00`, MANAUS);
    expect(ultimoDeManaus.toISOString()).toBe('2030-03-15T21:30:00.000Z');
    const emManaus = await agendar(MANAUS_T, 3, 2, ultimoDeManaus);
    expect(emManaus).toMatchObject({ ok: true, startsAt: '2030-03-15T21:30:00.000Z' });

    // O mesmo instante em Mossoró é 18:30: já fechou.
    expect(await agendar(MOSSORO, 1, 1, ultimoDeManaus)).toMatchObject({ ok: false, httpStatus: 400, error: 'Horário fora do expediente' });
    // E as 08:30 de Manaus são 09:30 em Mossoró: lá ainda não abriu, aqui já.
    const cedoEmManaus = fromZonedTime(`${D}T08:30:00`, MANAUS);
    expect(await agendar(MANAUS_T, 3, 2, cedoEmManaus)).toMatchObject({ ok: false, error: 'Horário fora do expediente' });
    expect(await agendar(MOSSORO, 1, 1, cedoEmManaus)).toMatchObject({ ok: true });
  });

  it('o e-mail do agendamento diz a hora da barbearia', async () => {
    const { avisarMudancaNaAgenda } = await import('../src/lib/avisoDeAgenda.js');
    const [{ id }] = await sql`SELECT id FROM appointments WHERE tenant_id = 2 AND starts_at = '2030-03-15T21:30:00.000Z'`;
    const enviados: { assunto: string; texto: string }[] = [];
    const n = await dbmod.comTenant(MANAUS_T, () => avisarMudancaNaAgenda({
      tenant: MANAUS_T, tipo: 'novo', agendamentoId: id,
      enviar: async (e) => { enviados.push(e); },
    }));
    expect(n).toBe(1);
    expect(enviados[0].assunto).toMatch(/às 17:30$/);
    expect(enviados[0].texto).toContain('sexta-feira, 15/03, às 17:30');
  });

  it('a agenda do dia junta os agendamentos pelo dia DELA', async () => {
    // 23:15 de 15/03 em Manaus já é 16/03 em UTC — e em Mossoró.
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                starts_at, ends_at, duration_minutes, price_cents, manage_token)
              VALUES (2, 3, 2, 'Cliente das 23:15', '92999990000',
                '2030-03-16T03:15:00.000Z', '2030-03-16T03:45:00.000Z', 30, 4000, 'token-fuso-1')`;
    const { GET } = await import('../src/pages/api/admin/appointments/index.ts');
    const doDia = async (data: string) => {
      const r = await doPainel(GET, MANAUS_T, cookies.donoManaus, `/api/admin/appointments?date=${data}`);
      expect(r.status).toBe(200);
      return (await r.json()) as { customerName: string; timeLocal: string }[];
    };
    expect((await doDia('2030-03-15')).find((a) => a.customerName === 'Cliente das 23:15')).toMatchObject({ timeLocal: '23:15' });
    expect((await doDia('2030-03-16')).map((a) => a.customerName)).not.toContain('Cliente das 23:15');
  });

  it('o calendário do mês conta pelo dia dela', async () => {
    const { GET } = await import('../src/pages/api/admin/appointments/calendar.ts');
    const r = await doPainel(GET, MANAUS_T, cookies.donoManaus, '/api/admin/appointments/calendar?month=2030-03');
    expect(r.status).toBe(200);
    const { days } = (await r.json()) as { days: Record<string, number> };
    // O das 17:30 e o das 23:15: os dois no dia 15, em Manaus.
    expect(days).toEqual({ '2030-03-15': 2 });
  });

  it('o cliente remarca pelo link: vale o expediente da barbearia do endereço', async () => {
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                starts_at, ends_at, duration_minutes, price_cents, manage_token) VALUES
      (2, 3, 2, 'Remarca em Manaus', '92999990001', '2030-04-01T14:00:00.000Z', '2030-04-01T14:30:00.000Z', 30, 4000, 'token-remarca-manaus'),
      (1, 1, 1, 'Remarca em Mossoró', '84999990001', '2030-04-01T14:00:00.000Z', '2030-04-01T14:30:00.000Z', 30, 4000, 'token-remarca-mossoro')`;
    const { POST } = await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts');
    const remarcar = (slug: string, t: Tenant, token: string, startsAt: Date) => dbmod.comTenant(t, async () => POST({
      params: { token },
      request: new Request(`http://${slug}.test/api/appointments/by-token/${token}/reschedule`, {
        method: 'POST',
        headers: { host: `${slug}.test`, 'content-type': 'application/json' },
        body: JSON.stringify({ startsAt: startsAt.toISOString() }),
      }),
    } as never));

    const ultimoDeManaus = fromZonedTime(`${DIA}T17:30:00`, MANAUS);
    const emManaus = await remarcar('manaus', MANAUS_T, 'token-remarca-manaus', ultimoDeManaus);
    expect(emManaus.status).toBe(200);
    expect(await emManaus.json()).toMatchObject({ startsAt: ultimoDeManaus.toISOString(), timeLocal: '17:30' });
    // O mesmo instante, em Mossoró, é 18:30.
    const emMossoro = await remarcar('mossoro', MOSSORO, 'token-remarca-mossoro', ultimoDeManaus);
    expect(emMossoro.status).toBe(400);
    expect((await emMossoro.json()).error).toBe('Horário fora do expediente');
  });

  it('o painel do operador mostra cada uma no calendário dela, e estende o teste até a meia-noite dela', async () => {
    const op = await import('../src/lib/operadorBarbearias.js');
    const lista = await op.listarBarbearias(new Date('2030-03-10T12:00:00Z'));
    const noTeste = lista.find((b) => b.slug === 'manaus-no-teste')!;
    expect(noTeste.fuso).toBe(MANAUS);
    // 04:00 UTC de 16/03 é a meia-noite em Manaus: o último dia é 15/03 — em
    // Fortaleza, seria 16/03.
    expect(noTeste.tela).toMatchObject({ rotulo: 'Teste', detalhe: 'até 15/03' });
    expect(lista.find((b) => b.slug === 'mossoro')!.fuso).toBe(FORTALEZA);

    const r = await op.estenderTeste(3, 7, '10.0.0.1', new Date('2030-03-10T12:00:00Z'));
    expect(r.tela.detalhe).toBe('até 22/03');
    const [{ trial_ends_at }] = await sql`SELECT trial_ends_at FROM tenants WHERE id = 3`;
    expect(new Date(trial_ends_at).toISOString()).toBe('2030-03-23T04:00:00.000Z');
    const [acao] = await op.ultimasAcoes(1);
    expect(op.descreverAcao(acao)).toBe('Estendeu o teste de manaus-no-teste em 7 dias (até 22/03)');
  });

  describe('o cadastro tira o fuso do estado', () => {
    const DADOS = { nome: 'Barbearia Nova', dono: 'José', endereco: 'R. A, 1', senha: 'segredo123', email: 'ze@exemplo.com.br' };
    const semBanco = (() => { throw new Error('tocou o banco'); }) as unknown as postgres.Sql;
    let provisionar: typeof import('../src/lib/provisionarBarbearia.js')['provisionarBarbearia'];
    beforeAll(async () => {
      ({ provisionarBarbearia: provisionar } = await import('../src/lib/provisionarBarbearia.js'));
    });

    it('o estado escolhido decide o fuso — e o fim do teste é na meia-noite dele', async () => {
      const agora = new Date('2026-10-08T21:28:00-03:00');
      const r = await provisionar(sql, { ...DADOS, slug: 'nova-manaus', telefone: '92988880001', cidade: 'Manaus', estado: 'AM' }, agora);
      expect(r).toMatchObject({ ok: true, fuso: MANAUS });
      const [t] = await sql`SELECT timezone, trial_ends_at FROM tenants WHERE slug = 'nova-manaus'`;
      expect(t.timezone).toBe(MANAUS);
      expect(new Date(t.trial_ends_at).toISOString()).toBe('2026-10-16T04:00:00.000Z');
      // E a cidade fica no formato que o site divide para o Google: "Cidade/UF".
      const [s] = await sql`SELECT s.address_city FROM settings s JOIN tenants t ON t.id = s.tenant_id WHERE t.slug = 'nova-manaus'`;
      expect(s.address_city).toBe('Manaus/AM');
    });

    it('sem o estado, vale a sigla escrita na cidade, como o script sempre aceitou', async () => {
      const r = await provisionar(sql, { ...DADOS, slug: 'nova-acre', telefone: '68988880001', cidade: 'Rio Branco - AC' });
      expect(r).toMatchObject({ ok: true, fuso: 'America/Rio_Branco' });
      // A cidade fica como foi escrita: a sigla já está nela.
      const [s] = await sql`SELECT s.address_city FROM settings s JOIN tenants t ON t.id = s.tenant_id WHERE t.slug = 'nova-acre'`;
      expect(s.address_city).toBe('Rio Branco - AC');
      expect(await provisionar(sql, { ...DADOS, slug: 'nova-mt', telefone: '65988880001', cidade: 'Cuiabá/MT' }))
        .toMatchObject({ ok: true, fuso: CUIABA });
    });

    it('o fuso dito pelo script ganha do estado (a ponta oeste do Amazonas)', async () => {
      const r = await provisionar(sql, { ...DADOS, slug: 'nova-eirunepe', telefone: '97988880001', cidade: 'Eirunepé', estado: 'AM', fuso: 'America/Eirunepe' });
      expect(r).toMatchObject({ ok: true, fuso: 'America/Eirunepe' });
    });

    it('sem estado nenhum, ou com sigla ou fuso que não existe: recusa, antes de tocar o banco', async () => {
      expect(await provisionar(semBanco, { ...DADOS, slug: 'x1', telefone: '84988880009', cidade: 'Mossoró' }))
        .toMatchObject({ ok: false, campo: 'estado', erro: expect.stringMatching(/Falta informar o estado/) });
      expect(await provisionar(semBanco, { ...DADOS, slug: 'x2', telefone: '84988880009', cidade: 'Mossoró', estado: 'ZZ' }))
        .toMatchObject({ ok: false, campo: 'estado' });
      expect(await provisionar(semBanco, { ...DADOS, slug: 'x3', telefone: '84988880009', cidade: 'Mossoró/RN', fuso: 'America/Manus' }))
        .toMatchObject({ ok: false, campo: 'estado' });
    });

    it('pela web, o estado é obrigatório — e o "último dia do teste" da resposta é o do fuso dele', async () => {
      const anterior = process.env.CADASTRO_ABERTO;
      process.env.CADASTRO_ABERTO = '1';
      try {
        const { POST } = await import('../src/pages/api/cadastrar.js');
        const cadastrar = (corpo: Record<string, unknown>, ip: string) => POST({
          request: new Request('http://painel.test/api/cadastrar', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
          }),
          clientAddress: ip,
        } as never);
        const sem = await cadastrar({ ...DADOS, slug: 'web-sem-estado', telefone: '84988880010', cidade: 'Mossoró/RN' }, '7.7.7.1');
        expect(sem.status).toBe(400);
        expect((await sem.json()).campo).toBe('estado');

        const com = await cadastrar({ ...DADOS, slug: 'web-cuiaba', telefone: '65988880010', cidade: 'Cuiabá', estado: 'MT' }, '7.7.7.2');
        expect(com.status).toBe(201);
        const [t] = await sql`SELECT timezone, trial_ends_at FROM tenants WHERE slug = 'web-cuiaba'`;
        expect(t.timezone).toBe(CUIABA);
        expect((await com.json()).ultimoDiaDoTeste).toBe(ultimoDia(new Date(t.trial_ends_at), CUIABA));
      } finally {
        if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
        else process.env.CADASTRO_ABERTO = anterior;
      }
    });
  });

  describe('Configurações troca o fuso — só o da barbearia da sessão', () => {
    let PATCH: typeof import('../src/pages/api/admin/settings.ts')['PATCH'];
    beforeAll(async () => {
      ({ PATCH } = await import('../src/pages/api/admin/settings.ts'));
    });
    const salvar = (cookie: string, corpo: Record<string, unknown>, t: Tenant = MOSSORO) =>
      doPainel(PATCH, t, cookie, '/api/admin/settings', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      });
    const doHost = async (slug: string) => {
      await tenant.carregarTenants(); // sem forçar: o que vale é o cache ter sido descartado
      return tenant.tenantDoHost(new Request(`http://${slug}.test/`, { headers: { host: `${slug}.test` } }));
    };

    it('o dono troca o da barbearia dele; a outra não muda — nem pedindo pelo corpo', async () => {
      const r = await salvar(cookies.donoMossoro, { fuso: CUIABA, tenantId: 2, tenant: 2 });
      expect(r.status).toBe(200);
      expect(await fusoNoBanco(1)).toBe(CUIABA);
      expect(await fusoNoBanco(2)).toBe(MANAUS);
    });

    it('o site muda NA HORA, sem esperar o cache de 30 s', async () => {
      expect((await doHost('mossoro'))?.fuso).toBe(CUIABA);
      const agora = await slotsDoSite('mossoro', (await doHost('mossoro'))!, 1, 1, DIA);
      expect(agora.corpo.timezone).toBe(CUIABA);
      expect(agora.corpo.slots[0]).toEqual({ time: '09:00', utc: fromZonedTime(`${DIA}T09:00:00`, CUIABA).toISOString() });
      expect((await doHost('manaus'))?.fuso).toBe(MANAUS);
    });

    it('fuso fora da lista: 400, e nada muda', async () => {
      for (const fuso of ['America/New_York', 'America/Manus', '', 'UTC']) {
        const r = await salvar(cookies.donoMossoro, { fuso });
        expect(r.status, fuso).toBe(400);
      }
      expect(await fusoNoBanco(1)).toBe(CUIABA);
    });

    it('o barbeiro que só atende não troca', async () => {
      expect((await salvar(cookies.barbeiroMossoro, { fuso: FORTALEZA })).status).toBe(403);
      expect(await fusoNoBanco(1)).toBe(CUIABA);
    });

    it('junto com outro campo, os dois gravam; e de volta ao fuso de antes', async () => {
      const r = await salvar(cookies.donoMossoro, { fuso: FORTALEZA, shortName: 'Mossoró!' });
      expect(r.status).toBe(200);
      expect(await fusoNoBanco(1)).toBe(FORTALEZA);
      expect((await sql`SELECT short_name FROM settings WHERE tenant_id = 1`)[0].short_name).toBe('Mossoró!');
      expect((await doHost('mossoro'))?.fuso).toBe(FORTALEZA);
    });
  });

  it('o banco recusa fuso fora da lista — e aceita os 16', async () => {
    await expect(sql`UPDATE tenants SET timezone = 'America/New_York' WHERE id = 2`).rejects.toThrow(/tenants_timezone_do_brasil/);
    await expect(sql`UPDATE tenants SET timezone = 'America/Manus' WHERE id = 2`).rejects.toThrow(/tenants_timezone_do_brasil/);
    await expect(sql`UPDATE tenants SET timezone = NULL WHERE id = 2`).rejects.toThrow(/null value/);
    for (const f of FUSOS_DO_BRASIL) await sql`UPDATE tenants SET timezone = ${f.id} WHERE id = 2`;
    await sql`UPDATE tenants SET timezone = ${MANAUS} WHERE id = 2`;
  });

  it('o papel do app não grava em `tenants` — por isso a troca vai pela conexão do dono', async () => {
    let recusa = '';
    try {
      await dbmod.comTenant(MANAUS_T, () => dbmod.db.execute(consulta`UPDATE tenants SET timezone = 'America/Cuiaba' WHERE id = 2`));
    } catch (e) {
      const erro = e as { message?: string; cause?: { message?: string } };
      recusa = `${erro.message ?? ''} ${erro.cause?.message ?? ''}`;
    }
    expect(recusa).toMatch(/permission denied/i);
    expect(await fusoNoBanco(2)).toBe(MANAUS);
  });
});

// ── A 0013 sobre o banco de antes ───────────────────────────────────────────

describe.skipIf(!TEM_BANCO)('a migration 0013, num banco parado na 0012', () => {
  let sql: ReturnType<typeof postgres>;
  const NOVA = '0013_fuso_por_barbearia.sql';

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const todas = listarMigrations();
    expect(todas).toContain(NOVA);
    for (const f of todas.slice(0, todas.indexOf(NOVA))) await sql.unsafe(migrationSql(f));
    // O banco de produção antes do deploy: barbearias que nunca tiveram fuso próprio.
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
      (1, 'bayron', 'Barbearia Bayron', 'active'), (2, 'outra', 'Outra', 'suspended')`;
    await sql.unsafe(migrationSql(NOVA));
  }, 60_000);

  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('as barbearias que existiam ficam no fuso de antes — nada muda de hora no deploy', async () => {
    const linhas = await sql`SELECT slug, timezone FROM tenants ORDER BY id`;
    expect(linhas).toEqual([{ slug: 'bayron', timezone: FORTALEZA }, { slug: 'outra', timezone: FORTALEZA }]);
  });

  it('roda duas vezes sem erro — e não desfaz o fuso que o dono escolheu', async () => {
    await sql`UPDATE tenants SET timezone = ${MANAUS} WHERE id = 2`;
    await sql.unsafe(migrationSql(NOVA));
    const linhas = await sql`SELECT slug, timezone FROM tenants ORDER BY id`;
    expect(linhas).toEqual([{ slug: 'bayron', timezone: FORTALEZA }, { slug: 'outra', timezone: MANAUS }]);
    await expect(sql`UPDATE tenants SET timezone = 'Europe/Lisbon' WHERE id = 1`).rejects.toThrow(/tenants_timezone_do_brasil/);
  });
});
