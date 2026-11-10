/**
 * O que o painel diz sobre o teste e a cobrança — a faixa do topo de toda tela
 * e a tela de assinatura. O texto mora num lugar só, e é testado
 * (`tests/assinatura.test.ts`): é ele que o dono lê para saber quando paga.
 *
 * As regras de tempo estão em `lib/situacao.ts`; aqui só se escolhe a frase. As
 * datas saem no fuso DA BARBEARIA, que quem chama passa (`fusoDe(tenant)`).
 */
import { diaDe, diasAte, ultimoDia, type Situacao } from './situacao.js';

/**
 * A cobrança está ligada neste servidor? A regra de `configDaAsaas` (`lib/asaas.ts`): sem
 * `ASAAS_API_KEY`, desligada. Repetida aqui de propósito — as telas da barbearia não podem chegar
 * ao módulo da cobrança (`tests/cobranca-isolada.test.ts`) —, e `tests/assinatura.test.ts` confere
 * que as duas concordam.
 *
 * Desligada (05/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.69), o painel, a tela de assinatura e os
 * avisos por e-mail mandam falar com o suporte: até aqui mandavam "cadastrar o cartão", e o botão
 * dizia que ainda não dava — o dono que acreditasse no e-mail via o site sair do ar no 10º dia.
 * Quem mostra o texto passa `cobrancaLigada()`: o padrão dos parâmetros é a cobrança ligada.
 */
export function cobrancaLigada(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ASAAS_API_KEY?.trim());
}

/** O que o dono faz para continuar, com a cobrança desligada — o mesmo em toda frase. */
const PELO_SUPORTE = 'O pagamento pelo painel ainda não abriu: para continuar, fale com o suporte pelo WhatsApp.';

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
export function avisoDoPainel(s: Situacao, fuso: string, agora: Date = new Date(), ligada = true): AvisoDoPainel | null {
  if (s.fase === 'ativa' && s.encerraEm) {
    return { tom: 'info', texto: `Assinatura cancelada: o site fica no ar até ${ultimoDia(s.encerraEm, fuso)}.`, acao: 'Reativar' };
  }
  if (s.fase === 'teste') {
    const dias = diasAte(s.ate, fuso, agora);
    const ate = ultimoDia(s.ate, fuso);
    const texto = dias > 1 ? `Teste grátis: faltam ${dias} dias, até ${ate}.`
      : dias === 1 ? `Teste grátis: falta 1 dia — termina amanhã, ${ate}.`
      : `Teste grátis: hoje é o último dia (${ate}).`;
    return { tom: dias > 1 ? 'info' : 'alerta', texto, acao: ligada ? 'Cadastrar o cartão' : 'Ver como continuar' };
  }
  if (s.fase === 'carencia') {
    const ate = ultimoDia(s.ate, fuso);
    if (s.motivo === 'teste' && !ligada) {
      return { tom: 'alerta', texto: `O teste acabou. Fale com o suporte até ${ate} para o site continuar no ar.`, acao: 'Ver como continuar' };
    }
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
export function explicacaoDaSituacao(s: Situacao, fuso: string, agora: Date = new Date(), ligada = true): string {
  switch (s.fase) {
    case 'ativa':
      if (s.encerraEm) {
        return `Assinatura cancelada. O site e o painel funcionam até ${ultimoDia(s.encerraEm, fuso)}; depois disso, ` +
          'quem abrir o seu site vai ver que o agendamento online está temporariamente indisponível, com o seu ' +
          'WhatsApp para contato. Mudou de ideia? Reative antes disso e nada muda.';
      }
      return 'Assinatura em dia. O site e o painel estão funcionando normalmente.';
    case 'teste':
      return (diasAte(s.ate, fuso, agora) > 0
        ? `Você está no teste grátis, até ${ultimoDia(s.ate, fuso)}.`
        : `Hoje, ${ultimoDia(s.ate, fuso)}, é o último dia do seu teste grátis.`) +
        ' Até lá, nada é cobrado. ' + (ligada
          ? 'Para o site continuar no ar depois disso, cadastre o cartão antes do fim do teste.'
          : PELO_SUPORTE);
    case 'carencia':
      return (s.motivo === 'teste' ? 'O teste acabou' : 'A cobrança do cartão não passou') +
        `. O site continua no ar até ${ultimoDia(s.ate, fuso)}. Depois disso, quem abrir o seu site vai ver que ` +
        'o agendamento online está temporariamente indisponível, com o seu WhatsApp para contato.' +
        (s.motivo === 'teste' && !ligada ? ` ${PELO_SUPORTE}` : '');
    case 'suspensa':
      if (s.motivo === 'manual') {
        return 'A sua barbearia foi tirada do ar. Fale com o suporte para saber o motivo.';
      }
      if (s.motivo === 'cancelada') {
        return 'A assinatura foi cancelada' + (s.desde ? `, e desde ${diaDe(s.desde, fuso)}` : ', e agora') +
          ' quem abre o seu site vê que o agendamento online está temporariamente indisponível, com o seu ' +
          'WhatsApp para contato. Nada foi apagado: assinando de novo, o site volta na hora.';
      }
      return (s.motivo === 'teste' ? 'O teste acabou sem o cartão cadastrado' : 'A cobrança do cartão não passou') +
        (s.desde ? `, e desde ${diaDe(s.desde, fuso)}` : ', e agora') +
        ' quem abre o seu site vê que o agendamento online está temporariamente indisponível, com o seu ' +
        'WhatsApp para contato. ' + (s.motivo === 'teste' && !ligada
          ? 'Nada foi apagado: fale com o suporte pelo WhatsApp, e o site volta.'
          : 'Nada foi apagado: regularizou, o site volta na hora.');
    case 'cancelada':
      return 'Esta barbearia foi encerrada.';
  }
}
