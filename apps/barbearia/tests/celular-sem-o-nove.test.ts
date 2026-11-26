// O celular digitado sem o 9 da frente â€” achado no teste em produÃ§Ã£o de 25/11/2026.
//
// "(84) 9965-8951" tem 10 dÃ­gitos e passava como telefone FIXO. Mas fixo comeÃ§a de 2 a 5: nÃºmero local
// de 8 dÃ­gitos comeÃ§ando de 6 a 9 Ã© celular sem o 9, que todo celular do Brasil tem desde 2016. TrÃªs
// estragos: o login procura o telefone exatamente como foi gravado, e o dono que digitasse o nÃºmero
// certo, com o 9, nÃ£o entrava; o link do WhatsApp saÃ­a sem o 9; e o mesmo celular virava DUAS contas,
// uma com e outra sem o 9 â€” a trava de telefone repetido (migration 0017) compara os dÃ­gitos.
//
// A parte de banco precisa de Postgres; sem DATABASE_URL ela Ã© pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { celularSemONove, formasDoTelefone, recusaDoCelularSemONove } from '../src/lib/phone';
import { chavesDaConta, resetRateLimit } from '../src/lib/rateLimit';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

describe('o que Ã© celular sem o 9', () => {
  it('8 dÃ­gitos locais comeÃ§ando de 6 a 9 Ã© celular sem o 9; fixo, de 2 a 5, nÃ£o', () => {
    expect(celularSemONove('8499658951')).toBe(true);
    expect(celularSemONove('1176543210')).toBe(true);
    expect(celularSemONove('8433334444')).toBe(false);   // fixo
    expect(celularSemONove('8425556666')).toBe(false);   // fixo
    expect(celularSemONove('84999658951')).toBe(false);  // celular certo
  });

  it('a recusa jÃ¡ escreve o nÃºmero certo', () => {
    expect(recusaDoCelularSemONove('8499658951')).toBe('Celular tem o 9 na frente: (84) 99965-8951.');
  });

  it('as formas do mesmo celular: com e sem o 9 â€” e o fixo, sÃ³ ele', () => {
    expect(formasDoTelefone('84999658951')).toEqual(['84999658951', '8499658951']);
    expect(formasDoTelefone('8499658951')).toEqual(['8499658951', '84999658951']);
    expect(formasDoTelefone('8433334444')).toEqual(['8433334444']);
    expect(formasDoTelefone('')).toEqual([]);
  });
});

// â”€â”€ Contra o banco â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SENHA = 'SenhaBoa123';
let sql: ReturnType<typeof postgres>;
let provisionar: typeof import('../src/lib/provisionarBarbearia').provisionarBarbearia;
let entrarNaRota: typeof import('../src/pages/api/auth/login.ts').POST;
let criarBarbeiro: typeof import('../src/pages/api/admin/barbers/index.ts').POST;
let editarBarbeiro: typeof import('../src/pages/api/admin/barbers/[id].ts').PUT;
let pedirRedefinicao: typeof import('../src/lib/redefinicaoDeSenha').pedirRedefinicao;
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let cookieDono = '';
const LOJA = { id: 1, slug: 'antiga', status: 'active', domain: null, fuso: 'America/Fortaleza' };

const BASE = {
  slug: 'nova', nome: 'Barbearia Nova', dono: 'Dono Novo', telefone: '84 3333-4444',
  endereco: 'R. das Flores, 42', cidade: 'MossorÃ³/RN', estado: 'RN', senha: 'segredo123', email: 'novo@exemplo.com.br',
};

async function entrar(identificador: string) {
  const ip = `10.9.0.${Math.floor(Math.random() * 250) + 1}`;
  const res = await entrarNaRota({
    request: new Request('http://painel.test/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ identificador, password: SENHA }),
    }),
    clientAddress: ip,
  } as never);
  return { status: res.status, cookie: res.headers.get('Set-Cookie') ?? '' };
}

