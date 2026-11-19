// Promoções em horário ocioso, com banco: o painel, o agendamento e as duas paredes
// (`src/lib/promocoesDaBarbearia.ts`, `docs/PENDENCIAS-ABERTAS.md` §2.72).
//
// Duas barbearias em fusos diferentes — Fortaleza (UTC−3) e Manaus (UTC−4) —, com histórico
// gerado a partir do relógio DE VERDADE (nada de relógio parado: o painel lê o de verdade, e
// dado criado com a data de outro dia faria o teste passar hoje e falhar amanhã).
//
//  - "Um" (Fortaleza): todo dia das últimas 6 semanas, a manhã cheia (8 horários das 9h às
//    12h30) e um atendimento às 14h. A manhã não é ociosa; a tarde tem x = 1; o fim do dia, x = 0.
//  - "Dois" (Manaus): todo dia, um atendimento às 12h30 DE MANAUS — 13h30 em Fortaleza, 16h30
//    em UTC. É manhã só no fuso dela: contado em outro fuso, cairia na tarde, e os limites
//    das duas faixas se trocariam.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { diaDaSemana, somarDias } from '../src/lib/calendario';

process.env.SESSION_SECRET ??= 'segredo-de-teste-das-promocoes-com-mais-de-32-caracteres';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FORTALEZA = 'America/Fortaleza';
const MANAUS = 'America/Manaus';
const HOST_UM = 'promo-um.test';
const TARDE = 13 * 60;
const FIM = 17 * 60;

type Rota = (ctx: never) => Promise<Response>;
type Tenant = import('../src/lib/tenant').Tenant;

let sql: ReturnType<typeof postgres>;
let comTenant: typeof import('../src/db/index.js').comTenant;
let painelDePromocoes: typeof import('../src/lib/promocoesDaBarbearia.js').painelDePromocoes;
let rotas: Record<string, Record<string, Rota>> = {};
let um: Tenant;
let dois: Tenant;
const cookies: Record<string, string> = {};

// Os dias, cada um no fuso da sua barbearia.
const hojeUm = formatInTimeZone(new Date(), FORTALEZA, 'yyyy-MM-dd');
const hojeDois = formatInTimeZone(new Date(), MANAUS, 'yyyy-MM-dd');
const alvo = somarDias(hojeUm, 2);          // o dia dos agendamentos: dois dias à frente
const W = diaDaSemana(alvo);
const as = (dia: string, hora: string, fuso = FORTALEZA) => fromZonedTime(`${dia}T${hora}:00`, fuso).toISOString();

let n = 0;
function atendimentoAntigo(tenantId: number, barberId: number, serviceId: number, fuso: string, dia: string, hora: string) {
  n += 1;
  const inicio = fromZonedTime(`${dia}T${hora}:00`, fuso);
  return {
    tenant_id: tenantId, barber_id: barberId, service_id: serviceId,
    customer_name: 'Cliente antigo', customer_phone: `8498${String(n).padStart(7, '0')}`,
    starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    duration_minutes: 30, price_cents: 7000, status: 'completed', manage_token: `historico-${n}`,
  };
}

