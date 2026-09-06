export const prerender = false;
import type { APIRoute } from 'astro';
import { senhaCorreta, senhaConfigurada, criarCookie, limparCookie } from '../../lib/auth.js';

export const POST: APIRoute = async ({ request }) => {
  if (!senhaConfigurada()) {
    return new Response(JSON.stringify({ error: 'Defina ADMIN_SENHA no arquivo .env (mínimo 6 caracteres) e reinicie o servidor.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  let body: { senha?: string };
  try { body = await request.json(); } catch { body = {}; }

  // Atraso fixo: torna tentativa em massa lenta sem precisar de infraestrutura.
  await new Promise((r) => setTimeout(r, 400));

  if (!senhaCorreta(String(body.senha ?? ''))) {
    return new Response(JSON.stringify({ error: 'Senha incorreta.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': criarCookie() } });
};

export const DELETE: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': limparCookie() } });
