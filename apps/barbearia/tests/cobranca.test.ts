// A cobrança pela Asaas: o Checkout, o webhook e o cancelar (`src/lib/cobranca.ts`).
//
// ── O QUE ISTO IMPEDE ────────────────────────────────────────────────────────
//
// O webhook é a única coisa que muda o status de uma barbearia sozinho — e cada
// defeito dele é dinheiro ou site fora do ar de alguém:
//
//  - webhook aberto: qualquer um marca qualquer barbearia como paga;
//  - evento repetido processado de novo: a Asaas entrega "pelo menos uma vez";
//  - evento de uma barbearia mexendo em outra;
//  - a cobrança vencida de uma assinatura ANTIGA — removida quando o dono trocou
//    de cartão — atrasando quem já está em dia;
//  - pagamento desfazendo a suspensão que você fez à mão;
//  - estorno reativando ou desligando sozinho.
//
// E do Checkout: o número do cartão nunca passa por aqui, a primeira cobrança é
// no dia seguinte ao fim do teste, e a chave da Asaas não aparece em lugar nenhum.
//
// A Asaas daqui é de mentira (`fetch` trocado). Os eventos seguem os exemplos da
// documentação de 10/10/2026 — o sandbox de verdade ainda não foi testado
// (`docs/PENDENCIAS-ABERTAS.md` §4.14).
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { fimDaCarencia, situacaoDe, type Situacao } from '../src/lib/situacao';
import { TZ } from '../src/lib/timezone';
import {
  CHECKOUTS_GUARDADOS, dataDaPrimeiraCobranca, erroDefinitivo, fimDoPeriodoPago, podeCadastrarCartao, referenciaDaBarbearia,
} from '../src/lib/cobranca';
import { configDaAsaas } from '../src/lib/asaas';
import { tokenConfere } from '../src/pages/api/asaas/webhook';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const DIA = 24 * 60 * 60 * 1000;
const diaNoFuso = (d: Date) => formatInTimeZone(d, TZ, 'yyyy-MM-dd');
const meiaNoite = (dia: string) => fromZonedTime(`${dia}T00:00:00`, TZ);

// ── A Asaas de mentira ──────────────────────────────────────────────────────

interface Chamada { metodo: string; caminho: string; corpo: unknown; cabecalhos: Record<string, string> }
let chamadas: Chamada[] = [];
let responder: (c: Chamada) => { status?: number; corpo?: unknown } = () => ({ corpo: {} });

function ligarAsaasDeMentira(): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const c: Chamada = {
      metodo: init?.method ?? 'GET',
      caminho: u.pathname.replace(/^\/v3/, '') + u.search,
      corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      cabecalhos: Object.fromEntries(new Headers(init?.headers).entries()),
    };
    chamadas.push(c);
    const r = responder(c);
    return new Response(r.corpo === undefined ? '' : JSON.stringify(r.corpo), {
      status: r.status ?? 200, headers: { 'content-type': 'application/json' },
    });
  }));
}

const AMBIENTE = {
  ASAAS_API_KEY: 'chave-de-teste-que-nunca-pode-vazar',
  ASAAS_URL: 'http://asaas.de.mentira/v3',
  ASAAS_WEBHOOK_TOKEN: 'token-do-webhook-de-teste',
};

// ── Sem banco: as regras ────────────────────────────────────────────────────

describe('quem pode ir ao Checkout', () => {
  const agora = new Date('2026-10-10T15:00:00Z');
  const casos: [string, Situacao, boolean][] = [
    ['no teste', { fase: 'teste', ate: new Date(agora.getTime() + 3 * DIA) }, true],
    ['na carência do teste', { fase: 'carencia', motivo: 'teste', ate: agora }, true],
    ['na carência da cobrança', { fase: 'carencia', motivo: 'cobranca', ate: agora }, true],
    ['fora do ar por falta de pagamento', { fase: 'suspensa', motivo: 'cobranca', desde: agora }, true],
    ['fora do ar depois de cancelar', { fase: 'suspensa', motivo: 'cancelada', desde: agora }, true],
    ['cancelou e ainda está no período pago — reativa', { fase: 'ativa', encerraEm: new Date(agora.getTime() + DIA) }, true],
    ['em dia — já tem cartão', { fase: 'ativa' }, false],
    ['tirada do ar à mão', { fase: 'suspensa', motivo: 'manual', desde: null }, false],
    ['encerrada', { fase: 'cancelada' }, false],
  ];
  for (const [nome, s, esperado] of casos) {
    it(nome, () => expect(podeCadastrarCartao(s)).toBe(esperado));
  }
});

describe('o dia da primeira cobrança', () => {
  const agora = new Date('2026-10-10T15:00:00Z');

  it('no teste: o dia seguinte ao último dia do teste — nada é cobrado antes', () => {
    // Teste até o fim de 15/10: `ate` é a meia-noite que começa o dia 16, no fuso.
    const ate = meiaNoite('2026-10-16');
    expect(dataDaPrimeiraCobranca({ fase: 'teste', ate }, agora)).toBe('2026-10-16');
  });

  it('cancelou e ainda está no período pago: o dia em que ele acaba — o mesmo mês não é cobrado duas vezes', () => {
    const encerraEm = meiaNoite('2026-11-03');
    expect(dataDaPrimeiraCobranca({ fase: 'ativa', encerraEm }, agora)).toBe('2026-11-03');
  });

  it('na carência, fora do ar e com a cobrança atrasada: hoje, no fuso da barbearia', () => {
    for (const s of [
      { fase: 'carencia', motivo: 'teste', ate: agora },
      { fase: 'suspensa', motivo: 'cobranca', desde: agora },
      { fase: 'suspensa', motivo: 'cancelada', desde: agora },
    ] as Situacao[]) {
      expect(dataDaPrimeiraCobranca(s, agora)).toBe(diaNoFuso(agora));
    }
  });

  it('o dia é o do fuso, não o do servidor: 23h de Fortaleza já é amanhã em UTC', () => {
    const noite = fromZonedTime('2026-10-10T23:30:00', TZ);
    expect(dataDaPrimeiraCobranca({ fase: 'carencia', motivo: 'teste', ate: noite }, noite)).toBe('2026-10-10');
  });
});

