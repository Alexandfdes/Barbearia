export const prerender = false;

/**
 * A entrada no painel do operador — a senha e, com `OPERADOR_SEGUNDO_FATOR`, o código
 * de 6 dígitos do aplicativo (13/10/2026, `lib/segundoFator.ts`). Sem a variável, só a
 * senha, como desde 11/10 (`lib/operador.ts`).
 *
 * Com o segundo fator, a resposta não diz qual dos dois errou: "senha ou código
 * errado". O log diz — e "senha certa, código errado" é o aviso de que a senha vazou.
 * O código só é conferido com a senha certa: um código roubado com a senha errada não
 * gasta o código de quem é dono dele.
 *
 * Duas camadas de limite, como no login do painel (`api/auth/login.ts`), mas mais
 * apertadas — sem o segundo fator, o limite é a única coisa entre quem testa senhas
 * e a senha:
 *
 *  1. **Por IP:** 5 tentativas a cada 15 minutos.
 *  2. **No total:** 20 a cada 15 minutos, de qualquer IP. É o que segura quem
 *     troca de IP a cada tentativa. O custo: quem quiser pode esgotar as 20 e
 *     deixar o operador 15 minutos sem entrar. Para uma tela usada por uma
 *     pessoa, de vez em quando, é a troca certa.
 *
 * ⚠️ O limite mora na memória do processo (`lib/rateLimit.ts`): zera a cada deploy
 * e valeria por réplica se um dia houver mais de uma.
 *
 * O limite é conferido ANTES do scrypt: a conta é cara de propósito (~32 MiB e
 * dezenas de milissegundos), e sem isto cada tentativa seria uma chance de cansar
 * o servidor.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../lib/api.js';
import { checkRateLimit, resetRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import {
  conferirSenha, cookieDoOperador, naoEncontrado, portaoDoOperador, VARIAVEL_DA_SENHA,
} from '../../../lib/operador.js';
import { registrarEntrada } from '../../../lib/operadorBarbearias.js';
import { conferirCodigo, lerSegundoFator } from '../../../lib/segundoFator.js';

const corpoSchema = z.object({ senha: z.string().min(1).max(200), codigo: z.string().max(20).optional() });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (portaoDoOperador(request) !== 'aberto') return naoEncontrado();

  // Só JSON, pelo mesmo motivo do login do painel: um formulário de outro site
  // manda `text/plain` sem pré-voo de CORS.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }
  let corpo: unknown;
  try { corpo = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }
  const parsed = corpoSchema.safeParse(corpo);
  if (!parsed.success) return json({ error: 'Digite a senha.' }, 400);

  const ip = getClientIp(request, clientAddress);

  const total = checkRateLimit('operador-entrar:total', { maxTries: 20 });
  if (!total.ok) {
    console.warn(`[operador] limite total de tentativas atingido (ip ${ip})`);
    return json({ error: `Muitas tentativas. Tente em ${total.retryAfterSecs}s.` }, 429);
  }
  const chave = `operador-entrar:${ip}`;
  const porIp = checkRateLimit(chave, { maxTries: 5 });
  if (!porIp.ok) return json({ error: `Muitas tentativas. Tente em ${porIp.retryAfterSecs}s.` }, 429);

  const fator = lerSegundoFator();
  if (fator.ligado === true && !parsed.data.codigo?.trim()) {
    return json({ error: 'Digite o código do aplicativo.' }, 400);
  }

  if (!(await conferirSenha(parsed.data.senha, process.env[VARIAVEL_DA_SENHA]))) {
    console.warn(`[operador] senha errada (ip ${ip})`);
    return json({ error: fator.ligado === true ? 'Senha ou código errado.' : 'Senha errada.' }, 401);
  }
  if (fator.ligado === true && !conferirCodigo(parsed.data.codigo!, fator)) {
    console.warn(`[operador] ⚠️ senha CERTA e código errado (ip ${ip}) — se não foi você, a senha vazou: troque-a (npm run operador:senha)`);
    return json({ error: 'Senha ou código errado.' }, 401);
  }

  resetRateLimit(chave);
  // Gravada ANTES de abrir a sessão: entrada que não fica registrada não acontece.
  await registrarEntrada(ip);
  console.info(`[operador] entrou (ip ${ip})`);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': await cookieDoOperador(), 'Cache-Control': 'no-store' },
  });
};
