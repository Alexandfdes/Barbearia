// O agendamento: o que a revisão de 17/10/2026 achou, cada um com o caso que ficava verde.
//
//  - vaga oferecida por cima de agendamento que começou antes da janela de expediente
//    (o dono mudou o expediente depois dele): o cliente preenchia tudo e levava 409;
//  - a remarcação calculava as vagas com a duração ATUAL do serviço e gravava com a do
//    agendamento: oferecia o que o gravar recusava;
//  - barbeiro desligado continuava com vagas, e o link remarcava com ele;
//  - o combo de segunda remarcado para sexta levava o desconto junto;
//  - o e-mail do agendamento novo com combo não falava do produto a separar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { diaDaSemana } from '../src/lib/calendario';
import { textoDoAvisoDeAgenda } from '../src/lib/avisoDeAgenda';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FUSO = 'America/Fortaleza';
const HOST = 'ze.fadeline.com.br';
const DIA_MS = 24 * 60 * 60 * 1000;
let sql: ReturnType<typeof postgres>;
let slots: typeof import('../src/lib/slots.ts');
let tenantMod: typeof import('../src/lib/tenant.ts');
let remarcar: typeof import('../src/pages/api/appointments/by-token/[token]/reschedule.ts').POST;

/** A primeira segunda-feira a 3 dias ou mais de hoje, no calendário da barbearia. */
function proximaSegunda(): string {
  for (let i = 3; i < 12; i++) {
    const d = formatInTimeZone(new Date(Date.now() + i * DIA_MS), FUSO, 'yyyy-MM-dd');
    if (diaDaSemana(d) === 1) return d;
  }
  throw new Error('sem segunda');
}
const SEG = proximaSegunda();
const mais = (dia: string, n: number) => formatInTimeZone(new Date(fromZonedTime(`${dia}T12:00:00`, FUSO).getTime() + n * DIA_MS), FUSO, 'yyyy-MM-dd');
const TER = mais(SEG, 1);
const SEG_SEGUINTE = mais(SEG, 7);
const iso = (dia: string, hora: string) => fromZonedTime(`${dia}T${hora}:00`, FUSO).toISOString();
const hora = (d: Date) => formatInTimeZone(d, FUSO, 'HH:mm');

async function vagas(barbeiro: number, dia: string, remarcando?: number) {
  const t = tenantMod.resolverHost(HOST)!;
  return (await slots.getAvailableSlots(barbeiro, 1, dia, remarcando, t)).map(hora);
}

