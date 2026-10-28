/**
 * Até quando o link do cliente (`/a/<token>`) desmarca e remarca: até o horário começar.
 *
 * Até 18/10/2026 o link mexia em agendamento cuja hora já tinha passado, enquanto o
 * barbeiro não clicava "Concluir": o atendido ontem desmarcava hoje — o corte saía da
 * receita e o "Concluir" passava a dar erro —, e quem faltou remarcava sem contar a falta
 * (`docs/PENDENCIAS-ABERTAS.md` §2.55). Decisão do dono: depois que o horário começa, o
 * link só mostra; para mudar, fala com a barbearia. A tela, o desmarcar e o remarcar usam
 * esta mesma regra.
 */
export function horarioJaComecou(inicioIso: string, agora: Date = new Date()): boolean {
  const inicio = new Date(inicioIso).getTime();
  return !Number.isNaN(inicio) && inicio <= agora.getTime();
}

export const RECUSA_DEPOIS_DO_INICIO = 'Este horário já começou. Para desmarcar ou remarcar, fale com a barbearia.';