describe('o fim do período pago', () => {
  const agora = new Date('2026-10-10T15:00:00Z');
  it('a meia-noite, no fuso, do dia da próxima cobrança', () => {
    expect(fimDoPeriodoPago('2026-11-10', agora).toISOString()).toBe(meiaNoite('2026-11-10').toISOString());
  });
  it('sem data, com a data no passado ou com lixo: agora', () => {
    for (const v of [undefined, null, '', '2026-01-01', 'amanhã']) {
      expect(fimDoPeriodoPago(v as string | null | undefined, agora).getTime(), String(v)).toBe(agora.getTime());
    }
  });
});

describe('a situação de quem cancelou', () => {
  const encerraEm = meiaNoite('2026-11-10');
  it('antes do fim do período pago: em dia, com a data de saída', () => {
    expect(situacaoDe({ status: 'active', encerraEm }, new Date(encerraEm.getTime() - 1000)))
      .toEqual({ fase: 'ativa', encerraEm });
  });
  it('depois: fora do ar, sem carência — foi escolha dele', () => {
    expect(situacaoDe({ status: 'active', encerraEm }, encerraEm))
      .toEqual({ fase: 'suspensa', motivo: 'cancelada', desde: encerraEm });
  });
  it('sem data de saída, em dia como sempre', () => {
    expect(situacaoDe({ status: 'active', encerraEm: null })).toEqual({ fase: 'ativa' });
  });
});

describe('a configuração da Asaas', () => {
  it('sem chave, a cobrança está desligada', () => {
    expect(configDaAsaas({})).toBeNull();
    expect(configDaAsaas({ ASAAS_API_KEY: '   ' })).toBeNull();
  });
  it('⚠️ sem ASAAS_AMBIENTE=producao é sandbox — a variável esquecida não cobra ninguém', () => {
    expect(configDaAsaas({ ASAAS_API_KEY: 'x' })?.url).toBe('https://api-sandbox.asaas.com/v3');
    expect(configDaAsaas({ ASAAS_API_KEY: 'x', ASAAS_AMBIENTE: 'prod' })?.ambiente).toBe('sandbox');
    expect(configDaAsaas({ ASAAS_API_KEY: 'x', ASAAS_AMBIENTE: 'producao' })?.url).toBe('https://api.asaas.com/v3');
  });
});

describe('o token do webhook', () => {
  it('confere só o igual, e nunca sem token configurado', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abd', 'abc')).toBe(false);
    expect(tokenConfere('', 'abc')).toBe(false);
    expect(tokenConfere(null, 'abc')).toBe(false);
    expect(tokenConfere('abc', undefined)).toBe(false);
    expect(tokenConfere('', '')).toBe(false);
  });
});

describe('o erro que não volta para a fila da Asaas', () => {
  it('dado em conflito (23) e dado que o banco recusa (22): é do evento, e se repetiria em toda reentrega — não volta', () => {
    for (const code of ['23505', '23503', '23514', '22P02', '22P05', '22007']) expect(erroDefinitivo({ code })).toBe(true);
  });

  it('o resto volta: concorrência, conexão — e erro de programa, que quebraria todos os eventos iguais', () => {
    for (const code of ['40001', '40P01', '08006', '57P01', '53300', '42703', '42P01', '42501', 'ECONNREFUSED', 'CONNECTION_CLOSED']) {
      expect(erroDefinitivo({ code })).toBe(false);
    }
    expect(erroDefinitivo(new TypeError('x is undefined'))).toBe(false);
    expect(erroDefinitivo(null)).toBe(false);
    expect(erroDefinitivo(undefined)).toBe(false);
  });
});

