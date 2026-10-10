export const prerender = false;

import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { removerFoto } from '../../../../lib/galeria.js';

/** Tira uma foto da galeria — e apaga os arquivos dela (ver `removerFoto`). */
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'ID inválido' }, 400);

  // Foto de outra barbearia cai aqui também: para quem pergunta, ela não existe.
  if (!(await removerFoto(id, tenant))) return json({ error: 'Foto não encontrada' }, 404);
  return json({ ok: true });
};
