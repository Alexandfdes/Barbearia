// O que a troca para o Astro 7 (09/10/2026) precisa que continue verdade.
//
// A troca foi de segurança: o `npm audit` apontava falhas críticas no Astro 6.3.7,
// no adaptador Node 10 e no sharp 0.34 — entre elas, segundo o aviso, derrubar o
// servidor com um cabeçalho `Host` malformado. Estes casos impedem as três coisas
// que desfariam a troca sem barulho nenhum:
//
//  - uma tela que o compilador novo recusa — e o `npm run dev` só descobre quando
//    alguém abre aquela tela;
//  - a regra de espaços em branco voltando ao padrão do Astro 7, que apaga espaço
//    entre elementos de linha em silêncio, tela a tela;
//  - uma versão com falha conhecida voltando pelo `package-lock.json`.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { sep } from 'node:path';

type Diagnostico = { severity: string; text: string; labels?: { line?: number }[] };
let transform: (fonte: string, opcoes?: { filename?: string }) => { diagnostics?: Diagnostico[] };

beforeAll(async () => {
  // O compilador é dependência do Astro, não do app: resolvido a partir dele, para
  // não depender de onde o npm resolveu pôr a pasta.
  const doAstro = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
  ({ transform } = await import(pathToFileURL(doAstro.resolve('@astrojs/compiler-rs')).href));
}, 30_000);

describe('o compilador do Astro 7 aceita toda tela', () => {
  it('nenhum .astro dos dois apps tem erro de compilação', () => {
    // ⚠️ O compilador antigo consertava sozinho o que este recusa. Duas telas
    // pararam o build na troca: o `<script>` do `/agendar`, que nunca foi fechado,
    // e o comentário HTML antes da `<div>` num ramo do `? :` do `Hero.astro` — o
    // compilador novo exige um elemento só em cada ramo.
    const arquivos = [
      ...globSync('src/**/*.astro'),
      ...(existsSync('../vendas/src') ? globSync('../vendas/src/**/*.astro') : []),
    ].map((c) => c.split(sep).join('/')).sort();
    expect(arquivos.length).toBeGreaterThan(40);

    const erros: string[] = [];
    for (const arquivo of arquivos) {
      const r = transform(readFileSync(arquivo, 'utf8'), { filename: arquivo });
      for (const d of r.diagnostics ?? []) {
        if (d.severity === 'error') erros.push(`${arquivo}:${d.labels?.[0]?.line ?? '?'} — ${d.text}`);
      }
    }
    expect(erros).toEqual([]);
  });
});

describe('a regra de espaços do Astro 6 continua valendo', () => {
  it('os dois apps fixam compressHTML: true', () => {
    // Comparado em 09/10/2026: com `true`, as 25 telas do app e as 8 do site de
    // vendas renderizam igual ao Astro 6, nó por nó, fora espaço entre blocos e a
    // minificação dos scripts. Sem a linha, vale o padrão novo, 'jsx'.
    for (const config of ['astro.config.mjs', '../vendas/astro.config.mjs']) {
      if (!existsSync(config)) continue;
      expect(readFileSync(config, 'utf8'), config).toMatch(/^\s*compressHTML:\s*true,/m);
    }
  });
});

describe('as versões com falha conhecida não voltam', () => {
  /** O menor que fecha o que o `npm audit` apontava em 09/10/2026. */
  const MINIMOS: Record<string, string> = {
    astro: '7.2.8',          // XSS, SSRF pelo Host, desvio de autorização, execução remota pelo AVIF
    '@astrojs/node': '11.1.3', // o Host malformado que derruba o servidor
    sharp: '0.35.5',         // libvips, libheif, librsvg
    vite: '8.0.0',           // um Vite só para o Astro, o Tailwind e o Vitest
  };

  const maior = (a: string, b: string) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
    return true;
  };

  for (const app of ['.', '../vendas']) {
    it(`no package-lock.json de ${app === '.' ? 'apps/barbearia' : 'apps/vendas'}`, () => {
      const lock = `${app}/package-lock.json`;
      if (!existsSync(lock)) return;
      const pacotes = JSON.parse(readFileSync(lock, 'utf8')).packages as Record<string, { version?: string }>;
      const abaixo = Object.entries(pacotes)
        .filter(([caminho]) => Object.keys(MINIMOS).some((nome) => caminho.endsWith(`node_modules/${nome}`)))
        .map(([caminho, p]) => ({ caminho, nome: caminho.split('node_modules/').pop()!, versao: p.version ?? '0.0.0' }))
        .filter(({ nome, versao }) => !maior(versao, MINIMOS[nome]))
        .map(({ caminho, versao }) => `${caminho}@${versao}`);
      expect(abaixo).toEqual([]);
    });
  }
});