async function noPainel(tenant: Tenant, cookie: string, rota: Rota, metodo: string, corpo?: unknown, params: Record<string, string> = {}) {
  return comTenant(tenant, async () => {
    const r = await rota({
      request: new Request('http://painel.test/api/admin/promocoes', {
        method: metodo,
        headers: { cookie, 'content-type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      }),
      params,
    } as never);
    return { status: r.status, corpo: await r.json() as any };
  });
}

let ip = 0;
async function agendarCombo(startsAt: string, comboId = 1) {
  ip += 1;
  const endereco = `10.72.0.${ip}`;
  return comTenant(um, async () => {
    const r = await rotas.agendar.POST({
      request: new Request(`http://${HOST_UM}/api/appointments`, {
        method: 'POST',
        headers: { host: HOST_UM, 'content-type': 'application/json', 'x-forwarded-for': endereco },
        body: JSON.stringify({
          barberId: 1, serviceId: 1, comboId, startsAt,
          customerName: 'Cliente Novo', customerPhone: `849911${String(ip).padStart(5, '0')}`, customerBirthdate: '1990-05-20',
        }),
      }),
      clientAddress: endereco,
    } as never);
    return { status: r.status, corpo: await r.json() as any };
  });
}

async function remarcar(token: string, startsAt: string) {
  ip += 1;
  const endereco = `10.72.1.${ip}`;
  return comTenant(um, async () => {
    const r = await rotas.remarcar.POST({
      params: { token },
      request: new Request(`http://${HOST_UM}/api/appointments/by-token/${token}/reschedule`, {
        method: 'POST',
        headers: { host: HOST_UM, 'content-type': 'application/json', 'x-forwarded-for': endereco },
        body: JSON.stringify({ startsAt }),
      }),
      clientAddress: endereco,
    } as never);
    return { status: r.status, corpo: await r.json() as any };
  });
}

async function publico(tenant: Tenant, host: string, rota: Rota, caminho: string) {
  return comTenant(tenant, async () => {
    const r = await rota({ request: new Request(`http://${host}${caminho}`, { headers: { host } }) } as never);
    return { status: r.status, texto: await r.text() };
  });
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  await sql`INSERT INTO tenants (id, slug, business_name, status, timezone) VALUES
    (1, 'promo-um', 'Promo Um', 'active', ${FORTALEZA}),
    (2, 'promo-dois', 'Promo Dois', 'active', ${MANAUS})`;
  await sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
    (1, 'Promo Um', 'Um', '5584999990001', 'Rua A, 1', 'Mossoró/RN'),
    (2, 'Promo Dois', 'Dois', '5592999990002', 'Rua B, 2', 'Manaus/AM')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
    (1, 1, 'Dona Um', 'dona', 'admin', 'x', true, '84999990001'),
    (2, 1, 'Barbeiro Um', 'barbeiro', 'barber', 'x', true, '84999990002'),
    (3, 2, 'Dono Dois', 'dono', 'admin', 'x', true, '92999990003')`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
    (1, 1, 'Corte', 'corte', 7000, true),
    (2, 2, 'Corte', 'corte', 5000, true)`;
  await sql`INSERT INTO barber_services (tenant_id, barber_id, service_id, duration_minutes, active) VALUES
    (1, 1, 1, 30, true), (2, 3, 2, 30, true)`;
  for (let d = 0; d < 7; d++) {
    await sql`INSERT INTO working_hours (tenant_id, barber_id, weekday, start_time, end_time) VALUES
      (1, 1, ${d}, '09:00', '20:00'), (2, 3, ${d}, '09:00', '20:00')`;
  }
  await sql`INSERT INTO products (id, tenant_id, name, slug, price_cents, cost_cents, active) VALUES
    (1, 1, 'Pomada', 'pomada', 3000, 1000, true),
    (2, 1, 'Óleo', 'oleo', 2000, NULL, true),
    (3, 2, 'Pomada Dois', 'pomada-dois', 3000, 1500, true),
    (4, 2, 'Cera Dois', 'cera-dois', 2500, NULL, true)`;
  await sql`INSERT INTO combos (id, tenant_id, name, service_id, product_id, discount_pct, weekdays, active) VALUES
    (1, 1, 'Corte + Pomada', 1, 1, 10, 127, true),
    (2, 1, 'Corte + Óleo', 1, 2, 0, 127, true),
    (3, 2, 'Corte + Pomada Dois', 2, 3, 0, 127, true),
    (4, 2, 'Corte + Cera Dois', 2, 4, 0, 127, true)`;
  for (const seq of ['barbers', 'services', 'products', 'combos']) {
    await sql.unsafe(`SELECT setval('${seq}_id_seq', 50)`);
  }

  const historico = [];
  for (let k = 1; k <= 42; k++) {
    const diaUm = somarDias(hojeUm, -k);
    for (const hora of ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00']) {
      historico.push(atendimentoAntigo(1, 1, 1, FORTALEZA, diaUm, hora));
    }
    historico.push(atendimentoAntigo(2, 3, 2, MANAUS, somarDias(hojeDois, -k), '12:30'));
  }
  await sql`INSERT INTO appointments ${sql(historico)}`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookies.donaUm = valor(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
  cookies.barbeiroUm = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
  cookies.donoDois = valor(await makeSessionCookie({ barberId: 3, role: 'admin', tenantId: 2 }));

  const tenantLib = await import('../src/lib/tenant.js');
  await tenantLib.carregarTenants(true);
  um = tenantLib.tenantPorIdMesmoForaDoAr(1)!;
  dois = tenantLib.tenantPorIdMesmoForaDoAr(2)!;
  ({ comTenant } = await import('../src/db/index.js'));
  ({ painelDePromocoes } = await import('../src/lib/promocoesDaBarbearia.js'));
  rotas = {
    promocoes: await import('../src/pages/api/admin/promocoes/index.ts') as never,
    promocao: await import('../src/pages/api/admin/promocoes/[id].ts') as never,
    agendar: await import('../src/pages/api/appointments/index.ts') as never,
    remarcar: await import('../src/pages/api/appointments/by-token/[token]/reschedule.ts') as never,
    combos: await import('../src/pages/api/combos/index.ts') as never,
    produtos: await import('../src/pages/api/products/index.ts') as never,
    produtosDoPainel: await import('../src/pages/api/admin/products/index.ts') as never,
    configuracoes: await import('../src/pages/api/admin/settings.ts') as never,
  };
}, 120_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql?.end({ timeout: 5 });
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

/** As sugestões de um combo num dia, por faixa. */
const porFaixa = (sugestoes: any[], comboId: number, dia: number) =>
  Object.fromEntries(sugestoes.filter((s) => s.comboId === comboId && s.diaDaSemana === dia).map((s) => [s.faixa.chave, s]));

describe.skipIf(!TEM_BANCO)('as sugestões: a faixa ociosa e o desconto que mantém o lucro', () => {
  it('controle: o dia dos agendamentos está à frente, no fuso dela', () => {
    expect(alvo > hojeUm).toBe(true);
  });

  it('a barbearia Um: a manhã cheia não aparece; a tarde (x = 1) dá 72%; o fim do dia (x = 0) dá 90%', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET');
    expect(r.status).toBe(200);
    for (let dia = 0; dia < 7; dia++) {
      const f = porFaixa(r.corpo.sugestoes, 1, dia);
      expect(Object.keys(f).sort()).toEqual(['fim', 'tarde']);
      // P = 7000 + 3000, v = 1000, g = 4, x = 6 atendidos / 6 semanas:
      // 4 / (1 + 4) × 9000 / 10000 = 72%.
      expect(f.tarde).toMatchObject({
        semanas: 6, atendidos: 6, mediaDecimos: 10, ocupacaoPct: 13,
        precoCheioCents: 10000, custoCents: 1000, comboPct: 10,
        limiteDecimos: 720, limitePct: 72, bloqueio: null,
      });
      expect(f.fim).toMatchObject({ atendidos: 0, limiteDecimos: 900, limitePct: 90, bloqueio: null });
    }
  });

  it('o combo cujo produto não tem custo aparece bloqueado — sem v não há conta', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET');
    const doOleo = r.corpo.sugestoes.filter((s: any) => s.comboId === 2);
    expect(doOleo).toHaveLength(14);
    expect(doOleo.every((s: any) => s.bloqueio === 'sem-custo' && s.limitePct === null)).toBe(true);
    expect(r.corpo.produtosSemCusto).toEqual([{ id: 2, nome: 'Óleo' }]);
  });

  it('a barbearia Dois, em Manaus: o atendimento das 12h30 é manhã NO FUSO DELA', async () => {
    const r = await noPainel(dois, cookies.donoDois, rotas.promocoes.GET, 'GET');
    expect(r.status).toBe(200);
    const f = porFaixa(r.corpo.sugestoes, 3, W);
    // P = 8000, v = 1500: manhã com x = 1 → 4/5 × 6500/8000 = 65%; tarde e fim com x = 0 → 81,25%.
    expect(f.manha).toMatchObject({ atendidos: 6, limiteDecimos: 650, limitePct: 65 });
    expect(f.tarde).toMatchObject({ atendidos: 0, limiteDecimos: 813, limitePct: 81 });
    expect(f.fim).toMatchObject({ atendidos: 0, limiteDecimos: 813 });
  });

  it('uma barbearia não vê as sugestões, os combos nem o histórico da outra', async () => {
    const a = await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET');
    const b = await noPainel(dois, cookies.donoDois, rotas.promocoes.GET, 'GET');
    expect([...new Set(a.corpo.sugestoes.map((s: any) => s.comboId))].sort()).toEqual([1, 2]);
    expect([...new Set(b.corpo.sugestoes.map((s: any) => s.comboId))].sort()).toEqual([3, 4]);
    expect(JSON.stringify(b.corpo)).not.toMatch(/Pomada"|Óleo|Promo Um/);
  });

  it('a primeira parede: fora do RLS, na conexão do dono, a conta continua só da barbearia pedida', async () => {
    const p = await painelDePromocoes(um);
    expect([...new Set(p.sugestoes.map((s) => s.comboId))].sort()).toEqual([1, 2]);
    // O produto sem custo da outra barbearia não pode aparecer no aviso desta.
    expect(p.produtosSemCusto).toEqual([{ id: 2, nome: 'Óleo' }]);
    expect(porFaixa(p.sugestoes, 1, W).tarde).toMatchObject({ atendidos: 6, limitePct: 72 });
  });

  it('só o dono: o barbeiro leva 403, e sem sessão, 401', async () => {
    expect((await noPainel(um, cookies.barbeiroUm, rotas.promocoes.GET, 'GET')).status).toBe(403);
    expect((await noPainel(um, '', rotas.promocoes.GET, 'GET')).status).toBe(401);
  });
});

describe.skipIf(!TEM_BANCO)('ativar: só confirmado, só dentro do limite, uma por faixa', () => {
  const pedido = (extra: Record<string, unknown> = {}) => ({
    comboId: 1, diaDaSemana: W, faixa: 'tarde', descontoPct: 25, confirmacao: true, ...extra,
  });

  it('sem a confirmação no corpo, nada se ativa', async () => {
    const { confirmacao: _c, ...semConfirmar } = pedido();
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', semConfirmar);
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/confirme/i);
    expect((await sql`SELECT count(*)::int AS n FROM promocoes`)[0].n).toBe(0);
  });

  it('acima do limite, recusa — a tela limita, mas quem decide é o servidor', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ descontoPct: 73 }));
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/72%/);
  });

  it('no desconto que o combo já dá, ou abaixo, recusa: não mudaria o preço', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ descontoPct: 10 }));
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/já dá 10%/);
  });

  it('combo sem custo do produto: bloqueado, com o caminho para destravar', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ comboId: 2 }));
    expect(r.status).toBe(409);
    expect(r.corpo.error).toMatch(/custo de "Óleo"/);
  });

  it('o combo da outra barbearia não é sugestão desta', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ comboId: 3, faixa: 'manha' }));
    expect(r.status).toBe(409);
    expect((await sql`SELECT count(*)::int AS n FROM promocoes`)[0].n).toBe(0);
  });

  it('o barbeiro não ativa', async () => {
    expect((await noPainel(um, cookies.barbeiroUm, rotas.promocoes.POST, 'POST', pedido())).status).toBe(403);
  });

  it('ativa, com quem e quando — e a segunda igual é recusada', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido());
    expect(r.status).toBe(201);
    const [p] = await sql`SELECT * FROM promocoes WHERE id = ${r.corpo.id}`;
    expect(p).toMatchObject({
      tenant_id: 1, combo_id: 1, dia_da_semana: W, inicio_min: TARDE, fim_min: FIM, desconto_pct: 25, ativa: true, ativada_por: 1,
    });
    expect(p.ativada_em).not.toBeNull();

    const de_novo = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ descontoPct: 30 }));
    expect(de_novo.status).toBe(409);
  });

  it('dois pedidos ao mesmo tempo na mesma faixa: um ativa, o outro é recusado', async () => {
    const [a, b] = await Promise.all([
      noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ faixa: 'fim', descontoPct: 30 })),
      noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST', pedido({ faixa: 'fim', descontoPct: 30 })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const ativas = await sql`SELECT id FROM promocoes WHERE combo_id = 1 AND dia_da_semana = ${W} AND inicio_min = ${FIM} AND ativa`;
    expect(ativas).toHaveLength(1);
  });

  it('a ativa sai das sugestões e aparece na lista de ativas', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET');
    expect(porFaixa(r.corpo.sugestoes, 1, W)).toEqual({});
    expect(r.corpo.ativas.map((a: any) => [a.comboId, a.diaDaSemana, a.inicioMin, a.descontoPct, a.ativadaPorNome]))
      .toEqual([[1, W, TARDE, 25, 'Dona Um'], [1, W, FIM, 30, 'Dona Um']]);
    // A outra barbearia não vê.
    const b = await noPainel(dois, cookies.donoDois, rotas.promocoes.GET, 'GET');
    expect(b.corpo.ativas).toEqual([]);
  });
});

