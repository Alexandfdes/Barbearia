// A galeria do site: o dono sobe, ordena e remove — e cada barbearia só alcança
// as próprias fotos.
//
// ⚠️ As rotas rodam DENTRO de `comTenant`, com o papel restrito, como em
// produção. Foi rodando uma rota assim, em 25/09/2026, que apareceu o defeito de
// `tests/transacao-na-requisicao.test.ts`: fora do contexto tudo passava.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import sharp from 'sharp';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null };

const RAIZ_ANTES = process.env.UPLOAD_ROOT;
const raiz = mkdtempSync(join(tmpdir(), 'galeria-'));

let sql: ReturnType<typeof postgres>;
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let rotaLista: typeof import('../src/pages/api/admin/galeria/index.ts');
let rotaFoto: typeof import('../src/pages/api/admin/galeria/[id].ts');
let rotaOrdem: typeof import('../src/pages/api/admin/galeria/ordem.ts');
let rotaMidia: typeof import('../src/pages/api/media/[...path].ts');
let galeria: typeof import('../src/lib/galeria.js');
const cookie = { donoBayron: '', donaVintage: '', barbeiroVintage: '' };

type Foto = { id: number; path: string; widths: number[] };

/** Foto em pé, 900 × 1200: larga o bastante para ganhar a variante de 640. */
async function foto(cor = '#335'): Promise<File> {
  const buf = await sharp({ create: { width: 900, height: 1200, channels: 3, background: cor } }).jpeg().toBuffer();
  return new File([buf], 'corte.jpg', { type: 'image/jpeg' });
}

function envio(c: string, arquivo: File | null): Request {
  const fd = new FormData();
  if (arquivo) fd.set('arquivo', arquivo);
  return new Request('http://painel.test/api/admin/galeria', { method: 'POST', headers: { cookie: c }, body: fd });
}

const comoVintage = <T>(fn: () => Promise<T>) => comTenant(VINTAGE, fn);
const comoBayron = <T>(fn: () => Promise<T>) => comTenant(BAYRON, fn);

async function enviar(c: string, arquivo: File | null, quem = comoVintage): Promise<Response> {
  return quem(() => rotaLista.POST({ request: envio(c, arquivo) } as never));
}

async function listar(c: string, quem = comoVintage): Promise<Foto[]> {
  const r = await quem(() => rotaLista.GET({ request: new Request('http://painel.test/api/admin/galeria', { headers: { cookie: c } }) } as never));
  expect(r.status).toBe(200);
  return (await r.json()) as Foto[];
}

async function ordenar(c: string, ordem: unknown, quem = comoVintage): Promise<Response> {
  return quem(() => rotaOrdem.PUT({
    request: new Request('http://painel.test/api/admin/galeria/ordem', {
      method: 'PUT', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify({ ordem }),
    }),
  } as never));
}

async function remover(c: string, id: number, quem = comoVintage): Promise<Response> {
  return quem(() => rotaFoto.DELETE({
    request: new Request(`http://painel.test/api/admin/galeria/${id}`, { method: 'DELETE', headers: { cookie: c } }),
    params: { id: String(id) },
  } as never));
}

