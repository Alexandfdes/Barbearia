/**
 * O painel do operador — como as telas dizem as coisas: o relógio dele, o dinheiro,
 * as cores de cada fase e o nome de cada evento da Asaas. Não toca o banco.
 *
 * Quem entra: `lib/operador.ts`. O que as telas mostram: `lib/operadorBarbearias.ts`
 * (as barbearias, a ficha, o registro), `lib/operadorNumeros.ts` (o Início e a
 * Cobrança) e `lib/operadorSistema.ts`.
 *
 * ── DOIS RELÓGIOS NA MESMA TELA ──────────────────────────────────────────────
 *
 * O que é DA BARBEARIA — o fim do teste, a carência, o dia do último agendamento
 * — sai no fuso dela (`fusoDe`), como em todo o produto (regra 5 do `CLAUDE.md`).
 * O que é DO OPERADOR — quando ele entrou, quando o evento da Asaas chegou, o mês
 * da receita — sai no relógio dele, que não é de barbearia nenhuma: o padrão do
 * produto, o de Mossoró. É a única razão de `TZ_PADRAO` aparecer aqui
 * (`tests/timezone-unico.test.ts`, lista fechada).
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TZ_PADRAO } from './timezone.js';
import { somarDias } from './situacao.js';
import type { Tom } from './operadorBarbearias.js';

/** O relógio do operador. */
export const RELOGIO_DO_OPERADOR = TZ_PADRAO;

/** "12/10 14:05", no relógio do operador. */
export function quando(d: Date | null | undefined): string {
  return d ? formatInTimeZone(d, RELOGIO_DO_OPERADOR, 'dd/MM HH:mm') : '—';
}

/** "12/10/2026 14:05", no relógio do operador — para o que pode ser de outro ano. */
export function quandoComAno(d: Date | null | undefined): string {
  return d ? formatInTimeZone(d, RELOGIO_DO_OPERADOR, 'dd/MM/yyyy HH:mm') : '—';
}

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.234,00". */
export function dinheiro(reais: number): string {
  return REAIS.format(reais);
}

/** A meia-noite que começou o mês de `agora`, no relógio do operador. */
export function inicioDoMes(agora: Date): Date {
  return fromZonedTime(`${formatInTimeZone(agora, RELOGIO_DO_OPERADOR, 'yyyy-MM')}-01T00:00:00`, RELOGIO_DO_OPERADOR);
}

/** "outubro de 2026" — o mês de `agora`, no relógio do operador. */
export function nomeDoMes(agora: Date): string {
  const mes = Number(formatInTimeZone(agora, RELOGIO_DO_OPERADOR, 'M'));
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${nomes[mes - 1]} de ${formatInTimeZone(agora, RELOGIO_DO_OPERADOR, 'yyyy')}`;
}

export interface Semana {
  /** A segunda-feira que abre a semana, à meia-noite no relógio do operador. */
  inicio: Date;
  /** "06/10" — o rótulo da barra. */
  rotulo: string;
}

/**
 * As `quantas` últimas semanas, de segunda a domingo no relógio do operador — a
 * mais antiga primeiro; a última é a de `agora`.
 *
 * A conta é de DIA, não de hora: as datas saem de `somarDias` (`lib/situacao.ts`),
 * a meia-noite de cada segunda de `fromZonedTime`, e nunca de somar 7 × 24 h a um
 * instante (regra 5 do `CLAUDE.md`).
 */
export function ultimasSemanas(agora: Date, quantas: number): Semana[] {
  const hoje = formatInTimeZone(agora, RELOGIO_DO_OPERADOR, 'yyyy-MM-dd');
  // ISO: 1 = segunda … 7 = domingo.
  const diaDaSemana = Number(formatInTimeZone(agora, RELOGIO_DO_OPERADOR, 'i'));
  const segunda = somarDias(hoje, 1 - diaDaSemana);
  const semanas: Semana[] = [];
  for (let i = quantas - 1; i >= 0; i--) {
    const dia = somarDias(segunda, -7 * i);
    semanas.push({ inicio: fromZonedTime(`${dia}T00:00:00`, RELOGIO_DO_OPERADOR), rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}` });
  }
  return semanas;
}

