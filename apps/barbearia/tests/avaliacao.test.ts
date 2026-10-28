// A nota do Google no site (`PENDENCIAS-ABERTAS.md` §4.11).
//
// Não precisa de banco: a regra é conta (`src/lib/avaliacao.ts`), e a seção só a desenha.
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026, com a nota em branco, a seção publicava "0,0 — Baseado em 0
// avaliações" com cinco estrelas acesas — e as cinco nunca olhavam a nota: 3,8 mostrava
// cinco cheias. E ela só aparecia no site do Bayron, enquanto o medidor de completude
// dizia a todo dono que a nota "aparece no site".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMA_DA_NOTA, notaDoGoogle, quantasAvaliacoes } from '../src/lib/avaliacao.js';
import { calcularCompletude, type EstadoDaBarbearia } from '../src/lib/completude.js';

describe('notaDoGoogle() — quando a nota aparece, e com quantas estrelas', () => {
  it('sem nota, ou sem avaliação nenhuma, não há o que mostrar', () => {
    expect(notaDoGoogle('', 127)).toBeNull();
    expect(notaDoGoogle(null, 127)).toBeNull();
    expect(notaDoGoogle('   ', 127)).toBeNull();
    expect(notaDoGoogle('4.8', 0)).toBeNull();
    expect(notaDoGoogle('4.8', null)).toBeNull();
  });

  it('nota do Google vai de 1 a 5: zero e o que passa de 5 não são nota', () => {
    expect(notaDoGoogle('0', 10)).toBeNull();
    expect(notaDoGoogle('0.5', 10)).toBeNull();
    expect(notaDoGoogle('5.9', 10)).toBeNull();
    expect(notaDoGoogle('abc', 10)).toBeNull();
    expect(notaDoGoogle('1', 1)?.texto).toBe('1,0');
    expect(notaDoGoogle('5', 1)?.texto).toBe('5,0');
  });

  it('as estrelas seguem a nota — 4,8 pinta 80% da quinta, 3,8 deixa a quinta vazia', () => {
    expect(notaDoGoogle('4.8', 127)?.estrelas).toEqual([1, 1, 1, 1, 0.8]);
    expect(notaDoGoogle('3.8', 40)?.estrelas).toEqual([1, 1, 1, 0.8, 0]);
    expect(notaDoGoogle('5.0', 9)?.estrelas).toEqual([1, 1, 1, 1, 1]);
    expect(notaDoGoogle('1.2', 3)?.estrelas).toEqual([1, 0.2, 0, 0, 0]);
  });

  it('vírgula também vale, e o texto sai com vírgula', () => {
    expect(notaDoGoogle('4,5', 12)).toEqual({ valor: 4.5, texto: '4,5', quantidade: 12, estrelas: [1, 1, 1, 1, 0.5] });
  });

  it('"1 avaliação", e o milhar com ponto', () => {
    expect(quantasAvaliacoes(1)).toBe('1 avaliação');
    expect(quantasAvaliacoes(127)).toBe('127 avaliações');
    expect(quantasAvaliacoes(1234)).toBe('1.234 avaliações');
  });
});

/** O código sem os comentários — que é onde o defeito antigo fica registrado. */
function soCodigo(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

describe('o que Configurações aceita no campo da nota', () => {
  it('vazio, ou de 0 a 5 com uma casa — e não mais 5.9', () => {
    for (const ok of ['', '0', '4', '4.8', '5', '5.0', '0.5']) expect(FORMA_DA_NOTA.test(ok), ok).toBe(true);
    for (const nao of ['5.9', '5.1', '6', '4.85', '-1', '4,8', 'abc', ' 4.8']) expect(FORMA_DA_NOTA.test(nao), nao).toBe(false);
  });

  it('a rota de Configurações usa esta regra', () => {
    expect(readFileSync('src/pages/api/admin/settings.ts', 'utf8')).toMatch(/googleRating:\s+z\.string\(\)\.regex\(FORMA_DA_NOTA,/);
  });
});

describe('a seção usa a regra — e não inventa nota', () => {
  const secao = soCodigo(readFileSync('src/components/Testimonials.astro', 'utf8'));

  it('o bloco da nota só existe com nota; o carrossel, só com os depoimentos do Bayron', () => {
    expect(secao).toMatch(/const nota = notaDoGoogle\(s\.googleRating, s\.googleReviewCount\);/);
    expect(secao).toMatch(/\{nota && \(/);
    expect(secao).toMatch(/const comDepoimentos = BAYRON && depoimentos\.length > 0;/);
    expect(secao).toMatch(/const mostrar = nota !== null \|\| comDepoimentos;/);
  });

  it('as cinco estrelas não voltam a ser enfeite', () => {
    // O defeito era este: cinco estrelas pintadas, qualquer que fosse a nota.
    expect(secao).not.toMatch(/Array\.from\(\{ length: 5 \}\)\.map\(\(\) =>/);
    expect(secao).toMatch(/nota\.estrelas\.map\(/);
  });

  it('nem a nota nem os depoimentos do Google vão para o JSON-LD', () => {
    // A regra do Google: "Don't aggregate reviews or ratings from other websites"
    // (developers.google.com/search/docs/appearance/structured-data/review-snippet).
    expect(secao).not.toMatch(/AggregateRating|aggregateRating|"@type": "Review"|application\/ld\+json/);
  });
});

describe('o medidor de completude pede o que faz a nota aparecer', () => {
  const BASE: EstadoDaBarbearia = {
    logoPath: null, heroPath: null, tagline: null, aboutText: null,
    whatsappNumber: '5584999990000', addressStreet: 'R. A, 1', addressCity: 'Mossoró/RN',
    instagramUrl: null, googleRating: null, googleReviewCount: null, seoTitle: null, seoDescription: null,
    accentColor: null, horariosPublicados: 1, servicosAtivos: 1, barbeirosComAgenda: 1, fotosNaGaleria: 0,
  };
  const pedeAvaliacoes = (e: Partial<EstadoDaBarbearia>) =>
    calcularCompletude({ ...BASE, ...e }).pendencias.some((p) => p.id === 'avaliacoes');

  it('com a nota e a quantidade, está feito; com uma só, não', () => {
    expect(pedeAvaliacoes({})).toBe(true);
    expect(pedeAvaliacoes({ googleRating: '4.8' })).toBe(true);
    expect(pedeAvaliacoes({ googleReviewCount: 127 })).toBe(true);
    expect(pedeAvaliacoes({ googleRating: '4.8', googleReviewCount: 127 })).toBe(false);
  });
});
