// O catálogo sugerido — `PENDENCIAS-ABERTAS.md` §4.5.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Barbearia nova nasce com zero serviço, e **sem serviço não entra
// agendamento**. O site fica apresentável e inútil ao mesmo tempo, sem nada na
// tela dizendo que falta alguma coisa. O catálogo tira o dono da tela em branco.
//
// O risco de resolver isso mal já tem nome neste projeto: o §4.6, em que as
// migrations plantavam os dados do Bayron em todo banco novo. Por isso os casos
// abaixo vigiam menos "o catálogo é criado" e mais **o que ele não pode fazer**:
// não entra sozinho, não entra duas vezes, e não coloca preço nenhum no ar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { CATALOGO_SUGERIDO } from '../src/lib/catalogoSugerido.js';

// `lib/session.ts` exige SESSION_SECRET e não tem valor padrão — de propósito:
// segredo com padrão é segredo que vai para produção sem ninguém trocar.
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
let criarCatalogo: typeof import('../src/pages/api/admin/services/catalogo-sugerido.ts').POST;
let atualizarServico: typeof import('../src/pages/api/admin/services/[id].ts').PUT;
let cookieAdmin = '';

/** Requisição de painel já autenticada como admin da barbearia 1. */
function pedido(corpo?: unknown) {
  return new Request('http://painel.test/api/admin/services/catalogo-sugerido', {
    method: 'POST',
    headers: { cookie: cookieAdmin, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

beforeAll(async () => {
  if (!TEM_BANCO) return;

  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'nova', 'Barbearia Nova', 'active')`;
  await sql`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active) VALUES
    (1, 'Dona da Nova', 'dona', 'admin', 'x', true),
    (1, 'Barbeiro Desligado', 'desligado', 'barber', 'x', false)`;

  const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM barbers WHERE slug = 'dona'`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  cookieAdmin = await makeSessionCookie({ barberId: id, role: 'admin', tenantId: 1 } as never);

  ({ POST: criarCatalogo } = await import('../src/pages/api/admin/services/catalogo-sugerido.ts'));
  ({ PUT: atualizarServico } = await import('../src/pages/api/admin/services/[id].ts'));
});

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql?.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe('a lista sugerida', () => {
  it('não traz preço nenhum — nem campo para ele', () => {
    // ⚠️ É a decisão central do §4.5. Preço de corte muda de bairro para
    // bairro; um valor sugerido que passa despercebido vira o preço no site do
    // dono, e ele descobre quando o cliente chegar no caixa com outra
    // expectativa. Preço errado no ar é pior que preço faltando.
    for (const s of CATALOGO_SUGERIDO) {
      expect(Object.keys(s).sort()).toEqual(['minutos', 'nome']);
    }
  });

  it('é curta, para não repetir a paralisia da tela em branco com outro formato', () => {
    // O medidor de completude (§4.4) já tinha ensinado isso: oito pendências na
    // tela travam quem olha; três não.
    expect(CATALOGO_SUGERIDO.length).toBeGreaterThanOrEqual(5);
    expect(CATALOGO_SUGERIDO.length).toBeLessThanOrEqual(12);
  });

  it('não repete nome e tem duração plausível', () => {
    const nomes = CATALOGO_SUGERIDO.map((s) => s.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    for (const s of CATALOGO_SUGERIDO) {
      expect(s.minutos).toBeGreaterThanOrEqual(5);
      expect(s.minutos).toBeLessThanOrEqual(180);
    }
  });
});

describe.skipIf(!TEM_BANCO)('criar o catálogo', () => {
  it('cria os serviços DESLIGADOS e sem preço', async () => {
    const res = await criarCatalogo({ request: pedido() } as never);
    expect(res.status).toBe(201);

    const linhas = await sql<{ active: boolean; price_cents: number }[]>`
      SELECT active, price_cents FROM services WHERE tenant_id = 1`;

    expect(linhas).toHaveLength(CATALOGO_SUGERIDO.length);
    expect(linhas.every((l) => l.active === false)).toBe(true);
    expect(linhas.every((l) => l.price_cents === 0)).toBe(true);
  });

  it('vincula aos barbeiros ATIVOS — serviço sem barbeiro não é agendável', async () => {
    // `api/services.ts` junta `services` com `barber_services`. Criar o serviço
    // sem o vínculo seria entregar meia solução para o mesmo problema.
    const vinculos = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM barber_services WHERE tenant_id = 1`;
    expect(vinculos[0].n).toBe(CATALOGO_SUGERIDO.length); // 1 barbeiro ativo, o outro não conta

    const duracoes = await sql<{ duration_minutes: number }[]>`
      SELECT duration_minutes FROM barber_services WHERE tenant_id = 1`;
    expect(duracoes.every((d) => d.duration_minutes > 0)).toBe(true);
  });

  it('RECUSA a segunda vez — catálogo já montado não recebe empurrão', async () => {
    // Esta é a regra que impede o endpoint de virar o §4.6 de novo: oito
    // serviços que o dono não pediu no meio dos dele, descobertos pelo site.
    const res = await criarCatalogo({ request: pedido() } as never);
    expect(res.status).toBe(409);

    const linhas = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM services WHERE tenant_id = 1`;
    expect(linhas[0].n).toBe(CATALOGO_SUGERIDO.length); // nada duplicou
  });
});

describe.skipIf(!TEM_BANCO)('o preço zero não chega ao site', () => {
  async function put(id: number, corpo: unknown) {
    const req = new Request(`http://painel.test/api/admin/services/${id}`, {
      method: 'PUT',
      headers: { cookie: cookieAdmin, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return atualizarServico({ request: req, params: { id: String(id) } } as never);
  }

  it('ativar sem definir preço é recusado', async () => {
    // Sem esta regra, um clique em "ativar" publicaria "R$ 0,00" no site — e a
    // intenção do preço vazio viraria defeito.
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM services WHERE tenant_id = 1 ORDER BY id LIMIT 1`;

    const res = await put(id, { active: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('preço') });

    const [linha] = await sql<{ active: boolean }[]>`SELECT active FROM services WHERE id = ${id}`;
    expect(linha.active).toBe(false);
  });

  it('com preço, ativa', async () => {
    const [{ id }] = await sql<{ id: number }[]>`SELECT id FROM services WHERE tenant_id = 1 ORDER BY id LIMIT 1`;

    expect((await put(id, { priceCents: 4500 })).status).toBe(200);
    expect((await put(id, { active: true })).status).toBe(200);

    const [linha] = await sql<{ active: boolean; price_cents: number }[]>`
      SELECT active, price_cents FROM services WHERE id = ${id}`;
    expect(linha).toMatchObject({ active: true, price_cents: 4500 });
  });

  it('preço e ativação no mesmo pedido passam', async () => {
    const [{ id }] = await sql<{ id: number }[]>`
      SELECT id FROM services WHERE tenant_id = 1 AND active = false ORDER BY id LIMIT 1`;
    expect((await put(id, { priceCents: 3000, active: true })).status).toBe(200);
  });
});