describe.skipIf(!TEM_BANCO)('o agendamento: o preço do horário, gravado na hora', () => {
  let tokenDaPromocao = '';

  it('na faixa da promoção: 25% no serviço e no produto, e a promoção fica gravada', async () => {
    const r = await agendarCombo(as(alvo, '14:00'));
    expect(r.status).toBe(201);
    expect(r.corpo.priceCents).toBe(5250);                // 7000 − 25%
    const [a] = await sql`SELECT id, promocao_id, notes, manage_token FROM appointments WHERE id = ${r.corpo.id}`;
    const [p] = await sql`SELECT id FROM promocoes WHERE combo_id = 1 AND inicio_min = ${TARDE} AND ativa`;
    expect(a.promocao_id).toBe(p.id);
    expect(a.notes).toMatch(/25% OFF aplicado .*promoção do horário/);
    const itens = await sql`SELECT price_cents FROM appointment_items WHERE appointment_id = ${a.id}`;
    expect(itens.map((i) => i.price_cents)).toEqual([2250]); // 3000 − 25%
    tokenDaPromocao = a.manage_token;
  });

  it('fora da faixa: o desconto do combo, e nenhuma promoção gravada', async () => {
    const r = await agendarCombo(as(alvo, '11:00'));
    expect(r.status).toBe(201);
    expect(r.corpo.priceCents).toBe(6300);                // 7000 − 10%
    const [a] = await sql`SELECT promocao_id FROM appointments WHERE id = ${r.corpo.id}`;
    expect(a.promocao_id).toBeNull();
  });

  it('não soma com o desconto do combo: com o combo em 40%, vale o combo', async () => {
    await sql`UPDATE combos SET discount_pct = 40 WHERE id = 1`;
    try {
      const r = await agendarCombo(as(alvo, '14:30'));
      expect(r.status).toBe(201);
      expect(r.corpo.priceCents).toBe(4200);              // 7000 − 40%, e não − 25% nem − 65%
      const [a] = await sql`SELECT promocao_id FROM appointments WHERE id = ${r.corpo.id}`;
      expect(a.promocao_id).toBeNull();
    } finally {
      await sql`UPDATE combos SET discount_pct = 10 WHERE id = 1`;
    }
  });

  it('o link do cliente remarca dentro da faixa, e recusa levar o desconto para fora dela', async () => {
    const dentro = await remarcar(tokenDaPromocao, as(alvo, '15:00'));
    expect(dentro.status).toBe(200);
    const fora = await remarcar(tokenDaPromocao, as(alvo, '11:30'));
    expect(fora.status).toBe(400);
    expect(fora.corpo.error).toMatch(/promoção vale só no horário dela/);
    const [a] = await sql`SELECT starts_at, price_cents FROM appointments WHERE manage_token = ${tokenDaPromocao}`;
    expect(a.starts_at).toBe(as(alvo, '15:00'));
    expect(a.price_cents).toBe(5250);
  });
});

