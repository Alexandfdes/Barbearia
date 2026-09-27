export const prerender = false;

import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { adicionarFoto, fotosDaGaleria } from '../../../../lib/galeria.js';

/**
 * A galeria do site, vista pelo painel. Só o dono: a galeria é a vitrine da
 * barbearia, como a logo e a capa (`api/admin/settings/media.ts`).
 *
 * ⚠️ Uma foto por envio, de propósito. A tela manda as fotos escolhidas uma de
 * cada vez: cada uma tem o próprio erro ("essa é HEIC"), a barra de progresso é
 * de verdade, e ninguém manda 10 fotos de 12 MB num corpo só de 120 MB pelo 4G.
 */
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  return json(await fotosDaGaleria(tenant));
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Não consegui ler o envio' }, 400); }

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return json({ error: 'Nenhuma foto enviada' }, 400);
  }

  const r = await adicionarFoto(arquivo, tenant);
  if (!r.ok) return json({ error: r.error }, r.status);
  return json(r.foto, 201);
};
