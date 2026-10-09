// A fase da barbearia — `src/lib/situacao.ts`. Decisões de 08/10/2026
// (`docs/PLANO-PRODUTIZACAO.md` §13): teste até o fim do 7º dia depois do
// cadastro, no fuso da barbearia; 3 dias inteiros de carência; depois, fora do ar.
//
// Os casos falam em hora LOCAL de propósito: é assim que o dono lê "até 15/10".
// `local()` transforma a hora de parede em instante pelo mesmo caminho do código.
import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import {
  situacaoDe, noAr, fimDoTeste, fimDaCarencia, ultimoDia, diasAte,
  DIAS_DE_TESTE, DIAS_DE_CARENCIA,
} from '../src/lib/situacao';

const FORTALEZA = 'America/Fortaleza'; // UTC-3 — o fuso padrão de lib/timezone.ts
const MANAUS = 'America/Manaus';       // UTC-4

const local = (quando: string, fuso = FORTALEZA) => fromZonedTime(quando, fuso);
const menos1ms = (d: Date) => new Date(d.getTime() - 1);

describe('o fim do teste', () => {
  it('são as regras decididas: 7 dias de teste, 3 de carência', () => {
    expect(DIAS_DE_TESTE).toBe(7);
    expect(DIAS_DE_CARENCIA).toBe(3);
  });

  it('cadastrou no dia 8, a qualquer hora: o teste vai até o fim do dia 15', () => {
    for (const hora of ['00:00:30', '09:15:00', '21:28:00', '23:59:59']) {
      const fim = fimDoTeste(local(`2026-10-08T${hora}`));
      expect(fim.toISOString(), hora).toBe(local('2026-10-16T00:00:00').toISOString());
      expect(ultimoDia(fim), hora).toBe('15/10');
    }
  });

  it('vira o mês e o ano no calendário, não em conta de horas', () => {
    expect(ultimoDia(fimDoTeste(local('2026-10-28T10:00:00')))).toBe('04/11');
    expect(ultimoDia(fimDoTeste(local('2026-12-28T10:00:00')), FORTALEZA, 'dd/MM/yyyy')).toBe('04/01/2027');
  });

  it('o dia é o do fuso da barbearia, não o do servidor', () => {
    // 23:30 em Manaus já é 00:30 do dia seguinte em Fortaleza.
    const cadastro = local('2026-10-08T23:30:00', MANAUS);
    expect(ultimoDia(fimDoTeste(cadastro, MANAUS), MANAUS)).toBe('15/10');
    expect(ultimoDia(fimDoTeste(cadastro, FORTALEZA), FORTALEZA)).toBe('16/10');
  });
});

describe('a carência', () => {
  it('depois do teste: três dias inteiros, o primeiro já é o dia seguinte ao último', () => {
    const fim = fimDaCarencia(local('2026-10-16T00:00:00'));
    expect(fim.toISOString()).toBe(local('2026-10-19T00:00:00').toISOString());
    expect(ultimoDia(fim)).toBe('18/10');
  });

  it('cobrança que falhou no meio do dia: o resto daquele dia não conta', () => {
    const fim = fimDaCarencia(local('2026-11-20T10:37:00'));
    expect(fim.toISOString()).toBe(local('2026-11-24T00:00:00').toISOString());
    expect(ultimoDia(fim)).toBe('23/11');
  });
});

describe('a fase, ao longo do tempo', () => {
  const cadastro = local('2026-10-08T21:28:00');
  const emTeste = { status: 'trial' as const, testeAte: fimDoTeste(cadastro) };

  it('no teste até o último segundo do dia 15', () => {
    expect(situacaoDe(emTeste, cadastro).fase).toBe('teste');
    expect(situacaoDe(emTeste, local('2026-10-15T23:59:59')).fase).toBe('teste');
  });

  it('na carência do dia 16 ao fim do dia 18, com o motivo e a data', () => {
    for (const quando of ['2026-10-16T00:00:00', '2026-10-17T12:00:00', '2026-10-18T23:59:59']) {
      const s = situacaoDe(emTeste, local(quando));
      expect(s, quando).toMatchObject({ fase: 'carencia', motivo: 'teste' });
      if (s.fase === 'carencia') expect(ultimoDia(s.ate)).toBe('18/10');
    }
  });

  it('fora do ar a partir do dia 19 — e continua, sem ninguém mudar nada no banco', () => {
    for (const quando of ['2026-10-19T00:00:00', '2026-12-25T10:00:00']) {
      expect(situacaoDe(emTeste, local(quando)), quando).toMatchObject({ fase: 'suspensa', motivo: 'teste' });
    }
    expect(situacaoDe(emTeste, menos1ms(local('2026-10-19T00:00:00'))).fase).toBe('carencia');
  });

  it('cobrança que falhou: carência, depois fora do ar, com o motivo certo', () => {
    const atrasada = { status: 'past_due' as const, atrasadaDesde: local('2026-11-20T10:37:00') };
    expect(situacaoDe(atrasada, local('2026-11-23T23:59:59'))).toMatchObject({ fase: 'carencia', motivo: 'cobranca' });
    expect(situacaoDe(atrasada, local('2026-11-24T00:00:00'))).toMatchObject({ fase: 'suspensa', motivo: 'cobranca' });
  });

  it('pagando, tirada à mão e encerrada', () => {
    expect(situacaoDe({ status: 'active' })).toEqual({ fase: 'ativa' });
    expect(situacaoDe({ status: 'suspended' })).toMatchObject({ fase: 'suspensa', motivo: 'manual' });
    expect(situacaoDe({ status: 'cancelled' })).toEqual({ fase: 'cancelada' });
  });

  it('prazo faltando derruba em vez de dar o produto de graça', () => {
    expect(situacaoDe({ status: 'trial', testeAte: null }).fase).toBe('suspensa');
    expect(situacaoDe({ status: 'past_due', atrasadaDesde: null }).fase).toBe('suspensa');
  });

  it('no ar: pagando, no teste e na carência; fora: suspensa e encerrada', () => {
    const ate = local('2026-10-16T00:00:00');
    expect(noAr({ fase: 'ativa' })).toBe(true);
    expect(noAr({ fase: 'teste', ate })).toBe(true);
    expect(noAr({ fase: 'carencia', motivo: 'teste', ate })).toBe(true);
    expect(noAr({ fase: 'suspensa', motivo: 'teste', desde: ate })).toBe(false);
    expect(noAr({ fase: 'cancelada' })).toBe(false);
  });
});

describe('quantos dias faltam', () => {
  const fim = local('2026-10-16T00:00:00');

  it('7 no dia do cadastro, 1 na véspera, 0 no último dia', () => {
    expect(diasAte(fim, local('2026-10-08T21:28:00'))).toBe(7);
    expect(diasAte(fim, local('2026-10-14T08:00:00'))).toBe(1);
    expect(diasAte(fim, local('2026-10-15T00:00:00'))).toBe(0);
    expect(diasAte(fim, local('2026-10-15T23:59:59'))).toBe(0);
  });
});