describe.skipIf(!TEM_BANCO)('desativar', () => {
  let idDaTarde = 0;
  beforeAll(async () => {
    if (!TEM_BANCO) return;
    [{ id: idDaTarde }] = await sql`SELECT id FROM promocoes WHERE combo_id = 1 AND inicio_min = ${TARDE} AND ativa`;
  });

  it('a primeira parede: fora do RLS, a outra barbearia não desativa nem lê a promoção desta', async () => {
    const lib = await import('../src/lib/promocoesDaBarbearia.js');
    expect(await lib.desativarPromocao(2, idDaTarde)).toBe(false);
    expect(await lib.promocaoPorId(2, idDaTarde)).toBeNull();
    expect((await lib.promocoesAtivasDosCombos(2, [1])).size).toBe(0);
    expect((await sql`SELECT ativa FROM promocoes WHERE id = ${idDaTarde}`)[0].ativa).toBe(true);
  });

  it('a outra barbearia não desativa: 404, e a promoção continua ativa', async () => {
    const r = await noPainel(dois, cookies.donoDois, rotas.promocao.PATCH, 'PATCH', { ativa: false }, { id: String(idDaTarde) });
    expect(r.status).toBe(404);
    expect((await sql`SELECT ativa FROM promocoes WHERE id = ${idDaTarde}`)[0].ativa).toBe(true);
  });

  it('o barbeiro não desativa; e ativar por aqui não existe', async () => {
    expect((await noPainel(um, cookies.barbeiroUm, rotas.promocao.PATCH, 'PATCH', { ativa: false }, { id: String(idDaTarde) })).status).toBe(403);
    expect((await noPainel(um, cookies.donaUm, rotas.promocao.PATCH, 'PATCH', { ativa: true }, { id: String(idDaTarde) })).status).toBe(400);
  });

  it('o dono desativa: a linha fica, com a hora — e a segunda vez dá 404', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.promocao.PATCH, 'PATCH', { ativa: false }, { id: String(idDaTarde) });
    expect(r.status).toBe(200);
    const [p] = await sql`SELECT ativa, desativada_em FROM promocoes WHERE id = ${idDaTarde}`;
    expect(p.ativa).toBe(false);
    expect(p.desativada_em).not.toBeNull();
    expect((await noPainel(um, cookies.donaUm, rotas.promocao.PATCH, 'PATCH', { ativa: false }, { id: String(idDaTarde) })).status).toBe(404);
  });

  it('desativada, o horário volta ao preço do combo — e o agendamento feito antes não muda', async () => {
    const r = await agendarCombo(as(alvo, '16:00'));
    expect(r.status).toBe(201);
    expect(r.corpo.priceCents).toBe(6300);
    const [antes] = await sql`SELECT price_cents FROM appointments WHERE promocao_id = ${idDaTarde}`;
    expect(antes.price_cents).toBe(5250);
  });
});

