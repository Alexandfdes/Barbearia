export const prerender = false;

/**
 * Cancela a assinatura (`lib/cobranca.ts`): a Asaas para de cobrar, e o site fica
 * no ar até o fim do período pago. Depois, sai do ar como quem não pagou — nada é
 * apagado, e assinando de novo volta.
 *
 * A regra do "até o fim do período pago" foi decidida na implementação e
 * confirmada pelo dono em 10/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §4.14).
 *
 * Só o dono. Abre também com a barbearia FORA DO AR pela cobrança que falhou: a
 * assinatura atrasada continua viva na Asaas, e quem quer sair tem de poder
 * parar a cobrança sozinho. Por isso a sessão vem, como na rota do cartão, de
 * `getSession()` ou de `sessaoForaDoAr()`, e o `src/middleware.ts` a deixa passar.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api.js';
import { getSession, sessaoForaDoAr } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { configDaAsaas } from '../../../../lib/asaas.js';
import { cancelarAssinatura, ErroDeCobranca } from '../../../../lib/cobranca.js';
import { ultimoDia } from '../../../../lib/situacao.js';
import { fusoDe } from '../../../../lib/timezone.js';

export const POST: APIRoute = async ({ request }) => {
  const noAr = await getSession(request);
  const fora = noAr ? null : await sessaoForaDoAr(request);
  const sessao = noAr ?? fora?.sessao;
  if (!sessao) return json({ error: 'Não autenticado' }, 401);
  if (sessao.role !== 'admin') return json({ error: 'Só o dono da barbearia cancela a assinatura.' }, 403);
  const tenant = noAr ? tenantDaSessao(noAr) : fora!.tenant;

  const cfg = configDaAsaas();
  if (!cfg) return json({ error: 'A cobrança ainda não está ligada.' }, 503);

  try {
    const fim = await cancelarAssinatura(tenant.id, cfg);
    return json({ ok: true, noArAte: ultimoDia(fim, fusoDe(tenant)) });
  } catch (erro) {
    if (erro instanceof ErroDeCobranca) return json({ error: erro.message }, erro.status);
    console.error(`[cobrança] o cancelamento da barbearia ${tenant.id} falhou:`, erro instanceof Error ? erro.message : erro);
    return json({ error: 'Não deu para cancelar agora. Tente de novo em alguns minutos.' }, 502);
  }
};
