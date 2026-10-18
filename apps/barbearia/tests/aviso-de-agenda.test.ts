// O e-mail ao barbeiro e ao dono quando o CLIENTE agenda, desmarca ou remarca
// pelo site (`src/lib/avisoDeAgenda.ts`) — decidido pelo dono em 11/10/2026
// (`docs/PENDENCIAS-ABERTAS.md` §2.33).
//
// ── O QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────────────
//
// Até 11/10 nada avisava: o barbeiro descobria o cliente novo quando ele chegava,
// e o que desmarcou, esperando. E as regras que o dono escolheu: recebe o
// barbeiro do horário e o dono, nunca o de outra barbearia, cada um desligável na
// Equipe; o duplo clique não avisa duas vezes; e o e-mail que não sai nunca
// derruba o agendamento.
//
// As rotas rodam dentro de `comTenant`, como em produção: as duas paredes — o
// filtro da aplicação e o RLS — valem aqui.
//
// Precisa de Postgres. Sem DATABASE_URL a parte de banco é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { TZ_PADRAO as TZ } from '../src/lib/timezone';
import { somarDias, diaDaSemana } from '../src/lib/calendario';
import { caixaDeSaida } from '../src/lib/email';
import { quandoCurto, quandoPorExtenso, textoDoAvisoDeAgenda } from '../src/lib/avisoDeAgenda';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const NAVALHA = { id: 1, slug: 'navalha', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' };
const HOST = 'navalha.test';

// Uma terça ao menos dois dias à frente — a rota recusa o passado e além de 30 dias.
const hoje = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
let terca = somarDias(hoje, 2);
while (diaDaSemana(terca) !== 2) terca = somarDias(terca, 1);
const quarta = somarDias(terca, 1);
/** Um horário NA BARBEARIA, como o `/api/slots` oferece. */
const as = (dia: string, hora: string) => fromZonedTime(`${dia}T${hora}:00`, TZ).toISOString();

let sql: ReturnType<typeof postgres>;
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let agendarRota: typeof import('../src/pages/api/appointments/index.ts').POST;
let desmarcarRota: typeof import('../src/pages/api/appointments/by-token/[token]/cancel.ts').POST;
let remarcarRota: typeof import('../src/pages/api/appointments/by-token/[token]/reschedule.ts').POST;
let editarBarbeiro: typeof import('../src/pages/api/admin/barbers/[id].ts').PUT;
let aviso: typeof import('../src/lib/avisoDeAgenda.ts');
let cookieDono = '';
let cookieBarbeiro = '';
let ip = 0;

async function agendar(barberId: number, startsAt: string, idempotencyKey?: string) {
  ip += 1;
  const endereco = `10.31.0.${ip}`;
  const request = new Request(`http://${HOST}/api/appointments`, {
    method: 'POST',
    headers: { host: HOST, 'content-type': 'application/json', 'x-forwarded-for': endereco },
    body: JSON.stringify({
      barberId, serviceId: 1, customerName: 'Cliente Teste', customerPhone: '(84) 99000-0001',
      customerBirthdate: '1990-05-20', startsAt, ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  });
  const r = await comTenant(NAVALHA, async () => agendarRota({ request, clientAddress: endereco } as never));
  return { status: r.status, corpo: await r.json() as { id: number; manageToken: string; criado?: boolean } };
}

const porToken = (rota: 'cancel' | 'reschedule', token: string, corpo?: unknown) => {
  const request = new Request(`http://${HOST}/api/appointments/by-token/${token}/${rota}`, {
    method: 'POST',
    headers: { host: HOST, 'content-type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const fn = rota === 'cancel' ? desmarcarRota : remarcarRota;
  return comTenant(NAVALHA, async () => fn({ request, params: { token } } as never));
};

const ligarAvisos = (id: number, ligado: boolean, cookie = cookieDono) =>
  comTenant(NAVALHA, async () => editarBarbeiro({
    request: new Request(`http://painel.test/api/admin/barbers/${id}`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ avisarAgendamentos: ligado }),
    }),
    params: { id: String(id) },
  } as never));

const para = () => caixaDeSaida.map((e) => e.para);

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'navalha', 'Barbearia Navalha', 'active'),
              (2, 'outra',   'Barbearia Outra',   'active')`;
  await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
              (1, 1, 'Barbearia Navalha', 'Navalha', '5584999990000', 'Av. Rio Branco, 100', 'Natal/RN'),
              (2, 2, 'Barbearia Outra',   'Outra',   '5584999990009', 'Rua B, 2',            'Natal/RN')`;
  // Vera é a dona e também atende. Sócio é admin com o aviso desligado. Caio foi
  // admin e está inativo — admin recebe tudo, então é o caso que pega o inativo.
  // Beto não tem e-mail. Dani usa o mesmo e-mail da Vera.
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email, avisar_agendamentos) VALUES
              (1, 1, 'Vera Lucia',    'vera',  'admin',  'x', true,  '84999990001', 'vera@navalha.com',  true),
              (2, 1, 'Ana',           'ana',   'barber', 'x', true,  '84999990002', 'ana@navalha.com',   true),
              (3, 1, 'Beto',          'beto',  'barber', 'x', true,  '84999990003', NULL,                true),
              (4, 1, 'Sócio',         'socio', 'admin',  'x', true,  '84999990004', 'socio@navalha.com', false),
              (5, 1, 'Caio',          'caio',  'admin',  'x', false, '84999990005', 'caio@navalha.com',  true),
              (6, 1, 'Dani',          'dani',  'barber', 'x', true,  '84999990006', 'vera@navalha.com',  true),
              (7, 2, 'Dono da Outra', 'dono',  'admin',  'x', true,  '84999990007', 'dono@outra.com',    true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
              (1, 1, 'Corte', 'corte', 4000, true),
              (2, 2, 'Corte', 'corte', 3000, true)`;
  for (const b of [1, 2, 3, 6]) {
    await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES (1, ${b}, 1, 30, true)`;
    for (let d = 0; d < 7; d++) {
      await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES (1, ${b}, ${d}, '08:00', '23:00')`;
    }
  }
  await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES (2, 7, 2, 30, true)`;
  await sql`SELECT setval('barbers_id_seq', 20)`;
  await sql`SELECT setval('services_id_seq', 20)`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDono     = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookieBarbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));

  const tenant = await import('../src/lib/tenant.js');
  await tenant.carregarTenants(true);
  ({ comTenant } = await import('../src/db/index.js'));
  ({ POST: agendarRota } = await import('../src/pages/api/appointments/index.ts'));
  ({ POST: desmarcarRota } = await import('../src/pages/api/appointments/by-token/[token]/cancel.ts'));
  ({ POST: remarcarRota } = await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts'));
  ({ PUT: editarBarbeiro } = await import('../src/pages/api/admin/barbers/[id].ts'));
  aviso = await import('../src/lib/avisoDeAgenda.ts');
}, 60_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

beforeEach(() => { caixaDeSaida.length = 0; });

describe('o texto do aviso', () => {
  const appt = {
    cliente: 'Joao guilherme', telefone: '84990000001', servico: 'Corte', barbeiro: 'Ana',
    // 21:30 de terça em Fortaleza — 00:30 de quarta em UTC.
    inicio: '2026-10-14T00:30:00.000Z', precoCentavos: 3990,
  };
  const ctx = { destinatario: 'Ana Maria', barbearia: 'Barbearia Navalha', painel: 'https://painel.exemplo', fuso: TZ };

  it('a data e a hora são as da barbearia, não as de UTC', () => {
    expect(quandoPorExtenso(appt.inicio, TZ)).toBe('terça-feira, 13/10, às 21:30');
    expect(quandoCurto(appt.inicio, TZ)).toBe('ter 13/10 às 21:30');
  });

  it('agendamento novo: quem, quando, o quê, o WhatsApp e o link da agenda do dia', () => {
    const { assunto, texto } = textoDoAvisoDeAgenda('novo', appt, ctx);
    expect(assunto).toBe('Agendamento novo: Joao guilherme, ter 13/10 às 21:30');
    expect(texto).toMatch(/^Olá, Ana\.\n/);
    expect(texto).toContain('Joao guilherme agendou pelo site da Barbearia Navalha:');
    expect(texto).toContain('terça-feira, 13/10, às 21:30');
    expect(texto).toContain('Corte — R$ 39,90');
    expect(texto).toContain('Com: Ana');
    expect(texto).toContain('WhatsApp do cliente: (84) 99000-0001 — https://wa.me/5584990000001');
    expect(texto).toContain('A agenda do dia: https://painel.exemplo/admin/dia/2026-10-13');
    expect(texto).toContain('o dono da barbearia desliga na tela da Equipe');
  });

  it('desmarcado e remarcado dizem o que mudou', () => {
    const d = textoDoAvisoDeAgenda('desmarcado', appt, ctx);
    expect(d.assunto).toBe('Desmarcado: Joao guilherme, ter 13/10 às 21:30');
    expect(d.texto).toContain('O horário ficou livre no site.');

    const r = textoDoAvisoDeAgenda('remarcado', { ...appt, inicio: '2026-10-15T13:00:00.000Z' },
      { ...ctx, inicioAnterior: appt.inicio });
    expect(r.assunto).toBe('Remarcado: Joao guilherme, ter 13/10 às 21:30 → qui 15/10 às 10:00');
    expect(r.texto).toContain('Era:   terça-feira, 13/10, às 21:30');
    expect(r.texto).toContain('Agora: quinta-feira, 15/10, às 10:00');
    // O link leva ao dia NOVO.
    expect(r.texto).toContain('/admin/dia/2026-10-15');
  });

  it('sem painel configurado, sem link — e sem telefone válido, sem o wa.me', () => {
    const { texto } = textoDoAvisoDeAgenda('novo', { ...appt, telefone: '123' }, { ...ctx, painel: '' });
    expect(texto).not.toContain('/admin/dia/');
    expect(texto).not.toContain('wa.me');
  });
});

describe('quem chama o aviso', () => {
  it('só as três rotas do cliente — o que o barbeiro faz pelo painel não avisa ninguém', () => {
    const CHAMADA = /avisarMudancaNaAgenda\(\{/;
    // Controle: o padrão pega a chamada como ela é escrita.
    expect(CHAMADA.test("await avisarMudancaNaAgenda({ tenant, tipo: 'novo', agendamentoId: 1 });")).toBe(true);
    const chamam = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => c !== 'src/lib/avisoDeAgenda.ts' && CHAMADA.test(readFileSync(c, 'utf8')))
      .sort();
    expect(chamam).toEqual([
      'src/pages/api/appointments/by-token/[token]/cancel.ts',
      'src/pages/api/appointments/by-token/[token]/reschedule.ts',
      'src/pages/api/appointments/index.ts',
    ]);
  });
});

describe('a tela da Equipe', () => {
  it('cada pessoa tem o liga-e-desliga, e o "Salvar" manda o que está marcado', () => {
    const tela = readFileSync('src/pages/admin/barbeiros.astro', 'utf8');
    expect(tela).toMatch(/<input data-edit-avisos=\{String\(b\.id\)\} type="checkbox" checked=\{b\.avisarAgendamentos\}/);
    expect(tela).toMatch(/body: JSON\.stringify\(\{ name, role, active, email, phone, avisarAgendamentos: avisosEl\.checked \}\)/);
    // E a linha diz, sem abrir o formulário, se a pessoa recebe.
    expect(tela).toMatch(/'Avisos de agendamento por e-mail desligados\.'/);
  });
});

describe.skipIf(!TEM_BANCO)('o aviso de agenda, pelas rotas do cliente', () => {
  let tokenDaAna = '';

  it('agendou com um barbeiro: ele e a dona recebem, um e-mail cada — ninguém mais', async () => {
    const r = await agendar(2, as(terca, '10:00'), 'aviso-chave-0001');
    expect(r.status).toBe(201);
    tokenDaAna = r.corpo.manageToken;
    expect(para()).toEqual(['ana@navalha.com', 'vera@navalha.com']);
    expect(caixaDeSaida[0].texto).toMatch(/^Olá, Ana\./);
    expect(caixaDeSaida[1].texto).toMatch(/^Olá, Vera\./);
  });

  it('o e-mail é o do agendamento gravado — e não leva nascimento nem o link de desmarcar', async () => {
    const r = await agendar(2, as(terca, '11:00'));
    const e = caixaDeSaida[0];
    expect(e.assunto).toBe(`Agendamento novo: Cliente Teste, ${quandoCurto(as(terca, '11:00'), TZ)}`);
    expect(e.texto).toContain('Corte — R$ 40');
    expect(e.texto).toContain(`/admin/dia/${terca}`);
    expect(e.texto).not.toMatch(/1990|20\/05/);
    expect(e.texto).not.toContain(r.corpo.manageToken);
  });

  it('a mesma chave de idempotência — o duplo clique — não avisa de novo', async () => {
    const r = await agendar(2, as(terca, '10:00'), 'aviso-chave-0001');
    expect(r.status).toBe(201);
    expect(r.corpo.criado).toBe(false);
    expect(caixaDeSaida).toHaveLength(0);
  });

  it('a dona que também atende recebe UM e-mail', async () => {
    await agendar(1, as(terca, '12:00'));
    expect(para()).toEqual(['vera@navalha.com']);
  });

  it('barbeiro sem e-mail: só a dona fica sabendo', async () => {
    await agendar(3, as(terca, '13:00'));
    expect(para()).toEqual(['vera@navalha.com']);
  });

  it('o mesmo e-mail em duas pessoas sai uma vez, com o nome de quem atende', async () => {
    await agendar(6, as(terca, '14:00'));
    expect(para()).toEqual(['vera@navalha.com']);
    expect(caixaDeSaida[0].texto).toMatch(/^Olá, Dani\./);
  });

  it('desmarcou pelo link: os dois recebem "Desmarcado" — e desmarcar de novo não avisa', async () => {
    const r = await porToken('cancel', tokenDaAna);
    expect(r.status).toBe(200);
    expect(para()).toEqual(['ana@navalha.com', 'vera@navalha.com']);
    expect(caixaDeSaida[0].assunto).toBe(`Desmarcado: Cliente Teste, ${quandoCurto(as(terca, '10:00'), TZ)}`);

    caixaDeSaida.length = 0;
    expect((await porToken('cancel', tokenDaAna)).status).toBe(409);
    expect(caixaDeSaida).toHaveLength(0);
  });

  it('cinco cliques ao mesmo tempo no "desmarcar": desmarca uma vez, avisa uma vez', async () => {
    const { corpo } = await agendar(2, as(terca, '15:00'));
    caixaDeSaida.length = 0;
    const respostas = await Promise.all(Array.from({ length: 5 }, () => porToken('cancel', corpo.manageToken)));
    expect(respostas.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(para()).toEqual(['ana@navalha.com', 'vera@navalha.com']);
  });

  it('remarcou pelo link: o horário de antes e o de agora, e o link para o dia novo', async () => {
    const { corpo } = await agendar(2, as(terca, '16:00'));
    caixaDeSaida.length = 0;
    const r = await porToken('reschedule', corpo.manageToken, { startsAt: as(quarta, '09:00') });
    expect(r.status).toBe(200);
    expect(para()).toEqual(['ana@navalha.com', 'vera@navalha.com']);
    const e = caixaDeSaida[0];
    expect(e.assunto).toBe(`Remarcado: Cliente Teste, ${quandoCurto(as(terca, '16:00'), TZ)} → ${quandoCurto(as(quarta, '09:00'), TZ)}`);
    expect(e.texto).toContain(`Era:   ${quandoPorExtenso(as(terca, '16:00'), TZ)}`);
    expect(e.texto).toContain(`/admin/dia/${quarta}`);

    caixaDeSaida.length = 0;
    // Remarcar para o mesmo horário não muda nada, e não avisa.
    expect((await porToken('reschedule', corpo.manageToken, { startsAt: as(quarta, '09:00') })).status).toBe(200);
    expect(caixaDeSaida).toHaveLength(0);
  });

  it('desligado pela dona na Equipe, não recebe; religado, volta', async () => {
    expect((await ligarAvisos(2, false)).status).toBe(200);
    expect((await sql`SELECT avisar_agendamentos FROM barbers WHERE id = 2`)[0].avisar_agendamentos).toBe(false);
    await agendar(2, as(terca, '17:00'));
    expect(para()).toEqual(['vera@navalha.com']);

    caixaDeSaida.length = 0;
    expect((await ligarAvisos(2, true)).status).toBe(200);
    await agendar(2, as(terca, '18:00'));
    expect(para()).toEqual(['ana@navalha.com', 'vera@navalha.com']);
  });

  it('o barbeiro não liga nem desliga — como o e-mail, é a dona quem cuida', async () => {
    expect((await ligarAvisos(2, false, cookieBarbeiro)).status).toBe(403);
    expect((await sql`SELECT avisar_agendamentos FROM barbers WHERE id = 2`)[0].avisar_agendamentos).toBe(true);
  });

  it('o e-mail que não sai não derruba nada — nem quando estoura antes de devolver a promessa', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [appt] = await sql`SELECT id FROM appointments WHERE tenant_id = 1 AND barber_id = 2 ORDER BY id DESC LIMIT 1`;
    const recusa = async () => { throw new Error('o provedor recusou'); };
    const estoura = () => { throw new Error('estourou antes'); };
    await expect(comTenant(NAVALHA, () => aviso.avisarMudancaNaAgenda({
      tenant: NAVALHA, tipo: 'novo', agendamentoId: appt.id, enviar: recusa,
    }))).resolves.toBe(2);
    await expect(comTenant(NAVALHA, () => aviso.avisarMudancaNaAgenda({
      tenant: NAVALHA, tipo: 'novo', agendamentoId: appt.id, enviar: estoura as never,
    }))).resolves.toBe(2);
    await vi.waitFor(() => expect(avisos.mock.calls.filter((c) => String(c[0]).startsWith('[agenda]'))).toHaveLength(4));
    avisos.mockRestore();
  });

  it('o agendamento de outra barbearia não avisa ninguém desta — e nem o de lá', async () => {
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                starts_at, ends_at, duration_minutes, price_cents, manage_token, created_by)
              VALUES (2, 7, 2, 'Cliente da Outra', '84990000009', ${as(terca, '10:00')}, ${as(terca, '10:30')},
                30, 3000, 'token-da-outra-barbearia-0001', 'customer')`;
    const [daOutra] = await sql`SELECT id FROM appointments WHERE tenant_id = 2`;
    const n = await comTenant(NAVALHA, () => aviso.avisarMudancaNaAgenda({ tenant: NAVALHA, tipo: 'novo', agendamentoId: daOutra.id }));
    expect(n).toBe(0);
    expect(caixaDeSaida).toHaveLength(0);
    // E pela parede da aplicação, sem o RLS: a conexão de dono enxerga tudo.
    expect(await aviso.avisarMudancaNaAgenda({ tenant: NAVALHA, tipo: 'novo', agendamentoId: daOutra.id })).toBe(0);
    expect(caixaDeSaida).toHaveLength(0);
  });
});
