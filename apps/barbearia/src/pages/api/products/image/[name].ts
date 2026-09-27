export const prerender = false;

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pastaDeProduto, safeUploadName } from '../../../../lib/uploads.js';
import { tenantResolvido } from '../../../../lib/tenant.js';

const EXT_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
};

/**
 * Serve a foto de um produto ou combo: /api/products/image/{arquivo}.
 *
 * ⚠️ A PASTA SAI DO TENANT QUE O MIDDLEWARE RESOLVEU — nunca da URL.
 *
 * Até 24/09/2026 esta rota lia de uma pasta só, a mesma para todas as
 * barbearias, e servia qualquer arquivo dela em qualquer endereço
 * (`PENDENCIAS-ABERTAS.md` §2.7). Agora cada barbearia tem a sua
 * (`pastaDeProduto`), e a rota só enxerga a de quem pediu:
 *
 *   - no site da barbearia, é a do endereço;
 *   - no painel, que mora num endereço central, é a da sessão — senão a
 *     miniatura do produto dava 404 justamente para o dono.
 *
 * Sem barbearia resolvida, 404. Nunca a pasta da barbearia 1 por padrão.
 */
export const GET: APIRoute = async ({ params }) => {
  const tenant = tenantResolvido();
  if (!tenant) return new Response('Not found', { status: 404 });

  const name = safeUploadName(params.name ?? '');
  if (!name) return new Response('Not found', { status: 404 });

  const type = EXT_MIME[extname(name).toLowerCase()];
  if (!type) return new Response('Not found', { status: 404 });

  try {
    const buf = await readFile(join(pastaDeProduto(tenant), name));
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':  type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
