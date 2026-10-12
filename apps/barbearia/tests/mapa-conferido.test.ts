// O dono confere o ponto do mapa do site no painel (decisão de 11/10/2026,
// `docs/PENDENCIAS-ABERTAS.md` §2.33).
//
// ── O DEFEITO QUE ISTO ATACA ─────────────────────────────────────────────────
//
// O mapa e a rota saem de uma busca no Google (`src/lib/mapa.ts`). No roteiro de
// 10/10/2026, "nova betania, natal" caiu na Nova Betânia de Mossoró — e nada no
// produto mostrava isso ao dono: só o cliente, na rua, descobriria. Agora o Início
// mostra o mapa e pergunta; a resposta guarda a BUSCA conferida, e mudar o
// endereço faz a pergunta voltar.
//
// Precisa de Postgres para a rota. Sem DATABASE_URL, só a regra e o fonte.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { buscaDoMapa, embedDoMapa, mapaPrecisaConferir } from '../src/lib/mapa';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const soCodigo = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const NATAL = { mapsEmbedQuery: '', addressStreet: 'Rua das Flores, 42', addressCity: 'Natal/RN' };
const BUSCA = 'Rua das Flores, 42, Natal/RN';

describe('a regra (`lib/mapa.ts`)', () => {
  it('o mapa embutido sai da busca, com o espaço como "+", como o site sempre mandou', () => {
    expect(embedDoMapa(NATAL)).toBe(`https://www.google.com/maps?q=${encodeURIComponent(BUSCA).replace(/%20/g, '+')}&output=embed`);
    expect(embedDoMapa({ ...NATAL, mapsEmbedQuery: 'Barbearia do Zé, Nova Betânia, Natal' }))
      .toContain('Barbearia+do+Z%C3%A9%2C+Nova+Bet%C3%A2nia%2C+Natal');
    expect(embedDoMapa({ mapsEmbedQuery: null, addressStreet: ' ', addressCity: null })).toBeNull();
  });

  it('pergunta enquanto a busca de agora não for a conferida — e volta a perguntar se o endereço muda', () => {
    expect(mapaPrecisaConferir(NATAL, null)).toBe(true);
    expect(mapaPrecisaConferir(NATAL, BUSCA)).toBe(false);
    expect(mapaPrecisaConferir({ ...NATAL, addressStreet: 'Rua das Flores, 420' }, BUSCA)).toBe(true);
    expect(mapaPrecisaConferir({ ...NATAL, mapsEmbedQuery: 'Barbearia do Zé, Natal' }, BUSCA)).toBe(true);
  });

  it('sem endereço não há mapa, e nada a conferir', () => {
    expect(mapaPrecisaConferir({ mapsEmbedQuery: '', addressStreet: '', addressCity: '' }, null)).toBe(false);
  });
});

