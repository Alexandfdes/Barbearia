import { describe, it, expect } from 'vitest';
import {
  derivarAccent, cssDoAccent, contraste, isHex, ACCENT_PADRAO,
} from '../src/lib/accent.js';

/** Cores de logo que aparecem de verdade em barbearia. */
const LOGOS = {
  preto:    '#000000',
  branco:   '#ffffff',
  cinza:    '#8a8a8a',
  dourado:  '#c9a227',
  vinho:    '#6b1f2a',
  marinho:  '#1b2a5a',
  vermelho: '#c1272d',
  laranja:  '#e8721c',
  teal:     '#0f766e',
  roxo:     '#5b21b6',
  rosa:     '#db2777',
};

const SUPERFICIES = ['#0a0a0a', '#141414', '#1a1a1a', '#222222'];

describe('isHex', () => {
  it('aceita #rgb e #rrggbb', () => {
    expect(isHex('#fff')).toBe(true);
    expect(isHex('#0F766E')).toBe(true);
  });
  it('recusa o que não é hex — é o que barra injeção de CSS', () => {
    for (const v of ['red', '#12345', 'rgb(1,2,3)', '#fff;}body{display:none', '', null, undefined, 123]) {
      expect(isHex(v)).toBe(false);
    }
  });
});

describe('derivarAccent — a garantia que importa', () => {
  it('NENHUMA logo produz botão que reprove com texto branco', () => {
    for (const [nome, hex] of Object.entries(LOGOS)) {
      const a = derivarAccent(hex);
      expect(contraste('#ffffff', a.color), `${nome} (${hex}) -> ${a.color}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o hover ESCURECE, então nunca perde contraste em relação ao normal', () => {
    for (const [nome, hex] of Object.entries(LOGOS)) {
      const a = derivarAccent(hex);
      expect(contraste('#ffffff', a.hover), `${nome} hover`).toBeGreaterThanOrEqual(contraste('#ffffff', a.color) - 0.01);
    }
  });

  it('a variante clara passa como texto sobre TODAS as superfícies escuras', () => {
    for (const [nome, hex] of Object.entries(LOGOS)) {
      const a = derivarAccent(hex);
      for (const fundo of SUPERFICIES) {
        expect(contraste(a.light, fundo), `${nome} light sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('derivarAccent — casos particulares', () => {
  it('logo sem cor cai no padrão em vez de inventar matiz', () => {
    for (const cinza of ['#000000', '#ffffff', '#8a8a8a', '#333333']) {
      expect(derivarAccent(cinza)).toEqual(ACCENT_PADRAO);
    }
  });

  it('cor que já passa não é mexida — e aqui as ESCURAS é que já passam', () => {
    // Regra invertida em relação ao site de vendas: como o texto do botão é
    // branco, cor escura serve de cara. Vinho e marinho ficam intactos.
    expect(derivarAccent('#0f766e').color).toBe('#0f766e');
    expect(derivarAccent('#6b1f2a').color).toBe('#6b1f2a');
    expect(derivarAccent('#1b2a5a').color).toBe('#1b2a5a');
  });

  it('cor clara demais é escurecida — dourado e laranja não seguram texto branco', () => {
    for (const claro of ['#c9a227', '#e8721c']) {
      expect(contraste('#ffffff', claro), `${claro} cru`).toBeLessThan(4.5);
      const a = derivarAccent(claro);
      expect(a.color).not.toBe(claro);
      expect(contraste('#ffffff', a.color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserva a matiz da marca (marinho continua azul, vinho continua vermelho)', () => {
    const marinho = derivarAccent('#1b2a5a');
    const [r1, g1, b1] = [1, 3, 5].map((i) => parseInt(marinho.color.slice(i, i + 2), 16));
    expect(b1, 'azul deve dominar num marinho').toBeGreaterThan(r1);
    expect(b1).toBeGreaterThan(g1);

    const vinho = derivarAccent('#6b1f2a');
    const [r2, g2, b2] = [1, 3, 5].map((i) => parseInt(vinho.color.slice(i, i + 2), 16));
    expect(r2, 'vermelho deve dominar num vinho').toBeGreaterThan(g2);
    expect(r2).toBeGreaterThan(b2);
  });

  it('entrada inválida devolve o padrão, nunca quebra', () => {
    for (const v of ['', 'azul', '#xyzxyz', null as any, undefined as any]) {
      expect(derivarAccent(v)).toEqual(ACCENT_PADRAO);
    }
  });
});

describe('cssDoAccent', () => {
  it('monta a sobrescrita dos três tokens', () => {
    const css = cssDoAccent({ color: '#123456', hover: '#0a1a2a', light: '#9fd8ff' });
    expect(css).toBe(':root{--color-teal:#123456;--color-teal-hover:#0a1a2a;--color-teal-light:#9fd8ff}');
  });

  it('descarta valor malicioso e usa o padrão — sem isto o campo do painel injeta CSS', () => {
    const css = cssDoAccent({ color: '#fff;}body{display:none}.x{color:red' as any });
    expect(css).not.toContain('display:none');
    expect(css).toContain(ACCENT_PADRAO.color);
  });

  it('não deixa escapar chave, ponto-e-vírgula ou tag', () => {
    for (const veneno of ['</style><script>alert(1)</script>', 'red;}', 'url(javascript:alert(1))']) {
      const css = cssDoAccent({ color: veneno as any, hover: veneno as any, light: veneno as any });
      expect(css).toBe(cssDoAccent({}));
    }
  });
});
