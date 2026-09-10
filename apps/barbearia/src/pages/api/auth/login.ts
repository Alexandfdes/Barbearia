export const prerender = false;

/**
 * Login do painel — por TELEFONE.
 *
 * ── POR QUE NÃO É MAIS POR SLUG ──────────────────────────────────────────────
 *
 * O slug era único no mundo. A migration 0001 o tornou único POR BARBEARIA, e o
 * painel é central (painel.barbearianoar.com.br): não há endereço de onde
 * deduzir de quem é o login. Dois donos chamados "bayron" colidiam.
 *
 * O telefone é único no mundo por natureza (migration 0002), então ele responde
 * as duas perguntas de uma vez: quem é a pessoa, e de qual barbearia.
 *
 * ── ESTA ROTA É A QUE GRAVA O TENANT NA SESSÃO ───────────────────────────────
 *
 * `session.tenantId` existia vazio desde o passo 1. É aqui que ele passa a ser
 * preenchido — e é o que o passo 5 vai ler em `tenantDaSessao()` para o painel
 * inteiro parar de operar sobre um tenant fixo.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { barbers, tenants } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { makeSessionCookie } from '../../../lib/session.js';
import { checkRateLimit, resetRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { normalizePhone } from '../../../lib/phone.js';

const bodySchema = z.object({
  // Aceita como a pessoa digita — "(84) 99999-0000" — e normaliza aqui.
  // `identificador` e não `phone` porque durante a transição ele também aceita
  // slug; ver o bloco de transição mais abaixo.
  identificador: z.string().min(1).max(50),
  password:      z.string().min(1).max(200),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Campos obrigatórios' }, 400);

  const { identificador, password } = parsed.data;
  const telefone = normalizePhone(identificador);

  const ip = getClientIp(request, clientAddress);

  // 2 camadas de rate limit:
  // (1) Global por IP — protege contra varredura de telefones (15 / 15min)
  // (2) Por IP+identificador — força bruta de senha de uma conta (5 / 15min)
  //
  // A chave da segunda usa o valor NORMALIZADO: senão "84999990000",
  // "(84) 99999-0000" e "+5584999990000" seriam três contadores para a mesma
  // conta, e o limite de 5 viraria 15.
  const globalRl = checkRateLimit(`admin-login-global:${ip}`, { maxTries: 15 });
  if (!globalRl.ok) {
    return json({ error: `Muitas tentativas deste IP. Tente em ${globalRl.retryAfterSecs}s` }, 429);
  }

  const rlKey = `${ip}:${telefone || identificador.toLowerCase()}`;
  const rl    = checkRateLimit(rlKey);
  if (!rl.ok) {
    return json({ error: `Muitas tentativas. Tente em ${rl.retryAfterSecs}s` }, 429);
  }

  const colunas = {
    id: barbers.id,
    tenantId: barbers.tenantId,
    role: barbers.role,
    passwordHash: barbers.passwordHash,
    active: barbers.active,
  };

  let barbeiro: { id: number; tenantId: number; role: string; passwordHash: string; active: boolean } | undefined;

  if (telefone) {
    barbeiro = await first(db.select(colunas).from(barbers).where(eq(barbers.phone, telefone)));
  } else {
    /**
     * ── TRANSIÇÃO ────────────────────────────────────────────────────────────
     *
     * Os barbeiros que já existem não têm telefone cadastrado, e o Bayron não
     * pode ficar sem acesso ao painel no dia em que isto subir. Então o slug
     * continua valendo — mas SÓ ENQUANTO EXISTIR UMA BARBEARIA SÓ.
     *
     * Com duas ou mais, o slug volta a ser ambíguo e esta rota recusa em vez de
     * escolher. Recusar é a única saída honesta: entrar na barbearia errada dá
     * ao dono de uma o painel da outra.
     *
     * Para remover este bloco: cadastre o telefone de todos os barbeiros e
     * apague daqui até o `}` abaixo. O teste `login.test.ts` cobre os dois
     * caminhos e vai apontar se algo depender do slug depois disso.
     */
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tenants);
    if (n > 1) {
      return json({
        error: 'Entre com o seu telefone. O acesso por usuário não vale mais com várias barbearias.',
      }, 400);
    }
    barbeiro = await first(
      db.select(colunas).from(barbers).where(eq(barbers.slug, identificador.toLowerCase()))
    );
  }

  const isValid = barbeiro?.active && barbeiro.passwordHash
    ? await compare(password, barbeiro.passwordHash)
    : false;

  // Mensagem única de propósito: distinguir "telefone não existe" de "senha
  // errada" entrega uma lista de telefones cadastrados a quem estiver testando.
  if (!isValid || !barbeiro) {
    return json({ error: 'Telefone ou senha inválidos' }, 401);
  }

  // A barbearia precisa estar ativa. Sessão viva de barbearia suspensa é como um
  // inadimplente continua usando o sistema (regra 6 da skill barbearia-multi-tenant).
  const barbearia = await first(
    db.select({ status: tenants.status })
      .from(tenants)
      .where(and(eq(tenants.id, barbeiro.tenantId), eq(tenants.status, 'active')))
  );
  if (!barbearia) {
    return json({ error: 'Esta barbearia está suspensa. Fale com o suporte.' }, 403);
  }

  resetRateLimit(rlKey);

  const cookie = await makeSessionCookie({
    barberId: barbeiro.id,
    role:     barbeiro.role as 'admin' | 'barber',
    // O que o passo 5 vai ler em tenantDaSessao().
    tenantId: barbeiro.tenantId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
};
