export const prerender = false;

import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pastaDeMidia, TIPOS_MIDIA, safeUploadName, type TipoMidia } from '../../../lib/uploads.js';
import { tenantResolvido } from '../../../lib/tenant.js';

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
export const GET: APIRoute = async ({ params, request }) => {
  // ⚠️ Passo 6: a PASTA vem do tenant resolvido, nunca da URL.
  //
  // Até 24/09/2026 era `tenantDoHost(request)` — só o endereço. O painel mora num
  // endereço central, que não é de barbearia nenhuma, e a prévia da logo e da
  // capa dava 404 em produção, para todo mundo. `tenantResolvido()` é o que o
  // middleware decidiu: a sessão no painel, o endereço no site. Continua sem
  // padrão nenhum: sem barbearia, 404.
  //
  // `urlDeMidia()` monta dois formatos: `/api/media/logo/x.webp` para a
  // barbearia legada e `/api/media/<slug>/logo/x.webp` para as demais. Antes
  // desta mudança a rota aceitava só o primeiro e montava o caminho com
  // `UPLOAD_ROOT` cru — ou seja, **o logo, a capa e a galeria da segunda
  // barbearia davam 404**, e o site dela nascia sem imagem nenhuma.
  //
  // Aceitar o slug da URL como fonte da pasta seria pior que o 404: qualquer um
  // pediria a pasta de qualquer barbearia trocando uma palavra no endereço.
  // Quem responde "de quem é esta requisição" continua sendo o host.
  const tenant = tenantResolvido();
  if (!tenant) return new Response('Not found', { status: 404 });

  const partes = (params.path ?? '').split('/');
  if (partes.length !== 2 && partes.length !== 3) return new Response('Not found', { status: 404 });

  // No formato com slug, ele precisa ser o da barbearia do endereço. Divergiu,
  // é pedido para a pasta de outra — 404, sem explicar qual das duas coisas
  // estava errada.
  if (partes.length === 3 && partes[0] !== tenant.slug) {
    return new Response('Not found', { status: 404 });
  }

  const [tipo, arquivoBruto] = partes.slice(-2);
  if (!TIPOS_MIDIA.includes(tipo as TipoMidia)) return new Response('Not found', { status: 404 });

  const arquivo = safeUploadName(arquivoBruto);
  if (!arquivo) return new Response('Not found', { status: 404 });

  const type = EXT_MIME[extname(arquivo).toLowerCase()];
  if (!type) return new Response('Not found', { status: 404 });

  const pasta = pastaDeMidia(tipo as TipoMidia, tenant);

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