describe('o middleware deixa passar o que a cobrança precisa — e só isso', () => {
  const fonte = readFileSync('src/middleware.ts', 'utf8');
  it('o webhook passa antes de decidir a barbearia, mas DEPOIS da conferência da origem', () => {
    const corpo = fonte.slice(fonte.indexOf('export const onRequest'));
    expect(corpo.indexOf("caminho.startsWith('/api/asaas/')")).toBeGreaterThan(corpo.indexOf('motivoDaRecusa('));
    expect(corpo.indexOf("caminho.startsWith('/api/asaas/')")).toBeLessThan(corpo.indexOf('tenantDaRequisicao('));
  });
  it('fora do ar, abre a tela de assinatura, o botão do cartão, o cancelar e os dados em planilha — e nada mais', () => {
    // O cancelar também: fora do ar pela cobrança, a assinatura segue viva na Asaas.
    // E, desde 11/10/2026, as duas rotas da exportação (`lib/exportacao.ts`): quem
    // saiu leva a lista de clientes. O conjunto delas é conferido em
    // `tests/exportacao.test.ts` — são as duas, e só elas.
    expect(fonte).toMatch(/if \(caminho === TELA_DE_ASSINATURA \|\| caminho === ROTA_DO_CARTAO \|\| caminho === ROTA_DO_CANCELAMENTO\s*\|\|\s*ROTAS_DA_EXPORTACAO\.has\(caminho\)\) \{\s*return servirComTenant/);
    expect(fonte.split('servirComTenant(fora.tenant').length - 1).toBe(1);
  });
});

// ── Com banco: o webhook ────────────────────────────────────────────────────

let conn: ReturnType<typeof postgres>;
let sqlConnDoApp: { end: (o?: { timeout?: number }) => Promise<void> };
let carregarTenants: (forcar?: boolean) => Promise<void>;
let tenantDoHost: (r: Request) => { id: number } | null;
let tenantSuspensoDoHost: (h: string | null) => { id: number } | null;
let WEBHOOK: (ctx: { request: Request }) => Promise<Response>;
let CARTAO: (ctx: { request: Request }) => Promise<Response>;
let CANCELAR: (ctx: { request: Request }) => Promise<Response>;
let makeSessionCookie: (d: { barberId: number; role: 'admin' | 'barber'; tenantId: number }) => Promise<string>;

const ambienteAntes: Record<string, string | undefined> = {};

beforeAll(async () => {
  if (!TEM_BANCO) return;
  for (const [k, v] of Object.entries(AMBIENTE)) { ambienteAntes[k] = process.env[k]; process.env[k] = v; }
  conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);
  const daqui7 = new Date(Date.now() + 7 * DIA);
  const ha20 = new Date(Date.now() - 20 * DIA);
  const ha10 = new Date(Date.now() - 10 * DIA);
  const agora = new Date();
  await conn`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, past_due_since, asaas_customer_id, asaas_subscription_id, asaas_checkout_ids) VALUES
    (1,  'ze',       'Cortes do Zé',      'trial',     ${daqui7}, NULL,      NULL,         NULL,         '{chk_ze}'),
    (2,  'vintage',  'Barbearia Vintage', 'trial',     ${daqui7}, NULL,      NULL,         NULL,         '{chk_vintage}'),
    (3,  'manual',   'Tirada à Mão',      'suspended', NULL,      NULL,      'cus_manual', 'sub_manual', '{}'),
    (4,  'novo',     'Barbearia Nova',    'trial',     ${daqui7}, NULL,      NULL,         NULL,         '{}'),
    (5,  'antigo',   'Cliente Antigo',    'trial',     ${daqui7}, NULL,      'cus_antigo', NULL,         '{}'),
    (6,  'vencido',  'Teste Vencido',     'trial',     ${ha20},   NULL,      NULL,         NULL,         '{}'),
    (7,  'emdia',    'Em Dia',            'active',    NULL,      NULL,      'cus_emdia',  'sub_emdia',  '{}'),
    (8,  'atrasado', 'Atrasado',          'past_due',  NULL,      ${agora},  'cus_atr',    'sub_atr',    '{}'),
    (9,  'dono-a',   'Do Mesmo Dono A',   'trial',     ${daqui7}, NULL,      NULL,         NULL,         '{chk_a}'),
    (10, 'dono-b',   'Do Mesmo Dono B',   'trial',     ${daqui7}, NULL,      NULL,         NULL,         '{chk_b}'),
    (11, 'fora',     'Fora pela Cobrança', 'past_due', NULL,      ${ha10},   'cus_fora',   'sub_fora',   '{}')`;
  await conn`SELECT setval('tenants_id_seq', 20)`;
  // Um dono por barbearia, e um barbeiro comum na 4.
  await conn`INSERT INTO barbers (tenant_id, id, name, slug, role, password_hash, active, phone, email) VALUES
    (4, 40, 'Dono Novo',    'dono', 'admin',  'x', true, '84990000040', 'dono@novo.com.br'),
    (4, 41, 'Barbeiro',     'barb', 'barber', 'x', true, '84990000041', NULL),
    (5, 50, 'Dono Antigo',  'dono', 'admin',  'x', true, '84990000050', 'dono@antigo.com.br'),
    (6, 60, 'Dono Vencido', 'dono', 'admin',  'x', true, '84990000060', NULL),
    (7, 70, 'Dono Em Dia',  'dono', 'admin',  'x', true, '84990000070', NULL),
    (8, 80, 'Dono Atraso',  'dono', 'admin',  'x', true, '84990000080', NULL),
    (3, 30, 'Dono Manual',  'dono', 'admin',  'x', true, '84990000030', NULL),
    (11, 110, 'Dono Fora',  'dono', 'admin',  'x', true, '84990000110', NULL)`;

  ({ POST: WEBHOOK } = await import('../src/pages/api/asaas/webhook.js') as never);
  ({ POST: CARTAO } = await import('../src/pages/api/admin/assinatura/cartao.js') as never);
  ({ POST: CANCELAR } = await import('../src/pages/api/admin/assinatura/cancelar.js') as never);
  ({ makeSessionCookie } = await import('../src/lib/session.js') as never);
  const tenant = await import('../src/lib/tenant.js');
  carregarTenants = tenant.carregarTenants;
  tenantDoHost = tenant.tenantDoHost as never;
  tenantSuspensoDoHost = tenant.tenantSuspensoDoHost as never;
  await carregarTenants(true);
  ({ sqlConn: sqlConnDoApp } = await import('../src/db/index.js') as never);
}, 60_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  for (const [k, v] of Object.entries(ambienteAntes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await conn?.end({ timeout: 5 });
  await sqlConnDoApp?.end({ timeout: 5 });
});

beforeEach(() => {
  chamadas = [];
  responder = () => ({ corpo: {} });
  ligarAsaasDeMentira();
});
afterEach(() => { vi.unstubAllGlobals(); });

async function enviar(evento: Record<string, unknown>, token: string | null = AMBIENTE.ASAAS_WEBHOOK_TOKEN) {
  const r = await WEBHOOK({
    request: new Request('https://painel.fadeline.com.br/api/asaas/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token === null ? {} : { 'asaas-access-token': token }) },
      body: JSON.stringify(evento),
    }),
  });
  return { status: r.status, corpo: await r.json() as Record<string, unknown> };
}

async function linha(id: number) {
  const [t] = await conn`
    SELECT status, past_due_since, subscription_ends_at, asaas_customer_id, asaas_subscription_id, asaas_checkout_ids
    FROM tenants WHERE id = ${id}`;
  return t;
}

async function desfecho(eventoId: string) {
  const [e] = await conn`SELECT tenant_id, outcome FROM webhook_events WHERE gateway_event_id = ${eventoId}`;
  return e;
}

