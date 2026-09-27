// O importador das fotos do Bayron (`scripts/importar-galeria-bayron.mjs`).
//
// ⚠️ O script é `.mjs` e REPETE regras de `src/lib/uploads.ts` — a pasta da
// barbearia 1 sem slug, o endereço público e as larguras das variantes —, porque
// roda no container, onde o `.ts` não existe. O que prova que as duas cópias
// concordam é o caso "o site serve": a foto importada é pedida à rota de verdade.
// Caminho divergente = 404 aqui, e não no site do Bayron depois da migração.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import sharp from 'sharp';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null };
const RAIZ_ANTES = process.env.UPLOAD_ROOT;
const raiz = mkdtempSync(join(tmpdir(), 'import-raiz-'));
const origem = mkdtempSync(join(tmpdir(), 'import-fotos-'));

let sql: ReturnType<typeof postgres>;
let script: typeof import('../scripts/importar-galeria-bayron.mjs');
const silencio = () => {};

beforeAll(async () => {
  // Três fotos, com nomes que a ordem ALFABÉTICA embaralharia (10 antes de 2),
  // e uma delas "tirada com o celular em pé" (pixels deitados + etiqueta 6).
  const deitada = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#933' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const emPe = await sharp({ create: { width: 900, height: 1200, channels: 3, background: '#393' } }).jpeg().toBuffer();
  const pequena = await sharp({ create: { width: 500, height: 700, channels: 3, background: '#339' } }).jpeg().toBuffer();
  writeFileSync(join(origem, 'carrosel1.jpg'), deitada);
  writeFileSync(join(origem, 'carrosel10.jpg'), pequena);
  writeFileSync(join(origem, 'carrosel2.jpg'), emPe);
  writeFileSync(join(origem, 'foto-inicial5.jpg'), emPe); // não é do carrossel: fica de fora

  if (!TEM_BANCO) return;
  process.env.UPLOAD_ROOT = raiz;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'bayron', 'Barbearia Bayron', 'active')`;
  script = await import('../scripts/importar-galeria-bayron.mjs');
}, 30_000);

afterAll(async () => {
  if (RAIZ_ANTES === undefined) delete process.env.UPLOAD_ROOT;
  else process.env.UPLOAD_ROOT = RAIZ_ANTES;
  rmSync(raiz, { recursive: true, force: true });
  rmSync(origem, { recursive: true, force: true });
  if (!TEM_BANCO) return;
  await sql?.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe('as fotos do carrossel, em ordem numérica', () => {
  it('carrosel2 vem antes de carrosel10, e o que não é carrossel fica de fora', async () => {
    const { fotosDaPasta } = await import('../scripts/importar-galeria-bayron.mjs');
    expect(fotosDaPasta(origem)).toEqual(['carrosel1.jpg', 'carrosel2.jpg', 'carrosel10.jpg']);
  });

  it('as larguras do script são as mesmas do app', async () => {
    const { LARGURAS_GALERIA } = await import('../scripts/importar-galeria-bayron.mjs');
    const { largurasDe } = await import('../src/lib/uploads.js');
    expect(LARGURAS_GALERIA).toEqual([...largurasDe('galeria')]);
  });
});

describe.skipIf(!TEM_BANCO)('importar a galeria do Bayron', () => {
  it('importa as três, na ordem, com as variantes que cabem', async () => {
    const n = await script.importarGaleria({ sql, pasta: origem, uploadRoot: raiz, log: silencio });
    expect(n).toBe(3);

    const linhas = await sql<{ path: string; widths: number[]; sort_order: number }[]>`
      SELECT path, widths, sort_order FROM gallery_images WHERE tenant_id = 1 ORDER BY sort_order`;
    expect(linhas.map((l) => l.sort_order)).toEqual([0, 1, 2]);
    // A deitada vira 1200 × 1600 em pé: cabe a de 640, não a de 1280.
    expect(linhas.map((l) => l.widths)).toEqual([[640], [640], []]);
    expect(linhas.every((l) => /^\/api\/media\/galeria\/[\w-]+\.jpg$/.test(l.path))).toBe(true);
  });

  it('o site serve cada foto importada — o caminho do script bate com o do app', async () => {
    const { comTenant } = await import('../src/db/index.js');
    const rota = await import('../src/pages/api/media/[...path].ts');
    const { fotosDaGaleria } = await import('../src/lib/galeria.js');

    const fotos = await comTenant(BAYRON, () => fotosDaGaleria(BAYRON));
    expect(fotos).toHaveLength(3);
    for (const f of fotos) {
      for (const endereco of [f.path, ...f.widths.map((w) => f.path.replace(/\.jpg$/, `-${w}.webp`))]) {
        const r = await comTenant(BAYRON, () => rota.GET({
          params: { path: endereco.replace(/^\/api\/media\//, '') },
          request: new Request(`http://bayron.test${endereco}`),
        } as never));
        expect(r.status, endereco).toBe(200);
      }
    }
  });

  it('a foto tirada em pé sai em pé, e sem EXIF', async () => {
    const [primeira] = await sql<{ path: string }[]>`
      SELECT path FROM gallery_images WHERE tenant_id = 1 ORDER BY sort_order LIMIT 1`;
    const nome = primeira.path.split('/').pop()!;
    const original = await sharp(join(raiz, 'galeria', nome)).metadata();
    const variante = await sharp(join(raiz, 'galeria', nome.replace('.jpg', '-640.webp'))).metadata();
    expect(original.height).toBeGreaterThan(original.width!);
    expect(original.exif).toBeUndefined();
    expect(variante.height).toBeGreaterThan(variante.width!);
  });

  it('rodar de novo não duplica nada', async () => {
    const n = await script.importarGaleria({ sql, pasta: origem, uploadRoot: raiz, log: silencio });
    expect(n).toBe(0);
    const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM gallery_images`;
    expect(total).toBe(3);
  });

  it('barbearia que não existe: recusa com o motivo', async () => {
    await expect(script.importarGaleria({ sql, pasta: origem, uploadRoot: raiz, slug: 'nao-existe', log: silencio }))
      .rejects.toThrow(/não existe/);
  });

  it('pasta sem foto de carrossel: recusa com o motivo, sem gravar nada', async () => {
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (2, 'vintage', 'Barbearia Vintage', 'active')`;
    const vazia = join(origem, 'vazia');
    mkdirSync(vazia);
    await expect(script.importarGaleria({ sql, pasta: vazia, uploadRoot: raiz, slug: 'vintage', log: silencio }))
      .rejects.toThrow(/Nenhuma foto/);
    expect(existsSync(join(raiz, 'vintage'))).toBe(false);
  });
});
