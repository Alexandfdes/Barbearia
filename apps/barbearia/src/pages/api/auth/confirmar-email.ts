export const prerender = false;

/**
 * O clique em "Confirmar", na tela do link do e-mail. As regras estão em
 * `lib/confirmacaoDeEmail.ts`; a barbearia sai do token, não do endereço.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { confirmarEmail } from '../../../lib/confirmacaoDeEmail.js';

const bodySchema = z.object({ token: z.string().min(1).max(100) });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }

  // O token tem 256 bits — adivinhar não é o risco. O limite é contra martelar o banco.
  const ip = getClientIp(request, clientAddress);
  const rl = checkRateLimit(`confirmar-email:${ip}`, { maxTries: 20 });
  if (!rl.ok) return json({ error: `Muitas tentativas. Tente de novo em ${rl.retryAfterSecs}s.` }, 429);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Link inválido.' }, 400);

  if (!(await confirmarEmail(parsed.data.token))) {
    return json({ error: 'Este link expirou ou não vale mais. Peça outro no painel.' }, 410);
  }
  return json({ ok: true });
};
