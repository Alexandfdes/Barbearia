/**
 * O que o painel diz sobre o teste e a cobrança — a faixa do topo de toda tela
 * e a tela de assinatura. O texto mora num lugar só, e é testado
 * (`tests/assinatura.test.ts`): é ele que o dono lê para saber quando paga.
 *
 * As regras de tempo estão em `lib/situacao.ts`; aqui só se escolhe a frase.
 */
import { diaDe, diasAte, ultimoDia, type Situacao } from './situacao.js';

/**
 * A única tela do painel que abre com a barbearia fora do ar (`src/middleware.ts`).
 */
export const TELA_DE_ASSINATURA = '/admin/assinatura';

/**
 * Leva o dono ao Checkout da Asaas (`lib/cobranca.ts`). Abre também com a
 * barbearia fora do ar — é por ela que quem saiu do ar volta (`src/middleware.ts`).
 */
export const ROTA_DO_CARTAO = '/api/admin/assinatura/cartao';

/**
 * Cancela a assinatura: o site fica no ar até o fim do período pago. Abre também
 * fora do ar pela cobrança — é como quem quer sair para a cobrança (`src/middleware.ts`).
 */
export const ROTA_DO_CANCELAMENTO = '/api/admin/assinatura/cancelar';

export interface AvisoDoPainel {
  /** `alerta` quando falta 1 dia ou menos, ou o prazo já venceu. */
  tom: 'info' | 'alerta';
  texto: string;
  /** O que o botão da faixa diz. Só o dono vê o botão. */
  acao: string;
}

/**
 * A faixa do topo do painel. `null` quando não há nada a dizer — barbearia
 * pagando — ou quando o painel nem abre — fora do ar, encerrada.
 */
export function avisoDoPainel(s: Situacao, agora: Date = new Date()): AvisoDoPainel | null {
  if (s.fase === 'ativa' && s.encerraEm) {
    return { tom: 'info', texto: `Assinatura cancelada: o site fica no ar até ${ultimoDia(s.encerraEm)}.`, acao: 'Reativar' };
  }
  if (s.fase === 'teste') {
    const dias = diasAte(s.ate, agora);
    const ate = ultimoDia(s.ate);
    const texto = dias > 1 ? `Teste grátis: faltam ${dias} dias, até ${ate}.`
      : dias === 1 ? `Teste grátis: falta 1 dia — termina amanhã, ${ate}.`
      : `Teste grátis: hoje é o último dia (${ate}).`;
    return { tom: dias > 1 ? 'info' : 'alerta', texto, acao: 'Cadastrar o cartão' };
  }
  if (s.fase === 'carencia') {
    const ate = ultimoDia(s.ate);
    return s.motivo === 'teste'
      ? { tom: 'alerta', texto: `O teste acabou. Cadastre o cartão até ${ate} para o site continuar no ar.`, acao: 'Cadastrar o cartão' }
      : { tom: 'alerta', texto: `A cobrança não passou. Atualize o cartão até ${ate} para o site continuar no ar.`, acao: 'Atualizar o cartão' };
  }
  return null;
}

/**
 * O parágrafo de cima da tela de assinatura: onde ele está e o que acontece
 * depois. Fala do site do jeito que o cliente dele o vê — sem dívida exposta.
 */
export function explicacaoDaSituacao(s: Situacao, agora: Date = new Date()): string {
  switch (s.fase) {
    case 'ativa':
      if (s.encerraEm) {
        return `Assinatura cancelada. O site e o painel funcionam até ${ultimoDia(s.encerraEm)}; depois disso, ` +
          'quem abrir o seu site vai ver que o agendamento online está temporariamente indisponível, com o seu ' +
          'WhatsApp para contato. Mudou de ideia? Reative antes disso e nada muda.';
      }
      return 'Assinatura em dia. O site e o painel estão funcionando normalmente.';
    case 'teste':
      return (diasAte(s.ate, agora) > 0
        ? `Você está no teste grátis, até ${ultimoDia(s.ate)}.`
        : `Hoje, ${ultimoDia(s.ate)}, é o último dia do seu teste grátis.`) +
        ' Até lá, nada é cobrado. Para o site continuar no ar depois disso, cadastre o cartão antes do fim do teste.';
    case 'carencia':
      return (s.motivo === 'teste' ? 'O teste acabou' : 'A cobrança do cartão não passou') +
        `. O site continua no ar até ${ultimoDia(s.ate)}. Depois disso, quem abrir o seu site vai ver que ` +
        'o agendamento online está temporariamente indisponível, com o seu WhatsApp para contato.';
    case 'suspensa':
      if (s.motivo === 'manual') {
        return 'A sua barbearia foi tirada do ar. Fale com o suporte para saber o motivo.';
      }
      if (s.motivo === 'cancelada') {
        return 'A assinatura foi cancelada' + (s.desde ? `, e desde ${diaDe(s.desde)}` : ', e agora') +
          ' quem abre o seu site vê que o agendamento online está temporariamente indisponível, com o seu ' +
          'WhatsApp para contato. Nada foi apagado: assinando de novo, o site volta na hora.';
      }
      return (s.motivo === 'teste' ? 'O teste acabou sem o cartão cadastrado' : 'A cobrança do cartão não passou') +
        (s.desde ? `, e desde ${diaDe(s.desde)}` : ', e agora') +
        ' quem abre o seu site vê que o agendamento online está temporariamente indisponível, com o seu ' +
        'WhatsApp para contato. Nada foi apagado: regularizou, o site volta na hora.';
    case 'cancelada':
      return 'Esta barbearia foi encerrada.';
  }
}
