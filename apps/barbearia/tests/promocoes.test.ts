// Promoções em horário ocioso — a regra do desconto máximo, sem banco
// (`src/lib/promocoes.ts`, `docs/PENDENCIAS-ABERTAS.md` §2.72).
//
//     d_max = g / (x + g) × (P − v) / P
//
// A tabela é a do pedido do dono (17/11/2026), em décimos de ponto percentual: 286 é 28,6%.
// Roda igual com o processo em UTC e em Fortaleza — o horário de cada caso vem com o fuso
// escrito, nunca do relógio de quem roda.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clientesNovosValido, custoDoCampo, descontoMaximo, emDecimosDePorcento, faixaOciosa,
  limiteDoCampo, porcentoInteiroAte, textoDoPorcento,
} from '../src/lib/promocoes';
import { descontoNoHorario, precoDoCombo, promocaoDoHorario, rotuloDaFaixa } from '../src/lib/combo';
import { diaDaSemana, somarDias } from '../src/lib/calendario';
import { dataEMinutoLocal, diasDaSemanaAnteriores } from '../src/lib/promocoesDaBarbearia';

/** d_max para x inteiro, em décimos de ponto. */
const limite = (x: number, g: number, P: number, v: number) => {
  const f = descontoMaximo({ atendidos: x, semanas: 1, clientesNovos: g, precoCents: P, custoCents: v });
  return f && emDecimosDePorcento(f);
};

describe('o desconto máximo — a tabela do pedido', () => {
  it('combo só de serviço (P = R$ 100, v = 0)', () => {
    const tabela = [0, 5, 10].map((x) => [2, 4, 6].map((g) => limite(x, g, 10000, 0)));
    expect(tabela).toEqual([
      [1000, 1000, 1000], //  x = 0:  100%   100%   100%
      [286, 444, 545],    //  x = 5:  28,6%  44,4%  54,5%
      [167, 286, 375],    //  x = 10: 16,7%  28,6%  37,5%
    ]);
  });

  it('combo com produto, margem de 70% (v = R$ 30): cada valor vezes 0,7', () => {
    const tabela = [0, 5, 10].map((x) => [2, 4, 6].map((g) => limite(x, g, 10000, 3000)));
    expect(tabela).toEqual([
      [700, 700, 700],
      [200, 311, 382],
      [117, 200, 263],
    ]);
  });

  it('o exemplo do pedido: P = 10000, v = 3000, x = 10, g = 4 → 20%, e sem produto o mesmo horário daria 28,6%', () => {
    const f = descontoMaximo({ atendidos: 10, semanas: 1, clientesNovos: 4, precoCents: 10000, custoCents: 3000 })!;
    expect(emDecimosDePorcento(f)).toBe(200);
    expect(textoDoPorcento(emDecimosDePorcento(f))).toBe('20%');
    expect(limiteDoCampo(f)).toBe(20);
    expect(textoDoPorcento(limite(10, 4, 10000, 0)!)).toBe('28,6%');
  });

  it('o lucro se mantém no limite e cai acima dele — a conta de que a fórmula sai', () => {
    // Sem promoção: x·(P − v). Com o desconto d: (x + g)·(P·(1 − d) − v), em centavos.
    const [x, g, P, v] = [10, 4, 10000, 3000];
    const lucro = (pct: number) => (x + g) * (P - (P * pct) / 100 - v);
    expect(lucro(20)).toBe(x * (P - v));         // 20%: o mesmo lucro
    expect(lucro(21)).toBeLessThan(x * (P - v));  // um ponto a mais: prejuízo
  });
});