describe.skipIf(!TEM_BANCO)('o webhook só aceita a Asaas', () => {
  it('sem ASAAS_WEBHOOK_TOKEN configurado, recusa tudo — webhook aberto seria qualquer um pagando qualquer barbearia', async () => {
    const antes = process.env.ASAAS_WEBHOOK_TOKEN;
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    try {
      const r = await enviar({ id: 'evt_sem_token', event: 'CHECKOUT_PAID', checkout: { id: 'chk_ze' } }, 'qualquer');
      expect(r.status).toBe(503);
    } finally {
      process.env.ASAAS_WEBHOOK_TOKEN = antes;
    }
    expect(await desfecho('evt_sem_token')).toBeUndefined();
  });

  it('token errado ou ausente: 401, e nada é gravado', async () => {
    expect((await enviar({ id: 'evt_falso', event: 'CHECKOUT_PAID', checkout: { id: 'chk_ze' } }, 'chute')).status).toBe(401);
    expect((await enviar({ id: 'evt_falso', event: 'CHECKOUT_PAID', checkout: { id: 'chk_ze' } }, null)).status).toBe(401);
    expect(await desfecho('evt_falso')).toBeUndefined();
    expect((await linha(1)).status).toBe('trial');
  });

  it('evento sem id ou sem tipo: 400', async () => {
    expect((await enviar({ event: 'CHECKOUT_PAID' })).status).toBe(400);
    expect((await enviar({ id: 'evt_x' })).status).toBe(400);
  });
});

