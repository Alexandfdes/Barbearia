/**
 * Quanto vale um atendimento: o número da linha na agenda do dia, o "Valor" do detalhe,
 * o histórico da ficha do cliente — e a receita, que é a soma deles.
 *
 * ── POR QUE ───────────────────────────────────────────────────────────────────
 *
 * Até 15/10/2026 cada tela fazia a sua conta. A agenda do dia somava na receita os extras
 * da comanda — o que o barbeiro lança ao fechar o atendimento —, mas a linha do
 * atendimento continuava com o preço do serviço agendado: o corte de R$ 50 fechado com
 * mais R$ 30 aparecia "R$ 50", e a receita do topo ficava R$ 30 acima da soma das linhas.
 * E o "Receita prevista" do Início não somava extra nenhum, nem venda avulsa: o mesmo nome
 * da agenda, outro número (`docs/PENDENCIAS-ABERTAS.md` §2.43).
 *
 * ── A REGRA ───────────────────────────────────────────────────────────────────
 *
 * - Concluído: o serviço e os itens da comanda — os extras do fechamento e o produto do
 *   combo.
 * - Confirmado: o serviço. O produto do combo já nasce como item, no agendamento, mas só
 *   conta quando o atendimento é concluído — a regra do relatório do mês
 *   (`pages/admin/relatorios.astro`).
 * - Cancelado e não compareceu: fora da receita. A linha mostra o preço do serviço,
 *   apagada.
 *
 * A receita de um período é a soma dos confirmados e dos concluídos, mais a venda avulsa
 * de produto. O Início faz a conta com o que `lib/receita.ts` traz do banco.
 *
 * Para o CLIENTE a conta é outra — `totalParaOCliente`, no fim deste arquivo.
 *
 * Roda no servidor e no navegador — não importe nada de servidor aqui.
 */

/** O mínimo de um atendimento para saber quanto ele vale. */
export interface ParaOValor {
  status: string;
  /** O preço do serviço agendado, gravado no agendamento. */
  priceCents: number;
  /** A soma dos itens da comanda dele (`appointment_items`). */
  itemsCents: number;
}

/** Entra na receita: o confirmado, que vai acontecer, e o concluído, que aconteceu. */
export function contaNaReceita(status: string): boolean {
  return status === 'confirmed' || status === 'completed';
}

/** Os itens da comanda entram no valor só quando o atendimento foi concluído. */
export function itensContam(status: string): boolean {
  return status === 'completed';
}

export function valorDoAtendimento(a: ParaOValor): number {
  return a.priceCents + (itensContam(a.status) ? a.itemsCents : 0);
}

export function somaDosItens(itens: readonly { priceCents: number }[]): number {
  return itens.reduce((soma, item) => soma + item.priceCents, 0);
}

/** A receita: o valor de cada atendimento que conta, mais a venda avulsa de produto. */
export function receitaDe(
  atendimentos: readonly ParaOValor[],
  vendaAvulsaCents: number,
): { centavos: number; considerados: number } {
  let centavos = vendaAvulsaCents;
  let considerados = 0;
  for (const a of atendimentos) {
    if (!contaNaReceita(a.status)) continue;
    centavos += valorDoAtendimento(a);
    considerados++;
  }
  return { centavos, considerados };
}

/**
 * O que o cliente paga — ou pagou: o serviço e todos os itens, o produto do combo inclusive,
 * em qualquer situação. É o "Total" da página do agendamento (`pages/a/[token].astro`) e o
 * número de cada visita na área do cliente (`pages/cliente/index.astro`), que até 15/10/2026
 * mostrava só o preço do serviço (`docs/PENDENCIAS-ABERTAS.md` §2.43).
 *
 * Difere da regra de cima num caso só, e de propósito: o combo ainda não concluído. A receita
 * espera a conclusão para contar o produto; o cliente, que vai pagar por ele, vê desde o
 * agendamento.
 */
export function totalParaOCliente(a: { priceCents: number; itemsCents: number }): number {
  return a.priceCents + a.itemsCents;
}
