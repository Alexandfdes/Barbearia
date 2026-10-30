export const prerender = false;

/**
 * Manda de novo o link de confirmação do e-mail (`lib/confirmacaoDeEmail.ts`).
 *
 * Quem pode: o dono, para qualquer pessoa da equipe; o barbeiro, só para si — o Início
 * mostra o aviso a todo mundo cujo e-mail não está confirmado.
 */
import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { barbers } from '../../../../../db/schema.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';
import { pedirConfirmacao, type ResultadoDoPedidoDeConfirmacao } from '../../../../../lib/confirmacaoDeEmail.js';
import { mascararEmail } from '../../../../../lib/email.js';

const RESPOSTAS: Record<Exclude<ResultadoDoPedidoDeConfirmacao, 'enviado'>, [number, string]> = {
  'sem-email': [400, 'Sem e-mail cadastrado. Ponha um em Editar e salve.'],
  'ja-confirmado': [409, 'Este e-mail já está confirmado.'],
  'cedo-demais': [429, 'O link acabou de sair. Espere um minuto antes de pedir outro — e olhe também o spam.'],
  'limite-do-dia': [429, 'Já saíram 5 links hoje. Confira se o e-mail está certo, e tente de novo amanhã.'],
  'sem-painel': [503, 'O endereço do painel não está configurado neste servidor: o link sairia quebrado.'],
  'sem-envio': [503, 'O envio de e-mail ainda não está ligado neste servidor. Nenhum e-mail sai por enquanto.'],
  'falhou': [503, 'O e-mail não saiu agora. Tente de novo daqui a pouco.'],
};

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);
  if (session.role !== 'admin' && id !== session.barberId) return json({ error: 'Acesso restrito ao admin' }, 403);

  const alvo = await first(db.select({ email: barbers.email }).from(barbers)
    .where(and(eq(barbers.id, id), eq(barbers.tenantId, tenant.id))));
  if (!alvo) return json({ error: 'Barbeiro não encontrado' }, 404);

  const r = await pedirConfirmacao({ tenantId: tenant.id, barberId: id });
  if (r === 'enviado') {
    return json({ ok: true, mensagem: `Link enviado para ${mascararEmail(alvo.email ?? '')}. Olhe também o spam.` });
  }
  const [status, error] = RESPOSTAS[r];
  return json({ error, motivo: r }, status);
};
