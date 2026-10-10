// O e-mail de cada um, na tela da equipe (`/admin/barbeiros`).
//
// Até 09/10/2026 o painel não tinha onde ver nem corrigir o e-mail: digitado
// errado no cadastro, o erro só aparecia no dia em que a senha nova não chegasse
// (`docs/JORNADA-DO-BARBEIRO.md` §2.2). Agora ele aparece na lista e se troca em
// "Editar" — com a mesma regra do cadastro (`src/lib/email.ts`).
//
// As chamadas rodam DENTRO de `comTenant`, com o papel restrito, como em
// produção — o mesmo cuidado de `tests/telefone-unico.test.ts`.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null };

let sql: ReturnType<typeof postgres>;
let editar: typeof import('../src/pages/api/admin/barbers/[id].ts').PUT;
let rotaDaLista: typeof import('../src/pages/api/admin/barbers/index.ts');
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let cookieDono = '';
let cookieBarbeiro = '';

function pedido(url: string, metodo: string, cookie: string, corpo?: unknown): Request {
  return new Request(url, {
    method: metodo,
    headers: { cookie, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

const trocarEmail = (id: number, email: unknown, cookie = cookieDono) =>
  comTenant(BAYRON, async () => editar({
    request: pedido(`http://painel.test/api/admin/barbers/${id}`, 'PUT', cookie, { email }),
    params: { id: String(id) },
  } as never));

async function emailDe(id: number): Promise<string | null> {
  const [b] = await sql`SELECT email FROM barbers WHERE id = ${id}`;
  return b.email;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true, '84999990001', NULL),
              (2, 1, 'Ana',             'ana',    'barber', 'x', true, '84999990002', NULL),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true, '84999990004', 'dona@vintage.com')`;
  await sql`SELECT setval('barbers_id_seq', 10)`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDono     = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookieBarbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));

  ({ PUT: editar } = await import('../src/pages/api/admin/barbers/[id].ts'));
  rotaDaLista = await import('../src/pages/api/admin/barbers/index.ts');
  ({ comTenant } = await import('../src/db/index.js'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o e-mail na tela da equipe', () => {
  it('o dono grava o e-mail de alguém — sem espaço e em minúsculas, como o cadastro', async () => {
    const r = await trocarEmail(2, '  Ana@Bayron.COM ');
    expect(r.status).toBe(200);
    expect(await emailDe(2)).toBe('ana@bayron.com');
  });

  it('vazio apaga', async () => {
    expect((await trocarEmail(2, '')).status).toBe(200);
    expect(await emailDe(2)).toBeNull();
  });

  it('sem forma de e-mail: 400 com o motivo, e nada muda', async () => {
    await trocarEmail(1, 'dono@bayron.com');
    const r = await trocarEmail(1, 'dono@bayron');
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/não parece um e-mail/);
    expect(await emailDe(1)).toBe('dono@bayron.com');
  });

  it('não alcança o barbeiro de outra barbearia', async () => {
    const r = await trocarEmail(4, 'invasor@x.com');
    expect(r.status).toBe(404);
    expect(await emailDe(4)).toBe('dona@vintage.com');
  });

  it('só o dono troca', async () => {
    const r = await trocarEmail(2, 'ana@bayron.com', cookieBarbeiro);
    expect(r.status).toBe(403);
  });

  it('a lista devolve o e-mail; o barbeiro novo pode nascer com um', async () => {
    const criado = await comTenant(BAYRON, async () => rotaDaLista.POST({
      request: pedido('http://painel.test/api/admin/barbers', 'POST', cookieDono, {
        name: 'Carlos', phone: '84999990077', role: 'barber', password: 'senha-de-teste', email: 'Carlos@Bayron.com',
      }),
    } as never));
    expect(criado.status).toBe(201);

    const ruim = await comTenant(BAYRON, async () => rotaDaLista.POST({
      request: pedido('http://painel.test/api/admin/barbers', 'POST', cookieDono, {
        name: 'Paulo', phone: '84999990078', role: 'barber', password: 'senha-de-teste', email: 'paulo@',
      }),
    } as never));
    expect(ruim.status).toBe(400);

    const lista = await comTenant(BAYRON, async () => rotaDaLista.GET({
      request: pedido('http://painel.test/api/admin/barbers', 'GET', cookieDono),
    } as never));
    const corpo = (await lista.json()) as { name: string; email: string | null }[];
    expect(corpo.find((b) => b.name === 'Carlos')?.email).toBe('carlos@bayron.com');
    expect(corpo.some((b) => b.name === 'Paulo')).toBe(false);
  });
});
