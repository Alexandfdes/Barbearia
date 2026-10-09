export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { barbers } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession, makeSessionCookie } from '../../../../../lib/session.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';

const BCRYPT_COST = 12;

const bodySchema = z.object({
  password: z.string().min(6).max(200),
});

// POST — troca a senha de um barbeiro. Admin pode trocar a de qualquer um.
// A senha em texto não é logada nem devolvida na resposta.
//
// ⚠️ Desde 09/10/2026, trocar a senha DERRUBA as sessões abertas daquele barbeiro
// (`senha_trocada_em`, conferido em `lib/session.ts`). É o que o dono espera quando
// troca a senha de quem saiu da equipe. Quando a senha é a DELE, este navegador
// recebe uma sessão nova na mesma resposta — senão a troca o poria para fora da
// tela em que ele acabou de clicar "Salvar".
export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'A senha precisa ter ao menos 6 caracteres' }, 400);

  const target = await first(db.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id))));
  if (!target) return json({ error: 'Barbeiro não encontrado' }, 404);

  const passwordHash = await hash(parsed.data.password, BCRYPT_COST);
  // O relógio do app, não o `now()` do banco: o mesmo que carimba a sessão nova.
  const agora = new Date();
  await db.update(barbers).set({ passwordHash, senhaTrocadaEm: agora })
    .where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id)));

  if (id !== session.barberId) return json({ ok: true });

  const cookie = await makeSessionCookie({ barberId: session.barberId, role: session.role, tenantId: session.tenantId });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'set-cookie': cookie },
  });
};
