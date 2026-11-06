// Os tetos de cada barbearia (05/11/2026, `src/lib/tetos.ts`, `docs/PENDENCIAS-ABERTAS.md` §2.69).
//
// Até aqui só a galeria tinha teto: com o cadastro aberto, uma conta de teste grátis criava
// barbeiro sem fim — bcrypt no núcleo da VPS e um e-mail de confirmação cada — e produto com foto
// sem fim, no disco de todas. Estes casos seguram os quatro tetos pela rota de verdade, o teto ao
// RELIGAR (sem ele, criar-desligar-religar passava de qualquer um), e que cada barbearia conta só
// as suas.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import type { Tenant } from '../src/lib/tenant.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';
const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

describe.skipIf(!TEM_BANCO)('os tetos de cada barbearia', () => {
  let sql: ReturnType<typeof postgres>;
  let dbmod: typeof import('../src/db/index.js');
  let tetos: typeof import('../src/lib/tetos.js');
  let A: Tenant;
  let cookie = '';
  let fotos = '';
  type Rota = (contexto: never) => Promise<Response>;
  const rotas: Record<string, Rota> = {};

  const chamar = async (rota: Rota, metodo: string, caminho: string, params: Record<string, string>, corpo: unknown) => {
    const url = `http://painel.test${caminho}`;
    const formulario = corpo instanceof FormData;
    const request = new Request(url, {
      method: metodo,
      headers: { host: 'painel.test', cookie, ...(formulario ? {} : { 'content-type': 'application/json' }) },
      body: formulario ? corpo : JSON.stringify(corpo),
    });
    const r = await dbmod.comTenant(A, () => rota({ request, params, url: new URL(url) } as never));
    return { status: r.status, corpo: (await r.json()) as { error?: string } };
  };

  beforeAll(async () => {
    fotos = mkdtempSync(join(tmpdir(), 'tetos-'));
    process.env.UPLOAD_ROOT = fotos;
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'cheia', 'Cheia', 'active'), (2, 'vizinha', 'Vizinha', 'active')`;
    // A barbearia 1: o dono, 13 barbeiros ativos (14 com ele) e um desligado.
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
                (1, 1, 'Dono', 'dono', 'admin', 'x', true, '84990000001'),
                (2, 1, 'Desligado', 'desligado', 'barber', 'x', false, '84990000002')`;
    for (let i = 3; i <= 15; i++) {
      await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone)
                VALUES (${i}, 1, ${`B${i}`}, ${`b${i}`}, 'barber', 'x', true, ${`849900000${String(i).padStart(2, '0')}`})`;
    }
    await sql`SELECT setval('barbers_id_seq', 100)`;
    // 99 serviços ativos e um desligado; 199 produtos; 49 combos.
    for (let i = 1; i <= 100; i++) {
      await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active)
                VALUES (${i}, 1, ${`S${i}`}, ${`s${i}`}, 3000, ${i !== 100})`;
    }
    await sql`SELECT setval('services_id_seq', 1000)`;
    for (let i = 1; i <= 199; i++) {
      await sql`INSERT INTO products (id, tenant_id, slug, name, price_cents) VALUES (${i}, 1, ${`p${i}`}, ${`P${i}`}, 1000)`;
    }
    // A vizinha também tem 200 produtos: não conta para a barbearia 1.
    for (let i = 201; i <= 400; i++) {
      await sql`INSERT INTO products (id, tenant_id, slug, name, price_cents) VALUES (${i}, 2, ${`p${i}`}, ${`P${i}`}, 1000)`;
    }
    await sql`SELECT setval('products_id_seq', 1000)`;
    for (let i = 1; i <= 49; i++) {
      await sql`INSERT INTO combos (tenant_id, name, service_id, product_id) VALUES (1, ${`C${i}`}, 1, 1)`;
    }
    // A vizinha tem de tudo um pouco — barbeiros, serviços e combos ativos —: a conta da
    // barbearia 1 não pode enxergá-los, nem fora do RLS (o último caso).
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
                (91, 2, 'Viz 1', 'viz1', 'admin', 'x', true, '84991000001'),
                (92, 2, 'Viz 2', 'viz2', 'barber', 'x', true, '84991000002'),
                (93, 2, 'Viz 3', 'viz3', 'barber', 'x', true, '84991000003')`;
    for (let i = 2001; i <= 2005; i++) {
      await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES (${i}, 2, ${`V${i}`}, ${`v${i}`}, 3000, true)`;
    }
    await sql`INSERT INTO combos (tenant_id, name, service_id, product_id) VALUES (2, 'CV1', 2001, 201), (2, 'CV2', 2001, 201)`;

    dbmod = await import('../src/db/index.js');
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    A = tenant.resolverHost('cheia.fadeline.test')!;
    expect(A?.id).toBe(1);
    tetos = await import('../src/lib/tetos.js');
    rotas.criarBarbeiro = (await import('../src/pages/api/admin/barbers/index.ts')).POST as Rota;
    rotas.editarBarbeiro = (await import('../src/pages/api/admin/barbers/[id].ts')).PUT as Rota;
    rotas.criarServico = (await import('../src/pages/api/admin/services/index.ts')).POST as Rota;
    rotas.editarServico = (await import('../src/pages/api/admin/services/[id].ts')).PUT as Rota;
    rotas.criarProduto = (await import('../src/pages/api/admin/products/index.ts')).POST as Rota;
    rotas.criarCombo = (await import('../src/pages/api/admin/combos/index.ts')).POST as Rota;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookie = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await dbmod.sqlConn.end({ timeout: 5 });
    rmSync(fotos, { recursive: true, force: true });
  });

  const barbeiroNovo = (n: number) => ({ name: `Novo ${n}`, phone: `8498000000${n}`, role: 'barber', password: 'senha-de-teste-1' });

  it('a equipe: o 15º ativo entra, o 16º não — nem religando o desligado', async () => {
    expect((await chamar(rotas.criarBarbeiro, 'POST', '/api/admin/barbers', {}, barbeiroNovo(1))).status).toBe(201);
    const recusa = await chamar(rotas.criarBarbeiro, 'POST', '/api/admin/barbers', {}, barbeiroNovo(2));
    expect(recusa.status).toBe(409);
    expect(recusa.corpo.error).toBe(tetos.RECUSA_DO_TETO.barbeirosAtivos);
    expect((await chamar(rotas.editarBarbeiro, 'PUT', '/api/admin/barbers/2', { id: '2' }, { active: true })).status).toBe(409);
    // Desligou um: o desligado de antes volta.
    await sql`UPDATE barbers SET active = false WHERE id = 3`;
    expect((await chamar(rotas.editarBarbeiro, 'PUT', '/api/admin/barbers/2', { id: '2' }, { active: true })).status).toBe(200);
    // Editar o nome de quem já está ativo não conta no teto.
    expect((await chamar(rotas.editarBarbeiro, 'PUT', '/api/admin/barbers/4', { id: '4' }, { name: 'Outro nome' })).status).toBe(200);
  }, 60_000);

  it('os serviços: o 100º ativo entra, o 101º não — nem religando', async () => {
    expect((await chamar(rotas.criarServico, 'POST', '/api/admin/services', {}, { name: 'Novo A', priceCents: 3000 })).status).toBe(201);
    const recusa = await chamar(rotas.criarServico, 'POST', '/api/admin/services', {}, { name: 'Novo B', priceCents: 3000 });
    expect(recusa.status).toBe(409);
    expect(recusa.corpo.error).toBe(tetos.RECUSA_DO_TETO.servicosAtivos);
    expect((await chamar(rotas.editarServico, 'PUT', '/api/admin/services/100', { id: '100' }, { active: true })).status).toBe(409);
    // Mudar o preço de um ativo não conta.
    expect((await chamar(rotas.editarServico, 'PUT', '/api/admin/services/5', { id: '5' }, { priceCents: 3500 })).status).toBe(200);
  });

  it('os produtos: o 200º entra, o 201º não — e a recusa não deixa a foto no disco; a vizinha não conta', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#336699' } }).png().toBuffer();
    const produto = (nome: string) => {
      const f = new FormData();
      f.set('name', nome);
      f.set('price', '25');
      f.set('image', new File([png], 'foto.png', { type: 'image/png' }));
      return f;
    };
    expect((await chamar(rotas.criarProduto, 'POST', '/api/admin/products', {}, produto('Pomada nova'))).status).toBe(201);
    const antes = readdirSync(fotos, { recursive: true }).length;
    const recusa = await chamar(rotas.criarProduto, 'POST', '/api/admin/products', {}, produto('Cera nova'));
    expect(recusa.status).toBe(409);
    expect(recusa.corpo.error).toBe(tetos.RECUSA_DO_TETO.produtos);
    expect(readdirSync(fotos, { recursive: true }).length).toBe(antes);
  });

  it('os combos: o 50º entra, o 51º não', async () => {
    const combo = (nome: string) => {
      const f = new FormData();
      f.set('name', nome);
      f.set('serviceId', '1');
      f.set('productId', '1');
      f.set('discountPct', '10');
      return f;
    };
    expect((await chamar(rotas.criarCombo, 'POST', '/api/admin/combos', {}, combo('Combo novo'))).status).toBe(201);
    const recusa = await chamar(rotas.criarCombo, 'POST', '/api/admin/combos', {}, combo('Combo demais'));
    expect(recusa.status).toBe(409);
    expect(recusa.corpo.error).toBe(tetos.RECUSA_DO_TETO.combos);
  });

  it('a conta é da barbearia na própria consulta — não só pelo RLS', async () => {
    // Fora de `comTenant`, a consulta roda como dono do banco, sem o RLS: só o filtro da
    // aplicação separa a barbearia 1 da vizinha. É a primeira das duas paredes
    // (skill `barbearia-multi-tenant`, regra 3) — com o RLS na frente, as rotas acima não a veem.
    expect(await tetos.quantosHa('barbeirosAtivos', 1)).toBe(15);
    expect(await tetos.quantosHa('servicosAtivos', 1)).toBe(100);
    expect(await tetos.quantosHa('produtos', 1)).toBe(200);
    expect(await tetos.quantosHa('combos', 1)).toBe(50);
    // Controle: a vizinha existe, e tem as dela.
    expect(await tetos.quantosHa('barbeirosAtivos', 2)).toBe(3);
    expect(await tetos.quantosHa('servicosAtivos', 2)).toBe(5);
    expect(await tetos.quantosHa('combos', 2)).toBe(2);
  });

  it('os números são os decididos, e a frase diz o que fazer', () => {
    expect(tetos.TETOS).toEqual({ barbeirosAtivos: 15, servicosAtivos: 100, produtos: 200, combos: 50 });
    for (const frase of Object.values(tetos.RECUSA_DO_TETO)) expect(frase).toMatch(/Desligue|Apague/);
  });
});
