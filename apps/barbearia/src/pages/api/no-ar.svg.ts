/**
 * O sinal de "site no ar": uma imagem de 1 pixel que só este app serve, e só no
 * endereço de uma barbearia no ar (`src/lib/noAr.ts`).
 *
 * A tela de fim do cadastro a pede como imagem, do navegador do dono. Se carregou,
 * o caminho inteiro funciona — DNS, certificado, proxy, app e o resolvedor de
 * barbearia. Por isso a resposta sai do resolvedor, como toda página pública
 * (`lib/tenant.ts`): endereço que não é de barbearia no ar dá 404, que não é
 * imagem, e a tela não diz que está no ar.
 *
 * Não diz nada que a página do site já não diga: quem quiser saber se um
 * endereço existe abre o endereço.
 */
import type { APIRoute } from 'astro';
import { tenantDoHost } from '../../lib/tenant.js';

export const prerender = false;

const PIXEL = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"/>';

export const GET: APIRoute = ({ request }) => {
  const semCache = { 'cache-control': 'no-store' };
  if (!tenantDoHost(request)) {
    return new Response('Não encontrado.', {
      status: 404,
      headers: { ...semCache, 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(PIXEL, {
    status: 200,
    headers: { ...semCache, 'content-type': 'image/svg+xml' },
  });
};
