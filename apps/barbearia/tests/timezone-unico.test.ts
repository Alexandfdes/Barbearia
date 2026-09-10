// Guarda-corpo do `PENDENCIAS-ABERTAS.md` §2.1: o fuso mora num lugar só.
//
// Não precisa de banco: lê o código-fonte.
//
// POR QUE ESTE TESTE EXISTE
//
// `America/Fortaleza` chegou a estar escrito 24 vezes em 20 arquivos. Não
// quebrava por coincidência — Fortaleza é UTC-3 como São Paulo. Manaus é UTC-4
// e o Acre é UTC-5: vender para lá com o fuso cravado dá horário errado em
// silêncio, que num sistema de agendamento é o pior defeito possível.
//
// Espalhar de novo é fácil: basta alguém copiar uma linha de outro arquivo.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/** O único arquivo onde o nome do fuso pode aparecer. */
const FONTE_UNICA = 'src/lib/timezone.ts';

const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
  .map((c) => c.split(sep).join('/'))
  .filter((c) => c !== FONTE_UNICA)
  .sort();

describe('o fuso horário tem uma fonte só', () => {
  it('o glob encontrou os arquivos (guarda contra falhar em silêncio)', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it('nenhum arquivo crava o nome de um fuso', () => {
    // Qualquer zona IANA de América, não só Fortaleza: trocar por
    // 'America/Sao_Paulo' cravado seria o mesmo defeito com outro nome.
    const cravaram = arquivos.filter((c) =>
      /['"`]America\/[A-Za-z_]+['"`]/.test(readFileSync(c, 'utf8'))
    );
    expect(cravaram).toEqual([]);
  });

  it('quem precisa do fuso importa de lib/timezone', () => {
    // Se um arquivo usa `timeZone:` ou `AT TIME ZONE`, ele tem que ter pegado o
    // valor de algum lugar — e o único lugar é o módulo comum.
    const semImportar = arquivos.filter((c) => {
      const s = readFileSync(c, 'utf8');
      // `AT TIME ZONE 'UTC'` não conta: UTC é a zona de ARMAZENAMENTO, igual em
      // qualquer barbearia. O que precisa de fonte única é o fuso LOCAL.
      const semUtc = s.replace(/AT TIME ZONE 'UTC'/g, '');
      const usaFuso = /timeZone:|AT TIME ZONE|formatInTimeZone|fromZonedTime|toZonedTime/.test(semUtc);
      if (!usaFuso) return false;
      // Aceita o import de qualquer profundidade (`./timezone.js` dentro de lib/)
      // e o `define:vars={{ TZ }}`, que é o servidor passando o valor ao navegador.
      return !/from '[^']*timezone(\.js)?'|define:vars=\{\{\s*TZ\s*\}\}/.test(s);
    });
    expect(semImportar).toEqual([]);
  });
});
