export const prerender = false;

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { UPLOAD_ROOT, TIPOS_MIDIA, safeUploadName, type TipoMidia } from '../../../lib/uploads.js';

const EXT_MIME: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Serve a mídia da marca a partir do volume: /api/media/{tipo}/{arquivo}.
 *
 * Pública de propósito — são o logo e a foto de capa que já aparecem no site
 * para qualquer visitante. O que protege aqui não é senha, é o nome do arquivo
 * ser aleatório e a validação recusar qualquer caminho fora do formato.
 *
 * Cache eterno é seguro porque cada upload gera um nome novo: trocar o logo
 * muda o caminho, e o navegador busca o arquivo novo na hora.
 */
export const GET: APIRoute = async ({ params }) => {
  const partes = (params.path ?? '').split('/');
  if (partes.length !== 2) return new Response('Not found', { status: 404 });

  const [tipo, arquivoBruto] = partes;
  if (!TIPOS_MIDIA.includes(tipo as TipoMidia)) return new Response('Not found', { status: 404 });

  const arquivo = safeUploadName(arquivoBruto);
  if (!arquivo) return new Response('Not found', { status: 404 });

  const type = EXT_MIME[extname(arquivo).toLowerCase()];
  if (!type) return new Response('Not found', { status: 404 });

  const pasta = join(UPLOAD_ROOT, tipo);

  try {
    const buf = await readFile(join(pasta, arquivo));
    return new Response(new Uint8Array(buf), { status: 200, headers: cabecalhos(type) });
  } catch { /* pode ser uma variante que não foi gerada — ver abaixo */ }

  // Variante ausente cai no original.
  //
  // Não geramos variante maior que a foto enviada: ampliar um 800px para 1920
  // só produz arquivo maior igualmente borrado. Mas o srcset da página pede
  // todas as larguras. Sem esta queda, o navegador tomaria 404 justamente na
  // imagem de capa. Servir o original é o comportamento certo: quando a
  // variante não existe é porque o original já é menor que ela.
  const variante = arquivo.match(/^(.+)-\d+\.webp$/i);
  if (variante) {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.avif']) {
      try {
        const buf = await readFile(join(pasta, variante[1] + ext));
        return new Response(new Uint8Array(buf), { status: 200, headers: cabecalhos(EXT_MIME[ext]) });
      } catch { /* tenta a próxima extensão */ }
    }
  }

  return new Response('Not found', { status: 404 });
};

function cabecalhos(type: string): Record<string, string> {
  return {
    'Content-Type':  type,
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}
