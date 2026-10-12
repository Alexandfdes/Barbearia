// O que o painel diz sobre o teste e a cobrança — `src/lib/assinatura.ts`.
// É o texto que o dono lê para saber quando paga e o que acontece se não pagar.
import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import { avisoDoPainel, explicacaoDaSituacao } from '../src/lib/assinatura';

const FORTALEZA = 'America/Fortaleza';
const local = (quando: string) => fromZonedTime(quando, FORTALEZA);
const FIM_DO_TESTE = local('2026-10-16T00:00:00');      // teste até 15/10
const FIM_DA_CARENCIA = local('2026-10-19T00:00:00');   // carência até 18/10

describe('a faixa do topo do painel', () => {
  it('no teste, conta os dias e diz a data', () => {
    const a = avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, FORTALEZA, local('2026-10-08T21:28:00'));
    expect(a).toEqual({ tom: 'info', texto: 'Teste grátis: faltam 7 dias, até 15/10.', acao: 'Cadastrar o cartão' });
  });

  it('na véspera e no último dia, vira alerta', () => {
    expect(avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, FORTALEZA, local('2026-10-14T10:00:00')))
      .toMatchObject({ tom: 'alerta', texto: 'Teste grátis: falta 1 dia — termina amanhã, 15/10.' });
    expect(avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, FORTALEZA, local('2026-10-15T10:00:00')))
      .toMatchObject({ tom: 'alerta', texto: 'Teste grátis: hoje é o último dia (15/10).' });
  });

  it('na carência, diz até quando o site fica no ar — e por quê', () => {
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'teste', ate: FIM_DA_CARENCIA }, FORTALEZA)?.texto)
      .toBe('O teste acabou. Cadastre o cartão até 18/10 para o site continuar no ar.');
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DA_CARENCIA }, FORTALEZA)?.texto)
      .toBe('A cobrança não passou. Atualize o cartão até 18/10 para o site continuar no ar.');
  });

  it('pagando, não há faixa; fora do ar, o painel nem abre', () => {
    expect(avisoDoPainel({ fase: 'ativa' }, FORTALEZA)).toBeNull();
    expect(avisoDoPainel({ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA }, FORTALEZA)).toBeNull();
  });
});

describe('a explicação da tela de assinatura', () => {
  it('fora do ar: o que o cliente dele vê, desde quando, e que nada foi apagado', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA }, FORTALEZA);
    expect(texto).toContain('desde 19/10');
    expect(texto).toContain('temporariamente indisponível');
    expect(texto).toContain('WhatsApp');
    expect(texto).toContain('Nada foi apagado');
  });

  it('tirada do ar à mão não fala em cartão', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'manual', desde: null }, FORTALEZA);
    expect(texto).not.toMatch(/cart[aã]o/i);
    expect(texto).toMatch(/suporte/);
  });

  it('no último dia do teste, diz que é hoje', () => {
    expect(explicacaoDaSituacao({ fase: 'teste', ate: FIM_DO_TESTE }, FORTALEZA, local('2026-10-15T09:00:00')))
      .toMatch(/^Hoje, 15\/10, é o último dia/);
  });
});

describe('quem cancelou (10/10/2026)', () => {
  // Cancelou com o mês pago até 09/11: no ar até lá, fora do ar a partir de 10/11.
  const FIM_DO_PERIODO = local('2026-11-10T00:00:00');

  it('a faixa diz até quando o site fica no ar, e oferece reativar', () => {
    expect(avisoDoPainel({ fase: 'ativa', encerraEm: FIM_DO_PERIODO }, FORTALEZA))
      .toEqual({ tom: 'info', texto: 'Assinatura cancelada: o site fica no ar até 09/11.', acao: 'Reativar' });
  });

  it('a tela diz até quando, o que o cliente dele vai ver depois, e que dá para voltar atrás', () => {
    const texto = explicacaoDaSituacao({ fase: 'ativa', encerraEm: FIM_DO_PERIODO }, FORTALEZA);
    expect(texto).toContain('até 09/11');
    expect(texto).toMatch(/temporariamente indisponível/);
    expect(texto).toMatch(/Reative antes disso/);
    expect(texto).not.toMatch(/em dia/);
  });

  it('depois do fim: fora do ar desde o dia, nada apagado, e assinando de novo volta — sem falar em cobrança', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'cancelada', desde: FIM_DO_PERIODO }, FORTALEZA);
    expect(texto).toMatch(/^A assinatura foi cancelada, e desde 10\/11/);
    expect(texto).toMatch(/Nada foi apagado: assinando de novo/);
    expect(texto).not.toMatch(/cobrança|cartão não passou|teste/);
  });
});
