export const prerender = false;

/**
 * Sair do painel do operador: apaga o cookie e volta para a tela de entrar.
 *
 * Formulário comum (`<form method="post">`), sem JavaScript: o `src/middleware.ts`
 * só deixa passar POST vindo do próprio endereço, então um site de fora não
 * desloga ninguém.
 */
import type { APIRoute } from 'astro';
import { cookieDeSaida, naoEncontrado, portaoDoOperador } from '../../../lib/operador.js';

export const POST: APIRoute = ({ request }) => {
  if (portaoDoOperador(request) !== 'aberto') return naoEncontrado();
  return new Response(null, {
    status: 303,
    headers: { Location: '/operador', 'Set-Cookie': cookieDeSaida(), 'Cache-Control': 'no-store' },
  });
};
