// O rodapé do site acende a linha do horário de hoje — pelos DIAS da linha (17/10/2026).
//
// Até aqui ele procurava "Segunda", "Sábado" ou "Domingo" no rótulo. Mas o cadastro
// agrupa os dias seguidos com o mesmo horário (`horarioDeVitrine`): com segunda a sábado
// iguais, a linha é "Segunda — Sábado", e no sábado nada acendia; com sábado e domingo
// fechados, "Sábado — Domingo", e no domingo nada acendia (`docs/PENDENCIAS-ABERTAS.md`
// §2.47). Agora o rodapé lê os dias da linha como o JSON-LD os lê (`diasDoRotulo`).
//
// O contrato que importa é entre os dois arquivos: TODO rótulo que o cadastro escreve
// tem de ser lido de volta como os dias que ele cobre. Se um dia o cadastro mudar o
// formato, o rodapé e o horário do Google param juntos — e este teste fica vermelho.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { horarioDeVitrine } from '../src/lib/provisionarBarbearia.js';
import { diasDoRotulo } from '../src/lib/horarioDosBuscadores.js';

type Dia = { weekday: number; abre: string; fecha: string; fechado: boolean };
const SEMANA_DO_COMERCIO = [1, 2, 3, 4, 5, 6, 0];

/** Os dias que cada linha da vitrine cobre, refeitos a partir da semana preenchida. */
function diasEsperados(semana: Dia[]): number[][] {
  const texto = (d: number) => {
    const h = semana.find((x) => x.weekday === d)!;
    return h.fechado ? 'Fechado' : `${h.abre} — ${h.fecha}`;
  };
  const blocos: number[][] = [];
  for (const d of SEMANA_DO_COMERCIO) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && texto(ultimo[ultimo.length - 1]) === texto(d)) ultimo.push(d);
    else blocos.push([d]);
  }
  return blocos;
}

describe('o rótulo que o cadastro escreve, o rodapé lê', () => {
  it('nas 128 combinações de dia aberto e fechado, cada linha volta com os dias que cobre', () => {
    for (let mascara = 0; mascara < 128; mascara++) {
      const semana: Dia[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        weekday: d, abre: '09:00', fecha: '19:00', fechado: (mascara & (1 << d)) === 0,
      }));
      const linhas = JSON.parse(horarioDeVitrine(semana)) as { label: string }[];
      const lidos = linhas.map((l) => diasDoRotulo(l.label));
      expect(lidos, `máscara ${mascara}: ${linhas.map((l) => l.label).join(' | ')}`).toEqual(diasEsperados(semana));
    }
  });

  it('com horários diferentes no meio da semana, também', () => {
    const semana: Dia[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      weekday: d, abre: d === 6 ? '08:00' : '09:00', fecha: d === 3 ? '21:00' : '19:00', fechado: d === 0,
    }));
    const linhas = JSON.parse(horarioDeVitrine(semana)) as { label: string }[];
    expect(linhas.map((l) => l.label)).toEqual(['Segunda — Terça', 'Quarta', 'Quinta — Sexta', 'Sábado', 'Domingo']);
    expect(linhas.map((l) => diasDoRotulo(l.label))).toEqual(diasEsperados(semana));
  });

  it('os dois casos que não acendiam', () => {
    expect(diasDoRotulo('Segunda — Sábado')).toContain(6);
    expect(diasDoRotulo('Sábado — Domingo')).toContain(0);
  });
});

describe('o rodapé, lido', () => {
  const rodape = readFileSync('src/components/Footer.astro', 'utf8');

  it('marca cada linha com os dias dela, e acende pela lista — não pelo texto do rótulo', () => {
    expect(rodape).toMatch(/const dias = diasDoRotulo\(h\.label\);/);
    expect(rodape).toMatch(/data-dias=\{dias \? dias\.join\(' '\) : undefined\}/);
    expect(rodape).toMatch(/\(row\.dataset\.dias \?\? ''\)\.split\(' '\)\.includes\(hoje\)/);
    expect(rodape).not.toMatch(/label\.includes\(/);
    expect(rodape).not.toMatch(/data-day-group/);
  });

  it('o dia de hoje é o da barbearia: o fuso desce no data-tz', () => {
    expect(rodape).toMatch(/data-tz=\{fuso\}/);
    expect(rodape).toMatch(/timeZone: fuso, weekday: 'short'/);
  });
});
