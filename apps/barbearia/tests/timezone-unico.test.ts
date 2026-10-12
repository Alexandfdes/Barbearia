// Guarda-corpo do `PENDENCIAS-ABERTAS.md` §2.1: o fuso é o DA BARBEARIA.
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
// Em 10/09/2026 o fuso foi para um lugar só (`lib/timezone.ts`), lido de uma
// variável de ambiente. Em 12/10/2026 passou a ser de cada barbearia
// (`tenants.timezone`, lido por `fusoDe`): um processo só atende Manaus e Mossoró
// ao mesmo tempo, e variável de ambiente vale para o processo inteiro. Então o que
// este arquivo reprova é todo fuso que não venha DELA — o nome cravado, o padrão
// usado onde há barbearia, o fuso do ambiente e o do relógio de quem roda.
//
// Espalhar de novo é fácil: basta alguém copiar uma linha de outro arquivo.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/** O único arquivo onde o nome do fuso pode aparecer: a lista dos fusos do Brasil. */
const FONTE_UNICA = 'src/lib/timezone.ts';

const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
  .map((c) => c.split(sep).join('/'))
  .filter((c) => c !== FONTE_UNICA)
  .sort();

describe('o fuso horário vem da barbearia', () => {
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

  it('o fuso do processo não existe mais: `lib/timezone` não exporta `TZ`, e ninguém o importa', () => {
    // Até 12/10/2026 era `export const TZ`, lido de `TZ_BARBEARIA` — o mesmo
    // fuso para todas as barbearias do processo. Sumir com ele é o que fez o
    // compilador apontar cada lugar que precisava do fuso DELA.
    expect(soCodigo(readFileSync(FONTE_UNICA, 'utf8'))).not.toMatch(/export\s+const\s+TZ\b(?!_)/);
    const importam = arquivos.filter((c) =>
      /import\s*\{[^}]*\bTZ\b(?!_)[^}]*\}\s*from\s*'[^']*timezone(\.js)?'/.test(readFileSync(c, 'utf8'))
    );
    expect(importam).toEqual([]);
  });

  it('o fuso padrão só vale onde não há barbearia — lista fechada', () => {
    // `TZ_PADRAO` é Fortaleza. Usado onde há uma barbearia, é o defeito antigo de
    // volta, com outro nome: certo em Mossoró, uma hora errado em Manaus.
    const PERMITIDOS: Record<string, string> = {
      'src/lib/tenant.ts': 'a barbearia única, sem requisição (`TENANT_UNICO`) — o mesmo padrão da coluna',
      'src/db/schema.ts': 'o padrão da coluna `tenants.timezone`, o mesmo da migration 0013',
      'src/pages/operador.astro':
        'o relógio do operador, que não é de barbearia nenhuma; as datas de cada barbearia, na lista, saem no fuso dela',
    };
    const usam = arquivos.filter((c) => /\bTZ_PADRAO\b/.test(soCodigo(readFileSync(c, 'utf8'))));
    expect(usam).toEqual(Object.keys(PERMITIDOS).sort());
  });

  it('ninguém tira o fuso do ambiente nem do relógio de quem roda', () => {
    // `process.env.TZ` é o fuso do container (UTC, no Docker); `resolvedOptions()`
    // é o do servidor — ou, no navegador, o do celular de quem abre o site. Nenhum
    // dos dois é o da barbearia. `TZ_BARBEARIA` não é mais lida (o boot avisa,
    // `scripts/startup.mjs`).
    const PROIBIDOS = /TZ_BARBEARIA|process\.env\.TZ\b|import\.meta\.env\.TZ\b|resolvedOptions\(\)\.timeZone/;
    const achados = [...arquivos, FONTE_UNICA].filter((c) => PROIBIDOS.test(soCodigo(readFileSync(c, 'utf8'))));
    expect(achados).toEqual([]);
  });

  it('quem formata no fuso pega o da barbearia em `fusoDe` — ou o recebe de quem pegou', () => {
    // Se um arquivo usa `timeZone:`, `AT TIME ZONE` ou `formatInTimeZone`, o fuso
    // tem de ter vindo de algum lugar. O lugar é `fusoDe(barbearia)`, de
    // `lib/timezone`. A outra saída é receber o fuso como argumento — e cada
    // arquivo que faz isso está na lista, com quem passa.
    //
    // ⚠️ Até 25/09/2026 aceitava também `define:vars={{ TZ }}` — e foi esse o
    // caminho que quebrou a agenda do dia: `define:vars` deixa o script inline,
    // sem `import` e sem TypeScript. O fuso chega ao navegador pelos dados da
    // página (`clientData.tz`, `data-tz`). Ver `tests/scripts-inline.test.ts`.
    const RECEBEM_O_FUSO: Record<string, string> = {
      'src/lib/occupancy.ts': '`computeOccupancy({ tz })`: relatórios e a agenda do dia passam `fusoDe(barbearia)`',
      'src/lib/exportacao.ts': 'as duas rotas de `api/admin/exportar/` passam `fusoDe(tenant)`',
    };
    const semImportar = arquivos.filter((c) => {
      const s = readFileSync(c, 'utf8');
      // `AT TIME ZONE 'UTC'` não conta: UTC é a zona de ARMAZENAMENTO, igual em
      // qualquer barbearia. O que precisa de origem é o fuso LOCAL.
      const semUtc = s.replace(/AT TIME ZONE 'UTC'/g, '');
      const usaFuso = /timeZone:|AT TIME ZONE|formatInTimeZone|fromZonedTime|toZonedTime/.test(semUtc);
      // Aceita o import de qualquer profundidade (`./timezone.js` dentro de lib/).
      return usaFuso && !/from '[^']*timezone(\.js)?'/.test(s);
    });
    expect(semImportar).toEqual(Object.keys(RECEBEM_O_FUSO).sort());
  });

  it('no navegador, toda data e hora mostrada leva o fuso da barbearia', () => {
    // Sem `timeZone`, `toLocaleDateString` e o `Intl` usam o fuso de quem abre: o
    // celular do barbeiro em viagem, o cliente de outro estado. Até 12/10/2026 a
    // ficha do cliente, na agenda do dia, mostrava a hora no fuso da barbearia e a
    // DATA no do navegador — um corte às 23:30 saía com a data do dia seguinte.
    //
    // A exceção é a hora de agora para quem está na tela: o "Salvo às" de
    // Configurações é o relógio de quem salvou, não um horário da barbearia.
    const EXCECOES = ["src/pages/admin/configuracoes.astro: new Date().toLocaleTimeString('pt-BR')"];
    const chamadas = arquivos.flatMap((c) =>
      [...soCodigo(readFileSync(c, 'utf8')).matchAll(/(new Date\(\)\.)?(toLocaleDateString|toLocaleTimeString|new Intl\.DateTimeFormat)\(([^)]*)\)/g)]
        .map((m) => ({ onde: `${c}: ${m[0].replace(/\s+/g, ' ')}`, temFuso: /timeZone:/.test(m[3]) }))
    );
    // Guarda contra o padrão parar de achar: hoje são mais de cinco.
    expect(chamadas.length).toBeGreaterThan(5);
    expect(chamadas.filter((c) => !c.temFuso).map((c) => c.onde)).toEqual(EXCECOES);
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