describe.skipIf(!TEM_BANCO)('o g — clientes novos que uma promoção traz', () => {
  it('fora de 2 a 6, recusa em português', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 7 });
    expect(r.status).toBe(400);
    expect(r.corpo.error).toMatch(/de 2 a 6/);
  });

  it('com g = 6, o limite da tarde sobe: 6 / (1 + 6) × 90% = 77,1%', async () => {
    const r = await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 6 });
    expect(r.status).toBe(200);
    const p = await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET');
    expect(p.corpo.clientesNovos).toBe(6);
    const outroDia = (W + 1) % 7;
    expect(porFaixa(p.corpo.sugestoes, 1, outroDia).tarde).toMatchObject({ limiteDecimos: 771, limitePct: 77 });
  });
});

describe.skipIf(!TEM_BANCO)('sem 4 semanas com atendimento, não há sugestão', () => {
  it('a barbearia Dois com só 3 semanas de histórico: nenhuma sugestão, e o aviso de por quê', async () => {
    await sql`DELETE FROM appointments WHERE tenant_id = 2 AND starts_at < ${as(somarDias(hojeDois, -21), '00:00', MANAUS)}`;
    const r = await noPainel(dois, cookies.donoDois, rotas.promocoes.GET, 'GET');
    expect(r.status).toBe(200);
    expect(r.corpo.sugestoes).toEqual([]);
    expect(r.corpo.diasSemHistorico).toBe(14); // 7 dias × 2 combos
  });
});

