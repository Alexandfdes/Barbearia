// Guarda-corpo da raiz dos uploads.
//
// POR QUE ESTE TESTE EXISTE
//
// A raiz saía de `dirname(process.env.DATABASE_PATH)`. Enquanto o banco era
// SQLite isso dava `/data/uploads` em produção — certo por acidente. O porte
// para Postgres trocou `DATABASE_PATH` por `DATABASE_URL`, e sem a variável o
// padrão caía numa raiz RELATIVA: `/app/data/uploads` dentro do container, ou
// seja, dentro da camada da imagem e fora do volume.
//
// O defeito não aparece em teste de unidade nem em log: as fotos antigas
// param de ser servidas e as novas somem no deploy seguinte.
//
// Estes casos existem para que ninguém volte a amarrar a mídia a uma variável
// de banco, e para que o padrão de produção continue sendo absoluto.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isAbsolute, join } from 'node:path';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import type { Tenant } from '../src/lib/tenant.js';
import { metadadosDoArquivo } from './imagemEmDisco.js';

/** Recarrega o módulo com o ambiente pedido — a raiz é const de topo. */
async function raizCom(env: Record<string, string | undefined>): Promise<string> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  // `stubEnv('X','')` deixa a variável vazia, não ausente: apagamos de verdade.
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const mod = await import('../src/lib/uploads.js');
  return mod.UPLOAD_ROOT;
}

describe('a raiz dos uploads', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('em produção é absoluta, sem precisar de variável nenhuma', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    // Relativa aqui significa "dentro da camada da imagem": some no deploy.
    expect(isAbsolute(raiz)).toBe(true);
    expect(raiz).toBe('/data/uploads');
  });

  it('em produção NÃO muda se DATABASE_PATH sumir — era daí que vinha o defeito', async () => {
    const comBanco = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: '/data/appointments.db',
    });
    const semBanco = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    expect(semBanco).toBe(comBanco);
  });

  it('UPLOAD_ROOT explícito vence — é a saída para quem montar o volume em outro lugar', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'production',
      UPLOAD_ROOT: '/mnt/fotos',
      DATABASE_PATH: '/data/appointments.db',
    });
    expect(raiz).toBe('/mnt/fotos');
  });

  it('fora de produção fica na pasta do projeto, para não escrever em /data na máquina de ninguém', async () => {
    const raiz = await raizCom({
      NODE_ENV: 'development',
      UPLOAD_ROOT: undefined,
      DATABASE_PATH: undefined,
    });
    expect(raiz).toBe('./data/uploads');
  });

  it('o módulo não lê mais nenhuma variável de banco', async () => {
    const fonte = readFileSync('src/lib/uploads.ts', 'utf8')
      // Os comentários explicam o defeito antigo e citam o nome de propósito.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(fonte).not.toMatch(/DATABASE_PATH|DATABASE_URL/);
  });
});

describe('onde a mídia da marca é gravada', () => {
  // ⚠️ O DEFEITO: `salvarMidiaMarca()` montava o caminho à mão —
  // `join(UPLOAD_ROOT, tipo)`, o formato legado, sem slug — enquanto a leitura
  // em `/api/media/[...path].ts` usava `pastaDeMidia(tipo, tenant)`. Para toda
  // barbearia que não é a de id 1, as duas metades do caminho discordavam: o
  // logo e a capa davam 404 no site dela, e os arquivos iam parar na pasta da
  // barbearia 1. O cabeçalho deste mesmo módulo proíbe montar caminho à mão;
  // a função, três telas abaixo, montava.
  //
  // Escrito DEPOIS da correção, e não junto: foi a verificação por mutação de
  // 24/09/2026 que mostrou a lacuna — com o caminho legado de volta, a suíte
  // inteira continuava verde.
  const BAYRON: Tenant  = { id: 1, slug: 'bayron',  status: 'active', domain: null };
  const VINTAGE: Tenant = { id: 2, slug: 'vintage', status: 'active', domain: null };
  let raiz = '';

  async function modulo() {
    vi.resetModules();
    vi.stubEnv('UPLOAD_ROOT', raiz);
    return import('../src/lib/uploads.js');
  }

  async function png(): Promise<File> {
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .png().toBuffer();
    return new File([buf], 'logo.png', { type: 'image/png' });
  }

  beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), 'midia-')); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(raiz, { recursive: true, force: true }); });

  it('barbearia nova grava na pasta DELA, e devolve o endereço que a leitura procura', async () => {
    const { salvarMidiaMarca, pastaDeMidia, urlDeMidia } = await modulo();
    const r = await salvarMidiaMarca(await png(), 'logo', VINTAGE);
    if ('error' in r) throw new Error(r.error);

    const nome = r.path.split('/').pop()!;
    // As duas metades do caminho tem que concordar — é esse o defeito.
    expect(r.path).toBe(urlDeMidia('logo', nome, VINTAGE));
    expect(r.path).toMatch(/^\/api\/media\/vintage\/logo\//);
    expect(existsSync(join(pastaDeMidia('logo', VINTAGE), nome))).toBe(true);

    // E não na pasta legada, que é a da barbearia 1.
    expect(existsSync(join(raiz, 'logo', nome))).toBe(false);
  });

  it('a barbearia 1 continua no caminho legado — os arquivos e o banco dela já estão assim', async () => {
    const { salvarMidiaMarca } = await modulo();
    const r = await salvarMidiaMarca(await png(), 'logo', BAYRON);
    if ('error' in r) throw new Error(r.error);

    const nome = r.path.split('/').pop()!;
    expect(r.path).toBe(`/api/media/logo/${nome}`);
    expect(existsSync(join(raiz, 'logo', nome))).toBe(true);
  });
});

