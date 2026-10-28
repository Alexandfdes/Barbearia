export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { json } from '../../../lib/api.js';
import { checkRateLimit, resetRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { makeCustomerSessionCookie, normalizePhone } from '../../../lib/customerSession.js';
import { tenantDoHost, type Tenant } from '../../../lib/tenant.js';

const bodySchema = z.object({
  phone:     z.string().min(10).max(25),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida'),
});

// customer_phone é armazenado normalizado (migration 0004) — comparação direta
// usa o índice appt_phone_idx.
//
// COUNT/SUM no Postgres voltam como bigint, que o driver entrega em string pra
// não perder precisão. Por isso todo agregado passa por Number() antes de virar
// comparação — `'0' === 0` seria falso e a conta de login sempre falharia.
async function contarComBirthdate(phone: string, birthdate: string, tenant: Tenant): Promise<number> {
  const r = await first(db.execute<{ c: string }>(sql`
    SELECT COUNT(*) AS c FROM appointments
    WHERE tenant_id = ${tenant.id}
      AND customer_phone = ${phone} AND customer_birthdate = ${birthdate}
  `));
  return Number(r?.c ?? 0);
}

// Conta agendamentos do telefone independente de birthdate — usado pra distinguir
// "telefone não cadastrado" de "telefone cadastrado mas sem birthdate".
async function contarPorTelefone(phone: string, tenant: Tenant): Promise<{ total: number; semBirthdate: number }> {
  const r = await first(db.execute<{ total: string; without_birthdate: string | null }>(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN customer_birthdate IS NULL THEN 1 ELSE 0 END) AS without_birthdate
    FROM appointments
    WHERE tenant_id = ${tenant.id} AND customer_phone = ${phone}
  `));
  return { total: Number(r?.total ?? 0), semBirthdate: Number(r?.without_birthdate ?? 0) };
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const tenant = tenantDoHost(request);
  // Endereço que não é de barbearia nenhuma. 404 de propósito: servir o site da
  // barbearia errada é pior que não servir nada (`lib/tenant.ts`, passo 6).
  if (!tenant) return json({ error: 'Barbearia não encontrada' }, 404);
  // Só JSON, pelo mesmo motivo do login do painel (`api/auth/login.ts`): esta rota
  // abre sessão, e um formulário de outro site manda `text/plain` sem pré-voo.
  // Faltava desde sempre; entrou em 09/10/2026 (`PENDENCIAS-ABERTAS.md` §2.23).
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }
  // Rate limit por IP — protege contra brute-force de números/datas
  const ip = getClientIp(request, clientAddress);
  const rl = checkRateLimit(`customer-login:${ip}`);
  if (!rl.ok) {
    return json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }, 429);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Dados inválidos' }, 400);

  const phone = normalizePhone(parsed.data.phone);
  if (phone.length < 10) return json({ error: 'Telefone inválido' }, 400);

  const compareKey = phone.length >= 11 ? phone.slice(-11) : phone;
  const birthdate  = parsed.data.birthdate;

  // ── Limite por TELEFONE, além do por IP (`PENDENCIAS-ABERTAS.md` §2.33, item 2) ──
  //
  // A data de nascimento é a senha da área do cliente (mantido pelo dono em
  // 11/10/2026), e o limite por IP acima não segura quem troca de endereço: o
  // alvo é o telefone. Duas janelas: 5 tentativas a cada 15 minutos e 10 por dia.
  // A conta que importa: são ~23 mil datas possíveis para um adulto, e 10 por dia
  // são anos para varrer todas. Com o limite só por IP, quem tem muitos endereços
  // não tinha limite nenhum; com um endereço só, eram umas sete semanas.
  //
  // ⚠️ O custo, aceito: qualquer um bloqueia por um dia a área do cliente de um
  // telefone, errando de propósito. É a área de consulta — agendar pelo site
  // continua funcionando para ele. E o limite mora na memória do processo
  // (`lib/rateLimit.ts`): zera a cada deploy. Quem sabe a data (rede social,
  // aniversário em grupo) entra na primeira tentativa: isto atrasa quem chuta,
  // não protege de quem sabe.
  //
  // A chave leva a barbearia: o mesmo telefone pode ser cliente de duas.
  // A janela curta vem primeiro, e o que ela recusa não gasta a cota do dia.
  const chaveCurta = `customer-login-tel:${tenant.id}:${compareKey}`;
  const chaveDoDia = `customer-login-tel-dia:${tenant.id}:${compareKey}`;
  const muitas = { error: 'Muitas tentativas com este telefone. Tente novamente mais tarde.' };
  if (!checkRateLimit(chaveCurta, { maxTries: 5, windowMs: 15 * 60 * 1000 }).ok) return json(muitas, 429);
  if (!checkRateLimit(chaveDoDia, { maxTries: 10, windowMs: 24 * 60 * 60 * 1000 }).ok) return json(muitas, 429);

  const match = await contarComBirthdate(compareKey, birthdate, tenant);

  if (match === 0) {
    // Distingue "telefone existe mas sem birthdate" (cliente antigo) de "não bate".
    // Mostra mensagem específica pro cliente antigo orientando a refazer agendamento.
    const any = await contarPorTelefone(compareKey, tenant);
    if (any.total > 0 && any.total === any.semBirthdate) {
      return json({
        error: 'Seu cadastro é anterior ao novo portal. Faça um novo agendamento ou peça pra barbearia atualizar sua data de nascimento.',
        code:  'legacy_no_birthdate',
      }, 403);
    }
    // Resposta genérica: não confirma se o telefone existe ou não
    return json({ error: 'Telefone ou data de nascimento não conferem.' }, 404);
  }

  // Acertou: a cota do telefone volta inteira — quem errou o dia duas vezes antes
  // de acertar não fica mais perto do bloqueio na próxima visita.
  resetRateLimit(chaveCurta);
  resetRateLimit(chaveDoDia);

  const cookie = await makeCustomerSessionCookie({ phone: compareKey, birthdate, tenantId: tenant.id });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie':   cookie,
    },
  });
};
