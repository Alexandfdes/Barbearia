// Fotos de produto e mídia da marca: cada barbearia na sua pasta, e o painel
// enxergando as da barbearia de quem está logado.
//
// ── OS DOIS DEFEITOS QUE ISTO IMPEDE DE VOLTAR ───────────────────────────────
//
// 1. `saveProductImage()` gravava as fotos de produto de TODAS as barbearias na
//    mesma pasta, e `/api/products/image/` servia qualquer arquivo dela em
//    qualquer endereço (`PENDENCIAS-ABERTAS.md` §2.7).
//
// 2. As rotas de arquivo descobriam a barbearia só pelo ENDEREÇO. O painel mora
//    num endereço central, que não é de barbearia nenhuma — então a prévia da
//    logo e da capa no painel dava 404 em produção, para todo mundo. No
//    desenvolvimento não aparecia, porque a barbearia 1 tem o domínio
//    `localhost` e o painel também roda lá.
//
// Não precisa de banco. O que o middleware faz — decidir de qual barbearia é a
// requisição e guardar no `armazemTenant` — é simulado aqui com `run()`, e as
// rotas são chamadas dentro dele. Sem `run()`, é uma requisição que o
// middleware não conseguiu atribuir a ninguém.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Tenant } from '../src/lib/tenant.js';

const BAYRON: Tenant  = { id: 1, slug: 'bayron',  status: 'active', domain: null };
const VINTAGE: Tenant = { id: 2, slug: 'vintage', status: 'active', domain: null };

let raiz = '';

/** Carrega os módulos com a raiz de upload temporária. Tudo do MESMO grafo. */
async function modulos() {
  vi.resetModules();
  vi.stubEnv('UPLOAD_ROOT', raiz);
  const uploads = await import('../src/lib/uploads.js');
  const { armazemTenant } = await import('../src/db/contexto.js');
  const fotoProduto = await import('../src/pages/api/products/image/[name].ts');
  const midia = await import('../src/pages/api/media/[...path].ts');
  /** Roda `fn` como se o middleware tivesse resolvido `tenant` — ou ninguém. */
  const comoSe = <T>(tenant: Tenant | null, fn: () => T): T =>
    tenant ? armazemTenant.run({ tenant, db: {} as never }, fn) : fn();
  return { uploads, comoSe, fotoProduto, midia };
}

async function png(): Promise<File> {
  const { default: sharp } = await import('sharp');
  const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
    .png().toBuffer();
  return new File([buf], 'foto.png', { type: 'image/png' });
}

/** Chama a rota de foto de produto como o navegador faria, no endereço dado. */
function pedirFotoProduto(rota: { GET: Function }, nome: string, host = 'painel.test') {
  return rota.GET({
    params: { name: nome },
    request: new Request(`http://${host}/api/products/image/${nome}`),
  } as never) as Promise<Response>;
}

beforeEach(() => { raiz = mkdtempSync(join(tmpdir(), 'fotos-')); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(raiz, { recursive: true, force: true }); });

describe('foto de produto: cada barbearia na sua pasta (§2.7)', () => {
  it('barbearia nova grava na pasta DELA; a barbearia 1 continua na pasta de antes', async () => {
    const { uploads } = await modulos();

    const daVintage = await uploads.saveProductImage(await png(), VINTAGE);
    const doBayron  = await uploads.saveProductImage(await png(), BAYRON);
    if ('error' in daVintage || 'error' in doBayron) throw new Error('upload recusado');

    const nomeV = daVintage.path.split('/').pop()!;
    const nomeB = doBayron.path.split('/').pop()!;
    expect(existsSync(join(raiz, 'vintage', 'products', nomeV))).toBe(true);
    expect(existsSync(join(raiz, 'products', nomeB))).toBe(true);
    // E nenhuma das duas na pasta da outra.
    expect(existsSync(join(raiz, 'products', nomeV))).toBe(false);
    // O endereço público é o mesmo formato para todas — a pasta sai do tenant.
    expect(daVintage.path).toBe(`/api/products/image/${nomeV}`);
  });

  it('apagar a foto apaga da pasta da barbearia, e só dela', async () => {
    const { uploads } = await modulos();
    const r = await uploads.saveProductImage(await png(), VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const nome = r.path.split('/').pop()!;

    // Um arquivo com o MESMO nome na pasta da barbearia 1 não pode ser tocado.
    mkdirSync(join(raiz, 'products'), { recursive: true });
    writeFileSync(join(raiz, 'products', nome), 'da barbearia 1');

    await uploads.apagarFotoProduto(r.path, VINTAGE);
    expect(existsSync(join(raiz, 'vintage', 'products', nome))).toBe(false);
    expect(existsSync(join(raiz, 'products', nome))).toBe(true);
  });
});

describe('a rota que serve a foto só enxerga a pasta de quem pediu', () => {
  it('serve a foto da barbearia que o middleware resolveu', async () => {
    const { uploads, comoSe, fotoProduto } = await modulos();
    const r = await uploads.saveProductImage(await png(), VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const nome = r.path.split('/').pop()!;

    const resp = await comoSe(VINTAGE, () => pedirFotoProduto(fotoProduto, nome));
    expect(resp.status).toBe(200);
  });

  it('a foto de uma barbearia NÃO sai no endereço da outra', async () => {
    const { uploads, comoSe, fotoProduto } = await modulos();
    const r = await uploads.saveProductImage(await png(), VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const nome = r.path.split('/').pop()!;

    const resp = await comoSe(BAYRON, () => pedirFotoProduto(fotoProduto, nome, 'bayron.test'));
    expect(resp.status).toBe(404);
  });

  it('requisição que o middleware não atribuiu a ninguém: 404, nunca a barbearia 1', async () => {
    const { uploads, comoSe, fotoProduto } = await modulos();
    const r = await uploads.saveProductImage(await png(), BAYRON);
    if ('error' in r) throw new Error(r.error);
    const nome = r.path.split('/').pop()!;

    const resp = await comoSe(null, () => pedirFotoProduto(fotoProduto, nome, 'ninguem.test'));
    expect(resp.status).toBe(404);
  });
});

describe('o painel enxerga a mídia da barbearia de quem está logado', () => {
  // O caso que dava 404 em produção: o painel mora em `painel.<domínio>`, que
  // não é endereço de barbearia. A barbearia vem da SESSÃO — e é isso que o
  // middleware põe no armazém.
  it('a prévia da logo abre no painel, pela sessão', async () => {
    const { uploads, comoSe, midia } = await modulos();
    const r = await uploads.salvarMidiaMarca(await png(), 'logo', VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const caminho = r.path.replace('/api/media/', '');   // vintage/logo/<arquivo>

    const resp = await comoSe(VINTAGE, () => midia.GET({
      params: { path: caminho },
      request: new Request(`http://painel.test${r.path}`),
    } as never) as Promise<Response>);
    expect(resp.status).toBe(200);
  });

  it('logado numa barbearia, a mídia de outra continua fechada', async () => {
    const { uploads, comoSe, midia } = await modulos();
    const r = await uploads.salvarMidiaMarca(await png(), 'logo', VINTAGE);
    if ('error' in r) throw new Error(r.error);
    const caminho = r.path.replace('/api/media/', '');

    const resp = await comoSe(BAYRON, () => midia.GET({
      params: { path: caminho },
      request: new Request(`http://painel.test${r.path}`),
    } as never) as Promise<Response>);
    expect(resp.status).toBe(404);
  });
});
