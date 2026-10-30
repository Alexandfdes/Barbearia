export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { and, asc, eq, gte } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { appointments, barbers } from '../../../../db/schema.js';
import { fusoDe } from '../../../../lib/timezone.js';
import { quandoCurto } from '../../../../lib/avisoDeAgenda.js';
import { json, violouUnico } from '../../../../lib/api.js';
import { normalizePhone } from '../../../../lib/phone.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { emailValido, normalizarEmail } from '../../../../lib/email.js';
import { avisarEmailTrocado, trocaQueAvisa } from '../../../../lib/avisoDeEmailTrocado.js';
import { cancelarPedidosDeSenha } from '../../../../lib/redefinicaoDeSenha.js';
import { pedirConfirmacao } from '../../../../lib/confirmacaoDeEmail.js';

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
   * O WhatsApp de login. Editável desde 18/10/2026: até aqui, digitado errado ficava
   * errado para sempre (`docs/PENDENCIAS-ABERTAS.md` §2.54). Único entre os barbeiros
   * ATIVOS de todas as barbearias (migration 0017) — quem confere é o índice.
   */
  phone:  z.string().max(30).optional(),
  /**
   * Recebe e-mail quando um cliente agenda, desmarca ou remarca pelo site
   * (`lib/avisoDeAgenda.ts`, 11/10/2026). Quem liga e desliga é o dono, como o
   * e-mail: o barbeiro não tem tela própria.
   */
  avisarAgendamentos: z.boolean().optional(),
  /** Desligar mesmo com horários marcados — só depois de a tela mostrar quais (abaixo). */
  mesmoComAgendados: z.boolean().optional(),
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
      && avisarAgendamentos === undefined && parsed.data.phone === undefined) {
    return json({ error: 'Nenhum campo para atualizar' }, 400);
  }

  // A mesma regra do cadastro (`lib/email.ts`): forma de e-mail, minúsculo.
  const email = parsed.data.email === undefined ? undefined : normalizarEmail(parsed.data.email);
  if (email && !emailValido(email)) {
    return json({ error: `"${parsed.data.email}" não parece um e-mail.` }, 400);
  }

  const phone = parsed.data.phone === undefined ? undefined : normalizePhone(parsed.data.phone);
  if (phone === '') return json({ error: 'WhatsApp inválido: use DDD + número, 10 ou 11 dígitos.' }, 400);

  const target = await first(db.select({ id: barbers.id, role: barbers.role, name: barbers.name, email: barbers.email,
    emailConfirmadoEm: barbers.emailConfirmadoEm, active: barbers.active })
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

  // Desligar quem tem cliente marcado daqui para a frente pede confirmação, mostrando quem
  // (revisão de 27/10/2026). Antes salvava calado: ele sumia da agenda do dia, o Início seguia
  // contando o dinheiro, e o cliente via "confirmado com Carlos" no link sem conseguir remarcar
  // — sem vaga em dia nenhum, porque barbeiro desligado não tem vaga.
  if (active === false && target.active && !parsed.data.mesmoComAgendados) {
    const marcados = await db.select({ startsAt: appointments.startsAt })
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenant.id), eq(appointments.barberId, id),
        eq(appointments.status, 'confirmed'), gte(appointments.startsAt, new Date().toISOString())))
      .orderBy(asc(appointments.startsAt));
    if (marcados.length > 0) {
      const n = marcados.length;
      return json({
        error: `${target.name} tem ${n === 1 ? '1 cliente marcado' : `${n} clientes marcados`} daqui para a frente — `
          + `o próximo, ${quandoCurto(marcados[0].startsAt, fusoDe(tenant))}. Desligado, ele some da agenda e `
          + `${n === 1 ? 'esse cliente não consegue' : 'esses clientes não conseguem'} remarcar pelo link. `
          + 'Cancele ou avise antes, na agenda.',
        pedeConfirmacao: true,
        marcados: n,
      }, 409);
    }
  }

  const updates: Record<string, unknown> = {};
  if (name   !== undefined) updates.name   = name;
  if (role   !== undefined) updates.role   = role;
  if (active !== undefined) updates.active = active;
  // E-mail novo nasce NÃO confirmado — a confirmação era do endereço anterior
  // (`lib/confirmacaoDeEmail.ts`). Salvar a ficha com o mesmo e-mail não mexe nela.
  const emailMudou = email !== undefined && email !== normalizarEmail(target.email);
  if (email  !== undefined) updates.email  = email;
  if (emailMudou) updates.emailConfirmadoEm = null;
  if (avisarAgendamentos !== undefined) updates.avisarAgendamentos = avisarAgendamentos;
  if (phone  !== undefined) updates.phone  = phone;
  // Desligar derruba as sessões abertas: até 18/10/2026 só o `active` barrava, e reativar
  // depois ressuscitava a sessão do celular que podia ter sido o motivo de desligar
  // (`lib/session.ts` recusa sessão emitida antes de `senha_trocada_em`).
  if (active === false && target.active) updates.senhaTrocadaEm = new Date();

  try {
    await db.update(barbers).set(updates).where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id)));
  } catch (err) {
    if (violouUnico(err, 'barbers_phone_ativo_uq')) {
      return json({
        error: active === true && !target.active
          ? 'Este WhatsApp agora é o login de um barbeiro ativo em outra barbearia. Troque o WhatsApp dele antes de reativar.'
          : 'Este WhatsApp já é o login de outro barbeiro.',
      }, 409);
    }
    throw err;
  }

  // E-mail novo: o link de senha nova que foi para o endereço anterior morre — inclusive o
  // que um intruso pediu depois de trocar o e-mail pelo dele (`lib/redefinicaoDeSenha.ts`).
  if (email !== undefined && email !== target.email) await cancelarPedidosDeSenha(tenant.id, id);

  // O e-mail mudou: o endereço antigo fica sabendo — é a última coisa que chega nele
  // (`lib/avisoDeEmailTrocado.ts`). Quem pega o painel aberto de um dono, troca o
  // e-mail e pede a senha nova não leva a conta em silêncio.
  if (email !== undefined && trocaQueAvisa(target.email, email)) {
    const quem = isSelf
      ? { name: name ?? target.name }
      : await first(db.select({ name: barbers.name }).from(barbers)
          .where(and(eq(barbers.id, session.barberId), eq(barbers.tenantId, tenant.id))));
    await avisarEmailTrocado({
      tenant,
      pessoa: { id, nome: name ?? target.name, papel: role ?? (target.role as 'admin' | 'barber') },
      antigo: target.email,
      antigoConfirmado: !!target.emailConfirmadoEm,
      novo: email,
      quemTrocou: { id: session.barberId, nome: quem?.name ?? 'o dono da barbearia' },
    });
  }

  // O endereço novo recebe o link de confirmação — e só ele, até confirmar.
  const confirmacao = emailMudou && email
    ? await pedirConfirmacao({ tenantId: tenant.id, barberId: id, esperarEnvio: false })
    : null;
  return json({ ok: true, ...(confirmacao ? { confirmacao } : {}) });
};
