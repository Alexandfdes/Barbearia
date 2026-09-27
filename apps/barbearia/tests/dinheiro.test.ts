// Preço com centavos, igual em toda tela.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// Cada tela formatava preço do seu jeito, e quase todas arredondavam: o "Corte +
// barba" de R$ 39,90 aparecia como R$ 40 no site, no agendamento, na confirmação
// e na agenda do dia — visto ao vivo em 27/09/2026. E a edição de serviço fazia
// `Math.floor` + `parseInt(...) * 100`: corrigir só o NOME gravava R$ 39,00, sem
// aviso (`PENDENCIAS-ABERTAS.md` §2.15).
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { reais, centavosDoCampo } from '../src/lib/dinheiro.js';

describe('reais()', () => {
  it('mostra os centavos quando existem', () => expect(reais(3990)).toBe('R$ 39,90'));
  it('valor redondo sem vírgula, como o site sempre mostrou', () => expect(reais(4000)).toBe('R$ 40'));
  it('milhar com ponto', () => expect(reais(123450)).toBe('R$ 1.234,50'));
  it('centavo sozinho', () => expect(reais(5)).toBe('R$ 0,05'));
  it('zero', () => expect(reais(0)).toBe('R$ 0'));
});

describe('centavosDoCampo()', () => {
  it('vírgula, que é como o dono digita', () => expect(centavosDoCampo('39,90')).toBe(3990));
  it('ponto, que é o que o campo numérico do navegador devolve', () => expect(centavosDoCampo('39.90')).toBe(3990));
  it('inteiro', () => expect(centavosDoCampo('40')).toBe(4000));
  it('arredonda a terceira casa em vez de cortar', () => expect(centavosDoCampo('39.999')).toBe(4000));
  it('o que não é número vira NaN — quem chama decide a mensagem', () => {
    expect(centavosDoCampo('')).toBeNaN();
    expect(centavosDoCampo('abc')).toBeNaN();
  });
});

// Nenhuma tela volta a formatar preço por conta própria, arredondando.
const PADROES = [
  /\/\s?100\)?\.toFixed\(0\)/,               // (c / 100).toFixed(0)
  /Math\.(round|floor)\([^)]*\/\s?100\)/,     // Math.round(c / 100)
  /maximumFractionDigits:\s*0/,               // toLocaleString(..., { maximumFractionDigits: 0 })
  /parseInt\([^)]*\)\s*\*\s*100/,             // parseInt(valor) * 100
];
const soCodigo = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('nenhuma tela arredonda preço para mostrar', () => {
  const fontes = [...globSync('src/**/*.astro'), ...globSync('src/**/*.ts')]
    // `combo.ts` calcula o desconto em centavos — conta, não exibição.
    .filter((f) => !f.replace(/\\/g, '/').endsWith('lib/combo.ts'));

  it('controle: os padrões pegam o que existia antes', () => {
    const antes = [
      "const reais = (c: number) => `R$ ${Math.round(c / 100)}`;",
      'price: `R$ ${(r.priceCents / 100).toFixed(0)}`,',
      "`R$ ${(cents / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`",
      'priceCents: parseInt(priceEl.value, 10) * 100',
    ];
    for (const linha of antes) expect(PADROES.some((p) => p.test(linha)), linha).toBe(true);
    expect(fontes.length).toBeGreaterThan(50);
  });

  it('nenhum arquivo do app tem um deles', () => {
    const achados = fontes.flatMap((f) => {
      const codigo = soCodigo(readFileSync(f, 'utf8'));
      return PADROES.filter((p) => p.test(codigo)).map((p) => `${f}: ${p}`);
    });
    expect(achados).toEqual([]);
  });
});
