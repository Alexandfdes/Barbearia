// O painel do operador (decisão de 11/10/2026, `docs/PENDENCIAS-ABERTAS.md` §3.9):
// a lista das barbearias e as três ações — estender o teste, tirar do ar, reativar.
//
// ── O QUE ISTO PROTEGE ───────────────────────────────────────────────────────
//
// É a tela mais poderosa do produto, e entra só com senha (o dono decidiu, com o
// risco dito). Então cada trava tem de ficar vermelha quando some:
//
//  · desligado sem `OPERADOR_SENHA_HASH`, e 404 fora do endereço do painel;
//  · a senha certa e só ela; o limite de tentativas; o cookie de barbeiro não
//    serve; trocar o hash derruba a sessão;
//  · cada ação muda só a barbearia escolhida, grava o registro, e o site muda NA
//    HORA (o cache de barbearias segura 30 s);
//  · nenhum dado de cliente de barbearia sai na lista.
//
// Precisa de Postgres para as rotas e as ações. Sem DATABASE_URL, só a senha, o
// endereço, a sessão e as contas de data.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  COOKIE_DO_OPERADOR, DURACAO_DA_SESSAO, SENHA_MINIMA, conferirSenha, cookieDoOperador, ehEnderecoDoPainel,
  ehRotaDoOperador, gerarHash, lerHash, operadorAutenticado, portaoDoOperador,
} from '../src/lib/operador';
import { fimDoTeste, fimDoTesteEstendido, situacaoDe, ultimoDia, type ComPrazos } from '../src/lib/situacao';
import { descreverAcao, faseNaTela } from '../src/lib/operadorBarbearias';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const SENHA = 'frase de teste do operador 2026';
const HOST_DO_PAINEL = 'painel.test';
/** O fuso das barbearias do teste: o padrão da coluna (`drizzle/0013`). */
const FORTALEZA = 'America/Fortaleza';
const PAINEL_URL = `http://${HOST_DO_PAINEL}`;

/** Custo 14, o menor aceito: o teste não precisa da lentidão de produção. */
let HASH = '';
beforeAll(async () => { HASH = await gerarHash(SENHA, 14); }, 30_000);

const comCookie = (valor: string) => new Request(`${PAINEL_URL}/operador`, { headers: { host: HOST_DO_PAINEL, cookie: valor } });
const valorDe = (setCookie: string) => setCookie.split(';')[0];

// ── A senha ─────────────────────────────────────────────────────────────────

