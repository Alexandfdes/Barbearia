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
 *   dono em 26/10/2026: o cliente atendido mais cedo se conclui na hora, e o tempo
 *   que sobrava fica livre (`janelaDoAtendimentoConcluido`). O de amanhã, não.
 *   *(Até a decisão, a regra era "uma hora antes do início".)*
 *
 * ⚠️ A conferência vai também no próprio UPDATE (`WHERE starts_at <= …`), não só
 * aqui: é o que impede dois pedidos ao mesmo tempo de fecharem o mesmo horário
 * duas vezes. Ver `tests/fechar-atendimento.test.ts`.
 */
/** O instante (ISO, o formato de `starts_at`) ANTES do qual um horário já pode ser concluído: a meia-noite que encerra o dia de hoje, no fuso da barbearia. */
export function limiteParaConcluir(fuso: string, agora: Date = new Date()): string {
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  return fromZonedTime(`${somarDias(hoje, 1)}T00:00:00`, fuso).toISOString();
}

/** O começo do dia de hoje, no fuso da barbearia. */
function inicioDeHoje(fuso: string, agora: Date): number {
  return fromZonedTime(`${formatInTimeZone(agora, fuso, 'yyyy-MM-dd')}T00:00:00`, fuso).getTime();
}

/**
 * Para onde vai o horário de um atendimento concluído ANTES do fim marcado — o tempo que
 * sobrava fica livre para outro cliente. `null` quando nada muda (concluído depois do fim).
 *
 * - Concluído no meio do horário: termina agora.
 * - Concluído antes de o horário começar (o cliente veio mais cedo): o atendimento passa
 *   a ser a duração dele terminando agora — é quando de fato aconteceu —, sem cair no
 *   dia anterior.
 *
 * ⚠️ O horário novo pode cruzar com outro agendamento do barbeiro (ele atendeu dois
 * clientes ao mesmo tempo, ou o anterior foi concluído tarde). Quem grava tenta e, se o
 * banco recusar, fica com o horário marcado: o atendimento é concluído do mesmo jeito,
 * só a vaga não abre.
 */
export function janelaDoAtendimentoConcluido(
  atendimento: { startsAt: string; endsAt: string; durationMinutes: number },
  fuso: string,
  agora: Date = new Date(),
): { startsAt: string; endsAt: string } | null {
  const inicio = Date.parse(atendimento.startsAt);
  const fim = Date.parse(atendimento.endsAt);
  const t = agora.getTime();
  if (t >= fim) return null;
  if (t > inicio) return { startsAt: atendimento.startsAt, endsAt: agora.toISOString() };
  const novoInicio = Math.max(t - atendimento.durationMinutes * 60_000, inicioDeHoje(fuso, agora));
  if (novoInicio >= t) return null;
  return { startsAt: new Date(novoInicio).toISOString(), endsAt: agora.toISOString() };
}

/** O instante até o qual um horário já pode ser marcado como falta: o próprio agora. */
export function limiteParaFalta(agora: Date = new Date()): string {
  return agora.toISOString();
}

export const RECUSA_CONCLUIR_ANTES =
  'Este horário é de outro dia. Dá para concluir só os de hoje.';
export const RECUSA_FALTA_ANTES =
  'Este horário ainda não começou — não dá para marcar falta antes da hora.';