describe('o site, o Início e Configurações mostram o MESMO mapa', () => {
  it('o site usa a função — não monta o endereço do mapa à mão', () => {
    const local = soCodigo(readFileSync('src/components/Location.astro', 'utf8'));
    expect(local).toMatch(/const mapsEmbedSrc = embedDoMapa\(s\);/);
    expect(local).not.toMatch(/google\.com\/maps\?q=/);
  });

  it('o Início mostra o cartão só ao dono, só enquanto o ponto não foi conferido', () => {
    const inicio = soCodigo(readFileSync('src/pages/admin/index.astro', 'utf8'));
    // `cfg` só existe para o admin (o medidor de completude já dependia disso).
    expect(inicio).toMatch(/const cfg = session\.role === 'admin'/);
    expect(inicio).toMatch(/const mapaParaConferir = cfg && mapaPrecisaConferir\(cfg, cfg\.mapaConferido\)/);
    expect(inicio).toMatch(/\{mapaParaConferir && \(\s*<section id="conferir-mapa" data-busca=\{mapaParaConferir\.busca\}/);
    expect(inicio).toMatch(/embed: embedDoMapa\(cfg\)/);
    // O "Está certo" manda a busca que o dono VIU; o "não está" leva ao endereço.
    expect(inicio).toMatch(/fetch\('\/api\/admin\/mapa-conferido'/);
    expect(inicio).toMatch(/busca: cartao\.dataset\.busca/);
    expect(inicio).toMatch(/href="\/admin\/configuracoes#endereco"/);
  });

  it('Configurações tem a âncora do endereço e a prévia que acompanha o que se digita', () => {
    const cfg = soCodigo(readFileSync('src/pages/admin/configuracoes.astro', 'utf8'));
    expect(cfg).toMatch(/titulo: 'Endereço',\s+ancora: 'endereco',\s+previaDoMapa: true,/);
    expect(cfg).toMatch(/<section id=\{secao\.ancora\}/);
    expect(cfg).toMatch(/const mapaAgora = cfg \? embedDoMapa\(cfg\) : null;/);
    expect(cfg).toMatch(/const src = embedDoMapa\(\{ addressStreet: rua, addressCity: cidade, mapsEmbedQuery: busca \}\);/);
  });
});

describe.skipIf(!TEM_BANCO)('a confirmação (`api/admin/mapa-conferido.ts`)', () => {
  let sql: ReturnType<typeof postgres>;
  let POST: typeof import('../src/pages/api/admin/mapa-conferido.ts').POST;
  let comTenant: typeof import('../src/db/index.js')['comTenant'];
  const UM = { id: 1, slug: 'um', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' };
  const cookies: Record<string, string> = {};

  const conferir = (busca: unknown, cookie = cookies.donoUm, tenant = UM) =>
    comTenant(tenant, async () => POST({
      request: new Request('http://painel.test/api/admin/mapa-conferido', {
        method: 'POST',
        headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
        body: JSON.stringify({ busca }),
      }),
    } as never));
  const conferidoDe = async (tenantId: number) =>
    (await sql`SELECT mapa_conferido FROM settings WHERE tenant_id = ${tenantId}`)[0].mapa_conferido as string | null;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
                (1, 'um', 'Barbearia Um', 'active'), (2, 'dois', 'Barbearia Dois', 'active')`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
                (1, 1, 'Barbearia Um',   'Um',   '5584999990000', 'Rua das Flores, 42', 'Natal/RN'),
                (2, 2, 'Barbearia Dois', 'Dois', '5584999990009', 'Rua B, 2',           'Natal/RN')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
                (1, 1, 'Dono do Um', 'dono',  'admin',  'x', true, '84999990001'),
                (2, 1, 'Barbeiro',   'barb',  'barber', 'x', true, '84999990002'),
                (3, 2, 'Dono do Dois','dono', 'admin',  'x', true, '84999990003')`;
    const { makeSessionCookie } = await import('../src/lib/session.js');
    const valor = (c: string) => c.split(';')[0];
    cookies.donoUm   = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
    cookies.barbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
    cookies.donoDois = valor(await makeSessionCookie({ barberId: 3, role: 'admin',  tenantId: 2 }));
    await (await import('../src/lib/tenant.js')).carregarTenants(true);
    ({ POST } = await import('../src/pages/api/admin/mapa-conferido.ts'));
    ({ comTenant } = await import('../src/db/index.js'));
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  it('o dono confirma a busca que viu: guardada na barbearia dele, e só nela', async () => {
    const r = await conferir(BUSCA);
    expect(r.status).toBe(200);
    expect(await conferidoDe(1)).toBe(BUSCA);
    expect(await conferidoDe(2)).toBeNull();
    const [linha] = await sql`SELECT address_street, address_city, maps_embed_query, mapa_conferido FROM settings WHERE tenant_id = 1`;
    expect(mapaPrecisaConferir({ addressStreet: linha.address_street, addressCity: linha.address_city,
      mapsEmbedQuery: linha.maps_embed_query }, linha.mapa_conferido)).toBe(false);
  });

  it('o endereço mudou depois que a tela abriu: 409, e o que estava guardado fica', async () => {
    await sql`UPDATE settings SET maps_embed_query = 'Barbearia Um, Nova Betânia, Natal' WHERE tenant_id = 1`;
    const r = await conferir(BUSCA);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/Recarregue/);
    expect(await conferidoDe(1)).toBe(BUSCA);
    // E a pergunta volta, porque a busca de agora não é a conferida.
    expect(mapaPrecisaConferir({ ...NATAL, mapsEmbedQuery: 'Barbearia Um, Nova Betânia, Natal' }, await conferidoDe(1))).toBe(true);
    expect((await conferir('Barbearia Um, Nova Betânia, Natal')).status).toBe(200);
    expect(await conferidoDe(1)).toBe('Barbearia Um, Nova Betânia, Natal');
  });

  it('o dono de outra barbearia confirma a dele — a do vizinho não muda', async () => {
    const DOIS = { id: 2, slug: 'dois', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' };
    expect((await conferir(buscaDoMapa({ addressStreet: 'Rua B, 2', addressCity: 'Natal/RN' }), cookies.donoDois, DOIS)).status).toBe(200);
    expect(await conferidoDe(2)).toBe('Rua B, 2, Natal/RN');
    expect(await conferidoDe(1)).toBe('Barbearia Um, Nova Betânia, Natal');
  });

  it('barbeiro comum não confirma; sem sessão, nem entra', async () => {
    expect((await conferir('qualquer', cookies.barbeiro)).status).toBe(403);
    expect((await conferir('qualquer', '')).status).toBe(401);
  });

  it('sem endereço não há mapa: 400, sem gravar', async () => {
    await sql`UPDATE settings SET address_street = '', address_city = '', maps_embed_query = NULL WHERE tenant_id = 2`;
    expect((await conferir('', cookies.donoDois, { id: 2, slug: 'dois', status: 'active' as const, domain: null, fuso: 'America/Fortaleza' })).status).toBe(400);
    expect(await conferidoDe(2)).toBe('Rua B, 2, Natal/RN');
  });
});
