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