/** A mídia pública, como o site pede — `quem` é a barbearia do endereço. */
async function servir(path: string, quem = comoVintage): Promise<number> {
  const caminho = path.replace(/^\/api\/media\//, '');
  const r = await quem(() => rotaMidia.GET({ params: { path: caminho }, request: new Request(`http://site.test${path}`) } as never));
  return r.status;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  process.env.UPLOAD_ROOT = raiz;

  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES
              (1, 1, 'Dono do Bayron',     'dono',   'admin',  'x', true),
              (4, 2, 'Dona da Vintage',    'dona-v', 'admin',  'x', true),
              (5, 2, 'Barbeiro da Vintage','beto-v', 'barber', 'x', true)`;
  await sql.end({ timeout: 5 });

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookie.donoBayron      = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookie.donaVintage     = valor(await makeSessionCookie({ barberId: 4, role: 'admin',  tenantId: 2 }));
  cookie.barbeiroVintage = valor(await makeSessionCookie({ barberId: 5, role: 'barber', tenantId: 2 }));

  ({ comTenant } = await import('../src/db/index.js'));
  rotaLista = await import('../src/pages/api/admin/galeria/index.ts');
  rotaFoto  = await import('../src/pages/api/admin/galeria/[id].ts');
  rotaOrdem = await import('../src/pages/api/admin/galeria/ordem.ts');
  rotaMidia = await import('../src/pages/api/media/[...path].ts');
  galeria   = await import('../src/lib/galeria.js');
}, 30_000);

afterAll(async () => {
  if (RAIZ_ANTES === undefined) delete process.env.UPLOAD_ROOT;
  else process.env.UPLOAD_ROOT = RAIZ_ANTES;
  rmSync(raiz, { recursive: true, force: true });
  if (!TEM_BANCO) return;
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('a galeria pelo painel', () => {
  it('o dono envia uma foto: ela vai para a pasta DELA, com a variante, e o site a serve', async () => {
    const r = await enviar(cookie.donaVintage, await foto());
    expect(r.status).toBe(201);
    const f = (await r.json()) as Foto;

    expect(f.path).toMatch(/^\/api\/media\/vintage\/galeria\/[\w-]+\.jpg$/);
    expect(f.widths).toEqual([640]);
    const nome = f.path.split('/').pop()!;
    expect(existsSync(join(raiz, 'vintage', 'galeria', nome))).toBe(true);
    expect(existsSync(join(raiz, 'vintage', 'galeria', nome.replace('.jpg', '-640.webp')))).toBe(true);

    // O site da Vintage serve; o do Bayron, pedindo o mesmo endereço, não.
    expect(await servir(f.path)).toBe(200);
    expect(await servir(f.path, comoBayron)).toBe(404);
  });

  it('barbeiro comum não mexe na galeria, e sem sessão também não', async () => {
    expect((await enviar(cookie.barbeiroVintage, await foto())).status).toBe(403);
    expect((await enviar('', await foto())).status).toBe(401);
  });

  it('arquivo que não é imagem volta com o motivo e não deixa linha nem arquivo', async () => {
    const antes = (await listar(cookie.donaVintage)).length;
    const arquivosAntes = readdirSync(join(raiz, 'vintage', 'galeria')).length;
    const r = await enviar(cookie.donaVintage, new File([Buffer.from('não sou foto')], 'x.jpg', { type: 'image/jpeg' }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/imagem/i);
    expect((await listar(cookie.donaVintage)).length).toBe(antes);
    expect(readdirSync(join(raiz, 'vintage', 'galeria')).length).toBe(arquivosAntes);
  });

  it('HEIC é recusado com o motivo', async () => {
    const r = await enviar(cookie.donaVintage, new File([Buffer.from('x')], 'IMG_0001.HEIC', { type: 'image/heic' }));
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toMatch(/JPG, PNG, WEBP ou AVIF/);
  });

  it('cada barbearia lista só as próprias fotos, na ordem de envio', async () => {
    await enviar(cookie.donaVintage, await foto('#533'));
    await enviar(cookie.donaVintage, await foto('#353'));
    await enviar(cookie.donoBayron, await foto('#555'), comoBayron);

    const daVintage = await listar(cookie.donaVintage);
    const doBayron = await listar(cookie.donoBayron, comoBayron);
    expect(daVintage).toHaveLength(3);
    expect(doBayron).toHaveLength(1);
    expect(daVintage.every((f) => f.path.startsWith('/api/media/vintage/galeria/'))).toBe(true);
    // A barbearia 1 continua no caminho legado, sem o slug.
    expect(doBayron[0].path).toMatch(/^\/api\/media\/galeria\//);
    expect(daVintage.map((f) => f.id)).toEqual([...daVintage.map((f) => f.id)].sort((a, b) => a - b));
  });

  it('reordena com a lista inteira', async () => {
    const ids = (await listar(cookie.donaVintage)).map((f) => f.id);
    const nova = [ids[2], ids[0], ids[1]];
    expect((await ordenar(cookie.donaVintage, nova)).status).toBe(200);
    expect((await listar(cookie.donaVintage)).map((f) => f.id)).toEqual(nova);
  });

  it('ordem que não bate com a galeria é recusada inteira — faltando, repetida ou com foto alheia', async () => {
    const ids = (await listar(cookie.donaVintage)).map((f) => f.id);
    const doBayron = (await listar(cookie.donoBayron, comoBayron))[0].id;

    expect((await ordenar(cookie.donaVintage, ids.slice(0, 2))).status).toBe(409);
    expect((await ordenar(cookie.donaVintage, [ids[0], ids[0], ids[1]])).status).toBe(409);
    expect((await ordenar(cookie.donaVintage, [ids[0], ids[1], doBayron])).status).toBe(409);
    expect((await ordenar(cookie.donaVintage, 'bagunça')).status).toBe(400);
    // E nada mudou.
    expect((await listar(cookie.donaVintage)).map((f) => f.id)).toEqual(ids);
  });

  it('remover apaga a linha e os arquivos', async () => {
    const [primeira] = await listar(cookie.donaVintage);
    const nome = primeira.path.split('/').pop()!;
    expect((await remover(cookie.donaVintage, primeira.id)).status).toBe(200);

    expect((await listar(cookie.donaVintage)).map((f) => f.id)).not.toContain(primeira.id);
    expect(existsSync(join(raiz, 'vintage', 'galeria', nome))).toBe(false);
    expect(existsSync(join(raiz, 'vintage', 'galeria', nome.replace('.jpg', '-640.webp')))).toBe(false);
  });

  it('a Vintage não remove a foto do Bayron: 404, e a foto e o arquivo continuam lá', async () => {
    const [doBayron] = await listar(cookie.donoBayron, comoBayron);
    const nome = doBayron.path.split('/').pop()!;

    expect((await remover(cookie.donaVintage, doBayron.id)).status).toBe(404);
    expect((await listar(cookie.donoBayron, comoBayron)).map((f) => f.id)).toContain(doBayron.id);
    expect(existsSync(join(raiz, 'galeria', nome))).toBe(true);
  });

  it(`o teto de fotos: a de número ${21} volta 409 com o motivo`, async () => {
    // Completa até o teto direto pela função, sem imagem nova a cada vez.
    const atual = (await listar(cookie.donaVintage)).length;
    const pequena = async () => new File(
      [await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).jpeg().toBuffer()],
      'p.jpg', { type: 'image/jpeg' });
    for (let i = atual; i < galeria.MAXIMO_DE_FOTOS; i++) {
      const r = await comoVintage(async () => galeria.adicionarFoto(await pequena(), VINTAGE));
      expect(r.ok).toBe(true);
    }

    const r = await enviar(cookie.donaVintage, await pequena());
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/máximo/);
    expect((await listar(cookie.donaVintage)).length).toBe(galeria.MAXIMO_DE_FOTOS);
  }, 30_000);
});

describe('a faixa do carrossel', () => {
  // Sem banco: é a conta que evita o carrossel "travar" em tela larga.
  it('três fotos viram uma volta de 12 cartões, em voltas inteiras', async () => {
    const { faixaDoCarrossel, CARTOES_POR_VOLTA } = await import('../src/lib/galeria.js');
    const faixa = faixaDoCarrossel(['a', 'b', 'c']);
    expect(faixa.length).toBe(CARTOES_POR_VOLTA);
    expect(faixa.map((f) => f.foto).join('')).toBe('abcabcabcabc');
    // Só a primeira ocorrência de cada foto conta para o leitor de tela.
    expect(faixa.filter((f) => !f.repetida).map((f) => f.foto)).toEqual(['a', 'b', 'c']);
  });

  it('cinco fotos: 15 cartões — nunca uma volta pela metade, senão a emenda aparece', async () => {
    const { faixaDoCarrossel } = await import('../src/lib/galeria.js');
    const faixa = faixaDoCarrossel([1, 2, 3, 4, 5]);
    expect(faixa.length).toBe(15);
    expect(faixa[faixa.length - 1].foto).toBe(5);
  });

  it('vinte fotos já cobrem a tela: nenhuma repetição', async () => {
    const { faixaDoCarrossel } = await import('../src/lib/galeria.js');
    const faixa = faixaDoCarrossel(Array.from({ length: 20 }, (_, i) => i));
    expect(faixa.length).toBe(20);
    expect(faixa.some((f) => f.repetida)).toBe(false);
  });

  it('sem foto, faixa vazia — e não um laço infinito', async () => {
    const { faixaDoCarrossel } = await import('../src/lib/galeria.js');
    expect(faixaDoCarrossel([])).toEqual([]);
  });
});