describe('o desconto máximo — sem float, com a média fracionária', () => {
  it('x é uma média: 10 atendidos em 4 semanas é x = 2,5', () => {
    const f = descontoMaximo({ atendidos: 10, semanas: 4, clientesNovos: 4, precoCents: 10000, custoCents: 0 })!;
    // 4 / (2,5 + 4) = 0,61538…
    expect(f).toEqual({ num: 4 * 4 * 10000, den: (10 + 16) * 10000 });
    expect(emDecimosDePorcento(f)).toBe(615);
    expect(porcentoInteiroAte(f)).toBe(61);
  });

  it('o limite do campo é o inteiro DE BAIXO — o de cima passaria do lucro', () => {
    const f = descontoMaximo({ atendidos: 5, semanas: 1, clientesNovos: 2, precoCents: 10000, custoCents: 0 })!; // 28,57%
    expect(emDecimosDePorcento(f)).toBe(286);
    expect(limiteDoCampo(f)).toBe(28);
  });

  it('o teto é 90%, o do desconto do combo', () => {
    const f = descontoMaximo({ atendidos: 0, semanas: 6, clientesNovos: 4, precoCents: 10000, custoCents: 0 })!;
    expect(emDecimosDePorcento(f)).toBe(1000);
    expect(limiteDoCampo(f)).toBe(90);
  });

  it('sem margem não há desconto; conta sem sentido não tem resultado', () => {
    expect(descontoMaximo({ atendidos: 3, semanas: 4, clientesNovos: 4, precoCents: 5000, custoCents: 5000 })).toEqual({ num: 0, den: 1 });
    expect(descontoMaximo({ atendidos: 3, semanas: 4, clientesNovos: 4, precoCents: 5000, custoCents: 6000 })).toEqual({ num: 0, den: 1 });
    expect(descontoMaximo({ atendidos: 3, semanas: 0, clientesNovos: 4, precoCents: 5000, custoCents: 0 })).toBeNull();
    expect(descontoMaximo({ atendidos: 3, semanas: 4, clientesNovos: 0, precoCents: 5000, custoCents: 0 })).toBeNull();
    expect(descontoMaximo({ atendidos: 3, semanas: 4, clientesNovos: 4, precoCents: 0, custoCents: 0 })).toBeNull();
    expect(descontoMaximo({ atendidos: 2.5, semanas: 4, clientesNovos: 4, precoCents: 5000, custoCents: 0 })).toBeNull();
    expect(descontoMaximo({ atendidos: -1, semanas: 4, clientesNovos: 4, precoCents: 5000, custoCents: 0 })).toBeNull();
  });

  it('o texto: décimos de ponto, com vírgula, e sem ",0"', () => {
    expect([1000, 286, 200, 5, 0].map(textoDoPorcento)).toEqual(['100%', '28,6%', '20%', '0,5%', '0%']);
  });
});

describe('as premissas', () => {
  it('g vai de 2 a 6; fora disso, o padrão 4', () => {
    expect([2, 4, 6].map(clientesNovosValido)).toEqual([2, 4, 6]);
    expect([1, 7, 4.5, null, '4'].map(clientesNovosValido)).toEqual([4, 4, 4, 4, 4]);
  });

  it('ociosa é abaixo de 30% — e com pelo menos 2 horas no período', () => {
    expect(faixaOciosa(240, 71)).toBe(true);   // 29,6%
    expect(faixaOciosa(240, 72)).toBe(false);  // 30%
    expect(faixaOciosa(119, 0)).toBe(false);
    expect(faixaOciosa(120, 0)).toBe(true);
  });

  it('o custo: vazio é "não informado"; o resto, centavos', () => {
    expect(custoDoCampo('')).toEqual({ ok: true, centavos: null });
    expect(custoDoCampo('  ')).toEqual({ ok: true, centavos: null });
    expect(custoDoCampo('12,50')).toEqual({ ok: true, centavos: 1250 });
    expect(custoDoCampo('39.9')).toEqual({ ok: true, centavos: 3990 });
    expect(custoDoCampo('0')).toEqual({ ok: true, centavos: 0 });
    expect(custoDoCampo('abc').ok).toBe(false);
    expect(custoDoCampo('-1').ok).toBe(false);
    expect(custoDoCampo('100000,01').ok).toBe(false);
  });
});

