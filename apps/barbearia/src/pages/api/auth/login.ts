export const prerender = false;

/**
 * Login do painel — por TELEFONE.
 *
 * ── POR QUE NÃO É MAIS POR SLUG ──────────────────────────────────────────────
 *
 * O slug era único no mundo. A migration 0001 o tornou único POR BARBEARIA, e o
 * painel é central (painel.<DOMINIO_BASE>): não há endereço de onde
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
import { compare, hash } from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
/**
 * ⚠️ `dbDono` e não `db`, e este é UM DOS DOIS lugares onde isso é certo.
 *
 * O login é a porta: ele precisa achar o barbeiro pelo telefone ANTES de saber
 * de qual barbearia ele é — é esse o trabalho da rota. Com a conexão da
 * requisição (sob row level security, passo 5.1), a busca só enxergaria a
 * barbearia do host, e o dono da segunda barbearia simplesmente não entraria.
 *
 * `tests/rls.test.ts` mantém a lista de quem pode usar `dbDono` fechada.
 */
import { dbDono, first } from '../../../db/index.js';
import { barbers, tenants } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { makeSessionCookie } from '../../../lib/session.js';
import { situacaoDe, noAr } from '../../../lib/situacao.js';
import { LIMITE_DA_CONTA, chavesDaConta, checkRateLimit, resetRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { normalizePhone } from '../../../lib/phone.js';

/**
 * O limite por CONTA, de qualquer endereço (17/10/2026). Até aqui só havia o por IP: com
 * cem endereços, quinhentas tentativas a cada 15 minutos contra o mesmo WhatsApp — que é
 * público. O preço: quem souber o número tranca o dono por um tempo; a saída é o "esqueci
 * a senha", que zera os dois contadores (`redefinirSenha`, em `lib/redefinicaoDeSenha.ts`).
 */

/**
 * O bcrypt roda mesmo sem barbeiro: sem isto, o telefone sem conta respondia na hora e o
 * com conta levava ~250 ms — a mensagem era a mesma de propósito, e o relógio entregava
 * quem tem conta no painel. O custo é o mesmo das senhas de verdade (12).
 */
let hashDeMentira: Promise<string> | null = null;
const semConta = async (senha: string) => compare(senha, await (hashDeMentira ??= hash('nenhuma-conta-tem-esta-senha', 12)));

const bodySchema = z.object({
  // Aceita como a pessoa digita — "(84) 99999-0000" — e normaliza aqui.
  // `identificador` e não `phone` porque durante a transição ele também aceita
  // slug; ver o bloco de transição mais abaixo.
  identificador: z.string().min(1).max(50),
  password:      z.string().min(1).max(200),
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Só JSON. Com o `checkOrigin` desligado (`astro.config.mjs`), um formulário de
  // outro site manda `text/plain` com corpo em forma de JSON sem pré-voo nenhum —
  // e esta rota abriria sessão: o visitante ficaria logado numa conta do atacante
  // ("login CSRF"), e o que ele cadastrasse depois iria para lá. `application/json`
  // vindo de outro site exige o pré-voo de CORS, que este servidor não autoriza.
  // Até 09/10/2026 faltava esta linha (`PENDENCIAS-ABERTAS.md` §2.23).
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }

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

  // (3) Por conta, de qualquer IP — a força bruta distribuída.
  if (telefone) {
    const [curta, doDia] = chavesDaConta(telefone);
    const conta = checkRateLimit(curta, LIMITE_DA_CONTA.curto);
    const dia = conta.ok ? checkRateLimit(doDia, LIMITE_DA_CONTA.dia) : conta;
    if (!conta.ok || !dia.ok) {
      return json({ error: 'Muitas tentativas com este WhatsApp. Tente mais tarde, ou use "Esqueci minha senha".' }, 429);
    }
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
    barbeiro = await first(dbDono.select(colunas).from(barbers).where(eq(barbers.phone, telefone)));
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
    const [{ n }] = await dbDono.select({ n: sql<number>`count(*)::int` }).from(tenants);
    if (n > 1) {
      return json({
        error: 'Entre com o seu WhatsApp. O acesso por usuário não vale mais com várias barbearias.',
      }, 400);
    }
    barbeiro = await first(
      dbDono.select(colunas).from(barbers).where(eq(barbers.slug, identificador.toLowerCase()))
    );
  }

  const isValid = barbeiro?.active && barbeiro.passwordHash
    ? await compare(password, barbeiro.passwordHash)
    : (await semConta(password), false);

  // Mensagem única de propósito: distinguir "telefone não existe" de "senha
  // errada" entrega uma lista de telefones cadastrados a quem estiver testando.
  if (!isValid || !barbeiro) {
    return json({ error: 'WhatsApp ou senha inválidos' }, 401);
  }

  // A situação da barbearia decide para onde ele vai — e se entra.
  //
  // ⚠️ FORA DO AR ENTRA, desde 08/10/2026, e isso não reabre o painel: a sessão
  // de barbearia suspensa só abre a tela de assinatura (`src/middleware.ts`); para
  // o resto, `getSession()` continua devolvendo `null` — a regra 6 da skill
  // barbearia-multi-tenant segue valendo. Até essa data o login recusava, e o
  // dono que deixou o teste vencer não tinha como ver o motivo nem como pagar.
  // ENCERRADA continua recusada.
  const barbearia = await first(
    dbDono.select({ status: tenants.status, testeAte: tenants.trialEndsAt, atrasadaDesde: tenants.pastDueSince, carenciaAte: tenants.carenciaAte, encerraEm: tenants.subscriptionEndsAt, fuso: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, barbeiro.tenantId))
  );
  const situacao = barbearia ? situacaoDe(barbearia) : null;
  if (!situacao || situacao.fase === 'cancelada') {
    return json({ error: 'Esta barbearia foi encerrada. Fale com o suporte.' }, 403);
  }

  resetRateLimit(rlKey);

  const cookie = await makeSessionCookie({
    barberId: barbeiro.id,
    role:     barbeiro.role as 'admin' | 'barber',
    // O que o passo 5 vai ler em tenantDaSessao().
    tenantId: barbeiro.tenantId,
  });

  return new Response(JSON.stringify({ ok: true, destino: noAr(situacao) ? '/admin' : '/admin/assinatura' }), {
    status:  200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
  });
};
