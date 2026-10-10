// A data do agendamento vem do fuso da barbearia — nunca de UTC.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// `bookAppointment` lia o dia assim:
//
//     const dateStr = startsAt.toISOString().slice(0, 10);   // UTC
//
// `startsAt` é um INSTANTE. Em UTC, 21:00 de Fortaleza já é 00:00 do dia
// seguinte — então o código buscava o expediente do dia errado, montava a janela
// no dia errado, e recusava com "Horário fora do expediente" um horário que o
// `/api/slots` tinha acabado de oferecer (porque o slots faz a conversão certa).
// Em Manaus isso começa às 20:00; no Acre, às 19:00.
//
// ── POR QUE UMA LISTA, E NÃO UMA REGRA ───────────────────────────────────────
//
// `toISOString().slice(0, 10)` nem sempre está errado. Aplicado a um instante,
// está. Aplicado a um `Date.UTC(y, m, d, 12)` — meio-dia UTC, que é o mesmo dia
// do calendário em qualquer fuso entre -11 e +12 — é só aritmética de calendário
// sobre uma data que já era local, e está certo.
//
// Nenhuma expressão regular distingue as duas: a diferença está no que a
// variável É, não em como ela se escreve. Então a lista abaixo guarda os casos
// conferidos um por um. Ocorrência nova em arquivo que não está aqui, ou a mais
// num que está, derruba o teste — e alguém tem que olhar e decidir.
//
// ⚠️ ESTE TESTE NÃO PEGA A OUTRA CLASSE DE DEFEITO DE FUSO: a aritmética de
// offset cravada no navegador (`Date.UTC(y, mo - 1, d, h + 3, min)`), que existe
// em `admin/bloqueios.astro` e em dois pontos de `admin/dia/[date].astro`. Está
// registrada em `PENDENCIAS-ABERTAS.md` e na skill `barbearia-fuso`, e sai na
// onda "antes do primeiro cliente fora do UTC-3". Não é esquecimento.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * Arquivo → quantas ocorrências conferidas e aprovadas ele tem.
 *
 * As três são a mesma ideia repetida: recebem uma data 'YYYY-MM-DD' que já é
 * local, montam o meio-dia UTC dela — `Date.UTC(y, m - 1, d + n, 12)`, ou
 * `${dia}T12:00:00Z` em `lib/situacao.ts` — para somar dias sem esbarrar em
 * horário de verão, e leem de volta. Nunca tocam num instante.
 */
const PERMITIDOS = new Map<string, number>([
  ['src/pages/admin/index.astro', 1],      // addDaysStr() — navegação de semana
  ['src/pages/admin/dia/[date].astro', 1], // offsetDate() — navegação de dia
  ['src/lib/situacao.ts', 1],              // somarDias() — o fim do teste e da carência, sobre a data local ao meio-dia
]);

const PADRAO = /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/g;

const encontrados = new Map<string, number>();
for (const caminho of [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')].sort()) {
  // globSync devolve o separador do sistema — `\` no Windows, onde o
  // desenvolvimento acontece. Sem normalizar, nenhuma chave da lista casa.
  const nome = caminho.split(sep).join('/');
  const n = (readFileSync(caminho, 'utf8').match(PADRAO) ?? []).length;
  if (n > 0) encontrados.set(nome, n);
}

describe('a data do calendário nunca é lida em UTC', () => {
  it('encontra os arquivos (guarda contra o glob quebrar em silêncio)', () => {
    const totalDeArquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')].length;
    expect(totalDeArquivos).toBeGreaterThan(50);
  });

  it('nenhuma ocorrência nova de toISOString().slice(0, 10)', () => {
    const novas = [...encontrados.entries()]
      .filter(([arquivo, n]) => (PERMITIDOS.get(arquivo) ?? 0) !== n)
      .map(([arquivo, n]) => `${arquivo}: ${n} (aprovadas: ${PERMITIDOS.get(arquivo) ?? 0})`);

    expect(
      novas,
      'confira se a data vem de um INSTANTE (errado — use formatInTimeZone) ' +
      'ou de um Date.UTC(..., 12) sobre data já local (certo — some à lista)',
    ).toEqual([]);
  });

  it('a lista não guarda arquivo que já foi limpo', () => {
    const sumiram = [...PERMITIDOS.keys()].filter((a) => !encontrados.has(a));
    expect(sumiram, 'não tem mais ocorrência — tire da lista PERMITIDOS').toEqual([]);
  });

  it('`bookAppointment` monta a data com o fuso, e não com toISOString', () => {
    const s = readFileSync('src/lib/bookAppointment.ts', 'utf8');
    expect(s).toMatch(/const dateStr\s*=\s*formatInTimeZone\(startsAt, TZ, 'yyyy-MM-dd'\)/);
  });
});

describe('a conta que o defeito fazia (sem banco, só para documentar)', () => {
  const diaLocal = (iso: string, tz: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));

  it.each([
    ['America/Fortaleza',  '2030-03-15T21:00:00-03:00'],
    ['America/Manaus',     '2030-03-15T20:00:00-04:00'],
    ['America/Rio_Branco', '2030-03-15T19:00:00-05:00'],
  ])('em %s, a última hora do dia já é o dia seguinte em UTC', (tz, iso) => {
    const emUtc   = new Date(iso).toISOString().slice(0, 10);
    const emCasa  = diaLocal(iso, tz);

    expect(emCasa).toBe('2030-03-15');
    expect(emUtc).toBe('2030-03-16');   // o dia que o código lia
    expect(emUtc).not.toBe(emCasa);
  });
});
