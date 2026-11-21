// Duas gravações ao mesmo tempo, quando a conferência vem ANTES da gravação (21/11/2026):
//
// - o cancelar do painel (`api/admin/appointments/[id]/cancel.ts`): o segundo não mudava nada e
//   respondia "ok";
// - o cadastro (`lib/provisionarBarbearia.ts`): o endereço ou o WhatsApp tomado no meio caía no índice
//   do banco e virava 500, em vez da recusa com o campo;
// - a equipe (`api/admin/barbers/index.ts`): o mesmo nome no mesmo instante, 500.
//
// Cada caso faz a corrida de verdade e determinística: outra conexão grava e SEGURA a transação; o
// pedido confere (não vê nada, porque não foi gravado), chega à gravação e espera a trava; a outra
// confirma, e o banco decide.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

type Rota = (ctx: unknown) => Promise<Response>;
type Tenant = import('../src/lib/tenant').Tenant;

const BASE = {
  slug: 'corrida', nome: 'Barbearia da Corrida', dono: 'Fulano', telefone: '84 99999-0000',
  endereco: 'Rua A, 1', cidade: 'Mossoró/RN', estado: 'RN', senha: 'segredo123', email: 'f@exemplo.com.br',
};

/** Outra conexão grava e segura; `pedido` roda no meio; depois de `ms`, ela confirma. */
async function comOutraSegurando<T>(outra: ReturnType<typeof postgres>, gravar: (tx: postgres.TransactionSql) => Promise<unknown>, pedido: () => Promise<T>, ms = 400): Promise<T> {
  let emCurso!: Promise<T>;
  await outra.begin(async (tx) => {
    await gravar(tx);
    emCurso = pedido();
    await new Promise((ok) => setTimeout(ok, ms));
  });
  return emCurso;
}

describe.skipIf(!TEM_BANCO)('gravações ao mesmo tempo: o banco decide, e a resposta diz', () => {
  let sql: ReturnType<typeof postgres>;
  let outra: ReturnType<typeof postgres>;
  let comTenant: typeof import('../src/db/index.js').comTenant;
  let provisionarBarbearia: typeof import('../src/lib/provisionarBarbearia.js').provisionarBarbearia;
  let cancelar: Rota;
  let criarBarbeiro: Rota;
  let um: Tenant;
  let cookieDona = '';

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    outra = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'um', 'Um', 'active')`;
    await sql`SELECT setval('tenants_id_seq', 10)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dona', 'dona', 'admin', 'x', true, '84988880001')`;
    await sql`SELECT setval('barbers_id_seq', 10)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookieDona = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
    const tenantLib = await import('../src/lib/tenant.js');
    await tenantLib.carregarTenants(true);
    um = tenantLib.tenantPorIdMesmoForaDoAr(1)!;
    ({ comTenant } = await import('../src/db/index.js'));
    ({ provisionarBarbearia } = await import('../src/lib/provisionarBarbearia.js'));
    ({ POST: cancelar } = await import('../src/pages/api/admin/appointments/[id]/cancel.ts') as never);
    ({ POST: criarBarbeiro } = await import('../src/pages/api/admin/barbers/index.ts') as never);
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await outra?.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  const noPainel = (rota: Rota, url: string, corpo: unknown, params: Record<string, string>) => comTenant(um, async () => {
    const r = await rota({
      request: new Request(url, { method: 'POST', headers: { cookie: cookieDona, 'content-type': 'application/json' }, body: JSON.stringify(corpo) }),
      params,
    });
    return { status: r.status, corpo: await r.json() as Record<string, unknown> };
  });

  describe('o cancelar do painel', () => {
    let id = 0;
    beforeEach(async () => {
      await sql`DELETE FROM appointments`;
      const inicio = new Date(Date.now() + 3 * 24 * 3600_000);
      inicio.setUTCMinutes(0, 0, 0);
      const [a] = await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone, starts_at, ends_at, duration_minutes, price_cents, status, manage_token)
        VALUES (1, 1, 1, 'Cliente', '84977770000', ${inicio.toISOString()}, ${new Date(inicio.getTime() + 30 * 60_000).toISOString()}, 30, 4000, 'confirmed', ${`tok-${Date.now()}`}) RETURNING id`;
      id = a.id;
    });
    const pedir = () => noPainel(cancelar, `http://painel.test/api/admin/appointments/${id}/cancel`, {}, { id: String(id) });

    it('controle: cancela uma vez', async () => {
      expect((await pedir()).status).toBe(200);
      expect((await sql`SELECT status FROM appointments WHERE id = ${id}`)[0].status).toBe('cancelled');
    });

    it('o outro pedido cancela no meio: este não diz "ok" sobre o que não fez — 409', async () => {
      const r = await comOutraSegurando(outra,
        (tx) => tx`UPDATE appointments SET status = 'cancelled', cancelled_by = 'customer' WHERE id = ${id}`, pedir);
      expect(r.status).toBe(409);
      // Quem cancelou foi o outro: a marca dele fica.
      expect((await sql`SELECT cancelled_by FROM appointments WHERE id = ${id}`)[0].cancelled_by).toBe('customer');
    });
  });

  describe('o cadastro', () => {
    beforeEach(async () => {
      await sql`DELETE FROM working_hours WHERE tenant_id > 1`;
      await sql`DELETE FROM barber_services WHERE tenant_id > 1`;
      await sql`DELETE FROM services WHERE tenant_id > 1`;
      await sql`DELETE FROM settings WHERE tenant_id > 1`;
      await sql`DELETE FROM barbers WHERE tenant_id > 1`;
      await sql`DELETE FROM tenants WHERE id > 1`;
    });

    it('controle: cadastra', async () => {
      expect((await provisionarBarbearia(sql, BASE)).ok).toBe(true);
    });

    it('o endereço tomado no meio: a recusa do campo, não 500', async () => {
      const r = await comOutraSegurando(outra,
        (tx) => tx`INSERT INTO tenants (slug, business_name, status) VALUES ('corrida', 'Outra', 'active')`,
        () => provisionarBarbearia(sql, BASE));
      expect(r).toMatchObject({ ok: false, campo: 'slug', conflito: true });
    });

    it('o WhatsApp tomado no meio: a recusa do campo, não 500', async () => {
      const r = await comOutraSegurando(outra, async (tx) => {
        const [t] = await tx`INSERT INTO tenants (slug, business_name, status) VALUES ('outra', 'Outra', 'active') RETURNING id`;
        await tx`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active, phone)
                 VALUES (${t.id}, 'Outro', 'outro', 'admin', 'x', true, '84999990000')`;
      }, () => provisionarBarbearia(sql, BASE));
      expect(r).toMatchObject({ ok: false, campo: 'telefone-dono', conflito: true });
      expect(await sql`SELECT id FROM tenants WHERE slug = 'corrida'`).toHaveLength(0); // nada pela metade
    });
  });

  describe('a equipe', () => {
    const corpo = { name: 'Carlos Corrida', phone: '84966660001', role: 'barber', password: 'segredo123' };

    it('o mesmo nome no meio: 409 com o slug, não 500', async () => {
      const r = await comOutraSegurando(outra,
        (tx) => tx`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active, phone)
                   VALUES (1, 'Carlos', 'carlos-corrida', 'barber', 'x', true, '84966669999')`,
        () => noPainel(criarBarbeiro, 'http://painel.test/api/admin/barbers', corpo, {}));
      expect(r.status).toBe(409);
      expect(String(r.corpo.error)).toMatch(/slug "carlos-corrida" já está em uso/);
    });
  });
});
