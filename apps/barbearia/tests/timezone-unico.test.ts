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
      // Aceita o import de qualquer profundidade (`./timezone.js` dentro de lib/).
      //
      // ⚠️ Até 25/09/2026 aceitava também `define:vars={{ TZ }}` — e foi esse o
      // caminho que quebrou a agenda do dia: `define:vars` deixa o script inline,
      // sem `import` e sem TypeScript. O fuso chega ao navegador pelos dados da
      // página (`clientData.tz`). Ver `tests/scripts-inline.test.ts`.
      return !/from '[^']*timezone(\.js)?'/.test(s);
    });
    expect(semImportar).toEqual([]);
  });
});

// ── A conta do offset, a classe que os dois casos acima não pegam ──────────────
//
// Até 27/09/2026 este arquivo só procurava o NOME do fuso. A conta passava livre:
// `Date.UTC(y, mo - 1, d, h + 3, min)`, `(h - 3 + 24) % 24`, `utcOffsetMin ?? -180` e
// `Date.now() - 3 * 60 * 60 * 1000` não têm string de zona nenhuma — e eram seis
// lugares, cinco deles no navegador (a agenda do dia, o bloqueio e o calendário do
// cliente). Todos acertavam em Fortaleza e erravam uma hora em Manaus, em silêncio
// (`PENDENCIAS-ABERTAS.md` §2.11).
//
// Varre o código de todo `.ts` e `.astro` de `src/`, os scripts de página inclusive.
// Comentário não conta: é onde a conta antiga fica registrada.
const CONTA_DE_OFFSET: [string, RegExp][] = [
  // `h - 3` exige espaço dos dois lados: `h-3` é classe do Tailwind (altura).
  ['hora mais ou menos 3', /\bh\s*\+\s*3\b|\bh\s+-\s+3\b/],
  ['Date.UTC com ± 3', /Date\.UTC\([^;]*[+-]\s*3\s*[,)]/],
  ['offset em minutos', /\butcOffsetMin\b|(?<![\w-])-\s*180\b/],
  ['três horas em milissegundos', /\b3\s*\*\s*60\s*\*\s*60\b|\b10_?800_?000\b|\b3\s*\*\s*3_?600(_?000)?\b/],
  ['offset do relógio de quem roda', /getTimezoneOffset\(/],
];

/** O código sem os comentários — que viram linhas em branco, para o número da linha continuar certo. */
function soCodigo(texto: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, '');
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/<!--[\s\S]*?-->/g, vazio)
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l))
    .join('\n');
}

describe('nenhuma conta soma ou subtrai o offset à mão', () => {
  it('controle: os padrões pegam as contas que existiam, e não pegam o que é certo', () => {
    const antes = [
      'return new Date(Date.UTC(y, mo - 1, d, h + 3, min)).toISOString();',
      'const utc = new Date(Date.UTC(y, mo - 1, d, h + 3, mm)).toISOString();',
      'const hLocal   = (h - 3 + 24) % 24;',
      'const utcOffsetMin = params.utcOffsetMin ?? -180;',
      'const d = new Date(Date.now() - 3 * 60 * 60 * 1000);',
    ];
    for (const linha of antes) {
      expect(CONTA_DE_OFFSET.some(([, p]) => p.test(linha)), linha).toBe(true);
    }
    const certas = [
      'return fromZonedTime(`${dateStr}T${timeStr}:00`, TZ).toISOString();',
      '<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">',
      'class="w-5 h-5 transition-transform group-open:rotate-180"',
      'const fim = inicio + 3 * 60;',
    ];
    for (const linha of certas) {
      expect(CONTA_DE_OFFSET.some(([, p]) => p.test(linha)), linha).toBe(false);
    }
  });

  it('nenhum arquivo de src/ tem uma delas', () => {
    const achados = arquivos.flatMap((c) =>
      soCodigo(readFileSync(c, 'utf8')).split('\n').flatMap((linha, i) =>
        CONTA_DE_OFFSET.filter(([, p]) => p.test(linha)).map(([nome]) => `${c}:${i + 1} (${nome}): ${linha.trim()}`)
      )
    );
    expect(achados).toEqual([]);
  });
});
