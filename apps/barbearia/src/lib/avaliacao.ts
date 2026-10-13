/**
 * A nota do Google que o dono digita em Configurações ("Avaliações do Google"), pronta
 * para o site — ou `null`, quando não há o que mostrar.
 *
 * Até 13/10/2026 a seção publicava "0,0 — Baseado em 0 avaliações", com cinco estrelas
 * acesas, quando a nota estava em branco; e as cinco estrelas nunca olhavam a nota —
 * 3,8 mostrava cinco cheias (`docs/PENDENCIAS-ABERTAS.md` §4.11). A regra é a do §4.1.1:
 * ou tem conteúdo da barbearia, ou não aparece.
 *
 * Sem dependência nenhuma: é conta, e o teste a confere sem banco
 * (`tests/avaliacao.test.ts`).
 */

/**
 * O que Configurações aceita no campo da nota: vazio, ou de 0 a 5 com uma casa.
 * Até 13/10/2026 a regra aceitava 5.9 — o primeiro dígito ia até 5, e a casa decimal, livre.
 */
export const FORMA_DA_NOTA = /^$|^[0-4](\.\d)?$|^5(\.0)?$/;

export interface NotaDoGoogle {
  /** De 1 a 5, com uma casa. */
  valor: number;
  /** Como aparece: "4,8". */
  texto: string;
  /** Quantas avaliações — pelo menos uma. */
  quantidade: number;
  /** Quanto de cada uma das cinco estrelas fica pintado, de 0 a 1: 4,8 → [1, 1, 1, 1, 0,8]. */
  estrelas: number[];
}

/**
 * A nota vem como texto (`settings.google_rating`, "4.8") e a quantidade como número.
 * Nota do Google vai de 1 a 5: vazio, zero ou fora disso é "não tem nota" — e sem
 * nenhuma avaliação também, porque "Baseado em 0 avaliações" é a seção meia-boca.
 */
export function notaDoGoogle(
  nota: string | null | undefined,
  quantidade: number | null | undefined,
): NotaDoGoogle | null {
  const bruto = String(nota ?? '').trim().replace(',', '.');
  if (!bruto) return null;
  const valor = Math.round(Number(bruto) * 10) / 10;
  if (!Number.isFinite(valor) || valor < 1 || valor > 5) return null;
  const n = Number(quantidade ?? 0);
  if (!Number.isInteger(n) || n < 1) return null;
  return {
    valor,
    texto: valor.toFixed(1).replace('.', ','),
    quantidade: n,
    // O arredondamento tira a sobra da conta de ponto flutuante: 4,8 − 4 dá 0,7999…
    estrelas: Array.from({ length: 5 }, (_, i) => Math.round(Math.min(1, Math.max(0, valor - i)) * 10) / 10),
  };
}

/** "1 avaliação", "127 avaliações", "1.234 avaliações". */
export function quantasAvaliacoes(n: number): string {
  return n === 1 ? '1 avaliação' : `${n.toLocaleString('pt-BR')} avaliações`;
}
