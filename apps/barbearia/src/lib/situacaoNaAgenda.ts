/**
 * Como a linha da agenda do dia mostra a situação de um atendimento: a cor da borda, o
 * rótulo e a cor dele, e se a linha fica apagada.
 *
 * O servidor monta a linha com isto (`components/admin/AgendaLista.astro`), e o navegador a
 * refaz com isto quando o atendimento é concluído, cancelado ou marcado como falta, sem
 * recarregar (`pages/admin/dia/[date].astro`). Até 15/10/2026 cada lado tinha a sua cópia, e
 * a do navegador não trocava a borda nem a cor da hora: o atendimento atrasado, depois de
 * concluído, continuava com a borda vermelha do "Atrasado" até alguém recarregar a página
 * (`docs/PENDENCIAS-ABERTAS.md` §2.43).
 *
 * Roda no servidor e no navegador — não importe nada de servidor aqui.
 */
export interface AparenciaDaSituacao {
  borda: string;
  rotulo: string;
  classe: string;
}

export function aparenciaDaSituacao(status: string, atrasado = false): AparenciaDaSituacao {
  if (atrasado && status === 'confirmed') return { borda: 'border-l-red-500', rotulo: 'Atrasado', classe: 'text-red-600' };
  if (status === 'completed') return { borda: 'border-l-teal-light', rotulo: '✓ Concluído', classe: 'text-teal/80' };
  if (status === 'cancelled') return { borda: 'border-l-red-500/60', rotulo: '✕ Cancelado', classe: 'text-red-600/80' };
  if (status === 'no_show') return { borda: 'border-l-amber-500/70', rotulo: '✗ No-show', classe: 'text-amber-600/80' };
  return { borda: 'border-l-teal', rotulo: '', classe: '' };
}

/** Todas as bordas acima: o navegador tira a antiga antes de pôr a nova. */
export const BORDAS_DA_SITUACAO = [
  'border-l-red-500', 'border-l-teal-light', 'border-l-red-500/60', 'border-l-amber-500/70', 'border-l-teal',
] as const;

/** O atendimento que já se resolveu — concluído, cancelado ou falta — fica com a linha apagada. */
export function linhaApagada(status: string): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'no_show';
}

/**
 * O nome RISCADO é só do que não aconteceu — cancelado ou falta. Decisão do dono em
 * 26/10/2026: o concluído riscado parecia desmarcado para quem bate o olho; ele fica só
 * mais claro, com o "✓ Concluído" ao lado.
 */
export function nomeRiscado(status: string): boolean {
  return status === 'cancelled' || status === 'no_show';
}
