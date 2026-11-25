// O que o painel diz sobre o teste e a cobrança — `src/lib/assinatura.ts`.
// É o texto que o dono lê para saber quando paga e o que acontece se não pagar.
import { describe, it, expect } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import {
  limiteParaOSuporte, saidaDoAr,
  avisoDoPainel, CARTAO_RECEBIDO, esperaDoCartao, explicacaoDaSituacao, fimDaEsperaDoCartao, HORAS_ESPERANDO_A_CONFIRMACAO,
} from '../src/lib/assinatura';

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
    // Não promete que "nada muda": quem cancelou devendo, reativando, paga no dia (23/11/2026).
    expect(texto).not.toMatch(/nada muda/);
  });

  it('depois do fim: fora do ar desde o dia, nada apagado, e assinando de novo volta — sem falar em cobrança', () => {
    const texto = explicacaoDaSituacao({ fase: 'suspensa', motivo: 'cancelada', desde: FIM_DO_PERIODO }, FORTALEZA);
    expect(texto).toMatch(/^A assinatura foi cancelada, e desde 10\/11/);
    expect(texto).toMatch(/Nada foi apagado: assinando de novo/);
    expect(texto).not.toMatch(/cobrança|cartão não passou|teste/);
  });
});

describe('com a cobrança desligada, o caminho é o suporte (05/11/2026)', () => {
  // Até 05/11, com a cobrança desligada, a faixa, a tela e os e-mails mandavam cadastrar o cartão,
  // e o botão dizia que ainda não dava: o dono que acreditasse via o site sair do ar no 10º dia
  // (`docs/PENDENCIAS-ABERTAS.md` §2.69).
  it('a regra de "ligada" é a mesma do módulo da cobrança', async () => {
    const { cobrancaLigada } = await import('../src/lib/assinatura');
    const { configDaAsaas } = await import('../src/lib/asaas');
    for (const env of [{}, { ASAAS_API_KEY: '' }, { ASAAS_API_KEY: '   ' }, { ASAAS_API_KEY: '$aact_x' }, { ASAAS_API_KEY: 'x', ASAAS_AMBIENTE: 'producao' }]) {
      expect(cobrancaLigada(env), JSON.stringify(env)).toBe(configDaAsaas(env) !== null);
    }
  });

  it('no teste e na carência do teste: suporte, não cartão', () => {
    const teste = avisoDoPainel({ fase: 'teste', ate: FIM_DO_TESTE }, FORTALEZA, local('2026-10-08T21:28:00'), false);
    expect(teste).toEqual({ tom: 'info', texto: 'Teste grátis: faltam 7 dias, até 15/10.', acao: 'Ver como continuar' });
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'teste', ate: FIM_DA_CARENCIA }, FORTALEZA, new Date(), false))
      .toEqual({ tom: 'alerta', texto: 'O teste acabou. Fale com o suporte até 18/10 para o site continuar no ar.', acao: 'Ver como continuar' });
    for (const s of [
      { fase: 'teste' as const, ate: FIM_DO_TESTE },
      { fase: 'carencia' as const, motivo: 'teste' as const, ate: FIM_DA_CARENCIA },
      { fase: 'suspensa' as const, motivo: 'teste' as const, desde: FIM_DA_CARENCIA },
    ]) {
      const texto = explicacaoDaSituacao(s, FORTALEZA, local('2026-10-08T21:28:00'), false);
      expect(texto, s.fase).toMatch(/fale com o suporte pelo WhatsApp/);
      expect(texto, s.fase).not.toMatch(/cadastre o cartão|regularizou/i);
    }
  });

  it('a cobrança que falhou continua falando em cartão — só existe com a cobrança ligada', () => {
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DA_CARENCIA }, FORTALEZA, new Date(), false)?.texto)
      .toBe('A cobrança não passou. Atualize o cartão até 18/10 para o site continuar no ar.');
  });

  it('quem mostra o texto passa a cobrança de verdade: a faixa, a tela de assinatura e os avisos', async () => {
    const { readFileSync } = await import('node:fs');
    // A faixa leva também a volta do cartão que espera confirmação (migration 0023): sem ela, a
    // faixa de toda tela mandava cadastrar de novo.
    expect(readFileSync('src/layouts/AdminLayout.astro', 'utf8')).toMatch(
      /avisoDoPainel\(situacao, fuso, agora, cobrancaLigada\(\), espera\)/);
    expect(readFileSync('src/layouts/AdminLayout.astro', 'utf8')).toMatch(
      /const espera = Astro\.props\.cartao !== undefined \? Astro\.props\.cartao : esperaDoCartao\(barbearia\.cartaoVoltouEm, situacao, agora\);/);
    expect(readFileSync('src/layouts/AdminLayout.astro', 'utf8')).toMatch(/const mostraAviso = aviso !== null && !\(naAssinatura && espera === 'esperando'\);/);
    const tela = readFileSync('src/pages/admin/assinatura.astro', 'utf8');
    expect(tela).toMatch(/explicacaoDaSituacao\(situacao, fuso, new Date\(\), cobrancaLigada, espera\)/);
    expect(tela).toMatch(/id="falar-com-o-suporte" href=\{linkDoSuporte\(/);
    expect(tela).not.toMatch(/Ainda não dá para pagar por aqui/);
    expect(readFileSync('src/lib/avisos.ts', 'utf8')).toMatch(/agora, cobrancaLigada\(\)\)/);
  });
});

