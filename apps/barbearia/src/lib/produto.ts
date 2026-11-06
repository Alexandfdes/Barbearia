/**
 * O nome do produto no app da barbearia: no login do painel e no cadastro.
 *
 * ⚠️ Provisório desde 08/10/2026. "Barbearia no Ar" soava genérico, e o dono
 * escolheu Fadeline até o cadastro abrir (`docs/PENDENCIAS-ABERTAS.md` §0.1).
 * O site de vendas tem o dele em `apps/vendas/src/config.ts`: trocar o nome é
 * trocar os dois, e `tests/nome-do-produto.test.ts` reprova se divergirem ou se
 * alguma tela escrever o nome à mão.
 */
export const NOME_PRODUTO = 'Fadeline';

/**
 * A mensalidade, em reais — a da tela de assinatura do painel. O site de vendas
 * tem a dele (`PRECO.mensal`, em `apps/vendas/src/config.ts`), e
 * `tests/preco-do-produto.test.ts` reprova se as duas divergirem: o preço que a
 * landing promete é o que o painel cobra.
 */
export const PRECO_MENSAL = 100;

/**
 * O WhatsApp do suporte — o mesmo que a landing usa (`WHATSAPP`, em `apps/vendas/src/config.ts`), e
 * `tests/whatsapp-do-suporte.test.ts` reprova se divergirem. Formato wa.me: DDI + DDD + número.
 *
 * Desde 05/11/2026 é para onde o painel e os avisos mandam o dono enquanto a cobrança está
 * desligada (`lib/assinatura.ts`): antes mandavam cadastrar um cartão que não tinha onde cadastrar.
 */
export const WHATSAPP_SUPORTE = '5584996658951';

/** O link do WhatsApp do suporte, com a mensagem já escrita se houver. */
export function linkDoSuporte(mensagem?: string): string {
  return `https://wa.me/${WHATSAPP_SUPORTE}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}
