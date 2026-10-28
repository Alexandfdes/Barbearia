export const prerender = false;

/**
 * `GET /api/saude` — para o monitor externo (`lib/saude.ts`). 200 com
 * `{"ok":true}` quando o app e o banco respondem; 503 com `{"ok":false}` quando o
 * banco não responde em 3 segundos.
 *
 * Não é de barbearia nenhuma: o `src/middleware.ts` a deixa passar antes de
 * resolver endereço ou sessão — que também consultam o banco, e transformariam o
 * banco fora num 500 genérico em vez desta resposta.
 */
import type { APIRoute } from 'astro';
import { saudeDoApp } from '../../lib/saude.js';

export const GET: APIRoute = async () => {
  const saude = await saudeDoApp();
  return new Response(JSON.stringify(saude), {
    status: saude.ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};

// Há monitor que pergunta com HEAD: a mesma resposta, sem o corpo.
export const HEAD: APIRoute = GET;
