export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { barbers, barberServices, services, workingHours } from '../../../../db/schema.js';
import { json, violouUnico } from '../../../../lib/api.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { emailValido, normalizarEmail } from '../../../../lib/email.js';
import { SENHA_MINIMA } from '../../../../lib/redefinicaoDeSenha.js';

const BCRYPT_COST = 12;

function slugify(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const createSchema = z.object({
  name:     z.string().min(2).max(80),
  slug:     z.string().min(1).max(50).optional(),
  // Telefone é como o barbeiro ENTRA no painel (migration 0002). Obrigatório em
  // cadastro novo: sem ele, o barbeiro é criado e não consegue logar — e a falha
  // só aparece no dia em que ele tenta.
  phone:    z.string().min(10).max(25),
  role:     z.enum(['admin', 'barber']),
  password: z.string().min(SENHA_MINIMA).max(200),  // 8, como a senha nova pelo link
  // Opcional: sem ele o barbeiro não recebe a senha nova por e-mail, e quem a
  // troca é o dono, nesta mesma tela.
  email:    z.string().max(254).optional(),
});

// GET — lista todos os barbeiros (ativos e inativos), sem o hash da senha
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const rows = await db
    .select({
      id:        barbers.id,
      name:      barbers.name,
      slug:      barbers.slug,
      phone:     barbers.phone,
      email:     barbers.email,
      role:      barbers.role,
      active:    barbers.active,
      createdAt: barbers.createdAt,
    })
    .from(barbers)
    .where(eq(barbers.tenantId, tenant.id))
    .orderBy(barbers.name);

  return json(rows);
};

// POST — cria um novo barbeiro e o deixa funcional (working_hours + barber_services)
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { name, role, password } = parsed.data;
  const slug = slugify(parsed.data.slug ?? name);

  if (!slug) return json({ error: 'Nome/slug inválido' }, 400);

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return json({ error: 'Telefone inválido: informe DDD + número.' }, 400);

  const email = normalizarEmail(parsed.data.email);
  if (email && !emailValido(email)) {
    return json({ error: `"${parsed.data.email}" não parece um e-mail.` }, 400);
  }

  // ⚠️ O telefone é único NO MUNDO, não nesta barbearia: é o que faz o login do
  // painel central saber de quem é quem está entrando (índice `barbers_phone_ativo_uq`,
  // migration 0017 — só entre os ativos). Quem confere é o índice, no `catch` do INSERT lá embaixo.
  //
  // Até 25/09/2026 havia aqui uma consulta que dizia conferir isso "sem filtrar
  // por tenant, de propósito". Só que ela roda dentro da requisição, sob o RLS, e
  // enxergava apenas os barbeiros DESTA barbearia. Telefone já usado em outra
  // passava por ela, caía no índice, e o `catch` genérico devolvia "Erro ao criar
  // barbeiro" (500) — o dono ficava sem saber o motivo. Uma consulta que olhasse
  // todas as barbearias precisaria da conexão de dono, e dono dentro de rota do
  // painel é justamente o que o guarda de `tests/rls.test.ts` proíbe.

  // Slug é o identificador de login: precisa ser único. Sem sufixo automático —
  // se colidir, o admin escolhe outro (senão geraria um login esquisito).
  const existing = await db.select({ id: barbers.id }).from(barbers).where(and(eq(barbers.slug, slug), eq(barbers.tenantId, tenant.id)));
  if (existing.length > 0) {
    return json({ error: `O slug "${slug}" já está em uso. Escolha outro.` }, 409);
  }

  const passwordHash = await hash(password, BCRYPT_COST);

  // Serviços ativos + uma duração de referência (a já praticada por algum barbeiro,
  // ou 30 min de fallback) para o novo barbeiro nascer oferecendo o catálogo.
  const activeServices = await db.select({ id: services.id }).from(services).where(and(eq(services.active, true), eq(services.tenantId, tenant.id)));
  const refDuration = async (serviceId: number): Promise<number> => {
    const r = await first(db.select({ d: barberServices.durationMinutes }).from(barberServices)
      .where(and(eq(barberServices.serviceId, serviceId), eq(barberServices.tenantId, tenant.id))).limit(1));
    return r?.d ?? 30;
  };
  const serviceSeed = await Promise.all(
    activeServices.map(async s => ({ serviceId: s.id, durationMinutes: await refDuration(s.id) })),
  );

  let newId: number | bigint;
  try {
    newId = await db.transaction(async (tx) => {
      const res = await tx.insert(barbers).values({ tenantId: tenant.id, name, slug, phone, email, role, passwordHash })
        .returning({ id: barbers.id });
      const id = res[0].id;

      // working_hours: seg–sex 09:00–20:00, sáb 09:00–18:00 (mesmo padrão do seed)
      for (let weekday = 1; weekday <= 5; weekday++) {
        await tx.insert(workingHours).values({ tenantId: tenant.id, barberId: Number(id), weekday, startTime: '09:00', endTime: '20:00' });
      }
      await tx.insert(workingHours).values({ tenantId: tenant.id, barberId: Number(id), weekday: 6, startTime: '09:00', endTime: '18:00' });

      // barber_services: oferece todos os serviços ativos por padrão
      for (const s of serviceSeed) {
        await tx.insert(barberServices).values({ tenantId: tenant.id,
          barberId: Number(id), serviceId: s.serviceId, durationMinutes: s.durationMinutes, active: true,
        });
      }
      return id;
    });
  } catch (err) {
    if (violouUnico(err, 'barbers_phone_ativo_uq')) {
      return json({ error: 'Este telefone já está cadastrado para outro barbeiro.' }, 409);
    }
    console.error('[api/admin/barbers]', err);
    return json({ error: 'Erro ao criar barbeiro' }, 500);
  }

  return json({ id: Number(newId), name, slug, role, active: true }, 201);
};
