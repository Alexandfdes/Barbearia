export const prerender = false;

/**
 * Leva o dono ao Checkout da Asaas, para cadastrar o cartão (`lib/cobranca.ts`).
 *
 * Abre também com a barbearia FORA DO AR — é por aqui que quem saiu do ar volta.
 * Por isso a sessão vem de `getSession()` ou, fora do ar, de `sessaoForaDoAr()`,
 * como na tela de assinatura; e o `src/middleware.ts` deixa esta rota passar
 * junto com a tela (`ROTA_DO_CARTAO`).
 *
 * Só o dono: é o cartão dele, e a cobrança é no nome dele.
 */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { barbers } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession, sessaoForaDoAr } from '../../../../lib/session.js';
import { tenantDaSessao, urlDoPainel } from '../../../../lib/tenant.js';
import { configDaAsaas } from '../../../../lib/asaas.js';
import { abrirCheckout, ErroDeCobranca } from '../../../../lib/cobranca.js';

export const POST: APIRoute = async ({ request }) => {
  const noAr = await getSession(request);
  const fora = noAr ? null : await sessaoForaDoAr(request);
  const sessao = noAr ?? fora?.sessao;
  if (!sessao) return json({ error: 'Não autenticado' }, 401);
  if (sessao.role !== 'admin') return json({ error: 'Só o dono da barbearia cadastra o cartão.' }, 403);
  const tenant = noAr ? tenantDaSessao(noAr) : fora!.tenant;

  const cfg = configDaAsaas();
  if (!cfg) {
    return json({ error: 'A cobrança ainda não está ligada: o cartão não se cadastra por aqui ainda.' }, 503);
  }

  const dono = await first(
    db.select({ nome: barbers.name, email: barbers.email, telefone: barbers.phone })
      .from(barbers)
      .where(and(eq(barbers.id, sessao.barberId), eq(barbers.tenantId, tenant.id))),
  );
  if (!dono) return json({ error: 'Não autenticado' }, 401);

  try {
    const url = await abrirCheckout({ tenantId: tenant.id, dono, painel: urlDoPainel(), cfg });
    return json({ url });
  } catch (erro) {
    if (erro instanceof ErroDeCobranca) return json({ error: erro.message }, erro.status);
    console.error(`[cobrança] o Checkout da barbearia ${tenant.id} não abriu:`, erro instanceof Error ? erro.message : erro);
    return json({ error: 'A página de pagamento não abriu agora. Tente de novo em alguns minutos.' }, 502);
  }
};