// ── As cores ────────────────────────────────────────────────────────────────

/** A pílula de cada fase — os mesmos tons da lista de antes (11/10/2026). */
export const PILULA: Record<Tom, string> = {
  'em-dia': 'bg-emerald-50 text-emerald-900 ring-emerald-600/25',
  teste: 'bg-sky-50 text-sky-900 ring-sky-600/25',
  atencao: 'bg-amber-50 text-amber-950 ring-amber-600/30',
  fora: 'bg-red-50 text-red-900 ring-red-600/25',
  encerrada: 'bg-slate-100 text-slate-700 ring-slate-500/25',
};

/** O ponto de cada estado na tela de Sistema. */
export type Estado = 'ok' | 'atencao' | 'problema' | 'neutro';

export const PONTO: Record<Estado, string> = {
  ok: 'bg-emerald-500',
  atencao: 'bg-amber-500',
  problema: 'bg-red-600',
  neutro: 'bg-slate-400',
};

// ── Os eventos da Asaas ─────────────────────────────────────────────────────

export type GrupoDeEvento = 'pagamentos' | 'assinaturas' | 'checkout' | 'outros';

/** O nome de cada evento, em português. O código original vai ao lado, na tela. */
export function rotuloDoEvento(evento: string): string {
  return ({
    CHECKOUT_PAID: 'Cartão cadastrado',
    CHECKOUT_CANCELED: 'Checkout cancelado',
    CHECKOUT_EXPIRED: 'Checkout expirou',
    SUBSCRIPTION_CREATED: 'Assinatura criada',
    SUBSCRIPTION_UPDATED: 'Assinatura alterada',
    SUBSCRIPTION_DELETED: 'Assinatura removida',
    SUBSCRIPTION_INACTIVATED: 'Assinatura inativada',
    PAYMENT_CREATED: 'Cobrança criada',
    PAYMENT_CONFIRMED: 'Pagamento confirmado',
    PAYMENT_RECEIVED: 'Pagamento recebido',
    PAYMENT_OVERDUE: 'Cobrança vencida',
    PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'Cartão recusado',
    PAYMENT_REFUNDED: 'Estorno',
    PAYMENT_CHARGEBACK_REQUESTED: 'Contestação',
    PAYMENT_DELETED: 'Cobrança removida',
  } as Record<string, string>)[evento] ?? evento;
}

export function grupoDoEvento(evento: string): GrupoDeEvento {
  if (evento.startsWith('PAYMENT_')) return 'pagamentos';
  if (evento.startsWith('SUBSCRIPTION_')) return 'assinaturas';
  if (evento.startsWith('CHECKOUT_')) return 'checkout';
  return 'outros';
}

/** "cartão", "Pix", "boleto" — o meio de pagamento que a Asaas manda. */
export function meioDePagamento(billingType: string | null): string | null {
  if (!billingType) return null;
  return ({ CREDIT_CARD: 'cartão', PIX: 'Pix', BOLETO: 'boleto', UNDEFINED: 'a escolher' } as Record<string, string>)[billingType] ?? billingType;
}

/** "1,2 MB" — o tamanho de um arquivo. Não é dinheiro: aqui arredondar é o certo. */
export function tamanhoDeArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(Math.round((kb / 1024) * 10) / 10).toLocaleString('pt-BR')} MB`;
}

/** "há 3 horas", "há 2 dias" — quanto tempo faz, para o backup e o processo. */
export function haQuanto(d: Date, agora: Date = new Date()): string {
  const min = Math.max(0, Math.round((agora.getTime() - d.getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dias`;
}
