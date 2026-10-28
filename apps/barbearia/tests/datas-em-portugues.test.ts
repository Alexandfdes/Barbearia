// Data com nome de mês ou de dia da semana sai em português: `date-fns` com `locale: ptBR`.
//
// POR QUE ESTE TESTE EXISTE
//
// Em 15/10/2026, conferindo a área do cliente no navegador, os cartões diziam "20 de Oct · Tue",
// e o Início do painel, "15 de Oct": o `date-fns` escreve em inglês quando ninguém passa o
// `locale` (`docs/PENDENCIAS-ABERTAS.md` §2.44). Não precisa de banco.
//
// O recorte é a linha da chamada: todas as deste projeto cabem numa. Uma chamada quebrada em
// várias linhas escaparia — o caso de controle no fim mostra o que o padrão pega.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

/** Os padrões do date-fns que escrevem um nome: o mês (MMM, LLL) e o dia da semana (EEE, eee, ccc). */
const ESCREVE_NOME = /MMM|LLL|EEE|eee|ccc/;
const CHAMADA = /\bformat(?:InTimeZone)?\(/;

/** As strings da linha — entre aspas duplas, simples ou crases. */
function textosDaLinha(linha: string): string[] {
  return [...linha.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

/** As chamadas que escrevem nome sem o português. */
function semPortugues(fonte: string): string[] {
  return fonte.split('\n')
    .filter((linha) => CHAMADA.test(linha) && textosDaLinha(linha).some((t) => ESCREVE_NOME.test(t)))
    .filter((linha) => !/locale:\s*ptBR\b/.test(linha))
    .map((linha) => linha.trim());
}

const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')].map((c) => c.split(sep).join('/')).sort();

describe('datas em português', () => {
  it('toda data que escreve o nome do mês ou do dia da semana passa o locale ptBR', () => {
    const achadas = arquivos.flatMap((c) => semPortugues(readFileSync(c, 'utf8')).map((l) => `${c}: ${l}`));
    expect(achadas).toEqual([]);
  });

  it('o recorte acha as chamadas que escrevem nome (guarda contra passar sem olhar nada)', () => {
    const comNome = arquivos.flatMap((c) => readFileSync(c, 'utf8').split('\n')
      .filter((l) => CHAMADA.test(l) && textosDaLinha(l).some((t) => ESCREVE_NOME.test(t)))
      .map(() => c));
    for (const esperado of ['src/pages/cliente/index.astro', 'src/pages/admin/index.astro', 'src/pages/a/[token].astro']) {
      expect(comNome, esperado).toContain(esperado);
    }
  });

  it('controle: o padrão pega as duas que saíam em inglês até 15/10/2026', () => {
    expect(semPortugues(`  dateLabel:       formatInTimeZone(new Date(r.starts_at), fuso, "dd 'de' MMM '·' EEE"),`)).toHaveLength(1);
    expect(semPortugues(`const fmtDate  = (iso: string) => formatInTimeZone(new Date(iso), fuso, "dd 'de' MMM");`)).toHaveLength(1);
    // e deixa passar o que não escreve nome
    expect(semPortugues(`formatInTimeZone(new Date(a.startsAt), fuso, 'HH:mm')`)).toEqual([]);
    expect(semPortugues(`formatInTimeZone(d, fuso, "dd/MM 'às' HH:mm")`)).toEqual([]);
  });
});
