export const prerender = false;
import type { APIRoute } from 'astro';
import { db } from '../../../lib/db.js';
import { autenticado } from '../../../lib/auth.js';

const PROTOCOLO = /^[A-Z]{4}-\d{3}$/;
const STATUS_VALIDOS = ['novo', 'em_andamento', 'concluido'];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
}

export const PATCH: APIRoute = async ({ request, params }) => {
  if (!autenticado(request)) return json({ error: 'Não autorizado' }, 401);

  const protocolo = params.protocolo ?? '';
  if (!PROTOCOLO.test(protocolo)) return json({ error: 'Protocolo inválido' }, 400);

  let body: { status?: string };
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const status = String(body.status ?? '');
  if (!STATUS_VALIDOS.includes(status)) return json({ error: 'Status inválido' }, 400);

  const r = db.prepare('UPDATE onboarding SET status = ? WHERE protocolo = ?').run(status, protocolo);
  if (r.changes === 0) return json({ error: 'Envio não encontrado' }, 404);
  return json({ ok: true, status });
};
