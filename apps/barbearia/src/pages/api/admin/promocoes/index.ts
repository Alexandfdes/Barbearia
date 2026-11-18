export const prerender = false;

/**
 * Promoções em horário ocioso — o painel do dono (`lib/promocoesDaBarbearia.ts`).
 *
 * GET: as sugestões, com o desconto máximo de cada uma, e as promoções ativas.
 * POST: ativa uma. Exige `confirmacao: true` no corpo — o dono confirmou na tela o
 * desconto e o preço que o cliente vai pagar. Sem ela, 400: nada se ativa por engano, nem
 * por um pedido montado à mão.
 *
 * Só o dono: a sugestão mostra o custo dos produtos, e ativar muda o preço do site.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { ativarPromocao, painelDePromocoes } from '../../../../lib/promocoesDaBarbearia.js';
import { DESCONTO_MAXIMO_PCT } from '../../../../lib/promocoes.js';

const ativarSchema = z.object({
  comboId: z.number('Escolha o combo').int('Escolha o combo').positive('Escolha o combo'),
  diaDaSemana: z.number('Escolha o dia').int('Escolha o dia').min(0, 'Escolha o dia').max(6, 'Escolha o dia'),
  faixa: z.enum(['manha', 'tarde', 'fim'], 'Escolha a faixa de horário'),
  descontoPct: z.number('O desconto tem de ser um número')
    .int('O desconto é um número inteiro')
    .min(1, 'O desconto vai de 1% para cima')
    .max(DESCONTO_MAXIMO_PCT, `O desconto vai até ${DESCONTO_MAXIMO_PCT}%`),
  confirmacao: z.literal(true, 'Confirme a promoção antes de ativar.'),
});

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  return json(await painelDePromocoes(tenant));
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = ativarSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { confirmacao: _confirmou, ...pedido } = parsed.data;
  const r = await ativarPromocao(tenant, session.barberId, pedido);
  if (!r.ok) return json({ error: r.erro }, r.status);
  return json({ ok: true, id: r.id }, 201);
};
