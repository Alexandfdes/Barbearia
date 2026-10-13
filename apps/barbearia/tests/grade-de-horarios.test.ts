// A grade de "Mover horário" e a faixa do topo da agenda saem do expediente real.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// A grade era fixa, de 08:00 às 19:00, para qualquer barbearia. Na que abre às
// 09:00, o dono escolhia 08:00, confirmava, e o servidor respondia "Horário fora
// do expediente do barbeiro" — visto ao vivo em 27/09/2026. A que fecha às 21:00
// não conseguia mover para depois das 19:00. E a grade convertia hora local em
// instante somando 3 horas à mão (`PENDENCIAS-ABERTAS.md` §2.11).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diaDaSemana, faixaDoDia, horariosLivres, horariosParaMover, horasDoGrafico, ocupacaoDoBarbeiro } from '../src/lib/gradeDeHorarios.js';

describe('horariosParaMover()', () => {
  const nove = [{ inicio: '09:00', fim: '19:00' }];

  it('começa na abertura da barbearia, não às 08:00', () => {
    const h = horariosParaMover(nove, 60);
    expect(h[0]).toBe('09:00');
    expect(h).not.toContain('08:00');
    expect(h).not.toContain('08:45');
  });

  it('o atendimento inteiro cabe: 60 minutos terminam no máximo no fechamento', () => {
    const h = horariosParaMover(nove, 60);
    expect(h.at(-1)).toBe('18:00');
    expect(h).not.toContain('18:15');
  });

  it('barbearia que fecha às 21:00 consegue mover para a noite', () => {
    expect(horariosParaMover([{ inicio: '09:00', fim: '21:00' }], 30)).toContain('20:30');
  });

  it('turno partido: manhã e tarde, sem o almoço', () => {
    const h = horariosParaMover([{ inicio: '08:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }], 60);
    expect(h).toContain('11:00');
    expect(h).not.toContain('11:15');   // terminaria 12:15, dentro do almoço
    expect(h).not.toContain('12:00');
    expect(h).toContain('14:00');
  });

  it('de 15 em 15 minutos', () => {
    expect(horariosParaMover(nove, 30).slice(0, 3)).toEqual(['09:00', '09:15', '09:30']);
  });

  it('dia sem expediente não oferece horário nenhum', () => {
    expect(horariosParaMover([], 30)).toEqual([]);
  });
});

// ── Só os horários livres — 12/10/2026 ──────────────────────────────────────
//
// A grade oferecia o horário de outro cliente: o dono escolhia, confirmava, e só
// então o servidor recusava ("Horário não está mais disponível").
describe('horariosLivres() e ocupacaoDoBarbeiro()', () => {
  // 15/03/2030 em Fortaleza (UTC−3): 09:00 local = 12:00Z.
  const grade = (...horas: string[]) => horas.map((rotulo) => {
    const [h, m] = rotulo.split(':').map(Number);
    return { rotulo, inicio: new Date(Date.UTC(2030, 2, 15, h + 3, m)).toISOString() };
  });
  const z = (h: number, m = 0) => new Date(Date.UTC(2030, 2, 15, h + 3, m)).toISOString();
  const rotulos = (xs: { rotulo: string }[]) => xs.map((x) => x.rotulo);

  it('tira o horário que cruza outro atendimento — e o que termina depois de ele começar', () => {
    const ocupados = [{ startsAt: z(10), endsAt: z(10, 30) }];
    // 30 minutos: 09:45 termina 10:15, cruza; 09:30 termina 10:00, encosta — livre.
    expect(rotulos(horariosLivres(grade('09:30', '09:45', '10:00', '10:15', '10:30'), 30, ocupados)))
      .toEqual(['09:30', '10:30']);
  });

  it('atendimento longo: 60 minutos às 09:15 batem no das 10:00', () => {
    const ocupados = [{ startsAt: z(10), endsAt: z(10, 30) }];
    expect(rotulos(horariosLivres(grade('09:00', '09:15'), 60, ocupados))).toEqual(['09:00']);
  });

  it('sem nada ocupado, a grade inteira', () => {
    expect(rotulos(horariosLivres(grade('09:00', '09:15'), 30, []))).toEqual(['09:00', '09:15']);
  });

  it('ocupa: os outros confirmados e concluídos do barbeiro, e os bloqueios dele e da casa', () => {
    const atendimentos = [
      { id: 1, barberId: 7, status: 'confirmed', startsAt: z(9), endsAt: z(9, 30) },  // o que está sendo movido
      { id: 2, barberId: 7, status: 'confirmed', startsAt: z(10), endsAt: z(10, 30) },
      { id: 3, barberId: 7, status: 'completed', startsAt: z(11), endsAt: z(11, 30) },
      { id: 4, barberId: 7, status: 'cancelled', startsAt: z(12), endsAt: z(12, 30) },
      { id: 5, barberId: 7, status: 'no_show', startsAt: z(13), endsAt: z(13, 30) },
      { id: 6, barberId: 8, status: 'confirmed', startsAt: z(14), endsAt: z(14, 30) }, // outro barbeiro
    ];
    const bloqueios = [
      { barberId: 7, startsAt: z(15), endsAt: z(16) },
      { barberId: null, startsAt: z(16), endsAt: z(17) },  // a casa toda
      { barberId: 8, startsAt: z(17), endsAt: z(18) },     // outro barbeiro
    ];
    expect(ocupacaoDoBarbeiro(7, 1, atendimentos, bloqueios)).toEqual([
      { startsAt: z(10), endsAt: z(10, 30) },
      { startsAt: z(11), endsAt: z(11, 30) },
      { startsAt: z(15), endsAt: z(16) },
      { startsAt: z(16), endsAt: z(17) },
    ]);
  });

  it('o id e o barbeiro chegam como número ou texto — tanto faz', () => {
    const atendimentos = [{ id: 1, barberId: 7, status: 'confirmed', startsAt: z(9), endsAt: z(9, 30) }];
    expect(ocupacaoDoBarbeiro('7' as unknown as number, '1' as unknown as number, atendimentos, [])).toEqual([]);
  });

  it('mover 15 minutos, por cima do próprio horário: livre', () => {
    const atendimentos = [{ id: 1, barberId: 7, status: 'confirmed', startsAt: z(9), endsAt: z(9, 30) }];
    const ocupados = ocupacaoDoBarbeiro(7, 1, atendimentos, []);
    expect(rotulos(horariosLivres(grade('09:00', '09:15'), 30, ocupados))).toEqual(['09:00', '09:15']);
  });
});

describe('faixaDoDia() e diaDaSemana()', () => {
  it('do primeiro início ao último fim', () => {
    expect(faixaDoDia([{ inicio: '14:00', fim: '18:00' }, { inicio: '08:00', fim: '12:00' }]))
      .toEqual({ inicio: '08:00', fim: '18:00' });
  });

  it('sem janela, sem faixa', () => expect(faixaDoDia([])).toBeNull());

  it('dia da semana por calendário: 28/09/2026 é segunda, 27/09/2026 é domingo', () => {
    expect(diaDaSemana('2026-09-28')).toBe(1);
    expect(diaDaSemana('2026-09-27')).toBe(0);
  });
});

describe('a agenda do dia usa o expediente real', () => {
  const agenda = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');

  it('a grade de mover vem do expediente do barbeiro', () => {
    expect(agenda).toMatch(/horariosParaMover\(janelas, appt\.durationMinutes\)/);
    expect(agenda).not.toMatch(/clientData\.startHour \+ 11/);
  });

  it('e mostra só os livres, com a agenda do dia ESCOLHIDO — não a da tela', () => {
    expect(agenda).toMatch(/callApi\(`\/api\/admin\/appointments\?date=\$\{targetDate\}&barberId=\$\{appt\.barberId\}`, 'GET'\)/);
    expect(agenda).toMatch(/callApi\('\/api\/admin\/time-off', 'GET'\)/);
    expect(agenda).toMatch(/ocupacaoDoBarbeiro\(appt\.barberId, appt\.id, agenda\.data, bloqueios\.data\)/);
    expect(agenda).toMatch(/for \(const \{ rotulo: label, inicio: utc \} of livres\)/);
  });

  it('a faixa do topo e o "dia livre" não são mais 08:00 → 19:00 fixo', () => {
    expect(agenda).not.toMatch(/String\(START_HOUR\)\.padStart\(2, '0'\)\}:00 → \{String\(END_HOUR\)/);
    expect(agenda).toMatch(/faixaDoExpediente\.inicio/);
  });

  it('bloqueio fora de 08:00 → 19:00 continua na lista do dia', () => {
    // Até 27/09/2026 a lista descartava o bloqueio sem altura na linha do tempo
    // fixa — o das 19:30 às 20:30 sumia da agenda. Visto rodando, não deduzido.
    expect(agenda).not.toMatch(/\}\)\.filter\(b => b\.durationMin > 0\)/);
    expect(agenda).toMatch(/timeOffRows\s*\.filter\(b => new Date\(b\.endsAt\) > new Date\(dayStart\)\)/);
  });

  it('a linha do tempo de 08:00 às 19:00 saiu inteira — a janela fixa e o que só ela usava', () => {
    // Até 13/10/2026 a janela fixa continuava no topo da página, alimentando a posição de
    // cada atendimento, a linha do "agora", as linhas de hora e o clique num espaço vazio,
    // com o menu que ele abria — tudo de uma linha do tempo que saiu da tela antes de
    // 06/09. Sem ninguém usando, bastava alguém reaproveitar para o 08:00 → 19:00 voltar.
    const restos = [
      /\bSTART_HOUR\b/, /\bEND_HOUR\b/, /\bTOTAL_HOURS\b/, /timelinePos/, /nowTopMin/, /hourLines/,
      /--hour-px/, /timeline-root/, /empty-click-area/, /express-modal/, /__preferredSlotTime/,
    ];
    for (const resto of restos) expect(agenda, String(resto)).not.toMatch(resto);
    expect(readFileSync('src/lib/agendaDoDia.ts', 'utf8')).not.toMatch(/\b(startHour|totalHours)\b/);
  });

  it('nenhuma conversão de hora soma ou subtrai 3 horas à mão', () => {
    expect(agenda).not.toMatch(/h \+ 3/);
    expect(agenda).not.toMatch(/h - 3 \+ 24/);
    expect(agenda).toMatch(/fromZonedTime\(`\$\{dateStr\}T\$\{timeStr\}:00`, TZ\)/);
  });
});

describe('horasDoGrafico() — o movimento por horário do relatório', () => {
  const vinte4 = (marcas: Record<number, number> = {}) => Array.from({ length: 24 }, (_, h) => marcas[h] ?? 0);
  const expediente = (inicio: string, fim: string) => ({ startTime: inicio, endTime: fim });

  it('do começo do primeiro expediente ao fim do último', () => {
    expect(horasDoGrafico([expediente('07:00', '12:00'), expediente('14:00', '21:00')], vinte4())).toEqual({ inicio: 7, fim: 20 });
  });

  it('fechar às 19:30 inclui a hora das 19', () => {
    expect(horasDoGrafico([expediente('09:00', '19:30')], vinte4())).toEqual({ inicio: 9, fim: 19 });
  });

  it('atendimento fora do expediente aparece, em vez de sumir', () => {
    // Era o defeito: 09 a 19 fixo, e o encaixe das 08:00 e o das 20:00 não contavam.
    expect(horasDoGrafico([expediente('09:00', '19:00')], vinte4({ 8: 1, 20: 2 }))).toEqual({ inicio: 8, fim: 20 });
  });

  it('sem expediente, só as horas com atendimento', () => {
    expect(horasDoGrafico([], vinte4({ 10: 1, 15: 3 }))).toEqual({ inicio: 10, fim: 15 });
  });

  it('sem expediente e sem atendimento, nada', () => {
    expect(horasDoGrafico([], vinte4())).toBeNull();
  });
});

describe('o relatório não crava 09 → 19', () => {
  const relatorio = readFileSync('src/pages/admin/relatorios.astro', 'utf8');
  it('as constantes saíram e o recorte vem de horasDoGrafico', () => {
    expect(relatorio).not.toMatch(/const START_HOUR = \d+/);
    expect(relatorio).not.toMatch(/const END_HOUR = \d+/);
    expect(relatorio).toMatch(/horasDoGrafico\(whRows, cur\.porHora\)/);
  });
  it('conta as 24 horas, sem filtro', () => {
    expect(relatorio).toMatch(/new Array\(24\)\.fill\(0\)/);
  });
});
