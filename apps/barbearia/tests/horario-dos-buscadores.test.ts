// O horário que o site diz aos buscadores — o JSON-LD do `layouts/Layout.astro` — sai do
// horário de vitrine, o que o próprio site mostra (`src/lib/horarioDosBuscadores.ts`).
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026 o JSON-LD dava a toda barbearia o mesmo horário — segunda a sexta das 9h às
// 20h, sábado das 9h às 18h — e a faixa de preço "$$". Até a barbearia com o horário padrão
// do cadastro, que mostra "09:00 — 19:00" no próprio site, dizia ao Google que fechava às 20h
// (`docs/PENDENCIAS-ABERTAS.md` §2.41). Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { especificacaoDoHorario, diasDoRotulo, horasDaLinha } from '../src/lib/horarioDosBuscadores.js';
import { horarioDeVitrine, type HorarioDoCadastro } from '../src/lib/provisionarBarbearia.js';
import { parseBusinessHours, type BusinessHour } from '../src/lib/settings.js';

const linha = (label: string, hours: string, closed = false): BusinessHour => ({ label, hours, closed });
const SEMANA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

describe('o que o cadastro escreve, o buscador lê igual', () => {
  it('o horário padrão do cadastro: segunda a sexta até as 19h, sábado até as 18h, domingo fechado', () => {
    const padrao: HorarioDoCadastro[] = [
      { weekday: 0, fechado: true },
      ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, abre: '09:00', fecha: '19:00' })),
      { weekday: 6, abre: '09:00', fecha: '18:00' },
    ];
    expect(especificacaoDoHorario(parseBusinessHours(horarioDeVitrine(padrao)))).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: SEMANA.slice(0, 5), opens: '09:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:00', closes: '18:00' },
    ]);
  });

  it('a barbearia que fecha na segunda e abre no domingo de manhã', () => {
    const semana: HorarioDoCadastro[] = [
      { weekday: 1, fechado: true },
      ...[2, 3, 4, 5, 6].map((weekday) => ({ weekday, abre: '10:00', fecha: '20:00' })),
      { weekday: 0, abre: '09:00', fecha: '13:00' },
    ];
    expect(especificacaoDoHorario(parseBusinessHours(horarioDeVitrine(semana)))).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: SEMANA.slice(1, 6), opens: '10:00', closes: '20:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday'], opens: '09:00', closes: '13:00' },
    ]);
  });

  it('quinhentas semanas sorteadas: o buscador lê cada dia aberto com o horário dele, e nenhum fechado', () => {
    let semente = 42;
    const sorteio = (n: number) => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente % n; };
    const hora = (q: number) => `${String(Math.floor(q / 4)).padStart(2, '0')}:${String((q % 4) * 15).padStart(2, '0')}`;
    for (let k = 0; k < 500; k++) {
      const semana: HorarioDoCadastro[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
        if (sorteio(4) === 0) return { weekday, fechado: true };
        // poucos horários diferentes, para os dias se agruparem como no mundo de verdade
        const abre = [28, 32, 36][sorteio(3)];
        const fecha = abre + [16, 36, 44][sorteio(3)];
        return { weekday, abre: hora(abre), fecha: hora(fecha) };
      });
      const lido = especificacaoDoHorario(parseBusinessHours(horarioDeVitrine(semana))) ?? [];
      const porDia = new Map(lido.flatMap((e) => e.dayOfWeek.map((d) => [d, `${e.opens}-${e.closes}`] as const)));
      const ingles = ['Sunday', ...SEMANA];
      for (const h of semana) {
        expect(porDia.get(ingles[h.weekday]), JSON.stringify(semana)).toBe(h.fechado ? undefined : `${h.abre}-${h.fecha}`);
      }
      expect(lido.flatMap((e) => e.dayOfWeek)).toHaveLength(semana.filter((h) => !h.fechado).length);
    }
  });
});