describe('o cartão que voltou do Checkout e a confirmação não chegou (migration 0023, 25/11/2026)', () => {
  // A fila do webhook parada, no sandbox, atrasou a confirmação por horas (23/11/2026): saindo da
  // tela de assinatura, a faixa mandava cadastrar o cartão de novo — e o segundo cadastro criava uma
  // segunda assinatura. Nas primeiras 48 horas, o painel diz que o cartão chegou.
  const VOLTOU = local('2026-10-14T10:00:00');
  const teste = { fase: 'teste' as const, ate: FIM_DO_TESTE };

  it('esperando nas primeiras 48 horas; depois, demorou — e a conta é de horas corridas', () => {
    expect(HORAS_ESPERANDO_A_CONFIRMACAO).toBe(48);
    expect(esperaDoCartao(VOLTOU, teste, VOLTOU)).toBe('esperando');
    expect(esperaDoCartao(VOLTOU, teste, local('2026-10-16T09:59:00'))).toBe('esperando');
    expect(esperaDoCartao(VOLTOU, teste, local('2026-10-16T10:00:00'))).toBe('demorou');
    expect(fimDaEsperaDoCartao(VOLTOU)).toEqual(local('2026-10-16T10:00:00'));
  });

  it('sem volta gravada, em dia, encerrada ou tirada do ar à mão: não há o que esperar', () => {
    expect(esperaDoCartao(null, teste, VOLTOU)).toBeNull();
    expect(esperaDoCartao(undefined, teste, VOLTOU)).toBeNull();
    // Em dia: a confirmação chegou — por qualquer caminho.
    expect(esperaDoCartao(VOLTOU, { fase: 'ativa' }, VOLTOU)).toBeNull();
    expect(esperaDoCartao(VOLTOU, { fase: 'cancelada' }, VOLTOU)).toBeNull();
    expect(esperaDoCartao(VOLTOU, { fase: 'suspensa', motivo: 'manual', desde: null }, VOLTOU)).toBeNull();
    // Quem cancelou e reativa, quem está na carência e quem saiu do ar esperam, como no teste.
    expect(esperaDoCartao(VOLTOU, { fase: 'ativa', encerraEm: FIM_DA_CARENCIA }, VOLTOU)).toBe('esperando');
    expect(esperaDoCartao(VOLTOU, { fase: 'carencia', motivo: 'cobranca', ate: FIM_DA_CARENCIA }, VOLTOU)).toBe('esperando');
    expect(esperaDoCartao(VOLTOU, { fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA }, VOLTOU)).toBe('esperando');
  });

  it('esperando, a faixa diz que o cartão chegou — no teste, na carência e em quem reativa', () => {
    expect(avisoDoPainel(teste, FORTALEZA, VOLTOU, true, 'esperando')).toEqual({ tom: 'info', texto: CARTAO_RECEBIDO, acao: 'Ver a assinatura' });
    // Com dia marcado para sair do ar, a faixa não esconde a data (revisão de 25/11/2026).
    const comSaida = {
      tom: 'alerta', acao: 'Ver a assinatura',
      texto: `${CARTAO_RECEBIDO} O site fica no ar até 18/10: se a confirmação não chegar antes, fale com o suporte.`,
    };
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'teste', ate: FIM_DA_CARENCIA }, FORTALEZA, VOLTOU, true, 'esperando')).toEqual(comSaida);
    expect(avisoDoPainel({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DA_CARENCIA }, FORTALEZA, VOLTOU, true, 'esperando')).toEqual(comSaida);
    expect(avisoDoPainel({ fase: 'ativa', encerraEm: FIM_DA_CARENCIA }, FORTALEZA, VOLTOU, true, 'esperando')).toEqual(comSaida);
    expect(CARTAO_RECEBIDO).toMatch(/não precisa cadastrar de novo/);
  });

  it('passada a espera, a faixa volta a pedir o cartão; em dia ou fora do ar, nada muda', () => {
    expect(avisoDoPainel(teste, FORTALEZA, VOLTOU, true, 'demorou'))
      .toEqual({ tom: 'alerta', texto: 'Teste grátis: falta 1 dia — termina amanhã, 15/10.', acao: 'Cadastrar o cartão' });
    expect(avisoDoPainel({ fase: 'ativa' }, FORTALEZA, VOLTOU, true, 'esperando')).toBeNull();
    expect(avisoDoPainel({ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA }, FORTALEZA, VOLTOU, true, 'esperando')).toBeNull();
  });

  it('a tela grava a volta só do dono, some com o botão enquanto espera, e tira a volta do endereço', async () => {
    const { readFileSync } = await import('node:fs');
    const tela = readFileSync('src/pages/admin/assinatura.astro', 'utf8');
    // Só o dono volta do Checkout — a rota do cartão é só dele —, e a volta gravada tranca o cartão:
    // o barbeiro que abrisse `?cartao=ok` trancaria o do dono por 48 horas.
    expect(tela).toMatch(/const voltouAgora = retorno === 'ok' && dono && cobrancaLigada && podeCartao && !emDia\s*\? await registrarVoltaDoCartao\(tenant\.id, Astro\.url\.searchParams\.get\('volta'\), agora\)/);
    // A faixa do layout usa a espera que a tela calculou — a barbearia do layout foi lida antes da volta.
    expect(tela).toMatch(/<Moldura [^>]*cartao=\{espera\}>/);
    // O barbeiro que não é dono não lê "o seu cartão", nem ganha o link do suporte em nome do dono.
    expect(tela).toMatch(/espera === 'esperando' && !dono \? `O dono cadastrou o cartão/);
    expect(tela).toMatch(/const suporteDoCartao = dono && espera !== null && !confirmado/);
    // O prazo para o suporte não passa do dia em que o site sai do ar.
    expect(tela).toMatch(/limiteParaOSuporte\(cartaoVoltouEm, situacao\)/);
    // Passada a espera, o aviso de falar com o suporte antes de cadastrar de novo.
    expect(tela).toMatch(/espera === 'demorou' \? `Você cadastrou o cartão em \$\{quandoVoltou\}, e a confirmação da Asaas não chegou\. ` \+\s*'Fale com o suporte antes de cadastrar de novo/);
    expect(tela).toMatch(/const espera = esperaDoCartao\(cartaoVoltouEm, situacao, agora\);/);
    // O `?cartao=ok` que fica no endereço gravaria de novo, num recarregar dias depois, uma volta que
    // não houve: a tela o tira quando para de conferir — nos dois ramos.
    const script = tela.slice(tela.indexOf('<script>'));
    expect(script).toMatch(/history\.replaceState\(/);
    expect(script.match(/limparAVolta\(\);/g)).toHaveLength(2);
    expect(script).toMatch(/\['cartao', 'volta', 'espera'\]/);
    expect(script).toMatch(/url\.searchParams\.delete\('volta'\);/);
  });

  it('esperando, o parágrafo de cima não manda cadastrar nem reativar — e não diz "sem o cartão"', () => {
    const casos: [Parameters<typeof explicacaoDaSituacao>[0], RegExp][] = [
      [teste, /cadastre o cartão/],
      [{ fase: 'ativa', encerraEm: FIM_DA_CARENCIA }, /Reative/],
      [{ fase: 'suspensa', motivo: 'teste', desde: FIM_DA_CARENCIA }, /sem o cartão cadastrado|regularizou/],
      [{ fase: 'suspensa', motivo: 'cobranca', desde: FIM_DA_CARENCIA }, /regularizou/],
      [{ fase: 'suspensa', motivo: 'cancelada', desde: FIM_DA_CARENCIA }, /assinando de novo/],
    ];
    for (const [s, pede] of casos) {
      expect(explicacaoDaSituacao(s, FORTALEZA, VOLTOU), s.fase).toMatch(pede);           // controle: sem espera, pede
      const esperando = explicacaoDaSituacao(s, FORTALEZA, VOLTOU, true, 'esperando');
      expect(esperando, s.fase).not.toMatch(pede);
      if (s.fase === 'suspensa') expect(esperando).toMatch(/quando a confirmação do cartão chegar, o site volta na hora/);
    }
    // Passada a espera, volta a pedir: o botão voltou.
    expect(explicacaoDaSituacao(teste, FORTALEZA, VOLTOU, true, 'demorou')).toMatch(/cadastre o cartão/);
  });

  it('o prazo para falar com o suporte não passa do dia em que o site sai do ar', () => {
    expect(saidaDoAr(teste)).toBeNull();
    expect(limiteParaOSuporte(VOLTOU, teste)).toEqual(fimDaEsperaDoCartao(VOLTOU));
    // A carência acaba antes das 48 h: o prazo é o fim dela.
    const carencia = { fase: 'carencia' as const, motivo: 'cobranca' as const, ate: local('2026-10-15T00:00:00') };
    expect(limiteParaOSuporte(VOLTOU, carencia)).toEqual(local('2026-10-15T00:00:00'));
    // Acaba depois: as 48 h.
    expect(limiteParaOSuporte(VOLTOU, { ...carencia, ate: FIM_DA_CARENCIA })).toEqual(fimDaEsperaDoCartao(VOLTOU));
    expect(limiteParaOSuporte(VOLTOU, { fase: 'ativa', encerraEm: local('2026-10-15T00:00:00') })).toEqual(local('2026-10-15T00:00:00'));
  });
});
