/**
 * O combo do dia: um serviço e um produto, com o desconto que o dono escolhe no
 * painel, nos dias da semana que ele marca.
 *
 * Funções puras, sem dependência de Node: o script do `/agendar` importa este
 * arquivo, e o servidor confere com as mesmas regras.
 *
 * ⚠️ Até 09/10/2026 este arquivo era a configuração do "Combo Boris" do Bayron —
 * 10% fixo e três serviços dele pelo slug —, que nada mais usava desde que o combo
 * passou a ser cadastrado no painel. Saiu.
 */
import { diaDaSemana } from './calendario.js';

export interface ComboProduct {
  slug: string;
  name: string;
  priceCents: number;
}

/** Aplica um desconto percentual (0–100) a um valor em centavos (arredonda pro centavo). */
export function applyDiscountPct(cents: number, pct: number): number {
  return Math.round(cents * (1 - pct / 100));
}

/**
 * O combo vale no dia do atendimento? `weekdays` é o que o painel grava: bit i =
 * dia da semana i (0 = domingo … 6 = sábado), 127 = todos os dias.
 *
 * ⚠️ O dia que conta é o do HORÁRIO marcado, na barbearia — não o dia em que o
 * cliente agenda. "Combo de segunda" é desconto para encher a segunda: quem abre o
 * link numa sexta pode marcar para segunda, e não para sexta
 * (`PENDENCIAS-ABERTAS.md` §2.16). `data` é 'YYYY-MM-DD', já no fuso da barbearia.
 */
export function comboValeNaData(weekdays: number, data: string): boolean {
  return (weekdays & (1 << diaDaSemana(data))) !== 0;
}

/** O preço do combo com um desconto: o serviço e o produto, cada um arredondado — como o agendamento grava. */
export function precoDoCombo(servicoCents: number, produtoCents: number, pct: number): number {
  return applyDiscountPct(servicoCents, pct) + applyDiscountPct(produtoCents, pct);
}

/**
 * Uma promoção ativa do combo, como o site e o agendamento a veem (`lib/promocoesDaBarbearia.ts`):
 * o dia da semana e a faixa de horário, em minutos desde a meia-noite NO FUSO DA BARBEARIA.
 */
export interface PromocaoNoHorario {
  id: number;
  diaDaSemana: number;
  inicioMin: number;
  fimMin: number;
  descontoPct: number;
}

/** "14:30" → 870. */
export function minutosDoHorario(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * A promoção que vale no horário — o de maior desconto, se mais de uma cobrir —, ou `null`.
 * `data` é 'YYYY-MM-DD' e `hhmm` é 'HH:mm', os dois já no fuso da barbearia (o que
 * `/api/slots` devolve). Vale pelo INÍCIO do atendimento: começou dentro da faixa, vale.
 */
export function promocaoDoHorario<T extends Omit<PromocaoNoHorario, 'id'>>(
  promocoes: readonly T[], data: string, hhmm: string,
): T | null {
  const dia = diaDaSemana(data);
  const min = minutosDoHorario(hhmm);
  let melhor: T | null = null;
  for (const p of promocoes) {
    if (p.diaDaSemana !== dia || min < p.inicioMin || min >= p.fimMin) continue;
    if (!melhor || p.descontoPct > melhor.descontoPct) melhor = p;
  }
  return melhor;
}

/**
 * O desconto que vale no horário. O do combo e o da promoção NÃO se somam: vale o maior
 * (decisão do dono, padrão do pedido de 17/11/2026 — `docs/PENDENCIAS-ABERTAS.md` §2.72).
 */
export function descontoNoHorario(
  comboPct: number, promocoes: readonly Omit<PromocaoNoHorario, 'id'>[], data: string, hhmm: string,
): number {
  const p = promocaoDoHorario(promocoes, data, hhmm);
  return p && p.descontoPct > comboPct ? p.descontoPct : comboPct;
}

/** "13h às 17h", "9h30 às 13h" — a faixa para gente ler. */
export function rotuloDaFaixa(inicioMin: number, fimMin: number): string {
  const hora = (m: number) => {
    const resto = m % 60;
    const h = (m - resto) / 60;
    return resto ? `${h}h${String(resto).padStart(2, '0')}` : `${h}h`;
  };
  return `${hora(inicioMin)} às ${hora(fimMin)}`;
}

/** "terça", "sábado". */
export function nomeDoDia(dia: number): string {
  return NOMES_DOS_DIAS[dia] ?? '';
}

const NOMES_DOS_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "segunda e quarta", "todos os dias" — para o cliente, na ordem da semana. */
export function diasDoCombo(weekdays: number): string {
  const dias = NOMES_DOS_DIAS.filter((_, i) => weekdays & (1 << i));
  if (dias.length === 7) return 'todos os dias';
  if (dias.length <= 1) return dias[0] ?? '';
  return `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`;
}
