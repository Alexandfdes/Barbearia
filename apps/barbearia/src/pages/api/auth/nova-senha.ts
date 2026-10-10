export const prerender = false;

/**
 * A senha nova, pelo link do e-mail. As regras estão em `lib/redefinicaoDeSenha.ts`.
 *
 * Trocou: a sessão deste navegador é apagada junto com todas as outras, e a tela
 * leva ao login. Entrar com a senha nova é a prova de que ela foi digitada como
 * ele pensa — melhor descobrir o erro de digitação agora, com o link fresco na
 * memória, do que amanhã de manhã com a barbearia aberta.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { clearSessionCookie } from '../../../lib/session.js';
import { redefinirSenha, SENHA_MINIMA } from '../../../lib/redefinicaoDeSenha.js';

const bodySchema = z.object({
  token: z.string().min(1).max(100),
  senha: z.string().max(1000),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }

  // O token tem 256 bits — adivinhar não é o risco. O limite é contra ocupar a
  // CPU: cada senha nova aceita custa um bcrypt.
  const ip = getClientIp(request, clientAddress);
  const rl = checkRateLimit(`nova-senha:${ip}`, { maxTries: 10 });
  if (!rl.ok) return json({ error: `Muitas tentativas. Tente de novo em ${rl.retryAfterSecs}s.` }, 429);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Confira os campos.' }, 400);

  const r = await redefinirSenha(parsed.data.token, parsed.data.senha);
  if (!r.ok) {
    switch (r.motivo) {
      case 'senha-curta':
        return json({ error: `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.` }, 400);
      case 'senha-longa':
        return json({ error: 'A senha passa de 200 caracteres.' }, 400);
      case 'link-invalido':
        return json({ error: 'Este link expirou ou já foi usado. Peça outro em "Esqueci minha senha".' }, 410);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'set-cookie': clearSessionCookie() },
  });
};
