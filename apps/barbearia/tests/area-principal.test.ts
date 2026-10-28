// Uma área principal por tela — o `<main>` que o leitor de tela anuncia, e para onde ele
// pula quando a pessoa pede o conteúdo principal.
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026, treze telas do painel do dono abriam um `<main>` dentro do `<main>` do
// `AdminLayout`: duas áreas principais, uma dentro da outra, que o leitor de tela anuncia
// como duas. E as quatro telas de entrar — a do dono, a da senha esquecida, a da senha
// nova e a do operador — não tinham nenhuma: o atalho para o conteúdo não levava a lugar
// nenhum. Conferido no navegador com o axe-core, antes e depois
// (`docs/PENDENCIAS-ABERTAS.md` §2.39).
//
// A regra: o layout que traz o `<main>` é o dono dele, e a página não abre outro; a
// página sem esse layout traz o seu — um só. Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/** O que a tela desenha: sem comentário de HTML nem de código, que podem citar o `<main>`. */
const semComentarios = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const ler = (c: string) => semComentarios(readFileSync(c, 'utf8'));
const mains = (texto: string) => (texto.match(/<main[\s>]/g) ?? []).length;
const normal = (c: string) => c.split(sep).join('/');

/** Os layouts que trazem o `<main>`, em volta do conteúdo da página. */
const COM_MAIN = ['AdminLayout', 'OperadorLayout', 'MolduraForaDoAr'];

const usaLayoutComMain = (texto: string) =>
  COM_MAIN.some((l) => new RegExp(`import\\s+\\w+\\s+from\\s+['"][./]+layouts/${l}\\.astro['"]`).test(texto));

/** O que vem depois do `---` do cabeçalho — vazio na página que só redireciona. */
const desenho = (texto: string) => {
  const m = /^---\n[\s\S]*?\n---\n?/.exec(texto);
  return m ? texto.slice(m[0].length) : texto;
};

const paginas = globSync('src/pages/**/*.astro').map(normal).sort();
const componentes = globSync('src/components/**/*.astro').map(normal).sort();

describe('uma área principal por tela', () => {
  it('o glob achou as telas (guarda contra passar em silêncio)', () => {
    expect(paginas.length).toBeGreaterThan(25);
    expect(paginas).toEqual(expect.arrayContaining([
      'src/pages/admin/dia/[date].astro', 'src/pages/admin/login.astro', 'src/pages/operador/index.astro', 'src/pages/index.astro',
    ]));
    expect(componentes).toContain('src/components/operador/Entrar.astro');
  });

  it('cada layout que traz a área principal tem uma só, e o conteúdo da página fica dentro dela', () => {
    for (const l of COM_MAIN) {
      const texto = ler(`src/layouts/${l}.astro`);
      expect(mains(texto), l).toBe(1);
      const abre = texto.search(/<main[\s>]/);
      const conteudo = texto.search(/<slot\s*\/>/);
      expect(abre, l).toBeGreaterThan(-1);
      expect(conteudo, `${l}: o <slot /> fica dentro da <main>`).toBeGreaterThan(abre);
      expect(texto.indexOf('</main>'), `${l}: o <slot /> fica dentro da <main>`).toBeGreaterThan(conteudo);
    }
  });

  it('o layout do site não traz — cada página do site traz a sua', () => {
    expect(mains(ler('src/layouts/Layout.astro'))).toBe(0);
  });

  it('página com um desses layouts não abre outra área principal', () => {
    const comLayout = paginas.filter((c) => usaLayoutComMain(ler(c)));
    expect(comLayout.length).toBeGreaterThan(15);
    expect(comLayout.filter((c) => mains(ler(c)) > 0)).toEqual([]);
  });

  it('página sem eles traz a sua, uma só — fora a que só redireciona', () => {
    const semLayout = paginas.filter((c) => !usaLayoutComMain(ler(c)));
    const desenham = semLayout.filter((c) => desenho(ler(c)).trim() !== '');
    expect(desenham).toEqual(expect.arrayContaining(['src/pages/admin/login.astro', 'src/pages/admin/esqueci.astro', 'src/pages/admin/nova-senha.astro', 'src/pages/index.astro']));
    expect(desenham.map((c) => `${c}: ${mains(ler(c))}`)).toEqual(desenham.map((c) => `${c}: 1`));
  });

  it('componente não abre área principal — a não ser o que é a tela inteira, que abre uma', () => {
    const errados = componentes
      .map((c) => ({ c, texto: ler(c) }))
      .filter(({ texto }) => mains(texto) !== (/<html[\s>]/.test(texto) ? 1 : 0))
      .map(({ c, texto }) => `${c}: ${mains(texto)}`);
    expect(errados).toEqual([]);
  });

  it('controle: a regra pega o que as telas faziam até 13/10/2026', () => {
    const tela = ler('src/pages/admin/buscar.astro');
    const comoEra = tela.replace(/<div class="max-w-3xl/, '<main class="max-w-3xl');
    expect(comoEra).not.toBe(tela);
    expect(usaLayoutComMain(comoEra) && mains(comoEra) > 0).toBe(true);

    const entrar = ler('src/pages/admin/login.astro');
    const semMain = entrar.replace('<main class="w-full max-w-sm">', '<div class="w-full max-w-sm">').replace('</main>', '</div>');
    expect(semMain).not.toBe(entrar);
    expect(mains(semMain)).toBe(0);

    expect(mains(semComentarios('<!-- a <main> do layout -->\n<div></div>'))).toBe(0);
    expect(mains('<main>')).toBe(1);
    expect(mains('<main class="x">')).toBe(1);
    expect(mains('<mainha>')).toBe(0);
  });
});