describe('qual desconto vale no horário — o mesmo no site e no servidor', () => {
  // Uma terça qualquer, conferida pelo próprio calendário.
  let terca = '2026-12-01';
  while (diaDaSemana(terca) !== 2) terca = somarDias(terca, 1);
  const quarta = somarDias(terca, 1);
  const tardeDeTerca = { diaDaSemana: 2, inicioMin: 13 * 60, fimMin: 17 * 60, descontoPct: 25 };

  it('vale pelo INÍCIO, dentro da faixa: das 13:00 às 16:59, e não às 17:00', () => {
    expect(descontoNoHorario(10, [tardeDeTerca], terca, '12:59')).toBe(10);
    expect(descontoNoHorario(10, [tardeDeTerca], terca, '13:00')).toBe(25);
    expect(descontoNoHorario(10, [tardeDeTerca], terca, '16:59')).toBe(25);
    expect(descontoNoHorario(10, [tardeDeTerca], terca, '17:00')).toBe(10);
  });

  it('só no dia da semana dela', () => {
    expect(descontoNoHorario(10, [tardeDeTerca], quarta, '14:00')).toBe(10);
  });

  it('não soma com o desconto do combo: vale o maior', () => {
    expect(descontoNoHorario(30, [tardeDeTerca], terca, '14:00')).toBe(30);
    expect(descontoNoHorario(0, [tardeDeTerca], terca, '14:00')).toBe(25);
  });

  it('duas que cobrem o mesmo horário: a de maior desconto', () => {
    const outra = { ...tardeDeTerca, inicioMin: 14 * 60, descontoPct: 35 };
    expect(promocaoDoHorario([tardeDeTerca, outra], terca, '14:30')?.descontoPct).toBe(35);
    expect(promocaoDoHorario([tardeDeTerca, outra], terca, '13:30')?.descontoPct).toBe(25);
  });

  it('o preço é o do combo com o desconto, item por item, como o agendamento grava', () => {
    expect(precoDoCombo(7000, 3000, 25)).toBe(5250 + 2250);
    expect(rotuloDaFaixa(13 * 60, 17 * 60)).toBe('13h às 17h');
    expect(rotuloDaFaixa(9 * 60 + 30, 13 * 60)).toBe('9h30 às 13h');
  });
});

describe('o dia e a hora são os da barbearia — com o processo em qualquer fuso', () => {
  it('o mesmo instante cai em faixas diferentes em Fortaleza, Manaus e Rio Branco', () => {
    const instante = '2026-11-17T16:30:00.000Z';
    expect(dataEMinutoLocal(instante, 'America/Fortaleza')).toEqual({ data: '2026-11-17', min: 13 * 60 + 30 }); // tarde
    expect(dataEMinutoLocal(instante, 'America/Manaus')).toEqual({ data: '2026-11-17', min: 12 * 60 + 30 });    // manhã
    expect(dataEMinutoLocal(instante, 'America/Rio_Branco')).toEqual({ data: '2026-11-17', min: 11 * 60 + 30 });
  });

  it('depois das 21h em Fortaleza o dia em UTC já virou — a data é a local', () => {
    expect(dataEMinutoLocal('2026-11-18T01:30:00.000Z', 'America/Fortaleza')).toEqual({ data: '2026-11-17', min: 22 * 60 + 30 });
  });

  it('as 8 semanas: os dias desse dia da semana ANTES de hoje, de 7 em 7', () => {
    let terca = '2026-12-01';
    while (diaDaSemana(terca) !== 2) terca = somarDias(terca, 1);
    const dias = diasDaSemanaAnteriores(terca, 2);
    expect(dias).toHaveLength(8);
    expect(dias[0]).toBe(somarDias(terca, -7)); // hoje não entra: o dia ainda não acabou
    expect(dias[7]).toBe(somarDias(terca, -56));
    expect(dias.every((d) => diaDaSemana(d) === 2)).toBe(true);
    expect(diasDaSemanaAnteriores(terca, 1)[0]).toBe(somarDias(terca, -1));
    expect(diasDaSemanaAnteriores(terca, 3)[0]).toBe(somarDias(terca, -6));
  });
});

describe('as janelas de confirmação da aba Promoções (19/11/2026)', () => {
  // A de ativar não se anunciava como janela, não fechava com Esc e não devolvia o foco — a de
  // desativar fazia as três. A tela não abre aqui sem barbearia com histórico: conferido no fonte.
  const fonte = readFileSync('src/pages/admin/combos.astro', 'utf8');

  it('as duas se anunciam como janela, com o título', () => {
    for (const id of ['confirmar-promocao', 'confirmar-desativar']) {
      const abre = new RegExp(`<div id="${id}"[^>]*>`).exec(fonte)?.[0] ?? '';
      expect(abre, id).toMatch(/role="dialog"/);
      expect(abre, id).toMatch(/aria-modal="true"/);
      expect(abre, id).toMatch(new RegExp(`aria-labelledby="${id}-titulo"`));
      expect(fonte, id).toMatch(new RegExp(`id="${id}-titulo"`));
    }
  });

  it('a de ativar fecha com Esc e devolve o foco ao botão de onde veio', () => {
    expect(fonte).toMatch(/e\.key === 'Escape' && !confirmacao\.classList\.contains\('hidden'\)\) fecharConfirmacao\(\)/);
    expect(fonte).toMatch(/function fecharConfirmacao\(\) \{[^}]*voltarDaConfirmacao\?\.focus\(\);/);
    expect(fonte).toMatch(/voltarDaConfirmacao = botaoAtivar;/);
  });
});
