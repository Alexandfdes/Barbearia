import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { somarDias } from './calendario.js';

/**
 * Quando um atendimento pode ser fechado — como concluído ou como falta.
 *
 * Até 26/10/2026, as duas rotas aceitavam qualquer horário, inclusive um de
 * semana que vem: marcar "faltou" num horário futuro liberava a vaga para outro
 * cliente (a trava do banco ignora `no_show`), sem aviso ao cliente e sem volta.
 *
 * - **Falta:** só depois de o horário começar. Antes disso ninguém faltou ainda.
 * - **Concluído:** em qualquer hora do MESMO DIA, no fuso da barbearia — decidido pelo
 *   dono em 26/10/2026: o cliente atendido mais cedo se conclui na hora. O de amanhã, não.
 * - **O horário NUNCA muda ao concluir**, também decisão do dono no mesmo dia: o
 *   agendamento fica concluído no horário que foi MARCADO, e a vaga continua ocupada —
 *   o site não a oferece a mais ninguém. *(Uma versão do mesmo dia movia o horário para
 *   quando o atendimento aconteceu e liberava o resto; rejeitada.)*
 *
 * ⚠️ A conferência vai também no próprio UPDATE (`WHERE starts_at <= …`), não só
 * aqui: é o que impede dois pedidos ao mesmo tempo de fecharem o mesmo horário
 * duas vezes. Ver `tests/painel-fechar-e-propagar.test.ts`.
 */
/** O instante (ISO, o formato de `starts_at`) ANTES do qual um horário já pode ser concluído: a meia-noite que encerra o dia de hoje, no fuso da barbearia. */
export function limiteParaConcluir(fuso: string, agora: Date = new Date()): string {
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  return fromZonedTime(`${somarDias(hoje, 1)}T00:00:00`, fuso).toISOString();
}

/** O instante até o qual um horário já pode ser marcado como falta: o próprio agora. */
export function limiteParaFalta(agora: Date = new Date()): string {
  return agora.toISOString();
}

export const RECUSA_CONCLUIR_ANTES =
  'Este horário é de outro dia. Dá para concluir só os de hoje.';
export const RECUSA_FALTA_ANTES =
  'Este horário ainda não começou — não dá para marcar falta antes da hora.';
