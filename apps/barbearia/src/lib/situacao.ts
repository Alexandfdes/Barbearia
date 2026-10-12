/**
 * Em que fase a barbearia está AGORA: no teste, pagando, na carência, fora do ar.
 *
 * Decisões do dono em 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13):
 *
 *  - **7 dias de teste**, até o FIM do 7º dia depois do cadastro, no fuso da
 *    barbearia. Cadastrou no dia 8, a qualquer hora: teste até o fim do dia 15.
 *    Data redonda de propósito — é o que a tela e o aviso conseguem dizer.
 *  - **O cartão é pedido no fim do teste**, não no cadastro.
 *  - **Não pagou** — no fim do teste ou numa cobrança que falhou —: **3 dias
 *    inteiros de carência**, com o site no ar e o painel avisando.
 *  - **Depois, fora do ar:** o site mostra "temporariamente indisponível" com o
 *    WhatsApp da barbearia, sem falar em dívida; o painel abre só a tela de
 *    assinatura, com a agenda para consulta. Nada é apagado; pagou, volta.
 *  - **Cancelou** (10/10/2026, `lib/cobranca.ts`): no ar até o fim do período
 *    pago, e fora do ar depois — sem carência, porque foi escolha dele. Assinando
 *    de novo, volta.
 *
 * ⚠️ A FASE É CALCULADA, NÃO GRAVADA. O banco guarda o começo de cada prazo
 * (`trial_ends_at`, `past_due_since`), e a fase sai daqui, a cada requisição —
 * não existe tarefa agendada mudando status à meia-noite. O porquê está no
 * cabeçalho da migration 0007.
 *
 * ⚠️ Fuso nunca é conta: dia vira instante por `fromZonedTime`, com o fuso DA
 * BARBEARIA (regra 5 do `CLAUDE.md`). Desde 12/10/2026 nenhuma função daqui tem
 * fuso padrão: o fim do teste em Manaus é uma hora depois do de Fortaleza, e um
 * padrão calado erraria o prazo de uma das duas (`lib/timezone.ts`).
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { fusoDe } from './timezone.js';

export const DIAS_DE_TESTE = 7;
export const DIAS_DE_CARENCIA = 3;

export type StatusDaBarbearia = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

/** O que a regra precisa saber da barbearia — a linha de `tenants`, em resumo. */
export interface ComPrazos {
  status: StatusDaBarbearia;
  /** `trial_ends_at`. */
  testeAte?: Date | null;
  /** `past_due_since`. */
  atrasadaDesde?: Date | null;
  /** `subscription_ends_at`: assinatura cancelada, no ar até aqui. */
  encerraEm?: Date | null;
  /** O fuso da barbearia (`tenants.timezone`): a carência acaba na meia-noite DELA. */
  fuso: string;
}

export type Situacao =
  | { fase: 'ativa'; encerraEm?: Date }
  | { fase: 'teste'; ate: Date }
  | { fase: 'carencia'; motivo: 'teste' | 'cobranca'; ate: Date }
  | { fase: 'suspensa'; motivo: 'teste' | 'cobranca' | 'cancelada' | 'manual'; desde: Date | null }
  | { fase: 'cancelada' };

export function situacaoDe(t: ComPrazos, agora: Date = new Date()): Situacao {
  const ms = agora.getTime();
  switch (t.status) {
    case 'active':
      // Cancelou: no ar até o fim do período pago. A assinatura já não existe na
      // Asaas — nada vai marcar a falta de pagamento —, então a saída é pelo relógio.
      if (t.encerraEm) {
        if (ms < t.encerraEm.getTime()) return { fase: 'ativa', encerraEm: t.encerraEm };
        return { fase: 'suspensa', motivo: 'cancelada', desde: t.encerraEm };
      }
      return { fase: 'ativa' };

    case 'trial': {
      // Teste sem fim seria teste para sempre. A migration 0007 impede no banco;
      // se mesmo assim chegar aqui, fora do ar — o erro que aparece, não o que
      // dá o produto de graça em silêncio.
      if (!t.testeAte) return { fase: 'suspensa', motivo: 'teste', desde: null };
      if (ms < t.testeAte.getTime()) return { fase: 'teste', ate: t.testeAte };
      const fim = fimDaCarencia(t.testeAte, fusoDe(t));
      if (ms < fim.getTime()) return { fase: 'carencia', motivo: 'teste', ate: fim };
      return { fase: 'suspensa', motivo: 'teste', desde: fim };
    }

    case 'past_due': {
      if (!t.atrasadaDesde) return { fase: 'suspensa', motivo: 'cobranca', desde: null };
      const fim = fimDaCarencia(t.atrasadaDesde, fusoDe(t));
      if (ms < fim.getTime()) return { fase: 'carencia', motivo: 'cobranca', ate: fim };
      return { fase: 'suspensa', motivo: 'cobranca', desde: fim };
    }

    case 'suspended':
      return { fase: 'suspensa', motivo: 'manual', desde: null };

    case 'cancelled':
      return { fase: 'cancelada' };

    default:
      // Status que esta versão não conhece: fora do ar, pelo mesmo motivo acima.
      return { fase: 'suspensa', motivo: 'manual', desde: null };
  }
}

