// A busca de clientes do painel — quem acha o quê.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// `api/admin/appointments/search.ts` era a ÚNICA rota de agendamento sem
// conferência de papel, e devolve o `manage_token` de cada resultado — o link
// de cancelamento. Um barbeiro comum digitava duas letras em `/admin/buscar` e
// recebia nome, telefone e o link para desmarcar o cliente do colega; o
// cancelamento ficava gravado como se o próprio cliente tivesse desmarcado.
//
// A mesma rota também não filtrava por barbearia na consulta: só o RLS segurava.
//
// ⚠️ Este arquivo foi escrito DEPOIS da correção, e não junto — o que a regra da
// casa proíbe. Foi a verificação por mutação de 24/09/2026 que mostrou a lacuna:
// com o filtro de papel removido, a suíte inteira continuava 269 de 269.
//
// A rota roda aqui FORA de `comTenant`, na conexão de dono, que ignora o RLS. É
// de propósito: o que se testa é a parede da aplicação, não a do banco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
let buscar: typeof import('../src/pages/api/admin/appointments/search.ts').GET;
let cookieDono = '';
let cookieAna = '';
let cookieDonaVintage = '';

interface Resultado { customerName: string; manageToken: string }

async function busca(cookie: string, q: string): Promise<Resultado[]> {
  const u = `http://painel.test/api/admin/appointments/search?q=${encodeURIComponent(q)}`;
  const r = await buscar({ request: new Request(u, { headers: { cookie } }), url: new URL(u) } as never);
  expect(r.status).toBe(200);
  return ((await r.json()) as { results: Resultado[] }).results;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;

  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true),
              (2, 1, 'Ana',             'ana',    'barber', 'x', true),
              (3, 1, 'Beto',            'beto',   'barber', 'x', true),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES
              (1, 1, 'Corte', 'corte', 4000),
              (2, 2, 'Corte', 'corte', 5000)`;
  await sql`SELECT setval('barbers_id_seq', 10)`;
  await sql`SELECT setval('services_id_seq', 10)`;

  // O mesmo nome de propósito: a busca por "Cliente" casa com os três.
  const agenda = (tenant: number, barbeiro: number, servico: number, nome: string, token: string) => sql`
    INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                              starts_at, ends_at, duration_minutes, price_cents, manage_token)
    VALUES (${tenant}, ${barbeiro}, ${servico}, ${nome}, '84900000000',
            '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z', 30, 4000, ${token})`;
  await agenda(1, 2, 1, 'Cliente da Ana',     'token-da-ana');
  await agenda(1, 3, 1, 'Cliente do Beto',    'token-do-beto');
  await agenda(2, 4, 2, 'Cliente da Vintage', 'token-da-vintage');

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDono        = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookieAna         = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
  cookieDonaVintage = valor(await makeSessionCookie({ barberId: 4, role: 'admin',  tenantId: 2 }));

  ({ GET: buscar } = await import('../src/pages/api/admin/appointments/search.ts'));
}, 30_000);

afterAll(async () => {
  if (TEM_BANCO) await sql?.end();
});

describe.skipIf(!TEM_BANCO)('quem acha o quê na busca de clientes', () => {
  it('o dono acha os clientes de todos os barbeiros DA BARBEARIA DELE', async () => {
    const nomes = (await busca(cookieDono, 'Cliente')).map((r) => r.customerName).sort();
    expect(nomes).toEqual(['Cliente da Ana', 'Cliente do Beto']);
  });

  it('barbeiro comum acha só os próprios — e nunca o link de cancelamento do colega', async () => {
    const achados = await busca(cookieAna, 'Cliente');
    expect(achados.map((r) => r.customerName)).toEqual(['Cliente da Ana']);
    // O dano real não era o nome: era o link que desmarca o cliente do Beto.
    expect(achados.map((r) => r.manageToken)).not.toContain('token-do-beto');
  });

  it('a outra barbearia não aparece para ninguém — nem para o dono', async () => {
    const doBayron = await busca(cookieDono, 'Cliente');
    expect(doBayron.map((r) => r.manageToken)).not.toContain('token-da-vintage');

    const daVintage = (await busca(cookieDonaVintage, 'Cliente')).map((r) => r.customerName);
    expect(daVintage).toEqual(['Cliente da Vintage']);
  });
});
