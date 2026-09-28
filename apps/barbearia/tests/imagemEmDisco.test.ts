// Guarda do `tests/imagemEmDisco.ts`: nenhum teste lê imagem pelo caminho.
//
// Em 28/09/2026, o `npm run test:db` no Windows deu 418 de 419: a limpeza da pasta
// temporária estourava `EPERM` em `tests/uploads.test.ts` e em
// `tests/importar-galeria.test.ts`, depois de casos que tinham passado. As duas
// leituras que falharam eram de `.webp` pelo caminho. Medido no Linux: depois de
// `sharp(caminho).metadata()` o `.webp` continua aberto no processo (o `.jpg`, não) —
// e no Windows arquivo aberto não se apaga.
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, globSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { metadadosDoArquivo } from './imagemEmDisco.js';

const TEM_PROC = existsSync('/proc/self/fd'); // Linux: dá para ver o que o processo tem aberto
const pasta = mkdtempSync(join(tmpdir(), 'imagem-em-disco-'));
afterAll(() => {
  sharp.cache(false); // solta o que o caso de controle deixou aberto
  sharp.cache(true);
  rmSync(pasta, { recursive: true, force: true });
});

function abertosEm(dir: string): string[] {
  return readdirSync('/proc/self/fd')
    .map((fd) => { try { return readlinkSync(`/proc/self/fd/${fd}`); } catch { return ''; } })
    .filter((alvo) => alvo.startsWith(dir));
}

async function webpEm(nome: string): Promise<string> {
  const caminho = join(pasta, nome);
  await sharp({ create: { width: 90, height: 120, channels: 3, background: '#393' } }).webp().toFile(caminho);
  return caminho;
}

describe.skipIf(!TEM_PROC)('o arquivo fica aberto?', () => {
  it('controle: pelo caminho, o sharp deixa o .webp aberto — era o que o Windows não deixava apagar', async () => {
    const caminho = await webpEm('pelo-caminho.webp');
    await sharp(caminho).metadata();
    expect(abertosEm(caminho)).toEqual([caminho]);
  });

  it('pelo conteúdo, nada fica aberto', async () => {
    const caminho = await webpEm('pelo-conteudo.webp');
    const m = await metadadosDoArquivo(caminho);
    expect(m.width).toBe(90);
    expect(abertosEm(caminho)).toEqual([]);
  });
});

describe('nenhum teste abre imagem pelo caminho', () => {
  // Caminho no sharp: `sharp(join(...))`, `sharp('...')`, `sharp(`...`)`. Buffer,
  // `{ create }` e variável passam — variável o texto não distingue.
  const PELO_CAMINHO = /\bsharp\(\s*(join\(|['"`])/;
  const soCodigo = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  it('controle: o padrão pega as leituras antigas, e não as certas', () => {
    expect(PELO_CAMINHO.test("await sharp(join(raiz, 'galeria', nome)).metadata();")).toBe(true);
    expect(PELO_CAMINHO.test("await sharp('/tmp/x.webp').metadata();")).toBe(true);
    expect(PELO_CAMINHO.test('await sharp(readFileSync(caminho)).metadata();')).toBe(false);
    expect(PELO_CAMINHO.test("await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })")).toBe(false);
  });

  it('nos arquivos de teste', () => {
    const arquivos = globSync('tests/**/*.ts')
      .map((c) => c.split(sep).join('/'))
      .filter((c) => c !== 'tests/imagemEmDisco.test.ts');
    expect(arquivos.length).toBeGreaterThan(30);
    const achados = arquivos.filter((c) => PELO_CAMINHO.test(soCodigo(readFileSync(c, 'utf8'))));
    expect(achados).toEqual([]);
  });
});