describe.skipIf(!TEM_BANCO)('o custo do produto nunca sai do painel do dono', () => {
  it('o site: /api/combos manda a promoção (dia, faixa, desconto) e nada de custo', async () => {
    const r = await publico(um, HOST_UM, rotas.combos.GET, '/api/combos');
    expect(r.status).toBe(200);
    expect(r.texto).not.toMatch(/cost|custo/i);
    const combo = JSON.parse(r.texto).find((c: any) => c.id === 1);
    expect(combo.promocoes).toEqual([{ diaDaSemana: W, inicioMin: FIM, fimMin: 20 * 60, descontoPct: 30 }]);
  });

  it('o site: /api/products, nada de custo', async () => {
    const r = await publico(um, HOST_UM, rotas.produtos.GET, '/api/products');
    expect(r.status).toBe(200);
    expect(r.texto).not.toMatch(/cost|custo/i);
  });

  it('o painel do barbeiro: o GET de produtos responde a qualquer sessão, e sem o custo', async () => {
    const r = await noPainel(um, cookies.barbeiroUm, rotas.produtosDoPainel.GET, 'GET');
    expect(r.status).toBe(200);
    expect(r.corpo.length).toBeGreaterThan(0);
    expect(r.corpo.every((p: any) => !('costCents' in p))).toBe(true);
  });
});

