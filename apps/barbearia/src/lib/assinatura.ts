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

/**
 * Quantas horas, depois da volta do Checkout com o cartão, o painel espera a confirmação do webhook
 * sem pedir o cartão de novo (decisão do dono em 25/11/2026). Com a fila do webhook parada — no
 * sandbox, em 23/11/2026, ela parou com 2 falhas —, a confirmação atrasa, e saindo da tela de
 * assinatura o painel, a faixa e os e-mails voltavam a pedir o cartão: cadastrar de novo criava uma
 * SEGUNDA assinatura (`docs/PENDENCIAS-ABERTAS.md` §4.14).
 */
export const HORAS_ESPERANDO_A_CONFIRMACAO = 48;

/**
 * Onde está a volta do Checkout que o webhook não confirmou (`tenants.cartao_voltou_em`, migration
 * 0023): `esperando`, nas primeiras `HORAS_ESPERANDO_A_CONFIRMACAO` — o painel não pede o cartão, os
 * e-mails não saem e o Checkout não abre —; `demorou`, depois delas — o cartão volta a ser pedido,
 * com o aviso de falar com o suporte antes; `null`, sem volta guardada, ou com a barbearia em dia.
 *
 * Não muda a fase: quem decide se o site fica no ar continua sendo o webhook (`lib/situacao.ts`).
 */
export type EsperaDoCartao = 'esperando' | 'demorou' | null;

export function esperaDoCartao(voltouEm: Date | null | undefined, s: Situacao, agora: Date): EsperaDoCartao {
  if (!voltouEm) return null;
  // Em dia, a confirmação chegou — por qualquer caminho. Encerrada ou tirada do ar à mão, o cartão
  // não se cadastra pelo painel (`podeCadastrarCartao`): não há o que esperar.
  if (s.fase === 'ativa' && !s.encerraEm) return null;
  if (s.fase === 'cancelada' || (s.fase === 'suspensa' && s.motivo === 'manual')) return null;
  return agora.getTime() - voltouEm.getTime() < HORAS_ESPERANDO_A_CONFIRMACAO * 60 * 60 * 1000 ? 'esperando' : 'demorou';
}

/** Até quando a volta do cartão espera a confirmação — o que a tela promete ao dono. */
export function fimDaEsperaDoCartao(voltouEm: Date): Date {
  return new Date(voltouEm.getTime() + HORAS_ESPERANDO_A_CONFIRMACAO * 60 * 60 * 1000);
}

/**
 * O dia em que o site sai do ar se a confirmação nunca chegar: o fim da carência, ou o fim do período
 * de quem cancelou. `null` no teste — depois dele ainda vem a carência — e fora do ar.
 */
export function saidaDoAr(s: Situacao): Date | null {
  if (s.fase === 'carencia') return s.ate;
  if (s.fase === 'ativa' && s.encerraEm) return s.encerraEm;
  return null;
}

/**
 * Até quando falar com o suporte, se a confirmação não chegar: o fim da espera, ou antes, o dia em
 * que o site sai do ar. Prometer as 48 horas a quem sai do ar amanhã deixava o site cair antes do
 * prazo dito (revisão de 25/11/2026).
 */
export function limiteParaOSuporte(voltouEm: Date, s: Situacao): Date {
  const fim = fimDaEsperaDoCartao(voltouEm);
  const sai = saidaDoAr(s);
  return sai && sai.getTime() < fim.getTime() ? sai : fim;
}

/** O que a faixa e a tela dizem enquanto a confirmação do cartão não chega. */
export const CARTAO_RECEBIDO = 'Recebemos o seu cartão, e a confirmação da Asaas está atrasada: não precisa cadastrar de novo.';

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
 *
 * `cartao`: a volta do Checkout que o webhook ainda não confirmou (`esperaDoCartao`). Esperando, a
 * faixa diz que o cartão chegou, em vez de pedi-lo de novo (25/11/2026).
 */
export function avisoDoPainel(
  s: Situacao, fuso: string, agora: Date = new Date(), ligada = true, cartao: EsperaDoCartao = null,
): AvisoDoPainel | null {
  if (cartao === 'esperando' && (s.fase === 'teste' || s.fase === 'carencia' || (s.fase === 'ativa' && s.encerraEm))) {
    // Com o site saindo do ar num dia marcado, a faixa não pode esconder a data (revisão de 25/11/2026).
    const sai = saidaDoAr(s);
    return sai
      ? { tom: 'alerta', acao: 'Ver a assinatura',
          texto: `${CARTAO_RECEBIDO} O site fica no ar até ${ultimoDia(sai, fuso)}: se a confirmação não chegar antes, fale com o suporte.` }
      : { tom: 'info', texto: CARTAO_RECEBIDO, acao: 'Ver a assinatura' };
  }
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
 *
 * `cartao`: esperando a confirmação do cartão que voltou do Checkout, o parágrafo não manda
 * cadastrar nem reativar — o botão sumiu, e a tela diz logo abaixo que não precisa (25/11/2026).
 */
export function explicacaoDaSituacao(
  s: Situacao, fuso: string, agora: Date = new Date(), ligada = true, cartao: EsperaDoCartao = null,
): string {
  const esperando = cartao === 'esperando';
  switch (s.fase) {
    case 'ativa':
      if (s.encerraEm) {
        return `Assinatura cancelada. O site e o painel funcionam até ${ultimoDia(s.encerraEm, fuso)}; depois disso, ` +
          'quem abrir o seu site vai ver que o agendamento online está temporariamente indisponível, com o seu ' +
          'WhatsApp para contato.' + (esperando ? '' : ' Mudou de ideia? Reative antes disso e o site segue sem interrupção.');
      }
      return 'Assinatura em dia. O site e o painel estão funcionando normalmente.';
    case 'teste':
      return (diasAte(s.ate, fuso, agora) > 0
        ? `Você está no teste grátis, até ${ultimoDia(s.ate, fuso)}.`
        : `Hoje, ${ultimoDia(s.ate, fuso)}, é o último dia do seu teste grátis.`) +
        ' Até lá, nada é cobrado.' + (esperando ? ''
          : ligada ? ' Para o site continuar no ar depois disso, cadastre o cartão antes do fim do teste.'
          : ` ${PELO_SUPORTE}`);
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
          'WhatsApp para contato. Nada foi apagado: ' + (esperando
            ? 'quando a confirmação do cartão chegar, o site volta na hora.' : 'assinando de novo, o site volta na hora.');
      }
      return (s.motivo === 'teste' ? (esperando ? 'O teste acabou' : 'O teste acabou sem o cartão cadastrado') : 'A cobrança do cartão não passou') +
        (s.desde ? `, e desde ${diaDe(s.desde, fuso)}` : ', e agora') +
        ' quem abre o seu site vê que o agendamento online está temporariamente indisponível, com o seu ' +
        'WhatsApp para contato. ' + (esperando ? 'Nada foi apagado: quando a confirmação do cartão chegar, o site volta na hora.'
          : s.motivo === 'teste' && !ligada
          ? 'Nada foi apagado: fale com o suporte pelo WhatsApp, e o site volta.'
          : 'Nada foi apagado: regularizou, o site volta na hora.');
    case 'cancelada':
      return 'Esta barbearia foi encerrada.';
  }
}
