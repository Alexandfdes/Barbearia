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

const NOMES_DOS_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "segunda e quarta", "todos os dias" — para o cliente, na ordem da semana. */
export function diasDoCombo(weekdays: number): string {
  const dias = NOMES_DOS_DIAS.filter((_, i) => weekdays & (1 << i));
  if (dias.length === 7) return 'todos os dias';
  if (dias.length <= 1) return dias[0] ?? '';
  return `${dias.slice(0, -1).join(', ')} e ${dias[dias.length - 1]}`;
}