describe('a foto do celular chega em pé e sem o GPS', () => {
  // ⚠️ Os dois defeitos que `normalizarFoto` conserta, achados em 25/09/2026:
  // variante WebP deitada (a etiqueta de rotação se perdia) e original servido
  // com o EXIF inteiro, GPS incluído. Ver o comentário em `src/lib/uploads.ts`.
  const VINTAGE: Tenant = { id: 2, slug: 'vintage', status: 'active', domain: null };
  let raiz = '';

  async function modulo() {
    vi.resetModules();
    vi.stubEnv('UPLOAD_ROOT', raiz);
    return import('../src/lib/uploads.js');
  }

  /**
   * Como o celular grava uma foto tirada em pé: pixels DEITADOS (1600×1200) e a
   * etiqueta "gire 90°" (orientação 6). O GPS vai junto, como no aparelho.
   */
  async function fotoDeCelularEmPe(largura = 1600, altura = 1200): Promise<File> {
    const buf = await sharp({ create: { width: largura, height: altura, channels: 3, background: '#a33' } })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '5/1 47/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '35/1 12/1 0/1' } },
      })
      .toBuffer();
    return new File([buf], 'IMG_0001.jpg', { type: 'image/jpeg' });
  }

  beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), 'celular-')); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(raiz, { recursive: true, force: true }); });

  it('o fixture é mesmo uma foto em pé com GPS — senão os casos abaixo não provam nada', async () => {
    const f = await fotoDeCelularEmPe();
    const m = await sharp(Buffer.from(await f.arrayBuffer())).metadata();
    expect(m.orientation).toBe(6);
    expect(m.exif).toBeDefined();
    expect(m.width).toBeGreaterThan(m.height!); // pixels deitados
  });

  it('a variante da galeria sai EM PÉ, não deitada', async () => {
    const { salvarMidiaMarca, pastaDeMidia } = await modulo();
    const r = await salvarMidiaMarca(await fotoDeCelularEmPe(), 'galeria', VINTAGE);
    if ('error' in r) throw new Error(r.error);
    expect(r.larguras).toContain(640);

    const nome = r.path.split('/').pop()!.replace(/\.jpg$/, '-640.webp');
    const m = await metadadosDoArquivo(join(pastaDeMidia('galeria', VINTAGE), nome));
    expect(m.width).toBe(640);
    expect(m.height).toBeGreaterThan(m.width!);
  });

  it('o original gravado não tem mais EXIF — nem GPS, nem etiqueta de rotação', async () => {
    const { salvarMidiaMarca, pastaDeMidia } = await modulo();
    const r = await salvarMidiaMarca(await fotoDeCelularEmPe(), 'galeria', VINTAGE);
    if ('error' in r) throw new Error(r.error);

    const m = await metadadosDoArquivo(join(pastaDeMidia('galeria', VINTAGE), r.path.split('/').pop()!));
    expect(m.exif).toBeUndefined();
    expect(m.orientation ?? 1).toBe(1);
    expect(m.height).toBeGreaterThan(m.width!); // e os pixels já estão em pé
  });

  it('não amplia: foto em pé de 1200 px de largura não ganha variante de 1280', async () => {
    // Antes a largura lida era a dos pixels deitados (1600) e a de 1280 era gerada.
    const { salvarMidiaMarca } = await modulo();
    const r = await salvarMidiaMarca(await fotoDeCelularEmPe(), 'galeria', VINTAGE);
    if ('error' in r) throw new Error(r.error);
    expect(r.larguras).toEqual([640]);
  });

  it('foto enorme é guardada com no máximo 2560 px no maior lado', async () => {
    const { salvarMidiaMarca, pastaDeMidia } = await modulo();
    const r = await salvarMidiaMarca(await fotoDeCelularEmPe(4000, 3000), 'hero', VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const m = await metadadosDoArquivo(join(pastaDeMidia('hero', VINTAGE), r.path.split('/').pop()!));
    expect(Math.max(m.width!, m.height!)).toBe(2560);
  });

  it('foto de produto também: em pé, sem EXIF', async () => {
    const { saveProductImage, pastaDeProduto } = await modulo();
    const r = await saveProductImage(await fotoDeCelularEmPe(), VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const m = await metadadosDoArquivo(join(pastaDeProduto(VINTAGE), r.path.split('/').pop()!));
    expect(m.exif).toBeUndefined();
    expect(m.height).toBeGreaterThan(m.width!);
    expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(1600);
  });

  it('arquivo que não é imagem é recusado, não gravado como .jpg', async () => {
    const { saveProductImage, salvarMidiaMarca, pastaDeProduto } = await modulo();
    const falso = new File([Buffer.from('<?php echo 1; ?>')], 'x.jpg', { type: 'image/jpeg' });

    expect('error' in (await saveProductImage(falso, VINTAGE))).toBe(true);
    expect('error' in (await salvarMidiaMarca(falso, 'galeria', VINTAGE))).toBe(true);
    expect(existsSync(pastaDeProduto(VINTAGE))).toBe(false);
  });
});