describe.skipIf(!TEM_BANCO)('contra o banco', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const h = await hash(SENHA, 4);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
                (1, 'antiga', 'Barbearia Antiga', 'active'),
                (2, 'dupla',  'Barbearia Dupla',  'active')`;
    // O dono da 1 ficou gravado SEM o 9, antes de 25/11/2026. A 2 tem as duas formas do mesmo
    // celular, em barbearias diferentes â€” o que o teste em produÃ§Ã£o criou.
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, phone, role, password_hash, active, email, email_confirmado_em) VALUES
                (1, 1, 'Dono Antigo', 'dono',  '8498887777',  'admin', ${h}, true, 'antigo@exemplo.com.br', now()),
                (2, 2, 'Dono Dupla',  'dono',  '84999658951', 'admin', ${h}, true, NULL, NULL),
                (3, 1, 'Sem o Nove',  'nove',  '8499658951',  'barber', ${h}, true, NULL, NULL)`;
    await sql`SELECT setval('tenants_id_seq', 10)`;
    await sql`SELECT setval('barbers_id_seq', 10)`;

    ({ provisionarBarbearia: provisionar } = await import('../src/lib/provisionarBarbearia'));
    ({ POST: entrarNaRota } = await import('../src/pages/api/auth/login.ts'));
    ({ POST: criarBarbeiro } = await import('../src/pages/api/admin/barbers/index.ts'));
    ({ PUT: editarBarbeiro } = await import('../src/pages/api/admin/barbers/[id].ts'));
    ({ pedirRedefinicao } = await import('../src/lib/redefinicaoDeSenha'));
    ({ comTenant } = await import('../src/db/index.js'));
    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookieDono = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    const mod = await import('../src/db/index.js');
    await mod.sqlConn.end({ timeout: 5 });
  });

  beforeEach(() => {
    for (const t of ['8498887777', '84998887777', '84999658951', '8499658951']) for (const k of chavesDaConta(t)) resetRateLimit(k);
  });

  it('o cadastro recusa o celular sem o 9 â€” no login e no WhatsApp da barbearia â€” e nada Ã© criado', async () => {
    const login = await provisionar(sql, { ...BASE, telefoneDono: '84 9876-5432' } as never);
    expect(login).toMatchObject({ ok: false, campo: 'telefone-dono', erro: 'Celular tem o 9 na frente: (84) 99876-5432.' });
    const loja = await provisionar(sql, { ...BASE, telefone: '(84) 9876-5432' } as never);
    expect(loja).toMatchObject({ ok: false, campo: 'telefone' });
    expect((await sql`SELECT count(*)::int AS n FROM tenants WHERE slug = 'nova'`)[0].n).toBe(0);
    // Controle: o mesmo celular, com o 9, cria — e o WhatsApp da barbearia, fixo de verdade, passa.
    expect((await provisionar(sql, { ...BASE, telefoneDono: '84 99876-5432' } as never)).ok).toBe(true);
  });

  it('o cadastro reconhece o mesmo celular gravado sem o 9: Ã© o login de outro barbeiro', async () => {
    const r = await provisionar(sql, { ...BASE, slug: 'outra', telefoneDono: '84 99888-7777' } as never);
    expect(r).toMatchObject({ ok: false, campo: 'telefone-dono', conflito: true });
  });

  it('o login acha quem ficou gravado sem o 9 pelo nÃºmero certo â€” e pelo de antes', async () => {
    expect((await entrar('(84) 99888-7777')).status).toBe(200);
    expect((await entrar('84 9888-7777')).status).toBe(200);
  });

  it('com as duas formas gravadas, vence a digitada', async () => {
    const comNove = await entrar('84999658951');
    const semNove = await entrar('8499658951');
    expect(comNove.status).toBe(200);
    expect(semNove.status).toBe(200);
    const { unsealData } = await import('iron-session');
    const ler = async (c: string) => unsealData<{ barberId: number }>(decodeURIComponent(c.split(';')[0].split('=')[1]),
      { password: process.env.SESSION_SECRET! });
    expect((await ler(comNove.cookie)).barberId).toBe(2);
    expect((await ler(semNove.cookie)).barberId).toBe(3);
  });

  it('a senha esquecida acha quem ficou gravado sem o 9 pelo nÃºmero certo', async () => {
    expect(await pedirRedefinicao('(84) 99888-7777')).not.toBe('sem-cadastro');
  });

  it('a Equipe recusa o celular sem o 9 â€” ao criar e ao editar', async () => {
    const criar = await comTenant(LOJA, async () => criarBarbeiro({
      request: new Request('http://painel.test/api/admin/barbers', {
        method: 'POST', headers: { cookie: cookieDono, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Barbeiro Novo', phone: '84 9123-4567', role: 'barber', password: 'senha-de-teste' }),
      }),
    } as never));
    expect(criar.status).toBe(400);
    expect((await criar.json()).error).toBe('Celular tem o 9 na frente: (84) 99123-4567.');

    const editar = await comTenant(LOJA, async () => editarBarbeiro({
      params: { id: '1' },
      request: new Request('http://painel.test/api/admin/barbers/1', {
        method: 'PUT', headers: { cookie: cookieDono, 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '84 9123-4567' }),
      }),
    } as never));
    expect(editar.status).toBe(400);
    expect((await sql`SELECT phone FROM barbers WHERE id = 1`)[0].phone).toBe('8498887777');
  });
});