describe('a senha (`lib/operador.ts`)', () => {
  it('o hash só tem caracteres que um .env não troca, e confere a senha certa — e só ela', async () => {
    expect(HASH).toMatch(/^scrypt:14:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
    expect(HASH).not.toContain('$');
    expect(await conferirSenha(SENHA, HASH)).toBe(true);
    expect(await conferirSenha('frase de teste do operador 2025', HASH)).toBe(false);
    expect(await conferirSenha(SENHA.toUpperCase(), HASH)).toBe(false);
    expect(await conferirSenha('', HASH)).toBe(false);
  });

  it('a mesma senha digitada noutro teclado — "é" composto ou decomposto — confere', async () => {
    const composta = 'café com pão às sete'.normalize('NFC');
    const decomposta = composta.normalize('NFD');
    expect(decomposta).not.toBe(composta);
    const h = await gerarHash(composta, 14);
    expect(await conferirSenha(decomposta, h)).toBe(true);
  });

  it('hash fora do formato é painel DESLIGADO — nunca porta aberta, nunca erro', async () => {
    const valido = HASH.split(':');
    for (const ruim of [
      undefined, '', '   ', SENHA,                           // a senha colada no lugar do hash
      '$2b$12$abcdefghijklmnopqrstuuK5bW0x7q1YlVq3Jt8m9yPq6Cz8eXx2',  // um hash de bcrypt
      HASH.slice(0, -10),                                     // cortado na cópia
      ['scrypt', '30', ...valido.slice(2)].join(':'),         // custo que travaria o servidor
      ['scrypt', '10', ...valido.slice(2)].join(':'),         // custo fraco demais
      ['bcrypt', ...valido.slice(1)].join(':'),
    ]) {
      expect(lerHash(ruim), String(ruim)).toBeNull();
      expect(await conferirSenha(SENHA, ruim)).toBe(false);
    }
    expect(lerHash(` ${HASH}\n`)).not.toBeNull(); // espaço e quebra de linha da cópia não atrapalham
  });

  it('o script `npm run operador:senha` gera um hash que o app aceita — sem nunca imprimir a senha', () => {
    const r = spawnSync(process.execPath, ['scripts/operador-senha.mjs'], { input: `${SENHA}\n`, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    const linhas = r.stdout.trim().split('\n');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatch(/^OPERADOR_SENHA_HASH=scrypt:15:8:1:/);
    expect(r.stdout + r.stderr).not.toContain(SENHA);
    return conferirSenha(SENHA, linhas[0].slice('OPERADOR_SENHA_HASH='.length)).then((ok) => expect(ok).toBe(true));
  }, 30_000);

  it('o script recusa senha curta, sem imprimir hash nenhum — e o mínimo é o mesmo dos dois lados', () => {
    const curta = 'x'.repeat(SENHA_MINIMA - 1);
    const r = spawnSync(process.execPath, ['scripts/operador-senha.mjs'], { input: `${curta}\n`, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(readFileSync('scripts/operador-senha.mjs', 'utf8')).toContain(`const SENHA_MINIMA = ${SENHA_MINIMA};`);
  }, 30_000);
});

// ── O endereço ──────────────────────────────────────────────────────────────

describe('o endereço: só o do painel', () => {
  it('compara nome e porta, e a porta padrão vale escrita ou não', () => {
    expect(ehEnderecoDoPainel('localhost:4399', 'http://localhost:4399')).toBe(true);
    expect(ehEnderecoDoPainel('LOCALHOST:4399', 'http://localhost:4399')).toBe(true);
    expect(ehEnderecoDoPainel('localhost:4321', 'http://localhost:4399')).toBe(false);
    expect(ehEnderecoDoPainel('tour-teste.localhost:4399', 'http://localhost:4399')).toBe(false);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br', 'https://painel.fadeline.com.br')).toBe(true);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br:443', 'https://painel.fadeline.com.br')).toBe(true);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br.', 'https://painel.fadeline.com.br')).toBe(true);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br:8443', 'https://painel.fadeline.com.br')).toBe(false);
    expect(ehEnderecoDoPainel('bayron.fadeline.com.br', 'https://painel.fadeline.com.br')).toBe(false);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br@outro.com', 'https://painel.fadeline.com.br')).toBe(false);
    expect(ehEnderecoDoPainel(null, 'https://painel.fadeline.com.br')).toBe(false);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br', '')).toBe(false);
  });

  it('sem o hash, desligado em qualquer endereço; com ele, aberto só no do painel', () => {
    const pedido = (host: string) => new Request(`http://${host}/operador`, { headers: { host } });
    expect(portaoDoOperador(pedido(HOST_DO_PAINEL), { PAINEL_URL })).toBe('desligado');
    expect(portaoDoOperador(pedido(HOST_DO_PAINEL), { PAINEL_URL, OPERADOR_SENHA_HASH: 'lixo' })).toBe('desligado');
    expect(portaoDoOperador(pedido(HOST_DO_PAINEL), { PAINEL_URL, OPERADOR_SENHA_HASH: HASH })).toBe('aberto');
    expect(portaoDoOperador(pedido('bayron.test'), { PAINEL_URL, OPERADOR_SENHA_HASH: HASH })).toBe('fora-do-painel');
    // Sem PAINEL_URL, o painel é `painel.<DOMINIO_BASE>` — o mesmo endereço dos e-mails.
    expect(portaoDoOperador(pedido('painel.fadeline.com.br'), { DOMINIO_BASE: 'fadeline.com.br', OPERADOR_SENHA_HASH: HASH })).toBe('aberto');
    expect(portaoDoOperador(pedido('fadeline.com.br'), { DOMINIO_BASE: 'fadeline.com.br', OPERADOR_SENHA_HASH: HASH })).toBe('fora-do-painel');
    // Produção sem nenhuma das duas: não há endereço de painel, e nada abre.
    expect(portaoDoOperador(pedido('qualquer.com'), { NODE_ENV: 'production', OPERADOR_SENHA_HASH: HASH })).toBe('fora-do-painel');
  });

  it('as rotas do operador são estas, e só estas', () => {
    for (const r of ['/operador', '/operador/', '/api/operador/entrar', '/api/operador/acao', '/api/operador/sair']) {
      expect(ehRotaDoOperador(r), r).toBe(true);
    }
    for (const r of ['/operadores', '/admin', '/api/admin/settings', '/', '/api/operadorx']) {
      expect(ehRotaDoOperador(r), r).toBe(false);
    }
  });

  it('o middleware deixa as rotas do operador passarem sem barbearia — depois da conferência de origem', () => {
    const fonte = readFileSync('src/middleware.ts', 'utf8');
    const origem = fonte.indexOf('motivoDaRecusa(contexto.request)');
    const desvio = fonte.indexOf('if (ehRotaDoOperador(caminho)) return next();');
    expect(origem).toBeGreaterThan(0);
    expect(desvio).toBeGreaterThan(origem);
    expect(desvio).toBeLessThan(fonte.indexOf('await tenantDaRequisicao(contexto.request)'));
  });
});

// ── A sessão ────────────────────────────────────────────────────────────────

describe('a sessão do operador', () => {
  const env = () => ({ ...process.env, OPERADOR_SENHA_HASH: HASH, PAINEL_URL });

  it('o cookie é HttpOnly, SameSite=Strict, sem Domain, e dura 8 horas', async () => {
    const c = await cookieDoOperador(env());
    expect(c.startsWith(`${COOKIE_DO_OPERADOR}=`)).toBe(true);
    expect(c).toMatch(/; HttpOnly/);
    expect(c).toMatch(/; SameSite=Strict/);
    expect(c).toMatch(new RegExp(`; Max-Age=${DURACAO_DA_SESSAO}(;|$)`));
    expect(DURACAO_DA_SESSAO).toBe(8 * 60 * 60);
    expect(c).not.toMatch(/Domain=/i);
    expect(c).not.toMatch(/; Secure/);
    expect(await cookieDoOperador({ ...env(), NODE_ENV: 'production' })).toMatch(/; Secure/);
  });

  it('vale com o hash de agora — e cai quando a senha (o hash) muda', async () => {
    const c = valorDe(await cookieDoOperador(env()));
    expect(await operadorAutenticado(comCookie(c), env())).toBe(true);
    const outro = await gerarHash('outra frase de teste 2026', 14);
    expect(await operadorAutenticado(comCookie(c), { ...env(), OPERADOR_SENHA_HASH: outro })).toBe(false);
    // E sem o hash configurado, nada vale.
    expect(await operadorAutenticado(comCookie(c), { ...env(), OPERADOR_SENHA_HASH: undefined })).toBe(false);
  });

  it('o cookie de barbeiro não serve de operador, nem o de operador serve de barbeiro', async () => {
    const { makeSessionCookie, getSession, SESSION_COOKIE } = await import('../src/lib/session.js');
    const barbeiro = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0].split('=').slice(1).join('=');
    expect(await operadorAutenticado(comCookie(`${COOKIE_DO_OPERADOR}=${barbeiro}`), env())).toBe(false);

    const operador = valorDe(await cookieDoOperador(env())).split('=').slice(1).join('=');
    const comoBarbeiro = new Request(`${PAINEL_URL}/admin`, { headers: { cookie: `${SESSION_COOKIE}=${operador}` } });
    expect(await getSession(comoBarbeiro)).toBeNull();
  });

  it('o lacre do operador nem abre com a chave do painel dos barbeiros', async () => {
    // O conteúdo já separa os dois (`operador: true` de um lado, `barberId` do
    // outro). A chave separada é a segunda parede: um campo novo na sessão do
    // painel, um dia, não vira sessão de operador por coincidência.
    const { unsealData } = await import('iron-session');
    const selo = valorDe(await cookieDoOperador(env())).split('=').slice(1).join('=');
    let aberto: Record<string, unknown> = {};
    try { aberto = await unsealData(selo, { password: process.env.SESSION_SECRET! }); } catch { /* recusado */ }
    expect(aberto).toEqual({});
  });

  it('passadas 8 horas, a sessão não vale', async () => {
    const agora = Date.now;
    Date.now = () => agora() - (DURACAO_DA_SESSAO + 60) * 1000;
    let c: string;
    try { c = valorDe(await cookieDoOperador(env())); } finally { Date.now = agora; }
    expect(await operadorAutenticado(comCookie(c), env())).toBe(false);
  });

  it('cookie adulterado não vale', async () => {
    const c = valorDe(await cookieDoOperador(env()));
    const adulterado = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await operadorAutenticado(comCookie(adulterado), env())).toBe(false);
  });
});

// ── As contas de data e os textos ───────────────────────────────────────────

describe('estender o teste: a conta (`fimDoTesteEstendido`)', () => {
  const noDia = (iso: string) => new Date(iso);

  it('teste no prazo: os dias contam do ÚLTIMO dia do teste', () => {
    const fim = fimDoTeste(noDia('2026-10-08T15:00:00-03:00'), FORTALEZA); // até 15/10
    expect(ultimoDia(fim, FORTALEZA)).toBe('15/10');
    const novo = fimDoTesteEstendido(fim, 7, FORTALEZA, noDia('2026-10-11T10:00:00-03:00'));
    expect(ultimoDia(novo, FORTALEZA)).toBe('22/10');
    expect(novo.toISOString()).toBe('2026-10-23T03:00:00.000Z'); // meia-noite em Fortaleza
  });

  it('teste vencido: os dias contam de HOJE — o mesmo que um cadastro feito hoje ganharia', () => {
    const vencido = fimDoTeste(noDia('2026-09-20T09:00:00-03:00'), FORTALEZA); // até 27/09
    const hoje = noDia('2026-10-11T22:30:00-03:00');
    const novo = fimDoTesteEstendido(vencido, 7, FORTALEZA, hoje);
    expect(ultimoDia(novo, FORTALEZA)).toBe('18/10');
    expect(novo.getTime()).toBe(fimDoTeste(hoje, FORTALEZA).getTime());
  });

  it('o último dia do teste é hoje: conta de hoje; sem prazo nenhum, também', () => {
    const hoje = noDia('2026-10-11T08:00:00-03:00');
    const acabaHoje = fimDoTeste(noDia('2026-10-04T12:00:00-03:00'), FORTALEZA); // até 11/10
    expect(ultimoDia(fimDoTesteEstendido(acabaHoje, 1, FORTALEZA, hoje), FORTALEZA)).toBe('12/10');
    expect(ultimoDia(fimDoTesteEstendido(null, 3, FORTALEZA, hoje), FORTALEZA)).toBe('14/10');
  });
});

describe('o que a tela diz de cada fase', () => {
  const agora = new Date('2026-10-11T12:00:00-03:00');
  const tela = (t: Omit<ComPrazos, 'fuso'>) => faseNaTela(situacaoDe({ ...t, fuso: FORTALEZA }, agora), FORTALEZA);

  it('cada fase com o rótulo, o detalhe e o tom', () => {
    expect(tela({ status: 'active' })).toMatchObject({ rotulo: 'Em dia', tom: 'em-dia', fase: 'ativa' });
    expect(tela({ status: 'active', encerraEm: new Date('2026-10-20T03:00:00Z') }))
      .toMatchObject({ rotulo: 'Cancelou', detalhe: 'no ar até 19/10', tom: 'atencao' });
    expect(tela({ status: 'trial', testeAte: new Date('2026-10-16T03:00:00Z') }))
      .toMatchObject({ rotulo: 'Teste', detalhe: 'até 15/10', tom: 'teste' });
    expect(tela({ status: 'trial', testeAte: new Date('2026-10-10T03:00:00Z') }))
      .toMatchObject({ rotulo: 'Carência', tom: 'atencao', fase: 'carencia' });
    expect(tela({ status: 'trial', testeAte: new Date('2026-09-01T03:00:00Z') }))
      .toMatchObject({ rotulo: 'Fora do ar', tom: 'fora', fase: 'suspensa' });
    expect(tela({ status: 'suspended' })).toMatchObject({ rotulo: 'Fora do ar', detalhe: 'tirada do ar à mão', tom: 'fora' });
    expect(tela({ status: 'cancelled' })).toMatchObject({ rotulo: 'Encerrada', tom: 'encerrada' });
  });

  it('o registro em português', () => {
    const base = { ip: null, quando: null, fuso: FORTALEZA };
    expect(descreverAcao({ ...base, acao: 'entrou', detalhe: {}, slug: null })).toBe('Entrou no painel');
    expect(descreverAcao({ ...base, acao: 'estendeu-teste', slug: 'ze', detalhe: { dias: 7, depois: '2026-10-23T03:00:00.000Z' } }))
      .toBe('Estendeu o teste de ze em 7 dias (até 22/10)');
    expect(descreverAcao({ ...base, acao: 'estendeu-teste', slug: 'ze', detalhe: { dias: 1, depois: '2026-10-17T03:00:00.000Z' } }))
      .toBe('Estendeu o teste de ze em 1 dia (até 16/10)');
    expect(descreverAcao({ ...base, acao: 'suspendeu', slug: 'ze', detalhe: { statusAnterior: 'active', motivo: 'pediu' } }))
      .toBe('Tirou ze do ar — estava em dia. Motivo: pediu');
    expect(descreverAcao({ ...base, acao: 'reativou', slug: 'ze', detalhe: { status: 'trial' } })).toBe('Reativou ze — no teste');
  });

  // Manaus está uma hora atrás de Fortaleza: a meia-noite que encerra o dia 15
  // lá é 1h da manhã do dia 16 aqui. Contada no relógio do operador, a data da
  // barbearia de Manaus sairia um dia adiante.
  it('as datas são do calendário da barbearia, não do relógio do operador', () => {
    const MANAUS = 'America/Manaus';
    const teste = { status: 'trial' as const, testeAte: new Date('2026-10-16T04:00:00Z'), fuso: MANAUS };
    expect(faseNaTela(situacaoDe(teste, agora), MANAUS)).toMatchObject({ detalhe: 'até 15/10' });
    expect(faseNaTela(situacaoDe(teste, agora), FORTALEZA)).toMatchObject({ detalhe: 'até 16/10' });

    const estendeu = { ip: null, quando: null, acao: 'estendeu-teste' as const, slug: 'ze', detalhe: { dias: 7, depois: '2026-10-23T04:00:00.000Z' } };
    expect(descreverAcao({ ...estendeu, fuso: MANAUS })).toBe('Estendeu o teste de ze em 7 dias (até 22/10)');
    expect(descreverAcao({ ...estendeu, fuso: FORTALEZA })).toBe('Estendeu o teste de ze em 7 dias (até 23/10)');
  });
});

// ── Com banco: as rotas e as ações ──────────────────────────────────────────

describe.skipIf(!TEM_BANCO)('com banco: entrar, listar e agir', () => {
  let sql: ReturnType<typeof postgres>;
  let ENTRAR: typeof import('../src/pages/api/operador/entrar.ts').POST;
  let ACAO: typeof import('../src/pages/api/operador/acao.ts').POST;
  let SAIR: typeof import('../src/pages/api/operador/sair.ts').POST;
  let mod: typeof import('../src/lib/operadorBarbearias.js');
  let tenant: typeof import('../src/lib/tenant.js');
  let rl: typeof import('../src/lib/rateLimit.js');
  const antes = { hash: process.env.OPERADOR_SENHA_HASH, painel: process.env.PAINEL_URL };
  let cookie = '';

  const AGORA = new Date();
  const DIA = 24 * 60 * 60 * 1000;

  const pedido = (caminho: string, corpo: unknown, o: { host?: string; cookie?: string; ip?: string; tipo?: string } = {}) => {
    const host = o.host ?? HOST_DO_PAINEL;
    return new Request(`http://${host}${caminho}`, {
      method: 'POST',
      headers: {
        host, 'content-type': o.tipo ?? 'application/json', 'x-forwarded-for': o.ip ?? '10.0.0.1',
        ...(o.cookie ? { cookie: o.cookie } : {}),
      },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });
  };
  const entrar = (senha: string, o: Parameters<typeof pedido>[2] = {}) =>
    ENTRAR({ request: pedido('/api/operador/entrar', { senha }, o), clientAddress: '127.0.0.1' } as never);
  const agir = (corpo: Record<string, unknown>, o: Parameters<typeof pedido>[2] = {}) =>
    ACAO({ request: pedido('/api/operador/acao', corpo, { cookie, ...o }), clientAddress: '127.0.0.1' } as never);
  const linha = async (id: number) =>
    (await sql`SELECT status, trial_ends_at, past_due_since FROM tenants WHERE id = ${id}`)[0];
  const registros = async (id: number | null) => id === null
    ? sql`SELECT acao, detalhe, ip FROM acoes_do_operador WHERE tenant_id IS NULL ORDER BY id`
    : sql`SELECT acao, detalhe, ip FROM acoes_do_operador WHERE tenant_id = ${id} ORDER BY id`;
  const doHost = async (slug: string) => {
    await tenant.carregarTenants();
    return tenant.tenantDoHost(new Request(`http://${slug}.test/`, { headers: { host: `${slug}.test` } }));
  };

  beforeAll(async () => {
    process.env.OPERADOR_SENHA_HASH = HASH;
    process.env.PAINEL_URL = PAINEL_URL;
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const iso = (ms: number) => new Date(ms).toISOString();
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, past_due_since, asaas_subscription_id, created_at) VALUES
      (1, 'em-dia',        'Em Dia',        'active',    NULL, NULL, 'sub_em_dia', ${iso(AGORA.getTime() - 60 * DIA)}),
      (2, 'no-teste',      'No Teste',      'trial',     ${fimDoTeste(AGORA, FORTALEZA).toISOString()}, NULL, NULL, ${iso(AGORA.getTime() - 1 * DIA)}),
      (3, 'teste-vencido', 'Teste Vencido', 'trial',     ${iso(AGORA.getTime() - 20 * DIA)}, NULL, NULL, ${iso(AGORA.getTime() - 27 * DIA)}),
      (4, 'atrasada',      'Atrasada',      'past_due',  NULL, ${iso(AGORA.getTime() - 1 * DIA)}, 'sub_atrasada', ${iso(AGORA.getTime() - 90 * DIA)}),
      (5, 'tirada-a-mao',  'Tirada à Mão',  'suspended', NULL, NULL, NULL, ${iso(AGORA.getTime() - 30 * DIA)}),
      (6, 'encerrada',     'Encerrada',     'cancelled', NULL, NULL, NULL, ${iso(AGORA.getTime() - 120 * DIA)})`;
    await sql`SELECT setval('tenants_id_seq', 6)`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city)
              SELECT id, id, business_name || ' (no site)', slug, '5584999990000', 'Rua A, 1', 'Natal/RN' FROM tenants`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email) VALUES
      (1, 1, 'Dona Em Dia',     'dona',   'admin',  'x', true,  '84990000001', 'dona@emdia.com'),
      (2, 1, 'Barbeiro Ativo',  'ativo',  'barber', 'x', true,  '84990000002', NULL),
      (3, 1, 'Barbeiro Saiu',   'saiu',   'barber', 'x', false, '84990000003', NULL),
      (4, 2, 'Dono No Teste',   'dono',   'admin',  'x', true,  '84990000004', NULL),
      (5, 3, 'Dono Vencido',    'dono',   'admin',  'x', true,  '84990000005', NULL),
      (6, 4, 'Dono Atrasado',   'dono',   'admin',  'x', true,  '84990000006', NULL),
      (7, 5, 'Dono Tirado',     'dono',   'admin',  'x', true,  '84990000007', NULL),
      (8, 6, 'Dono Encerrado',  'dono',   'admin',  'x', true,  '84990000008', NULL)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES (1, 1, 'Corte', 'corte', 4000, true)`;
    const quando = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone, customer_birthdate,
                                        starts_at, ends_at, duration_minutes, price_cents, manage_token, created_at) VALUES
      (1, 2, 1, 'Cliente Secreto Silva', '84988887777', '1990-01-01', ${iso(AGORA.getTime() + DIA)}, ${iso(AGORA.getTime() + DIA + 1800_000)}, 30, 4000, 'tk-1', ${quando(AGORA.getTime() - 2 * DIA)}),
      (1, 2, 1, 'Cliente Secreto Souza', '84988886666', NULL,         ${iso(AGORA.getTime() + DIA)}, ${iso(AGORA.getTime() + DIA + 1800_000)}, 30, 4000, 'tk-2', ${quando(AGORA.getTime() - 5 * DIA)}),
      (1, 2, 1, 'Cliente Antigo Lima',   '84988885555', NULL,         ${iso(AGORA.getTime() - 40 * DIA)}, ${iso(AGORA.getTime() - 40 * DIA + 1800_000)}, 30, 4000, 'tk-3', ${quando(AGORA.getTime() - 41 * DIA)})`;
    await sql`INSERT INTO webhook_events (tenant_id, gateway_event_id, event, payload, outcome) VALUES
      (NULL, 'evt_sem',   'PAYMENT_CONFIRMED', '{"customer":{"cpfCnpj":"12345678900"}}', 'sem barbearia: nenhuma chave do evento casou'),
      (NULL, 'evt_erro',  'PAYMENT_CONFIRMED', '{}', 'erro: deu ruim'),
      (5,    'evt_susp',  'PAYMENT_CONFIRMED', '{}', 'nada muda: a barbearia está suspended'),
      (1,    'evt_ok',    'PAYMENT_CONFIRMED', '{}', 'em dia: pagamento confirmado'),
      (1,    'evt_avulsa','PAYMENT_CONFIRMED', '{}', 'nada muda: cobrança avulsa, fora da assinatura')`;

    ({ POST: ENTRAR } = await import('../src/pages/api/operador/entrar.ts'));
    ({ POST: ACAO } = await import('../src/pages/api/operador/acao.ts'));
    ({ POST: SAIR } = await import('../src/pages/api/operador/sair.ts'));
    mod = await import('../src/lib/operadorBarbearias.js');
    tenant = await import('../src/lib/tenant.js');
    rl = await import('../src/lib/rateLimit.js');
    await tenant.carregarTenants(true);
  }, 60_000);

  afterAll(async () => {
    if (antes.hash === undefined) delete process.env.OPERADOR_SENHA_HASH; else process.env.OPERADOR_SENHA_HASH = antes.hash;
    if (antes.painel === undefined) delete process.env.PAINEL_URL; else process.env.PAINEL_URL = antes.painel;
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  beforeEach(() => {
    rl.resetRateLimit('operador-entrar:total');
    for (let i = 1; i <= 40; i++) rl.resetRateLimit(`operador-entrar:10.0.0.${i}`);
  });

  // ── Entrar ──

  it('senha errada: 401, sem cookie, sem registro; certa: cookie e a entrada gravada com o IP', async () => {
    const errada = await entrar('senha errada de teste', { ip: '10.0.0.2' });
    expect(errada.status).toBe(401);
    expect(errada.headers.get('set-cookie')).toBeNull();
    expect(await registros(null)).toHaveLength(0);

    const certa = await entrar(SENHA, { ip: '10.0.0.2' });
    expect(certa.status).toBe(200);
    const setCookie = certa.headers.get('set-cookie') ?? '';
    expect(setCookie.startsWith(`${COOKIE_DO_OPERADOR}=`)).toBe(true);
    cookie = valorDe(setCookie);
    expect(await operadorAutenticado(comCookie(cookie))).toBe(true);
    expect(await registros(null)).toEqual([{ acao: 'entrou', detalhe: {}, ip: '10.0.0.2' }]);
  });

  it('só JSON: formulário de outro site (text/plain) não entra', async () => {
    const r = await entrar(SENHA, { tipo: 'text/plain', ip: '10.0.0.3' });
    expect(r.status).toBe(415);
  });

  it('5 tentativas por IP: a 6ª é recusada mesmo com a senha certa — e outro IP ainda entra', async () => {
    for (let i = 0; i < 5; i++) expect((await entrar('chute de teste ' + i, { ip: '10.0.0.4' })).status).toBe(401);
    expect((await entrar(SENHA, { ip: '10.0.0.4' })).status).toBe(429);
    expect((await entrar(SENHA, { ip: '10.0.0.5' })).status).toBe(200);
  }, 30_000);

  it('20 tentativas no total, de IPs diferentes: a 21ª é recusada — quem troca de IP não passa', async () => {
    for (let i = 1; i <= 20; i++) expect((await entrar('chute ' + i, { ip: `10.0.0.${i}` })).status).toBe(401);
    expect((await entrar(SENHA, { ip: '10.0.0.30' })).status).toBe(429);
  }, 60_000);

  it('desligado ou fora do endereço do painel: as três rotas respondem o mesmo 404', async () => {
    process.env.OPERADOR_SENHA_HASH = '';
    try {
      expect((await entrar(SENHA, { ip: '10.0.0.6' })).status).toBe(404);
      expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 1 })).status).toBe(404);
      expect((await SAIR({ request: pedido('/api/operador/sair', {}) } as never)).status).toBe(404);
    } finally {
      process.env.OPERADOR_SENHA_HASH = HASH;
    }
    const noSite = { host: 'em-dia.test', ip: '10.0.0.7' };
    expect((await entrar(SENHA, noSite)).status).toBe(404);
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 1 }, noSite)).status).toBe(404);
    expect((await SAIR({ request: pedido('/api/operador/sair', {}, noSite) } as never)).status).toBe(404);
    expect(await (await entrar(SENHA, noSite)).text()).toBe('Não encontrado');
  });

  it('sair apaga o cookie e volta para a tela de entrar', async () => {
    const r = await SAIR({ request: pedido('/api/operador/sair', {}) } as never);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/operador');
    expect(r.headers.get('set-cookie')).toMatch(new RegExp(`^${COOKIE_DO_OPERADOR}=;.*Max-Age=0`));
  });

  // ── A lista ──

  it('a lista: a fase de cada uma, o contato do dono e o uso — e nenhum dado de cliente', async () => {
    const lista = await mod.listarBarbearias();
    const por = Object.fromEntries(lista.map((b) => [b.slug, b]));
    expect(lista.map((b) => b.slug)).toEqual(['no-teste', 'teste-vencido', 'tirada-a-mao', 'em-dia', 'atrasada', 'encerrada']);
    expect(por['em-dia'].situacao.fase).toBe('ativa');
    expect(por['no-teste'].situacao.fase).toBe('teste');
    expect(por['teste-vencido'].situacao).toMatchObject({ fase: 'suspensa', motivo: 'teste' });
    expect(por['atrasada'].situacao).toMatchObject({ fase: 'carencia', motivo: 'cobranca' });
    expect(por['tirada-a-mao'].situacao).toMatchObject({ fase: 'suspensa', motivo: 'manual' });
    expect(por['encerrada'].situacao.fase).toBe('cancelada');

    expect(por['em-dia'].nome).toBe('Em Dia (no site)'); // o nome que o dono mantém no painel
    expect(por['em-dia'].dono).toEqual({ nome: 'Dona Em Dia', telefone: '84990000001', email: 'dona@emdia.com' });
    expect(por['em-dia'].barbeirosAtivos).toBe(2);          // o que saiu não conta
    expect(por['em-dia'].agendamentos30Dias).toBe(2);       // o de 41 dias atrás não conta
    expect(por['em-dia'].ultimoAgendamento).not.toBeNull();
    expect(por['em-dia'].temAssinatura).toBe(true);
    expect(por['no-teste'].temAssinatura).toBe(false);
    expect(por['tirada-a-mao'].antesDaSuspensao).toBeNull(); // saiu do ar fora deste painel

    const tudo = JSON.stringify(lista);
    for (const dadoDeCliente of ['Secreto', 'Silva', 'Souza', 'Lima', '84988887777', '84988886666', '1990-01-01', 'tk-1']) {
      expect(tudo, dadoDeCliente).not.toContain(dadoDeCliente);
    }

    expect(mod.resumoDasFases(lista)).toEqual({ total: 6, noAr: 3, ativa: 1, teste: 1, carencia: 1, suspensa: 2, cancelada: 1 });
  });

  it('eventos da Asaas que pedem olho: falha, sem barbearia, barbearia fora do ar à mão — sem o corpo do evento', async () => {
    const eventos = await mod.eventosQuePedemOlho();
    expect(eventos.map((e) => e.idNaAsaas).sort()).toEqual(['evt_erro', 'evt_sem', 'evt_susp']);
    expect(eventos.find((e) => e.idNaAsaas === 'evt_susp')?.slug).toBe('tirada-a-mao');
    expect(JSON.stringify(eventos)).not.toContain('12345678900');
  });

  // ── As ações, pela rota ──

  it('sem sessão de operador, nenhuma ação — nem com o cookie de dono de barbearia', async () => {
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 1 }, { cookie: '' })).status).toBe(401);
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const dono = valorDe(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 1 }, { cookie: dono })).status).toBe(401);
    expect((await agir({ acao: 'suspender', barbearia: 1, confirmacao: 'em-dia' }, { cookie: dono })).status).toBe(401);
    expect((await linha(1)).status).toBe('active');
  });

  it('estender o teste no prazo: os dias contam do último dia, só ela muda, e fica registrado', async () => {
    const antesDela = await linha(2);
    const vizinha = await linha(3);
    const r = await agir({ acao: 'estender-teste', barbearia: 2, dias: 7 });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo).toMatchObject({ ok: true, slug: 'no-teste', fase: { rotulo: 'Teste' } });
    const depois = await linha(2);
    const esperado = fimDoTesteEstendido(new Date(antesDela.trial_ends_at), 7, FORTALEZA);
    expect(new Date(depois.trial_ends_at).getTime()).toBe(esperado.getTime());
    expect(corpo.fase.detalhe).toBe(`até ${ultimoDia(esperado, FORTALEZA)}`);
    const [reg] = await registros(2);
    expect(reg).toMatchObject({ acao: 'estendeu-teste', ip: '10.0.0.1', detalhe: { dias: 7, depois: esperado.toISOString() } });
    expect(await linha(3)).toEqual(vizinha);
  });

  it('estender o teste VENCIDO: o site volta NA HORA, sem esperar o cache de 30 s', async () => {
    expect(await doHost('teste-vencido')).toBeNull();               // fora do ar, e o cache sabe
    const r = await agir({ acao: 'estender-teste', barbearia: 3, dias: 3 });
    expect(r.status).toBe(200);
    expect((await r.json()).fase.rotulo).toBe('Teste');
    expect((await doHost('teste-vencido'))?.slug).toBe('teste-vencido'); // sem forçar o cache
    const fim = new Date((await linha(3)).trial_ends_at);
    expect(ultimoDia(fim, FORTALEZA)).toBe(ultimoDia(fimDoTesteEstendido(null, 3, FORTALEZA), FORTALEZA));
  });

  it('estender o teste de quem paga, de quem está atrasada ou fora do ar à mão: recusado, sem mudar nada', async () => {
    for (const id of [1, 4, 5, 6]) {
      const antesDela = await linha(id);
      const r = await agir({ acao: 'estender-teste', barbearia: id, dias: 7 });
      expect(r.status, String(id)).toBe(409);
      expect((await r.json()).error).toMatch(/Só dá para estender o teste de quem está no teste/);
      expect(await linha(id)).toEqual(antesDela);
    }
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 0 })).status).toBe(400);
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 61 })).status).toBe(400);
    expect((await agir({ acao: 'estender-teste', barbearia: 999, dias: 1 })).status).toBe(404);
    await expect(mod.estenderTeste(2, 61, 'x')).rejects.toMatchObject({ status: 400 });
  });

  it('tirar do ar exige digitar o endereço dela — o botão da linha errada não derruba ninguém', async () => {
    for (const errado of ['', 'em_dia', 'no-teste', 'em-di']) {
      const r = await agir({ acao: 'suspender', barbearia: 1, confirmacao: errado });
      expect(r.status, errado).toBe(400);
    }
    expect((await linha(1)).status).toBe('active');
    expect(await registros(1)).toHaveLength(0);
  });

  it('tirar do ar: o site sai NA HORA, o motivo e o status de antes ficam registrados', async () => {
    expect((await doHost('em-dia'))?.slug).toBe('em-dia');
    const r = await agir({ acao: 'suspender', barbearia: 1, confirmacao: ' EM-DIA ', motivo: '  pediu para pausar  ' });
    expect(r.status).toBe(200);
    expect((await r.json()).fase).toMatchObject({ rotulo: 'Fora do ar', detalhe: 'tirada do ar à mão' });
    expect((await linha(1)).status).toBe('suspended');
    expect(await doHost('em-dia')).toBeNull();
    // ...e o endereço mostra o aviso de indisponível, não um 404.
    expect(tenant.tenantSuspensoDoHost('em-dia.test')?.slug).toBe('em-dia');
    expect((await registros(1)).at(-1)).toMatchObject({ acao: 'suspendeu', detalhe: { statusAnterior: 'active', motivo: 'pediu para pausar' } });

    const lista = await mod.listarBarbearias();
    expect(lista.find((b) => b.id === 1)?.antesDaSuspensao).toBe('active');
    // De novo: já está fora do ar. E encerrada não se tira do ar.
    expect((await agir({ acao: 'suspender', barbearia: 1, confirmacao: 'em-dia' })).status).toBe(409);
    expect((await agir({ acao: 'suspender', barbearia: 6, confirmacao: 'encerrada' })).status).toBe(409);
  });

  it('reativar devolve o status que ela tinha — registrado na suspensão — e o site volta na hora', async () => {
    expect((await agir({ acao: 'reativar', barbearia: 1, comoEra: 'trial' })).status).toBe(400); // o registro diz "em dia"
    expect((await linha(1)).status).toBe('suspended');
    const r = await agir({ acao: 'reativar', barbearia: 1 });
    expect(r.status).toBe(200);
    expect((await r.json()).fase.rotulo).toBe('Em dia');
    expect((await linha(1)).status).toBe('active');
    expect((await doHost('em-dia'))?.slug).toBe('em-dia');
    expect((await registros(1)).at(-1)).toMatchObject({ acao: 'reativou', detalhe: { status: 'active', registrado: true } });
    // Reativar quem está no ar não é reativar — nem escolhendo como ela "volta".
    for (const [id, comoEra] of [[1, undefined], [1, 'trial'], [3, 'active']] as const) {
      const r = await agir({ acao: 'reativar', barbearia: id, ...(comoEra ? { comoEra } : {}) });
      expect(r.status).toBe(409);
      expect((await r.json()).error).toMatch(/Reativar é para quem foi tirada do ar à mão/);
    }
    expect((await linha(1)).status).toBe('active');
    expect((await linha(3)).status).toBe('trial');
    const r3 = await agir({ acao: 'reativar', barbearia: 3 });
    expect((await r3.json()).error).toMatch(/Se o teste venceu, estenda o teste/);
  });

  it('tirada do ar fora do painel: sem registro, o reativar pergunta — e em teste sem prazo ganha 7 dias', async () => {
    const r = await agir({ acao: 'reativar', barbearia: 5 });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Escolha como ela volta/);
    expect((await linha(5)).status).toBe('suspended');

    const ok = await agir({ acao: 'reativar', barbearia: 5, comoEra: 'trial' });
    expect(ok.status).toBe(200);
    const depois = await linha(5);
    expect(depois.status).toBe('trial');
    expect(new Date(depois.trial_ends_at).getTime()).toBe(fimDoTeste(new Date(), FORTALEZA).getTime());
    expect((await doHost('tirada-a-mao'))?.slug).toBe('tirada-a-mao');
  });

  it('o relógio não para na suspensão: o teste que venceu nesse meio-tempo volta vencido — e a resposta diz', async () => {
    expect((await agir({ acao: 'suspender', barbearia: 2, confirmacao: 'no-teste' })).status).toBe(200);
    await sql`UPDATE tenants SET trial_ends_at = ${new Date(Date.now() - 30 * DIA).toISOString()} WHERE id = 2`;
    const r = await agir({ acao: 'reativar', barbearia: 2 });
    expect(r.status).toBe(200);
    expect((await r.json()).fase).toMatchObject({ rotulo: 'Fora do ar', tom: 'fora' });
    expect((await linha(2)).status).toBe('trial');
    // E o caminho de volta é estender o teste.
    expect((await agir({ acao: 'estender-teste', barbearia: 2, dias: 2 })).status).toBe(200);
    expect((await doHost('no-teste'))?.slug).toBe('no-teste');
  });

  it('cada ação ficou no registro, na ordem, com o texto da tela', async () => {
    const acoes = await mod.ultimasAcoes();
    const textos = acoes.map((a) => mod.descreverAcao(a));
    expect(textos[0]).toMatch(/^Estendeu o teste de no-teste em 2 dias/);
    expect(textos).toContain('Tirou em-dia do ar — estava em dia. Motivo: pediu para pausar');
    expect(textos).toContain('Reativou em-dia — em dia');
    expect(acoes.filter((a) => a.acao === 'entrou').length).toBeGreaterThanOrEqual(1);
  });

  it('o papel do app não enxerga o registro do operador — nem com a barbearia certa no contexto', async () => {
    const { comTenant, db } = await import('../src/db/index.js');
    const { sql: q } = await import('drizzle-orm');
    let recusa = '';
    try {
      await comTenant({ id: 1, slug: 'em-dia', status: 'active', domain: null },
        () => db.execute(q`SELECT count(*) FROM acoes_do_operador`));
    } catch (e) {
      const erro = e as { message?: string; cause?: { message?: string } };
      recusa = `${erro.message ?? ''} ${erro.cause?.message ?? ''}`;
    }
    expect(recusa).toMatch(/permission denied/i);
  });
});
