// O telefone de login é único NO MUNDO — e o dono da barbearia precisa ouvir
// isso com o motivo, não com um erro genérico.
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// `api/admin/barbers/index.ts` tinha uma consulta que dizia conferir o telefone
// em todas as barbearias, "sem filtrar por tenant, de propósito". Só que a rota
// roda dentro da requisição, sob o RLS — e o RLS mostrava a ela apenas os
// barbeiros DESTA barbearia. O telefone já usado em outra passava pela conferência,
// batia no índice `barbers_phone_uq`, e o `catch` genérico devolvia 500 "Erro ao
// criar barbeiro". O índice segurava o dado; o dono ficava sem saber o motivo.
//
// Achado em 25/09/2026 pelo guarda de consulta por consulta de
// `tests/escopo-rotas.test.ts`, não por este arquivo.
//
// ⚠️ Por isso as chamadas aqui rodam DENTRO de `comTenant`, com o papel restrito,
// como em produção. Fora dele a rota usa a conexão de dono, que enxerga tudo — e
// a versão com defeito passava.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const TELEFONE_DO_BAYRON = '84999990001';

let sql: ReturnType<typeof postgres>;
let criar: typeof import('../src/pages/api/admin/barbers/index.ts').POST;
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let cookieDonoBayron = '';
let cookieDonaVintage = '';

function novo(cookie: string, phone: string, name = 'Barbeiro Novo'): Request {
  return new Request('http://painel.test/api/admin/barbers', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name, phone, role: 'barber', password: 'senha-de-teste' }),
  });
}

beforeAll(async () => {
  if (!TEM_BANCO) return;

  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true, ${TELEFONE_DO_BAYRON}),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true, '84999990004')`;
  await sql`SELECT setval('barbers_id_seq', 10)`;
  await sql.end({ timeout: 5 });

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDonoBayron  = valor(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
  cookieDonaVintage = valor(await makeSessionCookie({ barberId: 4, role: 'admin', tenantId: 2 }));

  ({ POST: criar } = await import('../src/pages/api/admin/barbers/index.ts'));
  ({ comTenant } = await import('../src/db/index.js'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('telefone de login repetido', () => {
  it('já usado em OUTRA barbearia: 409 com o motivo, não 500', async () => {
    const r = await comTenant(VINTAGE, async () => criar({ request: novo(cookieDonaVintage, TELEFONE_DO_BAYRON) } as never));
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/telefone já está cadastrado/i);
  });

  it('já usado NA MESMA barbearia: também 409', async () => {
    const r = await comTenant(BAYRON, async () => criar({ request: novo(cookieDonoBayron, TELEFONE_DO_BAYRON) } as never));
    expect(r.status).toBe(409);
  });

  it('telefone livre: cria — o 409 acima não vem de outra coisa', async () => {
    const r = await comTenant(VINTAGE, async () => criar({ request: novo(cookieDonaVintage, '84999990099') } as never));
    expect(r.status).toBe(201);
  });
});
