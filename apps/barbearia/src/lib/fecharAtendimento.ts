/**
 * Quando um atendimento pode ser fechado — como concluído ou como falta.
 *
 * Até 26/10/2026, as duas rotas aceitavam qualquer horário, inclusive um de
 * semana que vem: marcar "faltou" num horário futuro liberava a vaga para outro
 * cliente (a trava do banco ignora `no_show`), sem aviso ao cliente e sem volta.
 *
 * - **Falta:** só depois de o horário começar. Antes disso ninguém faltou ainda.
 * - **Concluído:** a partir de uma hora antes do início — o cliente que chega cedo
 *   e é atendido antes da hora é comum; o de amanhã, não.
 *
 * ⚠️ A conferência vai também no próprio UPDATE (`WHERE starts_at <= …`), não só
 * aqui: é o que impede dois pedidos ao mesmo tempo de fecharem o mesmo horário
 * duas vezes. Ver `tests/fechar-atendimento.test.ts`.
 */
export const ANTECEDENCIA_PARA_CONCLUIR_MS = 60 * 60 * 1000;

/** O instante (ISO, o formato de `starts_at`) até o qual um horário já pode ser concluído. */
export function limiteParaConcluir(agora: Date = new Date()): string {
  return new Date(agora.getTime() + ANTECEDENCIA_PARA_CONCLUIR_MS).toISOString();
}

/** O instante até o qual um horário já pode ser marcado como falta: o próprio agora. */
export function limiteParaFalta(agora: Date = new Date()): string {
  return agora.toISOString();
}

export const RECUSA_CONCLUIR_ANTES =
  'Este horário ainda não chegou. Dá para concluir a partir de uma hora antes do início.';
export const RECUSA_FALTA_ANTES =
  'Este horário ainda não começou — não dá para marcar falta antes da hora.';