/** No ar: o site atende e o painel abre inteiro. Teste e carência contam. */
export function noAr(s: Situacao): boolean {
  return s.fase === 'ativa' || s.fase === 'teste' || s.fase === 'carencia';
}

/**
 * O fim do teste de quem se cadastra em `cadastro`: a meia-noite que começa o 8º
 * dia, no fuso — ou seja, o teste vale até o fim do 7º dia depois do cadastro.
 */
export function fimDoTeste(cadastro: Date, fuso: string): Date {
  const dia = formatInTimeZone(cadastro, fuso, 'yyyy-MM-dd');
  return fromZonedTime(`${somarDias(dia, DIAS_DE_TESTE + 1)}T00:00:00`, fuso);
}

/**
 * O fim do teste estendido pelo operador em `dias` (`lib/operadorBarbearias.ts`):
 * `dias` a mais depois do último dia do teste — ou depois de HOJE, se ele já
 * acabou. Teste até o dia 15 estendido em 7: até o dia 22. Teste vencido, dia 11,
 * estendido em 7: até o dia 18 — o mesmo que um cadastro feito hoje ganharia.
 *
 * Uma meia-noite no fuso, como `fimDoTeste`: a tela continua dizendo "até 18/10".
 */
export function fimDoTesteEstendido(
  fimAtual: Date | null | undefined, dias: number, fuso: string, agora: Date = new Date(),
): Date {
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  const ultimo = fimAtual ? ultimoDia(fimAtual, fuso, 'yyyy-MM-dd') : hoje;
  // Datas "aaaa-mm-dd" comparam como texto.
  const base = ultimo > hoje ? ultimo : hoje;
  return fromZonedTime(`${somarDias(base, dias + 1)}T00:00:00`, fuso);
}

/**
 * O fim da carência que começa em `inicio`: três dias INTEIROS depois do dia em
 * que o prazo venceu. Vencido à meia-noite — o caso do teste —, o próprio dia já
 * é o primeiro dos três; vencido no meio do dia — a cobrança que falhou às
 * 10:37 —, o resto daquele dia não conta.
 */
export function fimDaCarencia(inicio: Date, fuso: string): Date {
  const dia = formatInTimeZone(inicio, fuso, 'yyyy-MM-dd');
  const meiaNoite = fromZonedTime(`${dia}T00:00:00`, fuso);
  const resto = inicio.getTime() === meiaNoite.getTime() ? 0 : 1;
  return fromZonedTime(`${somarDias(dia, DIAS_DE_CARENCIA + resto)}T00:00:00`, fuso);
}

/**
 * O último dia de um prazo que termina em `fim`, como a tela diz: "até 15/10".
 * `fim` é sempre uma meia-noite, que já é o dia SEGUINTE — por isso o milissegundo
 * antes.
 */
export function ultimoDia(fim: Date, fuso: string, formato = 'dd/MM'): string {
  return formatInTimeZone(new Date(fim.getTime() - 1), fuso, formato);
}

/** O dia de um instante, no fuso: "desde 19/10". */
export function diaDe(instante: Date, fuso: string, formato = 'dd/MM'): string {
  return formatInTimeZone(instante, fuso, formato);
}

/**
 * Quantos dias faltam até o último dia do prazo, contados no calendário do fuso:
 * 7 no dia do cadastro, 1 na véspera, 0 no último dia.
 */
export function diasAte(fim: Date, fuso: string, agora: Date = new Date()): number {
  const ultimo = ultimoDia(fim, fuso, 'yyyy-MM-dd');
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  return Math.round((meioDia(ultimo) - meioDia(hoje)) / (24 * 60 * 60 * 1000));
}

/** Soma dias a uma data de calendário ("2026-10-08" + 8 = "2026-10-16"). */
function somarDias(dia: string, n: number): string {
  const d = new Date(meioDia(dia));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Uma data de calendário como número, ao meio-dia de Greenwich: nenhuma conta de
 * dia inteiro cruza a virada, e o fuso de quem roda o processo não entra.
 */
function meioDia(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getTime();
}
