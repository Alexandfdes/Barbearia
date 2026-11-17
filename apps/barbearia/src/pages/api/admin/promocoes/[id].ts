export const prerender = false;

/**
 * Desativa uma promoção (`lib/promocoesDaBarbearia.ts`). A linha fica, com a hora em que
 * saiu; os agendamentos já feitos com ela continuam com o preço que pagaram.
 *
 * Só aceita `{ ativa: false }`: ativar de novo passa pelo POST de `/api/admin/promocoes`, que
 * refaz a conta e pede a confirmação.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { desativarPromocao } from '../../../../lib/promocoesDaBarbearia.js';

const corpoSchema = z.object({
  ativa: z.literal(false, 'Para ativar de novo, use a sugestão: o desconto é conferido outra vez.'),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }
  const parsed = corpoSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  // A condição vai no próprio UPDATE: a de outra barbearia, a que não existe e a que já saiu
  // dão o mesmo 404 — e dois cliques ao mesmo tempo, um só desativa.
  if (!(await desativarPromocao(tenant.id, id))) {
    return json({ error: 'Promoção não encontrada, ou já desativada. Atualize a tela.' }, 404);
  }
  return json({ ok: true });
};
