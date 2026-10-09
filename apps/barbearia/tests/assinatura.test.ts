// O que o painel diz sobre o teste e a cobrança — `src/lib/assinatura.ts`.
// É o texto que o dono lê para saber quando paga e o que acontece se não pagar.
import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import { avisoDoPainel, explicacaoDaSituacao } from '../src/lib/assinatura';

const local = (quando: string) => fromZonedTime(quando, 'America/Fortaleza');
const FIM_DO_TESTE = local('2026-10-16T00:00:00');      // teste até 15/10
const FIM_DA_CARENCIA = local('2026-10-19T00:00:00');   // carência até 18/10

describe('a faixa do topo do painel', () => {
  it('no teste, conta os dias e diz a data', () => {
    const a = avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, local('2026-10-08T21:28:00'));
    expect(a).toEqual({ tom: 'info', texto: 'Teste grátis: faltam 7 dias, até 15/10.', acao: 'Cadastrar o cartão' });
  });

  it('na véspera e no último dia, vira alerta', () => {
    expect(avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, local('2026-10-14T10:00:00')))
      .toMatchObject({ tom: 'alerta', texto: 'Teste grátis: falta 1 dia — termina amanhã, 15/10.' });
    expect(avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, local('2026-10-15T10:00:00')))
      .toMatchObject({ tom: 'alerta', texto: 'Teste grátis: hoje é o último dia (15/10).' });
  });

  it('na carência, diz até quando o site fica no ar — e por quê', () => {
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'teste', ate: FIM_DA_CARENCIA })?.texto)
      .toBe('O teste acabou. Cadastre o cartão até 18/10 para o site continuar no ar.');
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DA_CARENCIA })?.texto)
      .toBe('A cobrança não passou. Atualize o cartão até 18/10 para o site continuar no ar.');
  });

  it('pagando, não há faixa; fora do ar, o painel nem abre', () => {
    expect(avisoDoPainel({ fase: 'ativa' })).toBeNull();
    expect(avisoDoPainel({ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA })).toBeNull();
  });
});

describe('a explicação da tela de assinatura', () => {
  it('fora do ar: o que o cliente dele vê, desde quando, e que nada foi apagado', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA });
    expect(texto).toContain('desde 19/10');
    expect(texto).toContain('temporariamente indisponível');
    expect(texto).toContain('WhatsApp');
    expect(texto).toContain('Nada foi apagado');
  });

  it('tirada do ar à mão não fala em cartão', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'manual', desde: null });
    expect(texto).not.toMatch(/cart[aã]o/i);
    expect(texto).toMatch(/suporte/);
  });

  it('no último dia do teste, diz que é hoje', () => {
    expect(explicacaoDaSituacao({ fase: 'teste', ate: FIM_DO_TESTE }, local('2026-10-15T09:00:00')))
      .toMatch(/^Hoje, 15\/10, é o último dia/);
  });
});
