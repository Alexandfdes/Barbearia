// O ícone da aba de cada barbearia — `src/lib/iconeDaAba.ts`.
//
// Até 27/09/2026, sem ícone enviado, o site e o painel mostravam o do Astro (o
// framework do site), que é o que está em `public/favicon.svg`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { iconeComLetra, iconeDaAba, inicialDoNome } from '../src/lib/iconeDaAba';
import { ACCENT_PADRAO, contraste, derivarAccent } from '../src/lib/accent';

const svgDe = (dataUri: string) => decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml,/, ''));
const BASE = { faviconPath: null, shortName: 'Cortes do Zé', businessName: 'Barbearia Cortes do Zé', accentColor: '#7c3aed' };

describe('a inicial', () => {
  it('a primeira letra, em maiúscula', () => expect(inicialDoNome('cortes do Zé')).toBe('C'));
  it('acento e ñ contam como letra', () => {
    expect(inicialDoNome('Érico Barber')).toBe('É');
    expect(inicialDoNome('ñandu')).toBe('Ñ');
  });
  it('pula o que não é letra nem algarismo', () => expect(inicialDoNome('  "<Zé>" ')).toBe('Z'));
  it('algarismo vale', () => expect(inicialDoNome('100% Barba')).toBe('1'));
  it('sem letra nenhuma, um ponto — nunca vazio', () => {
    expect(inicialDoNome('')).toBe('•');
    expect(inicialDoNome('<&>')).toBe('•');
  });
});

describe('o ícone com a letra', () => {
  it('é um SVG em data: com a inicial', () => {
    const icone = iconeComLetra('Cortes do Zé', '#7c3aed');
    expect(icone.startsWith('data:image/svg+xml,')).toBe(true);
    expect(svgDe(icone)).toMatch(/<text[^>]*>C<\/text>/);
  });

  it('o fundo é a cor dos botões da barbearia, e a letra branca passa no contraste', () => {
    for (const cor of ['#7c3aed', '#fde047', '#0f766e', '#6b1f2a']) {
      const fundo = svgDe(iconeComLetra('Zé', cor)).match(/<rect[^>]*fill="(#[0-9a-fA-F]{3,6})"/)![1];
      expect(fundo).toBe(derivarAccent(cor).color);
      expect(contraste(fundo, '#ffffff'), cor).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('cor inválida cai na cor padrão do produto — não entra no SVG', () => {
    const svg = svgDe(iconeComLetra('Zé', 'red"/><script>'));
    expect(svg).toContain(`fill="${ACCENT_PADRAO.color}"`);
    expect(svg).not.toContain('<script');
  });
});

describe('o ícone da aba', () => {
  it('o que o dono enviou vence', () => {
    expect(iconeDaAba({ ...BASE, faviconPath: '/api/media/zé/favicon/x.png' })).toBe('/api/media/zé/favicon/x.png');
  });
  it('sem ícone enviado, a inicial do nome curto', () => {
    expect(svgDe(iconeDaAba(BASE))).toMatch(/>C<\/text>/);
  });
  it('sem nome curto, a do nome da barbearia', () => {
    expect(svgDe(iconeDaAba({ ...BASE, shortName: '' }))).toMatch(/>B<\/text>/);
  });
});

describe('site e painel usam o ícone da barbearia, não o do Astro', () => {
  const layouts = ['src/layouts/Layout.astro', 'src/layouts/AdminLayout.astro', 'src/pages/admin/login.astro'];

  it('controle: o padrão pega a linha antiga', () => {
    expect(/['"]\/favicon\.svg['"]/.test(`const favicon = s.faviconPath ?? '/favicon.svg';`)).toBe(true);
  });

  it('nenhum dos três aponta para o /favicon.svg', () => {
    for (const arquivo of layouts) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).not.toMatch(/['"]\/favicon\.svg['"]/);
    }
  });

  it('o site e o painel passam por iconeDaAba', () => {
    expect(readFileSync('src/layouts/Layout.astro', 'utf8')).toMatch(/const favicon = iconeDaAba\(s\)/);
    expect(readFileSync('src/layouts/AdminLayout.astro', 'utf8')).toMatch(/<link rel="icon" href=\{iconeDaAba\(s\)\}/);
  });
});
