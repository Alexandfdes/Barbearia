// JSON dentro de `<script>` passa pelo escape — sempre.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// `JSON.stringify` não escapa `<`. O navegador fecha um bloco `<script>` no
// primeiro `</script>` que encontra, inclusive dentro de uma string JSON — então
// um nome de barbearia com `</script><script>…` executava script no site
// público, no navegador de todo visitante.
//
// O nome vem do painel, e a validação dele limita tamanho, não caractere. Com
// `CADASTRO_ABERTO=1`, qualquer pessoa de fora plantava isso pelo formulário.
//
// Três lugares tinham o padrão: `layouts/Layout.astro`, `components/FAQ.astro` e
// `components/Testimonials.astro`.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import { jsonLdSeguro } from '../src/lib/jsonLd.js';

const astros = [...globSync('src/**/*.astro'), ...globSync('../vendas/src/**/*.astro')].sort();

describe('o escape', () => {
  it('fecha a sequência que terminaria a tag', () => {
    const cru = jsonLdSeguro({ name: 'Barbearia </script><script>alert(1)</script>' });

    expect(cru).not.toContain('</script>');
    expect(cru).toContain('\\u003c');
  });

  it('não muda o conteúdo — quem lê recebe o texto original de volta', () => {
    const original = { name: 'Bar & Cia <3', nota: 'aspas "assim" e \\ barra' };
    expect(JSON.parse(jsonLdSeguro(original))).toEqual(original);
  });

  it('escapa os separadores de linha que quebram o analisador de JS', () => {
    expect(jsonLdSeguro({ x: '\u2028\u2029' })).toBe('{"x":"\\u2028\\u2029"}');
  });
});

describe('nenhum `.astro` monta JSON para dentro de script sem escapar', () => {
  it('encontra os arquivos (guarda contra o glob quebrar em silêncio)', () => {
    expect(astros.length).toBeGreaterThan(20);
  });

  it('nenhum `set:html={JSON.stringify(...)}` sobrou', () => {
    const cruas = astros
      .filter((c) => /set:html=\{\s*JSON\.stringify/.test(readFileSync(c, 'utf8')))
      .map((c) => c.split(sep).join('/'));

    expect(
      cruas,
      'use `jsonLdSeguro()` de `src/lib/jsonLd.ts` — JSON.stringify não escapa `<`',
    ).toEqual([]);
  });
});
