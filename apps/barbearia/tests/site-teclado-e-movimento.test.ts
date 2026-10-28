// O menu do celular e os carrosséis do site, para quem usa teclado, leitor de tela ou pede
// ao sistema menos movimento.
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §2.41):
//  · o menu do celular, fechado, só ficava transparente — os links dele continuavam no
//    teclado e no leitor de tela, invisíveis; aberto, a página por baixo dele também; e o
//    botão se chamava "Toggle Menu", em inglês, sem dizer se o menu estava aberto;
//  · o carrossel dos depoimentos andava sozinho mesmo com "reduzir movimento" ligado — o da
//    galeria já respeitava.
// Não precisa de banco: o navegador conferiu o comportamento; aqui fica a guarda.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

const header = readFileSync('src/components/Header.astro', 'utf8');
const script = header.slice(header.indexOf('<script>'));

describe('o menu do celular', () => {
  it('nasce inerte: fechado, ele não está no teclado nem no leitor de tela', () => {
    expect(header).toMatch(/<div\s+id="mobile-menu"[^>]*\binert\b[^>]*>/);
  });

  it('o botão tem nome em português e diz se o menu está aberto', () => {
    const botao = /<button\s+id="mobile-menu-btn"[^>]*>/.exec(header)?.[0] ?? '';
    expect(botao).toMatch(/aria-label="Menu"/);
    expect(botao).toMatch(/aria-controls="mobile-menu"/);
    expect(botao).toMatch(/aria-expanded="false"/);
    expect(botao).not.toMatch(/Toggle/);
    expect(script).toMatch(/btn\.setAttribute\('aria-expanded', String\(sim\)\)/);
  });

  it('abrir e fechar mudam o teclado junto com a vista: o menu, e a página por baixo dele', () => {
    expect(script).toMatch(/menu\.inert = !sim;/);
    expect(script).toMatch(/porBaixo\(\)\.forEach\(\(el\) => \{ el\.inert = sim; \}\)/);
    // "porBaixo" é tudo menos o topo e o próprio menu — o botão de fechar mora no topo.
    expect(script).toMatch(/el !== menu && el !== header/);
  });

  it('Esc fecha, e o foco volta ao botão', () => {
    expect(script).toMatch(/e\.key !== 'Escape'/);
    expect(script).toMatch(/abrir\(false\);\s*btn\.focus\(\);/);
  });

  it('controle: a regra pega o menu de antes de 13/10/2026', () => {
    const antes = '<div\n  id="mobile-menu"\n  class="fixed inset-0 opacity-0 pointer-events-none"\n>';
    expect(antes).not.toMatch(/<div\s+id="mobile-menu"[^>]*\binert\b[^>]*>/);
    expect('<button id="mobile-menu-btn" aria-label="Toggle Menu">').toMatch(/Toggle/);
  });
});

describe('carrossel que anda sozinho respeita "reduzir movimento"', () => {
  const componentes = globSync('src/components/**/*.astro').map((c) => c.split(sep).join('/')).sort();
  const PERGUNTA = /const semMovimento = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;/;

  /** Os laços de animação: a função que se pede de novo a cada quadro. */
  const lacos = (texto: string) =>
    [...texto.matchAll(/function (\w+)\(\)\s*\{[\s\S]*?requestAnimationFrame\(\1\);/g)].map((m) => m[1]);

  /** A partida do laço é o último `requestAnimationFrame(nome)` do arquivo, fora da função. */
  const partidaGuardada = (texto: string, nome: string) => {
    const ultima = [...texto.matchAll(new RegExp(`^\\s*(.*)requestAnimationFrame\\(${nome}\\);`, 'gm'))].pop();
    return Boolean(ultima && /^if \(!semMovimento\)\s*$/.test(ultima[1]));
  };

  it('acha os dois carrosséis (guarda contra passar em silêncio)', () => {
    const comLaco = componentes.filter((c) => lacos(readFileSync(c, 'utf8')).length > 0);
    expect(comLaco).toEqual(expect.arrayContaining(['src/components/Gallery.astro', 'src/components/Testimonials.astro']));
  });

  it('todo laço de animação só começa sem o pedido de menos movimento', () => {
    const errados = componentes.flatMap((c) => {
      const texto = readFileSync(c, 'utf8');
      return lacos(texto)
        .filter((nome) => !PERGUNTA.test(texto) || !partidaGuardada(texto, nome))
        .map((nome) => `${c}: ${nome}`);
    });
    expect(errados).toEqual([]);
  });

  it('controle: a regra pega o carrossel dos depoimentos de antes de 13/10/2026', () => {
    const hoje = readFileSync('src/components/Testimonials.astro', 'utf8');
    const antes = hoje.replace('if (!semMovimento) requestAnimationFrame(tick);', 'requestAnimationFrame(tick);');
    expect(antes).not.toBe(hoje);
    expect(lacos(antes)).toContain('tick');
    expect(partidaGuardada(antes, 'tick')).toBe(false);
    expect(partidaGuardada(hoje, 'tick')).toBe(true);
  });
});