describe('o que o dono reescreve em Configurações', () => {
  it('lê o jeito comum de escrever: "a", "às", hífen, "-feira", sem acento', () => {
    expect(especificacaoDoHorario([
      linha('segunda a sexta', '9h às 19h'),
      linha('Sabado', '9h30 - 18h'),
      linha('Domingo', 'Fechado'),
    ])).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: SEMANA.slice(0, 5), opens: '09:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'], opens: '09:30', closes: '18:00' },
    ]);
    expect(diasDoRotulo('Terça-feira — Sábado')).toEqual([2, 3, 4, 5, 6]);
    expect(diasDoRotulo('Terça — Domingo')).toEqual([2, 3, 4, 5, 6, 0]);
    expect(diasDoRotulo('QUARTA')).toEqual([3]);
    expect(diasDoRotulo('Sexta — Segunda')).toBeNull();
  });

  it('o expediente partido, em duas linhas do mesmo dia', () => {
    expect(especificacaoDoHorario([
      linha('Segunda — Sexta', '09:00 — 12:00'),
      linha('Segunda — Sexta', '14:00 — 19:00'),
    ])).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: SEMANA.slice(0, 5), opens: '09:00', closes: '12:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: SEMANA.slice(0, 5), opens: '14:00', closes: '19:00' },
    ]);
  });

  it('na dúvida, nenhum horário — e uma linha duvidosa derruba todas', () => {
    const certas = [linha('Segunda — Sexta', '09:00 — 19:00'), linha('Sábado', '09:00 — 18:00')];
    expect(especificacaoDoHorario(certas)).not.toBeNull();
    for (const duvidosa of [
      linha('Seg a Sex', '09:00 — 19:00'),                 // dia abreviado
      linha('Feriados', '09:00 — 13:00'),                  // não é dia da semana
      linha('Domingo', '09:00 — 12:00 / 14:00 — 18:00'),  // dois horários numa linha
      linha('Domingo', '18:00 — 09:00'),                   // fecha antes de abrir
      linha('Domingo', 'das 9 às 13'),                     // hora sem "h" nem ":"
      linha('Sexta — Segunda', '09:00 — 19:00'),           // a semana começa na segunda
      linha('Sábado', '10:00 — 14:00'),                    // cruza com o sábado das certas
      linha('Sábado', 'Fechado'),                          // fechado e aberto no mesmo dia
      linha('Domingo', '09:00 — 12:00', true),             // "fechado" marcado, com horário escrito
      linha('Domingo', '25:00 — 26:00'),                   // hora que não existe
    ]) {
      expect(especificacaoDoHorario([...certas, duvidosa]), JSON.stringify(duvidosa)).toBeNull();
    }
    // E cada uma sozinha, para nenhuma passar só porque cruza com as certas.
    for (const sozinha of [
      linha('Seg a Sex', '09:00 — 19:00'), linha('Domingo', '18:00 — 09:00'),
      linha('Sexta — Segunda', '09:00 — 19:00'), linha('Domingo', '09:00 — 12:00', true),
    ]) {
      expect(especificacaoDoHorario([sozinha]), JSON.stringify(sozinha)).toBeNull();
    }
  });

  it('sem horário de vitrine, ou só com dias fechados: nenhum horário', () => {
    expect(especificacaoDoHorario([])).toBeNull();
    expect(especificacaoDoHorario([linha('Segunda — Domingo', 'Fechado', true)])).toBeNull();
    expect(horasDaLinha('', true)).toBe('fechado');
    expect(horasDaLinha('Fechado', false)).toBe('fechado');
  });
});

describe('o JSON-LD do site', () => {
  const layout = readFileSync('src/layouts/Layout.astro', 'utf8');
  const bloco = layout.slice(layout.indexOf('<script type="application/ld+json"'), layout.indexOf('<style set:html'));

  it('o horário vem do horário de vitrine da barbearia, e nada dele está escrito à mão', () => {
    expect(bloco.length).toBeGreaterThan(200);
    expect(layout).toMatch(/especificacaoDoHorario\(s\.businessHours\)/);
    expect(bloco).toMatch(/"openingHoursSpecification":\s*horarioParaBuscadores \?\? undefined/);
    expect(bloco).not.toMatch(/"opens"|"closes"|"dayOfWeek"|"priceRange"/);
  });

  it('controle: a regra pega o bloco que ia fixo até 13/10/2026', () => {
    const antigo = '"priceRange": "$$", "openingHoursSpecification": [{ "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday"], "opens": "09:00", "closes": "20:00" }]';
    expect(antigo).toMatch(/"opens"|"closes"|"dayOfWeek"|"priceRange"/);
  });
});
