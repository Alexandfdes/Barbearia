// A semana do painel começa na segunda-feira DA BARBEARIA (`PENDENCIAS-ABERTAS.md`
// §2.22).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// `admin/index.astro` achava a segunda-feira com `getDay()` e `setDate()` sobre o
// instante — contas no fuso do PROCESSO — e formatava o resultado no fuso da
// barbearia. Com o servidor em UTC, das 21h à meia-noite de Fortaleza o card
// "Esta semana" e o gráfico erravam de semana. Visto ao vivo em 25/09/2026, às
// 21h29 de Fortaleza: o gráfico mostrou "SEG 20", e 20/09/2026 foi domingo.
//
// Agora a segunda sai de `todayStr` — a data na barbearia — por conta de
// calendário (`lib/calendario.ts`), em que o relógio do processo não entra.
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatInTimeZone } from 'date-fns-tz';
import { diaDaSemana, segundaFeiraDaSemana, somarDias } from '../src/lib/calendario';
import { TZ_PADRAO } from '../src/lib/timezone';

describe('as contas de calendário', () => {
  it('o dia da semana, 0 = domingo', () => {
    expect(diaDaSemana('2026-09-20')).toBe(0); // domingo
    expect(diaDaSemana('2026-09-21')).toBe(1); // segunda
    expect(diaDaSemana('2026-09-26')).toBe(6); // sábado
  });

  it('somar dias atravessa mês e ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2028-03-01', -1)).toBe('2028-02-29'); // bissexto
  });

  it('a segunda-feira de cada dia da semana', () => {
    for (const dia of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
      expect(segundaFeiraDaSemana(dia), dia).toBe('2026-09-21');
    }
    // Domingo é o ÚLTIMO dia da semana: a segunda dele é a de seis dias antes.
    expect(segundaFeiraDaSemana('2026-09-27')).toBe('2026-09-21');
    expect(segundaFeiraDaSemana('2026-09-20')).toBe('2026-09-14');
  });

  it('a semana que atravessa o ano', () => {
    expect(segundaFeiraDaSemana('2027-01-01')).toBe('2026-12-28');
  });
});

describe('o caso visto ao vivo em 25/09/2026', () => {
  // 21h29 de sexta, 25/09, em Fortaleza — já é 00h29 de sábado, 26/09, em UTC.
  const AGORA = new Date('2026-09-26T00:29:00Z');

  it('a conta antiga, no fuso do processo em UTC, dava o domingo 20/09', () => {
    // O que `getMondayOf` fazia, com o relógio do processo em UTC: o dia da
    // semana do INSTANTE em UTC (sábado), cinco dias para trás, e o resultado
    // formatado em Fortaleza — 21h29 do domingo.
    const d = new Date(AGORA);
    const dia = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (dia === 0 ? -6 : 1 - dia));
    expect(formatInTimeZone(d, TZ_PADRAO, 'yyyy-MM-dd')).toBe('2026-09-20');
  });

  it('a conta nova dá a segunda 21/09', () => {
    const hoje = formatInTimeZone(AGORA, TZ_PADRAO, 'yyyy-MM-dd');
    expect(hoje).toBe('2026-09-25');
    expect(segundaFeiraDaSemana(hoje)).toBe('2026-09-21');
  });
});

describe('o painel usa a conta nova', () => {
  const PAGINA = readFileSync('src/pages/admin/index.astro', 'utf8');
  const FRONTMATTER = PAGINA.split('---')[1];
  const semComentarios = FRONTMATTER.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  it('a segunda-feira sai de todayStr, o dia na barbearia', () => {
    expect(FRONTMATTER).toMatch(/const mondayStr\s*=\s*segundaFeiraDaSemana\(todayStr\)/);
  });

  it('nenhuma conta de dia no relógio do processo', () => {
    expect(semComentarios).not.toMatch(/\.getDay\(\)|\.setDate\(|\.getDate\(\)/);
  });
});
