// A reserva de produto retirada ou cancelada uma vez só — `src/pages/api/admin/reservations/[id].ts`
// (19/11/2026). A condição `pending` era conferida só na leitura: dois cliques, ou o dono e o barbeiro
// ao mesmo tempo, passavam os dois, e a venda entrava em dobro no faturamento; o cancelar que corria
// junto deixava a reserva cancelada com a venda lançada.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

type Rota = (ctx: unknown) => Promise<Response>;
type Tenant = import('../src/lib/tenant').Tenant;

describe.skipIf(!TEM_BANCO)('a reserva: retirada ou cancelada, uma vez', () => {
  let sql: ReturnType<typeof postgres>;
  let comTenant: typeof import('../src/db/index.js').comTenant;
  let PATCH: Rota;
  let um: Tenant;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'reserva-um', 'Reserva Um', 'active')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dona', 'dona', 'admin', 'x', true, '84999990001'),
      (2, 1, 'Barbeiro', 'barbeiro', 'barber', 'x', true, '84999990002')`;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const valor = (c: string) => c.split(';')[0];
    cookies.dona = valor(await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 }));
    cookies.barbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
    const tenantLib = await import('../src/lib/tenant.js');
    await tenantLib.carregarTenants(true);
    um = tenantLib.tenantPorIdMesmoForaDoAr(1)!;
    ({ comTenant } = await import('../src/db/index.js'));
    ({ PATCH } = await import('../src/pages/api/admin/reservations/[id].ts') as never);
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  let reserva = 0;
  beforeEach(async () => {
    await sql`DELETE FROM product_sales`;
    await sql`DELETE FROM reservations`;
    const [r] = await sql`INSERT INTO reservations (tenant_id, product_name, price_cents, quantity, customer_name, customer_phone)
      VALUES (1, 'Pomada', 4000, 2, 'Cliente', '84988887777') RETURNING id`;
    reserva = r.id;
  });

  const pedir = (cookie: string, action: string) => comTenant(um, async () => {
    const r = await PATCH({
      request: new Request(`http://painel.test/api/admin/reservations/${reserva}`, {
        method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      }),
      params: { id: String(reserva) },
    });
    return r.status;
  });
  const vendas = async () => (await sql`SELECT count(*)::int AS n, coalesce(sum(price_cents), 0)::int AS total FROM product_sales`)[0];
  const status = async () => (await sql`SELECT status FROM reservations WHERE id = ${reserva}`)[0].status;

  it('controle: retirar uma vez lança uma venda de R$ 80', async () => {
    expect(await pedir(cookies.dona, 'fulfill')).toBe(200);
    expect(await vendas()).toEqual({ n: 1, total: 8000 });
    expect(await status()).toBe('fulfilled');
  });

  it('dois "retirado" ao mesmo tempo: um passa, o outro é 409 — e a venda entra uma vez', async () => {
    const r = await Promise.all([pedir(cookies.dona, 'fulfill'), pedir(cookies.barbeiro, 'fulfill')]);
    expect(r.sort()).toEqual([200, 409]);
    expect(await vendas()).toEqual({ n: 1, total: 8000 });
  });

  it('"retirado" e "cancelar" juntos: vale um só, e a reserva cancelada nunca tem venda', async () => {
    const r = await Promise.all([pedir(cookies.dona, 'fulfill'), pedir(cookies.barbeiro, 'cancel')]);
    expect(r.sort()).toEqual([200, 409]);
    const v = await vendas();
    if ((await status()) === 'cancelled') expect(v.n).toBe(0);
    else expect(v).toEqual({ n: 1, total: 8000 });
  });

  it('retirada, o cancelar que chega depois é 409 — a reserva continua retirada, com a venda', async () => {
    expect(await pedir(cookies.dona, 'fulfill')).toBe(200);
    expect(await pedir(cookies.barbeiro, 'cancel')).toBe(409);
    expect(await status()).toBe('fulfilled');
    expect(await vendas()).toEqual({ n: 1, total: 8000 });
  });

  it('o cancelar na corrida de verdade: outra conexão retira e segura a linha; o cancelar espera, e depois é 409', async () => {
    // A leitura do cancelar ainda vê "pendente" (a outra transação não gravou); o UPDATE dele espera a
    // trava. Gravada a retirada, o Postgres reavalia o WHERE: sem a condição `pending`, ele sobrescrevia.
    let cancelar!: Promise<number>;
    await sql.begin(async (tx) => {
      await tx`UPDATE reservations SET status = 'fulfilled' WHERE id = ${reserva}`;
      cancelar = pedir(cookies.barbeiro, 'cancel');
      await new Promise((ok) => setTimeout(ok, 400));
    });
    expect(await cancelar).toBe(409);
    expect(await status()).toBe('fulfilled');
  });

  it('a corrida de verdade: o outro pedido grava depois da leitura e antes do UPDATE — e não sai venda nenhuma deste', async () => {
    // Um gatilho faz o papel do outro pedido: antes de o UPDATE deste chegar à linha, ela já não está pendente.
    await sql`CREATE FUNCTION outro_pedido_antes() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF OLD.status = 'pending' AND NEW.status = 'fulfilled' AND current_setting('teste.uma_vez', true) IS NULL THEN
        PERFORM set_config('teste.uma_vez', '1', true);
        UPDATE reservations SET status = 'cancelled' WHERE id = OLD.id;
        RETURN NULL;
      END IF; RETURN NEW; END $$`;
    await sql`CREATE TRIGGER outro_pedido_antes BEFORE UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION outro_pedido_antes()`;
    try {
      expect(await pedir(cookies.dona, 'fulfill')).toBe(409);
    } finally {
      await sql`DROP TRIGGER outro_pedido_antes ON reservations`;
      await sql`DROP FUNCTION outro_pedido_antes()`;
    }
    expect(await status()).toBe('cancelled');
    expect((await vendas()).n).toBe(0);
  });
});
