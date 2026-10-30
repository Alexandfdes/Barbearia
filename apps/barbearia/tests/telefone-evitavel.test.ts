// O telefone de login deixou de ser uma prisão (18/10/2026, decisão do dono: "deixe evitável").
//
// Até aqui o índice `barbers_phone_uq` (migration 0002) valia para todo barbeiro, ativo ou
// não, e o telefone não se editava: o barbeiro desligado da barbearia A não entrava na B, o
// número digitado errado ficava errado para sempre. Agora (migration 0017) o número é único
// só entre os ATIVOS, e o dono o edita na Equipe. E desligar derruba as sessões abertas:
// reativar depois não as ressuscita (`docs/PENDENCIAS-ABERTAS.md` §2.55).
//
// As rotas rodam DENTRO de `comTenant`, com o papel restrito, como em produção
// (`tests/telefone-unico.test.ts` diz por quê).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const DO_JOAO = '84999990002';
const DA_DONA_VINTAGE = '84999990004';

let sql: ReturnType<typeof postgres>;
let criar: typeof import('../src/pages/api/admin/barbers/index.ts').POST;
let editar: typeof import('../src/pages/api/admin/barbers/[id].ts').PUT;
let entrar: typeof import('../src/pages/api/auth/login.ts').POST;
let sessao: typeof import('../src/lib/session.ts');
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let donoBayron = '';
let donaVintage = '';
let sessaoDoJoao = '';

const editarComo = (cookie: string, tenant: typeof BAYRON, id: number, corpo: unknown) => comTenant(tenant, async () => editar({
  request: new Request(`http://painel.test/api/admin/barbers/${id}`, {
    method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  }),
  params: { id: String(id) },
} as never));

const vale = async (cookie: string) => (await sessao.getSession(new Request('http://painel.test/admin', { headers: { cookie } }))) !== null;

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true, '84999990001'),
              (2, 1, 'João',            'joao',   'barber', 'x', true, ${DO_JOAO}),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true, ${DA_DONA_VINTAGE})`;
  await sql`SELECT setval('barbers_id_seq', 10)`;

  sessao = await import('../src/lib/session.ts');
  const valor = (c: string) => c.split(';')[0];
  donoBayron = valor(await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
  donaVintage = valor(await sessao.makeSessionCookie({ barberId: 4, role: 'admin', tenantId: 2 }));
  sessaoDoJoao = valor(await sessao.makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
  ({ POST: criar } = await import('../src/pages/api/admin/barbers/index.ts'));
  ({ PUT: editar } = await import('../src/pages/api/admin/barbers/[id].ts'));
  ({ POST: entrar } = await import('../src/pages/api/auth/login.ts'));
  ({ comTenant } = await import('../src/db/index.js'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o telefone do barbeiro', () => {
  it('a migration 0017: único só entre os ativos', async () => {
    const indices = (await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'barbers'`).map((r) => r.indexname);
    expect(indices).toContain('barbers_phone_ativo_uq');
    expect(indices).not.toContain('barbers_phone_uq');
  });

  it('desligar derruba as sessões abertas dele', async () => {
    expect(await vale(sessaoDoJoao)).toBe(true);
    const r = await editarComo(donoBayron, BAYRON, 2, { active: false });
    expect(r.status).toBe(200);
    expect(await vale(sessaoDoJoao)).toBe(false);
  });

  it('desligado na Bayron, o número dele vale na Vintage — e entra lá', async () => {
    const r = await comTenant(VINTAGE, async () => criar({
      request: new Request('http://painel.test/api/admin/barbers', {
        method: 'POST', headers: { cookie: donaVintage, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'João', phone: DO_JOAO, role: 'barber', password: 'senha-do-joao-1' }),
      }),
    } as never));
    expect(r.status).toBe(201);
    const login = await entrar({
      request: new Request('http://painel.test/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.70.0.1' },
        body: JSON.stringify({ identificador: DO_JOAO, password: 'senha-do-joao-1' }),
      }),
      clientAddress: '10.70.0.1',
    } as never);
    expect(login.status).toBe(200);
  });

  it('reativar na Bayron com o número já ativo na Vintage: 409, com o que fazer', async () => {
    const r = await editarComo(donoBayron, BAYRON, 2, { active: true });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/outra barbearia.*Troque o WhatsApp dele antes de reativar/);
  });

  it('o "esqueci a senha" pelo número vai para o barbeiro ATIVO dele, não para o desligado', async () => {
    const [{ id: ativo }] = await sql`SELECT id FROM barbers WHERE phone = ${DO_JOAO} AND active`;
    // O João desligado da Bayron, com o mesmo número, foi gravado antes do ativo da Vintage:
    // numa busca sem o filtro de ativo, ele vem primeiro.
    await sql`UPDATE barbers SET email = 'joao@vintage.test', email_confirmado_em = now() WHERE id = ${ativo}`;
    process.env.DOMINIO_BASE ??= 'fadeline.com.br';
    const { pedirRedefinicao } = await import('../src/lib/redefinicaoDeSenha.ts');
    const { caixaDeSaida } = await import('../src/lib/email.ts');
    caixaDeSaida.length = 0;
    expect(await pedirRedefinicao(DO_JOAO)).toBe('enviado');
    expect(caixaDeSaida.at(-1)?.para).toBe('joao@vintage.test');
  });

  it('o dono edita o telefone e reativa — e a sessão de antes de desligar continua morta', async () => {
    const r = await editarComo(donoBayron, BAYRON, 2, { phone: '(84) 98888-0002', active: true });
    expect(r.status).toBe(200);
    const [joao] = await sql`SELECT phone, active FROM barbers WHERE id = 2`;
    expect(joao).toMatchObject({ phone: '84988880002', active: true });
    expect(await vale(sessaoDoJoao)).toBe(false);
  });

  it('telefone de outro barbeiro ativo: 409; telefone inválido: 400', async () => {
    expect((await editarComo(donoBayron, BAYRON, 2, { phone: DA_DONA_VINTAGE })).status).toBe(409);
    expect((await editarComo(donoBayron, BAYRON, 2, { phone: '123' })).status).toBe(400);
  });
});
