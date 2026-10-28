// Desligar barbeiro com cliente marcado pede confirmação (revisão de 27/10/2026).
//
// Antes salvava calado: o barbeiro sumia da agenda do dia, o Início seguia contando o
// dinheiro, e o cliente via "confirmado com Carlos" no link sem conseguir remarcar — barbeiro
// desligado não tem vaga em dia nenhum. Reproduzido no navegador.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
let rota: typeof import('../src/pages/api/admin/barbers/[id].ts');
let sessao: typeof import('../src/lib/session.ts');
let db: typeof import('../src/db/index.ts');
let dono = '';

const daqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

async function desligar(id: number, extra: Record<string, unknown> = {}) {
  const r = await rota.PUT({
    request: new Request(`http://painel.test/api/admin/barbers/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: dono.split(';')[0] },
      body: JSON.stringify({ active: false, ...extra }),
    }),
    params: { id: String(id) },
  } as never) as Response;
  return { status: r.status, corpo: await r.json() };
}
const ativo = async (id: number) => (await sql<{ active: boolean }[]>`SELECT active FROM barbers WHERE id = ${id}`)[0].active;

describe.skipIf(!TEM_BANCO)('desligar barbeiro com cliente marcado', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    process.env.SESSION_SECRET ??= 'x'.repeat(40);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'ze', 'Barbearia do Zé', 'active')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, phone, role, password_hash, active) VALUES
      (1, 1, 'Zé', 'ze', '84966660001', 'admin', 'x', true),
      (2, 1, 'Carlos', 'carlos', '84966660002', 'barber', 'x', true),
      (3, 1, 'Pedro', 'pedro', '84966660003', 'barber', 'x', true)`;
    await sql`SELECT setval('barbers_id_seq', 3)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES (1, 1, 'Corte', 'corte', 3500, true)`;
    const ag = (barbeiro: number, inicio: string, status: string, token: string) => sql`
      INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
        starts_at, ends_at, duration_minutes, price_cents, manage_token, created_by, status)
      VALUES (1, ${barbeiro}, 1, 'Cliente', '84990000001', ${inicio}, ${new Date(Date.parse(inicio) + 30 * 60_000).toISOString()}, 30, 3500, ${token}, 'customer', ${status})`;
    await ag(2, daqui(1), 'confirmed', 'token-desligar-0000000001');
    await ag(2, daqui(2), 'confirmed', 'token-desligar-0000000002');
    await ag(3, daqui(-1), 'confirmed', 'token-desligar-0000000003'); // passado: não segura
    await ag(3, daqui(1), 'cancelled', 'token-desligar-0000000004');  // cancelado: não segura
    rota = await import('../src/pages/api/admin/barbers/[id].ts');
    sessao = await import('../src/lib/session.ts');
    db = await import('../src/db/index.ts');
    dono = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await db?.sqlConn.end({ timeout: 5 });
  });

  it('com cliente marcado daqui para a frente: recusa, diz quantos e o próximo, e não desliga', async () => {
    const r = await desligar(2);
    expect(r.status).toBe(409);
    expect(r.corpo.pedeConfirmacao).toBe(true);
    expect(r.corpo.marcados).toBe(2);
    expect(r.corpo.error).toMatch(/Carlos tem 2 clientes marcados/);
    expect(await ativo(2)).toBe(true);
  });

  it('confirmado pelo dono: desliga', async () => {
    const r = await desligar(2, { mesmoComAgendados: true });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(await ativo(2)).toBe(false);
  });

  it('só passado ou cancelado: desliga direto', async () => {
    const r = await desligar(3);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(await ativo(3)).toBe(false);
  });

  it('a tela pergunta e reenvia com a confirmação', async () => {
    const { readFileSync } = await import('node:fs');
    const tela = readFileSync('src/pages/admin/barbeiros.astro', 'utf8');
    expect(tela).toMatch(/data\.pedeConfirmacao/);
    expect(tela).toMatch(/salvar\(true\)/);
  });
});
