export const prerender = false;

import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { reordenar } from '../../../../lib/galeria.js';

/**
 * Grava a ordem da galeria: `{ ordem: [id, id, ...] }`, a lista INTEIRA.
 *
 * A lista inteira, e não "sobe a foto 7 uma posição": o pedido fica idempotente
 * (repetir não muda nada) e duas abas abertas não se somam num estado que
 * nenhuma das duas mostrou.
 */
export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: { ordem?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const ordem = body.ordem;
  if (!Array.isArray(ordem) || !ordem.every((id) => Number.isInteger(id) && id > 0)) {
    return json({ error: 'Ordem inválida' }, 400);
  }

  if (!(await reordenar(ordem as number[], tenant))) {
    // A lista não bate com as fotos desta barbearia: outra aba mudou a galeria
    // no meio do caminho, ou alguém mandou id que não é daqui.
    return json({ error: 'A galeria mudou desde que a página abriu. Recarregue e tente de novo.' }, 409);
  }
  return json({ ok: true });
};
