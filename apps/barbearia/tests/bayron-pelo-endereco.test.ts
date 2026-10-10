// O conteúdo do Bayron vai para o Bayron pelo ENDEREÇO, e não pelo nome
// (`PENDENCIAS-ABERTAS.md` §4.7).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// Dez lugares — oito componentes, o layout e o relatório impresso — decidiam
// com `shortName === "Bayron"` se mostravam o conteúdo dele cravado no
// repositório: o logo, a foto do topo, os depoimentos, o FAQ, o catálogo por
// categoria, a imagem de prévia e a logo do relatório. O nome curto é editável em
// Configurações: quem digitasse "Bayron" ali herdava os depoimentos, o FAQ, o
// catálogo e o logo de outra barbearia, no site de quem está pagando.
//
// Agora é uma função só, `ehOBayron()` (`lib/bayron.ts`), pelo `slug` — que o
// dono não edita, é único no banco e o cadastro não aceita.
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import { ehOBayron, SLUG_DO_BAYRON } from '../src/lib/bayron';
import { enderecoReservado } from '../src/lib/enderecosReservados';

describe('quem é o Bayron', () => {
  it('é o endereço bayron', () => {
    expect(ehOBayron({ slug: 'bayron' })).toBe(true);
  });

  it('o nome não conta: outra barbearia, mesmo chamada "Bayron", não é', () => {
    expect(ehOBayron({ slug: 'cortes-do-ze', shortName: 'Bayron' } as never)).toBe(false);
    expect(ehOBayron({ slug: 'bayron-2' })).toBe(false);
    expect(ehOBayron(null)).toBe(false);
  });

  it('o cadastro não aceita o endereço dele — nem num banco ainda sem ele', () => {
    expect(enderecoReservado(SLUG_DO_BAYRON)).toBe(true);
    expect(enderecoReservado('BAYRON')).toBe(true);
  });
});

/** O código sem os comentários — é neles que a comparação antiga fica registrada. */
const semComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const COMPARA_NOME = /\b(?:shortName|businessName)\s*[!=]==?\s*['"`]Bayron/i;

const arquivos = [...globSync('src/**/*.astro'), ...globSync('src/**/*.ts')]
  .map((c) => c.split(sep).join('/')).sort();

describe('ninguém decide pelo nome', () => {
  it('controle: o padrão pega as formas que existiam', () => {
    expect(COMPARA_NOME.test('const BAYRON = s.shortName === "Bayron";')).toBe(true);
    expect(COMPARA_NOME.test("const og = s.shortName === 'Bayron' ? '/og.jpg' : '';")).toBe(true);
    expect(COMPARA_NOME.test('const BAYRON = ehOBayron(tenantAtual());')).toBe(false);
  });

  it('nenhum arquivo de src/ compara o nome com "Bayron"', () => {
    expect(arquivos.length).toBeGreaterThan(50);
    const achados = arquivos.filter((c) => COMPARA_NOME.test(semComentarios(readFileSync(c, 'utf8'))));
    expect(achados).toEqual([]);
  });

  it('os dez lugares perguntam a ehOBayron', () => {
    const usam = arquivos.filter((c) => /\behOBayron\(/.test(semComentarios(readFileSync(c, 'utf8'))))
      .filter((c) => c !== 'src/lib/bayron.ts');
    expect(usam).toEqual([
      'src/components/FAQ.astro',
      'src/components/Footer.astro',
      'src/components/Gallery.astro',
      'src/components/Header.astro',
      'src/components/Hero.astro',
      'src/components/Products.astro',
      'src/components/Services.astro',
      'src/components/Testimonials.astro',
      'src/layouts/Layout.astro',
      'src/pages/admin/relatorios.astro',
    ]);
  });
});

describe('as constantes do Bayron saíram do config.ts', () => {
  it('sobrou só o destino do botão de agendar', () => {
    const config = semComentarios(readFileSync('src/config.ts', 'utf8'));
    expect([...config.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1])).toEqual(['TOPSALAO_URL']);
    expect(config).not.toMatch(/15551547238|Jaen Menescal|barbearia_bayron/);
  });
});
