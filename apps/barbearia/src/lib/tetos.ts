/**
 * Quanto cabe em cada barbearia (05/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.69).
 *
 * Até aqui só a galeria tinha teto (`MAXIMO_DE_FOTOS`, em `lib/galeria.ts`). Equipe, serviços,
 * produtos e combos, não: com o cadastro aberto, uma conta de teste grátis criava barbeiro sem
 * fim — cada um gastando bcrypt no núcleo da VPS e mandando um e-mail de confirmação —, e
 * produto com foto sem fim, no disco onde mora o banco de todas.
 *
 * Os números são do dono do produto, e generosos de propósito: nenhuma barbearia de verdade
 * passa perto deles.
 *
 *  - **Barbeiros e serviços contam só os ATIVOS.** Os dois ficam no banco depois de desligados
 *    — os agendamentos de antes apontam para eles —, e contar os desligados prenderia a
 *    barbearia antiga. Por isso o teto vale também ao RELIGAR, não só ao criar.
 *  - **Produtos e combos contam todos:** os dois se apagam de verdade.
 *
 * ⚠️ A conta e a gravação não são atômicas: dois pedidos ao mesmo tempo podem passar um a mais.
 * É um teto contra o excesso, não uma contagem exata.
 */
import { and, count, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { barbers, combos, products, services } from '../db/schema.js';

export const TETOS = {
  barbeirosAtivos: 15,
  servicosAtivos: 100,
  produtos: 200,
  combos: 50,
} as const;

export type Teto = keyof typeof TETOS;

/** A frase da tela — o que fazer, não só o número. */
export const RECUSA_DO_TETO: Record<Teto, string> = {
  barbeirosAtivos: `A equipe já tem ${TETOS.barbeirosAtivos} pessoas ativas, que é o máximo. Desligue alguém em Editar para cadastrar ou religar outra.`,
  servicosAtivos: `Já há ${TETOS.servicosAtivos} serviços ativos, que é o máximo. Desligue um que não usa para criar ou religar outro.`,
  produtos: `Já há ${TETOS.produtos} produtos, que é o máximo. Apague um que não vende para cadastrar outro.`,
  combos: `Já há ${TETOS.combos} combos, que é o máximo. Apague um para criar outro.`,
};

/** Quantos já há, desta barbearia, do que o teto conta. Corre dentro da requisição, sob o RLS. */
export async function quantosHa(teto: Teto, tenantId: number): Promise<number> {
  const [linha] = teto === 'barbeirosAtivos'
    ? await db.select({ n: count() }).from(barbers).where(and(eq(barbers.tenantId, tenantId), eq(barbers.active, true)))
    : teto === 'servicosAtivos'
      ? await db.select({ n: count() }).from(services).where(and(eq(services.tenantId, tenantId), eq(services.active, true)))
      : teto === 'produtos'
        ? await db.select({ n: count() }).from(products).where(eq(products.tenantId, tenantId))
        : await db.select({ n: count() }).from(combos).where(eq(combos.tenantId, tenantId));
  return Number(linha?.n ?? 0);
}

/** Cabem mais `quantos`? Devolve a frase da recusa, ou `null` se cabe. */
export async function recusaDoTeto(teto: Teto, tenantId: number, quantos = 1): Promise<string | null> {
  return (await quantosHa(teto, tenantId)) + quantos > TETOS[teto] ? RECUSA_DO_TETO[teto] : null;
}