describe.skipIf(!TEM_BANCO)('o webhook mantém a barbearia em dia', () => {
  it('CHECKOUT_PAID: a barbearia DO Checkout fica em dia, guarda o cliente e desliga as notificações dele — a outra não muda', async () => {
    const r = await enviar({ id: 'evt_1', event: 'CHECKOUT_PAID', checkout: { id: 'chk_ze', customer: 'cus_ze', status: 'PAID' } });
    expect(r).toEqual({ status: 200, corpo: { ok: true } });
    expect(await linha(1)).toMatchObject({ status: 'active', asaas_customer_id: 'cus_ze', past_due_since: null });
    expect((await linha(2)).status).toBe('trial');
    expect(await desfecho('evt_1')).toMatchObject({ tenant_id: 1, outcome: 'em dia: o cartão foi cadastrado' });
    await vi.waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0]).toMatchObject({ metodo: 'PUT', caminho: '/customers/cus_ze', corpo: { notificationDisabled: true } });
    expect(chamadas[0].cabecalhos.access_token).toBe(AMBIENTE.ASAAS_API_KEY);
    expect(chamadas[0].cabecalhos['user-agent']).toMatch(/^Fadeline\//);
  });

  it('o mesmo evento de novo: 200, e nada acontece duas vezes', async () => {
    const r = await enviar({ id: 'evt_1', event: 'CHECKOUT_PAID', checkout: { id: 'chk_ze', customer: 'cus_ze' } });
    expect(r).toEqual({ status: 200, corpo: { ok: true, duplicado: true } });
    const [{ n }] = await conn`SELECT count(*)::int AS n FROM webhook_events WHERE gateway_event_id = 'evt_1'`;
    expect(n).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chamadas).toHaveLength(0);
  });

  it('SUBSCRIPTION_CREATED, achado pelo cliente: liga a assinatura à barbearia', async () => {
    await enviar({ id: 'evt_2', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_ze_1', customer: 'cus_ze', nextDueDate: '2026-12-01' } });
    expect((await linha(1)).asaas_subscription_id).toBe('sub_ze_1');
    expect(chamadas).toHaveLength(0); // não havia assinatura antes: nada a remover
  });

  it('a cobrança que falha atrasa desde a PRIMEIRA falha; a paga põe em dia', async () => {
    await enviar({ id: 'evt_3', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_1', customer: 'cus_ze', subscription: 'sub_ze_1' } });
    const atrasada = await linha(1);
    expect(atrasada.status).toBe('past_due');
    expect(Date.now() - atrasada.past_due_since.getTime()).toBeLessThan(60_000);

    await enviar({ id: 'evt_4', event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', payment: { id: 'pay_1', customer: 'cus_ze', subscription: 'sub_ze_1' } });
    expect((await linha(1)).past_due_since.getTime()).toBe(atrasada.past_due_since.getTime());

    await enviar({ id: 'evt_5', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', customer: 'cus_ze', subscription: 'sub_ze_1' } });
    expect(await linha(1)).toMatchObject({ status: 'active', past_due_since: null });
  });

  it('cartão trocado: a assinatura nova entra, a antiga é removida na Asaas — e um evento atrasado da antiga não atrasa ninguém', async () => {
    responder = (c) => ({ corpo: c.metodo === 'GET' ? { id: 'sub_ze_1', status: 'ACTIVE', deleted: false } : { deleted: true } });
    await enviar({ id: 'evt_6', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_ze_2', customer: 'cus_ze' } });
    expect((await linha(1)).asaas_subscription_id).toBe('sub_ze_2');
    await vi.waitFor(() => expect(chamadas).toHaveLength(2));
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /subscriptions/sub_ze_1', 'DELETE /subscriptions/sub_ze_1']);

    await enviar({ id: 'evt_7', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_velho', customer: 'cus_ze', subscription: 'sub_ze_1' } });
    expect((await linha(1)).status).toBe('active');
    expect((await desfecho('evt_7')).outcome).toMatch(/não é mais a desta barbearia/);
  });

  it('a assinatura antiga que já foi removida — quem cancelou e assinou de novo — não é removida outra vez, nem gera alarme', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    responder = (c) => (c.caminho === '/subscriptions/sub_v1' ? { corpo: { id: 'sub_v1', deleted: true } } : { status: 404, corpo: { errors: [{ code: 'not_found' }] } });
    await conn`UPDATE tenants SET asaas_subscription_id = 'sub_v1' WHERE id = 2`;
    await enviar({ id: 'evt_v2', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_v2', customer: 'cus_v', externalReference: 'barbearia:2' } });
    await enviar({ id: 'evt_v3', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_v3', customer: 'cus_v', externalReference: 'barbearia:2' } });
    await vi.waitFor(() => expect(chamadas).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Removida (deleted) ou que a Asaas nem acha (404): só a leitura, nenhum DELETE.
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /subscriptions/sub_v1', 'GET /subscriptions/sub_v2']);
    expect(aviso).not.toHaveBeenCalled();
    await conn`UPDATE tenants SET asaas_subscription_id = NULL, asaas_customer_id = NULL WHERE id = 2`;
    aviso.mockRestore();
  });

  it('a cobrança avulsa, fora da assinatura, não mexe em nada', async () => {
    await enviar({ id: 'evt_8', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_avulsa', customer: 'cus_ze', subscription: null } });
    expect((await linha(1)).status).toBe('active');
  });

  it('estorno e contestação: alerta no log, e nada muda sozinho', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [id, tipo] of [['evt_9', 'PAYMENT_REFUNDED'], ['evt_10', 'PAYMENT_CHARGEBACK_REQUESTED']]) {
      await enviar({ id, event: tipo, payment: { id: 'pay_2', customer: 'cus_ze', subscription: 'sub_ze_2' } });
      expect((await desfecho(id)).outcome).toMatch(/^alerta/);
    }
    expect((await linha(1)).status).toBe('active');
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/PAYMENT_REFUNDED na barbearia 1/));
    aviso.mockRestore();
  });

  it('suspensa à mão continua suspensa, mesmo com pagamento — pagamento não desfaz o que você fez', async () => {
    await enviar({ id: 'evt_11', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_m', customer: 'cus_manual', subscription: 'sub_manual' } });
    expect((await linha(3)).status).toBe('suspended');
    await enviar({ id: 'evt_12', event: 'CHECKOUT_PAID', checkout: { id: 'chk_qualquer', customer: 'cus_manual' } });
    expect((await linha(3)).status).toBe('suspended');
  });

  it('a referência do Checkout (barbearia:N) também acha a barbearia — e só ela', async () => {
    expect(referenciaDaBarbearia(2)).toBe('barbearia:2');
    await enviar({ id: 'evt_13', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_vintage', customer: 'cus_vintage', externalReference: 'barbearia:2' } });
    expect(await linha(2)).toMatchObject({ asaas_subscription_id: 'sub_vintage', asaas_customer_id: 'cus_vintage', status: 'trial' });
    expect((await linha(1)).asaas_subscription_id).toBe('sub_ze_2');
  });

  it('o evento de uma barbearia não encosta na outra', async () => {
    await enviar({ id: 'evt_14', event: 'CHECKOUT_PAID', checkout: { id: 'chk_vintage', customer: 'cus_vintage' } });
    await enviar({ id: 'evt_15', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_v', customer: 'cus_vintage', subscription: 'sub_vintage' } });
    expect((await linha(2)).status).toBe('past_due');
    expect(await linha(1)).toMatchObject({ status: 'active', past_due_since: null });
  });

  it('evento que não acha barbearia nenhuma fica guardado, sem barbearia, e responde 200 — recusar pararia a fila', async () => {
    const r = await enviar({ id: 'evt_16', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_x', customer: 'cus_ninguem', subscription: 'sub_ninguem' } });
    expect(r.status).toBe(200);
    expect(await desfecho('evt_16')).toMatchObject({ tenant_id: null, outcome: expect.stringMatching(/^sem barbearia/) });
  });

  it('evento que não interessa: registrado, 200', async () => {
    expect((await enviar({ id: 'evt_17', event: 'PAYMENT_CREATED', payment: { id: 'pay_3', customer: 'cus_ze', subscription: 'sub_ze_2' } })).status).toBe(200);
    expect((await desfecho('evt_17')).outcome).toBe('registrado');
  });

  it('assinatura em vigor removida — aqui ou na Asaas: no ar até o fim do período pago; a de uma antiga não muda nada', async () => {
    const dia = diaNoFuso(new Date(Date.now() + 20 * DIA));
    await enviar({ id: 'evt_18', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_ze_1', customer: 'cus_ze', nextDueDate: dia } });
    expect((await linha(1)).subscription_ends_at).toBeNull();

    await enviar({ id: 'evt_19', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_ze_2', customer: 'cus_ze', nextDueDate: dia } });
    expect((await linha(1)).subscription_ends_at.toISOString()).toBe(meiaNoite(dia).toISOString());

    await carregarTenants(true);
    const req = new Request('https://ze.fadeline.com.br/', { headers: { host: 'ze.fadeline.com.br' } });
    expect(tenantDoHost(req)?.id).toBe(1); // ainda no ar
  });

  it('o papel do app não lê a tabela de eventos — só o webhook, como dono', async () => {
    await expect(conn.begin(async (tx) => {
      await tx`SET LOCAL ROLE barbearia_app`;
      await tx`SELECT set_config('app.tenant_id', '1', true)`;
      await tx`SELECT count(*) FROM webhook_events`;
    })).rejects.toThrow(/permission denied/);
  });
});

describe.skipIf(!TEM_BANCO)('o mesmo dono com duas barbearias', () => {
  it('cada Checkout pago acha a sua — o cliente repetido na Asaas não quebra nada', async () => {
    expect(await enviar({ id: 'evt_a1', event: 'CHECKOUT_PAID', checkout: { id: 'chk_a', customer: 'cus_dono' } }))
      .toEqual({ status: 200, corpo: { ok: true } });
    expect(await enviar({ id: 'evt_b1', event: 'CHECKOUT_PAID', checkout: { id: 'chk_b', customer: 'cus_dono' } }))
      .toEqual({ status: 200, corpo: { ok: true } });
    expect(await linha(9)).toMatchObject({ status: 'active', asaas_customer_id: 'cus_dono' });
    expect(await linha(10)).toMatchObject({ status: 'active', asaas_customer_id: 'cus_dono' });
  });

  it('o evento que só traz o cliente não escolhe nenhuma das duas — fica guardado, para tratar à mão', async () => {
    const r = await enviar({ id: 'evt_dono_sub', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_dono_x', customer: 'cus_dono' } });
    expect(r.status).toBe(200);
    expect(await desfecho('evt_dono_sub')).toMatchObject({ tenant_id: null, outcome: expect.stringMatching(/mais de uma barbearia/) });
    expect((await linha(9)).asaas_subscription_id).toBeNull();
    expect((await linha(10)).asaas_subscription_id).toBeNull();
  });

  it('com o Checkout na assinatura, acha a certa — e a cobrança dela atrasa só ela', async () => {
    await enviar({ id: 'evt_b2', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_dono_b', customer: 'cus_dono', checkoutSession: 'chk_b' } });
    expect((await linha(10)).asaas_subscription_id).toBe('sub_dono_b');
    expect((await linha(9)).asaas_subscription_id).toBeNull();
    await enviar({ id: 'evt_b3', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_b', customer: 'cus_dono', subscription: 'sub_dono_b' } });
    expect((await linha(10)).status).toBe('past_due');
    expect((await linha(9)).status).toBe('active');
  });
});

describe.skipIf(!TEM_BANCO)('o evento que falha', () => {
  it('por causa dele — um dado em conflito: 200, guardado com o erro, e a fila da Asaas não para', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A assinatura da barbearia 7 chegando pelo Checkout da 9: a UNIQUE recusa,
    // e recusaria igual em toda reentrega.
    const evento = { id: 'evt_conflito', event: 'SUBSCRIPTION_CREATED', subscription: { id: 'sub_emdia', customer: 'cus_dono', checkoutSession: 'chk_a' } };
    expect(await enviar(evento)).toEqual({ status: 200, corpo: { ok: true, falhou: true } });
    expect(await desfecho('evt_conflito')).toMatchObject({ tenant_id: null, outcome: expect.stringMatching(/^erro: .*tenants_asaas_subscription_id_key/) });
    expect((await linha(9)).asaas_subscription_id).toBeNull();
    expect((await linha(7)).asaas_subscription_id).toBe('sub_emdia');
    expect(erro).toHaveBeenCalledWith(expect.stringMatching(/evt_conflito falhou de um jeito que se repetiria/), expect.anything());
    // A reentrega não tenta de novo: o evento já está guardado.
    expect(await enviar(evento)).toEqual({ status: 200, corpo: { ok: true, duplicado: true } });
    erro.mockRestore();
  });

  it('por causa do corpo, que o jsonb recusa (um \\u0000): guardado como texto, 200', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await enviar({ id: 'evt_nulo', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_n', description: 'a\u0000b', subscription: 'sub_dono_b' } });
    expect(r).toEqual({ status: 200, corpo: { ok: true, falhou: true } });
    const [e] = await conn`SELECT jsonb_typeof(payload) AS tipo, payload #>> '{}' AS texto, outcome FROM webhook_events WHERE gateway_event_id = 'evt_nulo'`;
    expect(e.tipo).toBe('string');
    expect(e.texto).toContain('"pay_n"');
    expect(e.outcome).toMatch(/^erro: /);
    erro.mockRestore();
  });

  it('por erro de programa — uma coluna que não existe: 500, nada guardado; consertado, a reentrega processa', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const evento = { id: 'evt_programa', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_b2', customer: 'cus_dono', subscription: 'sub_dono_b' } };
    // A coluna some de `tenants`, não de `webhook_events`: guardar o evento como
    // falha funcionaria — e é justamente o que não se quer aqui.
    await conn`ALTER TABLE tenants RENAME COLUMN asaas_subscription_id TO asaas_subscription_id_sumiu`;
    let r: Awaited<ReturnType<typeof enviar>>;
    try {
      r = await enviar(evento);
    } finally {
      await conn`ALTER TABLE tenants RENAME COLUMN asaas_subscription_id_sumiu TO asaas_subscription_id`;
    }
    // Quebraria todos os eventos iguais: a fila parar é o certo — conserta-se e religa.
    expect(r.status).toBe(500);
    expect(await desfecho('evt_programa')).toBeUndefined();
    expect((await linha(10)).status).toBe('past_due');

    expect((await enviar(evento)).status).toBe(200);
    expect((await linha(10)).status).toBe('active');
    erro.mockRestore();
  });
});

// ── Com banco: o Checkout e o cancelar ──────────────────────────────────────

async function pedir(rota: typeof CARTAO, sessao: { barberId: number; role: 'admin' | 'barber'; tenantId: number }) {
  const cookie = (await makeSessionCookie(sessao)).split(';')[0];
  const r = await rota({ request: new Request('https://painel.fadeline.com.br/x', { method: 'POST', headers: { cookie } }) });
  return { status: r.status, corpo: await r.json() as Record<string, unknown> };
}

describe.skipIf(!TEM_BANCO)('o Checkout', () => {
  beforeEach(async () => { await carregarTenants(true); });

  it('sem ASAAS_API_KEY: 503, dizendo que ainda não dá — e ninguém é chamado', async () => {
    const antes = process.env.ASAAS_API_KEY;
    delete process.env.ASAAS_API_KEY;
    try {
      const r = await pedir(CARTAO, { barberId: 40, role: 'admin', tenantId: 4 });
      expect(r.status).toBe(503);
      expect(String(r.corpo.error)).toMatch(/ainda não está ligada/);
    } finally {
      process.env.ASAAS_API_KEY = antes;
    }
    expect(chamadas).toHaveLength(0);
  });

  it('o barbeiro que não é o dono não cadastra cartão', async () => {
    expect((await pedir(CARTAO, { barberId: 41, role: 'barber', tenantId: 4 })).status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });

  it('no teste: cartão, recorrente, mensal, R$ 100, primeira cobrança no dia seguinte ao fim do teste — e o id fica na barbearia', async () => {
    responder = () => ({ corpo: { id: 'chk_novo', link: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_novo' } });
    const r = await pedir(CARTAO, { barberId: 40, role: 'admin', tenantId: 4 });
    expect(r).toEqual({ status: 200, corpo: { url: 'https://sandbox.asaas.com/checkoutSession/show?id=chk_novo' } });

    expect(chamadas).toHaveLength(1);
    const { metodo, caminho, corpo } = chamadas[0] as { metodo: string; caminho: string; corpo: Record<string, any> };
    expect([metodo, caminho]).toEqual(['POST', '/checkouts']);
    expect(corpo.billingTypes).toEqual(['CREDIT_CARD']);
    expect(corpo.chargeTypes).toEqual(['RECURRENT']);
    expect(corpo.subscription.cycle).toBe('MONTHLY');
    const [{ trial_ends_at }] = await conn`SELECT trial_ends_at FROM tenants WHERE id = 4`;
    expect(corpo.subscription.nextDueDate).toBe(diaNoFuso(trial_ends_at));
    expect(corpo.items).toHaveLength(1);
    expect(corpo.items[0]).toMatchObject({ quantity: 1, value: 100 });
    expect(corpo.items[0].name.length).toBeLessThanOrEqual(30);
    expect(corpo.items[0].imageBase64).toMatch(/^iVBOR/); // um PNG — a Asaas exige imagem
    expect(corpo.externalReference).toBe('barbearia:4');
    expect(corpo.callback.successUrl).toMatch(/\/admin\/assinatura\?cartao=ok$/);
    expect(corpo.callback.cancelUrl).toMatch(/\/admin\/assinatura\?cartao=cancelado$/);
    // Cliente novo: os dados que o cadastro tem. O cartão e o CPF, a página da Asaas pede.
    expect(corpo.customerData).toEqual({ name: 'Dono Novo', email: 'dono@novo.com.br', phone: '84990000040' });
    expect(corpo.customer).toBeUndefined();
    expect(JSON.stringify(corpo)).not.toMatch(/card(Number|Holder)|ccv|cvv/i);
    expect((await linha(4)).asaas_checkout_ids).toEqual(['chk_novo']);
  });

  it('cliente que já existe na Asaas vai como `customer` — nunca junto com `customerData`', async () => {
    responder = () => ({ corpo: { id: 'chk_antigo', link: 'https://x/chk_antigo' } });
    await pedir(CARTAO, { barberId: 50, role: 'admin', tenantId: 5 });
    const corpo = chamadas[0].corpo as Record<string, unknown>;
    expect(corpo.customer).toBe('cus_antigo');
    expect(corpo.customerData).toBeUndefined();
  });

  it('fora do ar, com o teste vencido: abre também — e a cobrança é hoje', async () => {
    responder = () => ({ corpo: { id: 'chk_vencido', link: 'https://x/chk_vencido' } });
    const r = await pedir(CARTAO, { barberId: 60, role: 'admin', tenantId: 6 });
    expect(r.status).toBe(200);
    expect((chamadas[0].corpo as { subscription: { nextDueDate: string } }).subscription.nextDueDate).toBe(diaNoFuso(new Date()));
  });

  it('dois Checkouts abertos, e o dono paga no PRIMEIRO: a barbearia é achada — guardado só o último, o cartão ficaria sem barbearia', async () => {
    let n = 0;
    responder = () => ({ corpo: { id: `chk_duplo_${++n}`, link: `https://x/chk_duplo_${n}` } });
    await pedir(CARTAO, { barberId: 40, role: 'admin', tenantId: 4 });
    await pedir(CARTAO, { barberId: 40, role: 'admin', tenantId: 4 });
    expect((await linha(4)).asaas_checkout_ids).toEqual(['chk_novo', 'chk_duplo_1', 'chk_duplo_2']);
    // Cliente novo na Asaas: só o Checkout diz de quem é o pagamento.
    await enviar({ id: 'evt_duplo', event: 'CHECKOUT_PAID', checkout: { id: 'chk_duplo_1', customer: 'cus_recem_criado' } });
    expect(await desfecho('evt_duplo')).toMatchObject({ tenant_id: 4, outcome: 'em dia: o cartão foi cadastrado' });
    expect((await linha(4)).status).toBe('active');
  });

  it(`guarda os últimos ${CHECKOUTS_GUARDADOS} Checkouts, não todos`, async () => {
    let n = 0;
    responder = () => ({ corpo: { id: `chk_muitos_${++n}`, link: 'https://x/chk' } });
    for (let i = 0; i < CHECKOUTS_GUARDADOS + 2; i++) await pedir(CARTAO, { barberId: 60, role: 'admin', tenantId: 6 });
    const ids = (await linha(6)).asaas_checkout_ids as string[];
    expect(ids).toHaveLength(CHECKOUTS_GUARDADOS);
    expect(ids[0]).toBe('chk_muitos_3');
    expect(ids.at(-1)).toBe(`chk_muitos_${CHECKOUTS_GUARDADOS + 2}`);
  });

  it('em dia: 409, sem abrir Checkout', async () => {
    const r = await pedir(CARTAO, { barberId: 70, role: 'admin', tenantId: 7 });
    expect(r.status).toBe(409);
    expect(chamadas).toHaveLength(0);
  });

  it('a Asaas recusou: 502 com uma frase para o dono — sem o motivo técnico e sem a chave', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    responder = () => ({ status: 400, corpo: { errors: [{ code: 'invalid', description: 'O campo nextDueDate é inválido.' }] } });
    const r = await pedir(CARTAO, { barberId: 50, role: 'admin', tenantId: 5 });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.corpo)).not.toMatch(/nextDueDate|chave-de-teste/);
    // O motivo técnico vai para o log, que é onde se conserta — a chave, nem lá.
    expect(erro).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/O campo nextDueDate é inválido/));
    expect(JSON.stringify(erro.mock.calls)).not.toMatch(/chave-de-teste/);
    erro.mockRestore();
  });
});

describe.skipIf(!TEM_BANCO)('o cancelar', () => {
  beforeEach(async () => { await carregarTenants(true); });

  it('a Asaas para de cobrar, e o site fica no ar até o fim do período pago', async () => {
    const dia = diaNoFuso(new Date(Date.now() + 12 * DIA));
    responder = (c) => (c.metodo === 'GET'
      ? { corpo: { id: 'sub_emdia', status: 'ACTIVE', nextDueDate: dia, deleted: false } }
      : { corpo: { deleted: true, id: 'sub_emdia' } });
    const r = await pedir(CANCELAR, { barberId: 70, role: 'admin', tenantId: 7 });
    expect(r.status).toBe(200);
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /subscriptions/sub_emdia', 'DELETE /subscriptions/sub_emdia']);
    expect((await linha(7)).subscription_ends_at.toISOString()).toBe(meiaNoite(dia).toISOString());
    expect(r.corpo.noArAte).toBe(formatInTimeZone(new Date(meiaNoite(dia).getTime() - 1), TZ, 'dd/MM'));

    // O aviso da remoção chega depois, pelo webhook — e não mexe na data já gravada.
    const outroDia = diaNoFuso(new Date(Date.now() + 40 * DIA));
    await enviar({ id: 'evt_del_emdia', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_emdia', customer: 'cus_emdia', nextDueDate: outroDia } });
    expect((await desfecho('evt_del_emdia')).outcome).toMatch(/já estava marcada/);
    expect((await linha(7)).subscription_ends_at.toISOString()).toBe(meiaNoite(dia).toISOString());
  });

  it('cancelar de novo não chama a Asaas outra vez', async () => {
    const r = await pedir(CANCELAR, { barberId: 70, role: 'admin', tenantId: 7 });
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(0);
  });

  it('depois do fim do período pago, o site sai do ar como o de quem não pagou — e reativar volta', async () => {
    await conn`UPDATE tenants SET subscription_ends_at = now() - interval '1 minute' WHERE id = 7`;
    await carregarTenants(true);
    const host = 'emdia.fadeline.com.br';
    expect(tenantDoHost(new Request(`https://${host}/`, { headers: { host } }))).toBeNull();
    expect(tenantSuspensoDoHost(host)?.id).toBe(7);

    // Assinou de novo pelo Checkout: em dia, e a data de saída some.
    await conn`UPDATE tenants SET asaas_checkout_ids = asaas_checkout_ids || 'chk_volta'::text WHERE id = 7`;
    await enviar({ id: 'evt_volta', event: 'CHECKOUT_PAID', checkout: { id: 'chk_volta', customer: 'cus_emdia' } });
    expect(await linha(7)).toMatchObject({ status: 'active', subscription_ends_at: null });
  });

  it('com a cobrança atrasada, cancela também — a Asaas para de tentar o cartão, e o site fica só o que restava da carência', async () => {
    // A assinatura atrasada continua viva na Asaas, com o próximo vencimento lá na
    // frente: ele NÃO é o fim do período pago — o mês que falhou não foi pago.
    const longe = diaNoFuso(new Date(Date.now() + 25 * DIA));
    responder = (c) => (c.metodo === 'GET'
      ? { corpo: { id: 'sub_atr', status: 'ACTIVE', nextDueDate: longe, deleted: false } }
      : { corpo: { deleted: true, id: 'sub_atr' } });
    const [{ past_due_since }] = await conn`SELECT past_due_since FROM tenants WHERE id = 8`;
    const r = await pedir(CANCELAR, { barberId: 80, role: 'admin', tenantId: 8 });
    expect(r.status).toBe(200);
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /subscriptions/sub_atr', 'DELETE /subscriptions/sub_atr']);
    const depois = await linha(8);
    expect(depois).toMatchObject({ status: 'active', past_due_since: null });
    expect(depois.subscription_ends_at.toISOString()).toBe(fimDaCarencia(past_due_since).toISOString());
    // E a tela diz que foi cancelada, com o site no ar até o fim da carência.
    expect(situacaoDe({ status: 'active', encerraEm: depois.subscription_ends_at })).toEqual({ fase: 'ativa', encerraEm: depois.subscription_ends_at });
  });

  it('fora do ar pela cobrança: cancela pela sessão de fora do ar — e o site continua fora, agora como cancelado', async () => {
    responder = (c) => (c.metodo === 'GET'
      ? { corpo: { id: 'sub_fora', status: 'ACTIVE', nextDueDate: diaNoFuso(new Date(Date.now() + 20 * DIA)), deleted: false } }
      : { corpo: { deleted: true, id: 'sub_fora' } });
    expect(tenantSuspensoDoHost('fora.fadeline.com.br')?.id).toBe(11);
    const antes = Date.now();
    const r = await pedir(CANCELAR, { barberId: 110, role: 'admin', tenantId: 11 });
    expect(r.status).toBe(200);
    expect(chamadas.map((c) => `${c.metodo} ${c.caminho}`)).toEqual(['GET /subscriptions/sub_fora', 'DELETE /subscriptions/sub_fora']);
    const depois = await linha(11);
    expect(depois).toMatchObject({ status: 'active', past_due_since: null });
    expect(depois.subscription_ends_at.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(depois.subscription_ends_at.getTime()).toBeLessThanOrEqual(Date.now());
    await carregarTenants(true);
    expect(tenantSuspensoDoHost('fora.fadeline.com.br')?.id).toBe(11);
    expect(situacaoDe({ status: 'active', encerraEm: depois.subscription_ends_at })).toMatchObject({ fase: 'suspensa', motivo: 'cancelada' });
  });

  it('no teste, e tirada do ar à mão: não cancela por aqui — 409, e a Asaas não é chamada', async () => {
    const noTeste = await pedir(CANCELAR, { barberId: 60, role: 'admin', tenantId: 6 });
    expect(noTeste.status).toBe(409);
    expect(String(noTeste.corpo.error)).toMatch(/teste grátis/);
    const aMao = await pedir(CANCELAR, { barberId: 30, role: 'admin', tenantId: 3 });
    expect(aMao.status).toBe(409);
    expect(String(aMao.corpo.error)).toMatch(/suporte/);
    expect(chamadas).toHaveLength(0);
  });

  it('o barbeiro que não é o dono não cancela', async () => {
    expect((await pedir(CANCELAR, { barberId: 41, role: 'barber', tenantId: 4 })).status).toBe(403);
  });
});