async function pedirRemarcar(token: string, startsAt: string) {
  const r = await remarcar({
    params: { token },
    request: new Request(`https://${HOST}/x`, { method: 'POST', headers: { host: HOST, 'content-type': 'application/json' }, body: JSON.stringify({ startsAt }) }),
  } as never);
  return { status: r.status, corpo: (await r.json()) as { error?: string } };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status, timezone) VALUES (1, 'ze', 'Cortes do Zé', 'active', ${FUSO})`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES
              (1, 1, 'Ana',   'ana',   'admin',  'x', true),
              (2, 1, 'Pedro', 'pedro', 'barber', 'x', true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
  await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES (1, 1, 1, 30, true), (1, 2, 1, 30, true)`;
  for (const b of [1, 2]) for (let d = 0; d < 7; d++) {
    await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES
                (1, ${b}, ${d}, '08:00', '12:00'), (1, ${b}, ${d}, '13:00', '18:00')`;
  }
  const marcar = (barbeiro: number, inicio: string, fim: string, minutos: number, token: string, notes: string | null = null) => sql`
    INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                              starts_at, ends_at, duration_minutes, price_cents, manage_token, notes)
    VALUES (1, ${barbeiro}, 1, 'Cliente', '84900000000', ${inicio}, ${fim}, ${minutos}, 4000, ${token}, ${notes})`;
  // Marcado quando o dono atendia direto; depois ele passou a fechar das 12 às 13.
  await marcar(1, iso(SEG, '12:30'), iso(SEG, '13:30'), 60, 'token-atravessa');
  // Na terça: um de 60 min marcado quando o corte levava 60, e outro às 11:00.
  await marcar(1, iso(TER, '08:00'), iso(TER, '09:00'), 60, 'token-longo');
  await marcar(1, iso(TER, '11:00'), iso(TER, '11:30'), 30, 'token-das-onze');
  await marcar(2, iso(TER, '15:00'), iso(TER, '15:30'), 30, 'token-do-pedro');
  await marcar(1, iso(SEG, '09:00'), iso(SEG, '09:30'), 30, 'token-combo', '🎁 Combo do dia — produto para retirar na barbearia: Pomada. 20% OFF aplicado (serviço + produto).');

  tenantMod = await import('../src/lib/tenant.ts');
  await tenantMod.carregarTenants(true);
  slots = await import('../src/lib/slots.ts');
  ({ POST: remarcar } = await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end();
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('as vagas', () => {
  it('o agendamento que atravessa a abertura da janela ocupa a janela — 13:00 não é oferecida', async () => {
    const v = await vagas(1, SEG);
    expect(v).not.toContain('13:00');
    expect(v).toContain('13:30');
  });

  it('remarcando, as vagas saem da duração do AGENDAMENTO (60), não da do serviço hoje (30)', async () => {
    const [{ id }] = await sql`SELECT id FROM appointments WHERE manage_token = 'token-longo'`;
    const v = await vagas(1, TER, id);
    expect(v).toContain('10:00');       // 10:00–11:00 cabe
    expect(v).not.toContain('10:30');   // 10:30–11:30 bate no das 11:00
    expect(v).not.toContain('11:30');   // 11:30–12:30 passa do fim da janela
    // Agendamento novo, sem remarcar: a duração do serviço, 30.
    expect(await vagas(1, TER)).toContain('10:30');
  });
});

describe.skipIf(!TEM_BANCO)('o barbeiro desligado', () => {
  it('não tem vaga, e o link não remarca com ele', async () => {
    expect((await vagas(2, TER)).length).toBeGreaterThan(0);
    await sql`UPDATE barbers SET active = false WHERE id = 2`;
    expect(await vagas(2, TER)).toEqual([]);
    const r = await pedirRemarcar('token-do-pedro', iso(TER, '16:00'));
    expect(r.status).toBe(409);
    expect(r.corpo.error).toMatch(/não atende mais aqui/);
    const [a] = await sql`SELECT starts_at FROM appointments WHERE manage_token = 'token-do-pedro'`;
    expect(a.starts_at).toBe(iso(TER, '15:00'));
  });
});

describe.skipIf(!TEM_BANCO)('o combo do dia remarcado', () => {
  it('para outro dia da semana: recusa — o desconto não vai junto', async () => {
    const r = await pedirRemarcar('token-combo', iso(TER, '09:00'));
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/combo do dia vale só no mesmo dia da semana/);
  });

  it('para outra segunda: remarca', async () => {
    const r = await pedirRemarcar('token-combo', iso(SEG_SEGUINTE, '10:00'));
    expect(r.status).toBe(200);
  });
});

describe('o e-mail do agendamento novo com combo', () => {
  it('diz o produto a separar e o total para o cliente', () => {
    const { texto } = textoDoAvisoDeAgenda('novo', {
      cliente: 'João', telefone: '84999990000', servico: 'Corte', barbeiro: 'Ana',
      inicio: '2030-03-18T12:00:00.000Z', precoCentavos: 3200, itens: [{ nome: 'Pomada', precoCentavos: 2400 }],
    }, { destinatario: 'Ana', barbearia: 'Cortes do Zé', painel: 'https://painel.x', fuso: FUSO });
    expect(texto).toMatch(/\+ Pomada — R\$ 24(,00)? \(separar para o cliente\)/);
    expect(texto).toMatch(/Total para o cliente: R\$ 56/);
  });

  it('o aviso lê os itens do agendamento no banco', async () => {
    const { readFileSync } = await import('node:fs');
    const f = readFileSync('src/lib/avisoDeAgenda.ts', 'utf8');
    expect(f).toMatch(/textoDoAvisoDeAgenda\(p\.tipo, \{ \.\.\.appt, itens \}/);
    expect(f).toMatch(/from\(appointmentItems\)/);
  });
});
