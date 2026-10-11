export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { barbers } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { emailValido, normalizarEmail } from '../../../../lib/email.js';

// Slug NÃO é editável: ele é o identificador de login (ver /api/auth/login).
// Mudá-lo trocaria o usuário de acesso do barbeiro. Por isso fica fora do schema.
const updateSchema = z.object({
  name:   z.string().min(2).max(80).optional(),
  role:   z.enum(['admin', 'barber']).optional(),
  active: z.boolean().optional(),
  /**
   * Para onde vão a senha nova e, do dono, os avisos do teste e da cobrança.
   * Vazio apaga. Até 09/10/2026 o painel não tinha onde ver nem corrigir o
   * e-mail: digitado errado no cadastro, o erro só aparecia no dia em que a senha
   * nova não chegasse (`docs/JORNADA-DO-BARBEIRO.md` §2.2).
   */
  email:  z.string().max(254).nullable().optional(),
  /**
   * Recebe e-mail quando um cliente agenda, desmarca ou remarca pelo site
   * (`lib/avisoDeAgenda.ts`, 11/10/2026). Quem liga e desliga é o dono, como o
   * e-mail: o barbeiro não tem tela própria.
   */
  avisarAgendamentos: z.boolean().optional(),
});

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, role, active, avisarAgendamentos } = parsed.data;
  if (name === undefined && role === undefined && active === undefined && parsed.data.email === undefined
      && avisarAgendamentos === undefined) {
    return json({ error: 'Nenhum campo para atualizar' }, 400);
  }

  // A mesma regra do cadastro (`lib/email.ts`): forma de e-mail, minúsculo.
  const email = parsed.data.email === undefined ? undefined : normalizarEmail(parsed.data.email);
  if (email && !emailValido(email)) {
    return json({ error: `"${parsed.data.email}" não parece um e-mail.` }, 400);
  }

  const target = await first(db.select({ id: barbers.id, role: barbers.role })
    .from(barbers).where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id))));
  if (!target) return json({ error: 'Barbeiro não encontrado' }, 404);

  // Proteções: o admin logado não pode se trancar pra fora do sistema.
  // (Estas regras garantem que sempre exista ao menos 1 admin ativo.)
  const isSelf = id === session.barberId;
  if (isSelf && active === false) {
    return json({ error: 'Você não pode desativar a si mesmo.' }, 403);
  }
  if (isSelf && role === 'barber') {
    return json({ error: 'Você não pode rebaixar o seu próprio acesso de admin.' }, 403);
  }

  const updates: Record<string, unknown> = {};
  if (name   !== undefined) updates.name   = name;
  if (role   !== undefined) updates.role   = role;
  if (active !== undefined) updates.active = active;
  if (email  !== undefined) updates.email  = email;
  if (avisarAgendamentos !== undefined) updates.avisarAgendamentos = avisarAgendamentos;

  await db.update(barbers).set(updates).where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id)));
  return json({ ok: true });
};