describe.skipIf(!TEM_BANCO)('mudou o que entra na conta: a promoção ativa deixa de valer', () => {
  // O limite que o dono confirmou foi calculado com o preço e o custo daquele dia. Com outros, a
  // promoção venderia abaixo do lucro sem ninguém ter confirmado (revisão de 17/11/2026).
  const DIA = (W + 3) % 7;
  async function promocaoAtiva(comboId = 1): Promise<number> {
    const [p] = await sql`INSERT INTO promocoes (tenant_id, combo_id, dia_da_semana, inicio_min, fim_min, desconto_pct, ativa, ativada_por, ativada_em)
      VALUES (1, ${comboId}, ${DIA}, ${TARDE}, ${FIM}, 30, true, 1, now()) RETURNING id`;
    return p.id;
  }
  const ativa = async (id: number) => (await sql`SELECT ativa FROM promocoes WHERE id = ${id}`)[0].ativa;
  async function comFormulario(rota: Rota, metodo: string, campos: Record<string, string>, id: number) {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    return comTenant(um, async () => (await rota({
      request: new Request('http://painel.test/api/admin/x', { method: metodo, headers: { cookie: cookies.donaUm }, body: form }),
      params: { id: String(id) },
    } as never)).status);
  }
  let rotasDeEdicao: Record<string, Record<string, Rota>> = {};
  beforeAll(async () => {
    if (!TEM_BANCO) return;
    rotasDeEdicao = {
      produto: await import('../src/pages/api/admin/products/[id].ts') as never,
      combo: await import('../src/pages/api/admin/combos/[id].ts') as never,
      servico: await import('../src/pages/api/admin/services/[id].ts') as never,
    };
  });

  it('ocultar e mostrar o produto não mexe na conta: a promoção continua', async () => {
    const id = await promocaoAtiva();
    expect(await comFormulario(rotasDeEdicao.produto.PATCH, 'PATCH', { active: 'true' }, 1)).toBe(200);
    expect(await ativa(id)).toBe(true);
    await sql`UPDATE promocoes SET ativa = false, desativada_em = now() WHERE id = ${id}`;
  });

  it('o custo do produto mudou: desativada', async () => {
    const id = await promocaoAtiva();
    expect(await comFormulario(rotasDeEdicao.produto.PATCH, 'PATCH', { cost: '12,00' }, 1)).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect((await sql`SELECT cost_cents FROM products WHERE id = 1`)[0].cost_cents).toBe(1200);
  });

  it('o preço do produto mudou: desativada', async () => {
    const id = await promocaoAtiva();
    expect(await comFormulario(rotasDeEdicao.produto.PATCH, 'PATCH', { price: '35' }, 1)).toBe(200);
    expect(await ativa(id)).toBe(false);
  });

  it('o combo trocou de produto: desativada', async () => {
    const id = await promocaoAtiva();
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { productId: '2' }, 1)).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { productId: '1' }, 1)).toBe(200);
  });

  it('o preço do serviço mudou: desativada — e as promoções da outra barbearia não são tocadas', async () => {
    const [deDois] = await sql`INSERT INTO promocoes (tenant_id, combo_id, dia_da_semana, inicio_min, fim_min, desconto_pct, ativa, ativada_por, ativada_em)
      VALUES (2, 3, ${DIA}, ${TARDE}, ${FIM}, 30, true, 3, now()) RETURNING id`;
    const id = await promocaoAtiva();
    const r = await comTenant(um, async () => (await rotasDeEdicao.servico.PUT({
      request: new Request('http://painel.test/api/admin/services/1', {
        method: 'PUT', headers: { cookie: cookies.donaUm, 'content-type': 'application/json' }, body: JSON.stringify({ priceCents: 7500 }),
      }),
      params: { id: '1' },
    } as never)).status);
    expect(r).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect(await ativa(deDois.id)).toBe(true);
  });

  it('o combo apagado leva as promoções; o agendamento feito com uma remarca no mesmo dia, com o preço de antes', async () => {
    await sql`INSERT INTO combos (id, tenant_id, name, service_id, product_id, discount_pct, weekdays, active)
              VALUES (5, 1, 'Combo que vai sumir', 1, 1, 0, 127, true)`;
    await sql`INSERT INTO promocoes (tenant_id, combo_id, dia_da_semana, inicio_min, fim_min, desconto_pct, ativa, ativada_por, ativada_em)
              VALUES (1, 5, ${W}, ${TARDE}, ${FIM}, 20, true, 1, now())`;
    const r = await agendarCombo(as(alvo, '13:00'), 5);
    expect(r.status).toBe(201);
    const [a] = await sql`SELECT manage_token, price_cents, promocao_id FROM appointments WHERE id = ${r.corpo.id}`;
    expect(a.promocao_id).not.toBeNull();

    expect(await comFormulario(rotasDeEdicao.combo.DELETE, 'DELETE', {}, 5)).toBe(200);
    expect(await sql`SELECT id FROM promocoes WHERE combo_id = 5`).toHaveLength(0);

    const remarcado = await remarcar(a.manage_token, as(alvo, '13:30'));
    expect(remarcado.status).toBe(200);
    expect((await sql`SELECT price_cents FROM appointments WHERE manage_token = ${a.manage_token}`)[0].price_cents).toBe(a.price_cents);
  });

  // ── 19/11/2026: o que a varredura achou ──

  it('o desconto do combo mudou: desativada — o painel mostrava o preço dela e o site cobrava o do combo', async () => {
    const id = await promocaoAtiva();
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { discountPct: '35' }, 1)).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { discountPct: '10' }, 1)).toBe(200);
  });

  it('os dias do combo mudaram: desativada; o mesmo desconto e os mesmos dias, não', async () => {
    const [{ weekdays, discount_pct }] = await sql`SELECT weekdays, discount_pct FROM combos WHERE id = 1`;
    const id = await promocaoAtiva();
    // Reenviar o que já está gravado não muda a conta.
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { discountPct: String(discount_pct), weekdays: String(weekdays) }, 1)).toBe(200);
    expect(await ativa(id)).toBe(true);
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { weekdays: String(weekdays & ~(1 << DIA)) }, 1)).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect(await comFormulario(rotasDeEdicao.combo.PATCH, 'PATCH', { weekdays: String(weekdays) }, 1)).toBe(200);
  });

  it('menos clientes novos: as ativas desta barbearia saem; mais clientes, ou o mesmo, não — e a outra barbearia não é tocada', async () => {
    const [deDois] = await sql`INSERT INTO promocoes (tenant_id, combo_id, dia_da_semana, inicio_min, fim_min, desconto_pct, ativa, ativada_por, ativada_em)
      VALUES (2, 3, ${(DIA + 1) % 7}, ${TARDE}, ${FIM}, 30, true, 3, now()) RETURNING id`;
    await sql`UPDATE settings SET promo_clientes_novos = 4 WHERE tenant_id = 1`;
    const id = await promocaoAtiva();
    const g = async (n: number) => (await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: n })).status;
    expect(await g(4)).toBe(200);
    expect(await g(5)).toBe(200);
    expect(await ativa(id)).toBe(true);
    expect(await g(3)).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect(await ativa(deDois.id)).toBe(true);
    expect(await g(4)).toBe(200);
  });

  it('menos clientes novos com a desativação falhando: nada fica gravado pela metade, e a tela e o banco concordam', async () => {
    await sql`UPDATE settings SET promo_clientes_novos = 4 WHERE tenant_id = 1`;
    await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 4 }); // o cache com 4
    const id = await promocaoAtiva();
    await sql`CREATE FUNCTION recusar_desativar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'o banco caiu'; END $$`;
    await sql`CREATE TRIGGER recusar_desativar BEFORE UPDATE ON promocoes FOR EACH ROW EXECUTE FUNCTION recusar_desativar()`;
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    let r: Awaited<ReturnType<typeof noPainel>>;
    try {
      r = await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 2 });
    } finally {
      erro.mockRestore();
      await sql`DROP TRIGGER recusar_desativar ON promocoes`;
      await sql`DROP FUNCTION recusar_desativar()`;
    }
    expect(r.status).toBe(500);
    // O g menor não ficou: a transação desfez. Salvar de novo pega a promoção.
    expect((await sql`SELECT promo_clientes_novos AS g FROM settings WHERE tenant_id = 1`)[0].g).toBe(4);
    expect(await ativa(id)).toBe(true);
    expect((await noPainel(um, cookies.donaUm, rotas.promocoes.GET, 'GET')).corpo.clientesNovos).toBe(4);
    expect((await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 2 })).status).toBe(200);
    expect(await ativa(id)).toBe(false);
    expect((await noPainel(um, cookies.donaUm, rotas.configuracoes.PATCH, 'PATCH', { promoClientesNovos: 4 })).status).toBe(200);
  });

  it('o custo mudou enquanto a promoção era ativada: ela sai na hora, com 409 — a conta era a de antes', async () => {
    // A outra aba, simulada pelo banco: logo depois do INSERT da promoção, o custo do produto muda.
    await sql`CREATE FUNCTION mudar_custo_no_meio() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE products SET cost_cents = cost_cents + 500 WHERE id = 1 AND tenant_id = 1; RETURN NEW; END $$`;
    await sql`CREATE TRIGGER mudar_custo_no_meio AFTER INSERT ON promocoes FOR EACH ROW EXECUTE FUNCTION mudar_custo_no_meio()`;
    let r: Awaited<ReturnType<typeof noPainel>>;
    try {
      r = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST',
        { comboId: 1, diaDaSemana: DIA, faixa: 'tarde', descontoPct: 11, confirmacao: true });
    } finally {
      await sql`DROP TRIGGER mudar_custo_no_meio ON promocoes`;
      await sql`DROP FUNCTION mudar_custo_no_meio()`;
    }
    expect(r.status).toBe(409);
    expect(r.corpo.error).toMatch(/mudou enquanto a promoção era ativada/);
    expect(await sql`SELECT id FROM promocoes WHERE combo_id = 1 AND dia_da_semana = ${DIA} AND inicio_min = ${TARDE} AND ativa`).toHaveLength(0);
    // Controle: sem a mudança no meio, a mesma ativação passa.
    const ok = await noPainel(um, cookies.donaUm, rotas.promocoes.POST, 'POST',
      { comboId: 1, diaDaSemana: DIA, faixa: 'tarde', descontoPct: 11, confirmacao: true });
    expect(ok.status).toBe(201);
  });
});
