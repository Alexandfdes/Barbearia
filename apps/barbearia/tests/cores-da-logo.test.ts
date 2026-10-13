// As cores sugeridas da logo, em Configurações (`PENDENCIAS-ABERTAS.md` §4.2).
//
// Não precisa de banco nem de navegador: a conta recebe os pixels que o `<canvas>`
// devolveria, e aqui eles são feitos à mão.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sugestoesDaLogo } from '../src/lib/coresDaLogo.js';
import { derivarAccent, ACCENT_PADRAO } from '../src/lib/accent.js';

type Px = [number, number, number, number];

/** Uma "logo" com `n` pixels de cada cor, na ordem dada. */
function logo(...partes: [Px, number][]): number[] {
  return partes.flatMap(([px, n]) => Array.from({ length: n }, () => px).flat());
}

const TRANSPARENTE: Px = [0, 0, 0, 0];
const BRANCO: Px = [255, 255, 255, 255];
const PRETO: Px = [0, 0, 0, 255];
const CINZA: Px = [128, 128, 128, 255];
const DOURADO: Px = [201, 162, 39, 255];
const VINHO: Px = [107, 31, 42, 255];
const MARINHO: Px = [31, 42, 68, 255];

describe('sugestoesDaLogo()', () => {
  it('a logo de sempre — preta e dourada, num fundo transparente: sugere o dourado', () => {
    expect(sugestoesDaLogo(logo([TRANSPARENTE, 500], [PRETO, 300], [DOURADO, 120]))).toEqual(['#c9a227']);
  });

  it('logo sem cor nenhuma — preto, branco, cinza: nada a sugerir', () => {
    expect(sugestoesDaLogo(logo([BRANCO, 300], [PRETO, 300], [CINZA, 300]))).toEqual([]);
    expect(sugestoesDaLogo([])).toEqual([]);
  });

  it('o quase-preto com um tom não vira "vermelho da sua logo"', () => {
    expect(sugestoesDaLogo(logo([[12, 0, 0, 255], 400], [[30, 14, 12, 255], 400]))).toEqual([]);
  });

  it('marinho escuro conta — é cor de marca comum, e o derivarAccent aceita', () => {
    expect(sugestoesDaLogo(logo([BRANCO, 400], [MARINHO, 200]))).toEqual(['#1f2a44']);
    expect(derivarAccent('#1f2a44')).not.toBe(ACCENT_PADRAO);
  });

  it('da mais presente para a menos, e no máximo quatro', () => {
    const cores: Px[] = [VINHO, DOURADO, MARINHO, [20, 140, 60, 255], [200, 60, 160, 255]];
    const pixels = logo(...cores.map((c, i) => [c, 500 - i * 50] as [Px, number]));
    expect(sugestoesDaLogo(pixels)).toEqual(['#6b1f2a', '#c9a227', '#1f2a44', '#148c3c']);
    expect(sugestoesDaLogo(pixels, 2)).toEqual(['#6b1f2a', '#c9a227']);
  });

  it('o mesmo tom com variação de compressão é uma sugestão só, na média dele', () => {
    const r = sugestoesDaLogo(logo([[200, 40, 40, 255], 300], [[206, 46, 44, 255], 300], [[196, 38, 36, 255], 300]));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^#c[89a-c][0-9a-f]{4}$/);
  });

  it('a borda serrilhada — menos de 5% dos pixels com cor — não vira sugestão', () => {
    expect(sugestoesDaLogo(logo([DOURADO, 1000], [[240, 200, 120, 255], 30]))).toEqual(['#c9a227']);
  });

  it('o pixel quase transparente não conta', () => {
    expect(sugestoesDaLogo(logo([[201, 162, 39, 60], 900], [VINHO, 100]))).toEqual(['#6b1f2a']);
  });
});

describe('Configurações usa as sugestões sem gravar sozinha', () => {
  const pagina = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');

  it('o bloco só existe com logo, e lê os pixels dela', () => {
    expect(pagina).toMatch(/\{cfg\?\.logoPath && \(\s*<div id="cores-da-logo"/);
    expect(pagina).toMatch(/sugestoesDaLogo\(/);
  });

  it('tocar numa sugestão preenche o campo pelo mesmo caminho do seletor — e não chama o servidor', () => {
    const trecho = pagina.slice(pagina.indexOf('// ── As cores da logo'), pagina.indexOf('// ── fim das cores da logo'));
    expect(trecho.length).toBeGreaterThan(100);
    expect(trecho).toMatch(/sincronizar\(/);
    expect(trecho).not.toMatch(/fetch\(|btn-salvar|\.submit\(/);
  });
});
