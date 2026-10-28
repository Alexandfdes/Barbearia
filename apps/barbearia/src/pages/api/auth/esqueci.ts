export const prerender = false;

/**
 * "Esqueci minha senha": recebe o WhatsApp de login e manda o link para o e-mail
 * gravado. As regras estão em `lib/redefinicaoDeSenha.ts`.
 *
 * ── A RESPOSTA NÃO PODE DIZER SE O NÚMERO EXISTE — NEM PELO TEMPO ────────────
 *
 * O texto é o mesmo para todo número, e o envio NÃO é esperado: a rota responde
 * antes de o e-mail sair. Esperar o envio seria responder em um ou dois segundos
 * para número cadastrado e na hora para o resto — e o relógio entregaria, sem uma
 * palavra, a lista de quem é cliente.
 *
 * A única resposta diferente é a do envio desligado — `SMTP_URL` ausente em
 * produção, ou nenhum endereço do painel para pôr no link. Ela vale para qualquer
 * número, então não revela nenhum — e é melhor que prometer um e-mail que não vai
 * chegar.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { json } from '../../../lib/api.js';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { getClientIp } from '../../../lib/clientIp.js';
import { normalizePhone } from '../../../lib/phone.js';
import { transporteDeEmail } from '../../../lib/email.js';
import { urlDoPainel } from '../../../lib/tenant.js';
import { pedirRedefinicao } from '../../../lib/redefinicaoDeSenha.js';

const UMA_HORA_MS = 60 * 60 * 1000;

const bodySchema = z.object({
  whatsapp: z.string().trim().min(1).max(50),
});

/** O que a tela mostra depois do pedido, exista o número ou não. */
export const RESPOSTA_DO_PEDIDO =
  'Se este WhatsApp estiver cadastrado com um e-mail, o link para criar a senha nova está a caminho. ' +
  'Ele vale por 1 hora. Não chegou em alguns minutos? Olhe a caixa de spam.';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Só JSON, pelo mesmo motivo do cadastro (`api/cadastrar.ts`): um formulário de
  // outro site manda `text/plain` sem pedir licença, e esta rota dispara e-mail.
  // Com `application/json`, o navegador exige o pré-voo de CORS, que este servidor
  // não autoriza — e ninguém usa a página dos outros para mandar e-mail em nosso nome.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Envie os dados como JSON.' }, 415);
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Informe o seu WhatsApp.' }, 400);

  // Dois limites: por aparelho, contra quem varre números; por número, contra
  // quem enche a caixa de e-mail de um dono de pedidos que ele não fez.
  const ip = getClientIp(request, clientAddress);
  const porIp = checkRateLimit(`senha-nova-ip:${ip}`, { maxTries: 5, windowMs: UMA_HORA_MS });
  if (!porIp.ok) {
    return json({ error: `Muitos pedidos deste aparelho. Tente de novo em ${minutos(porIp.retryAfterSecs)}.` }, 429);
  }
  const telefone = normalizePhone(parsed.data.whatsapp);
  if (telefone) {
    const porNumero = checkRateLimit(`senha-nova-tel:${telefone}`, { maxTries: 3, windowMs: UMA_HORA_MS });
    if (!porNumero.ok) {
      // A MESMA resposta do pedido aceito, sem mandar nada (27/10/2026). Antes era 429, e
      // quem gastasse os 3 pedidos do número de um dono — o WhatsApp dele está no site —
      // trancava também esta saída, a única de quem foi trancado fora do login. Os pedidos
      // de quem gastou já mandaram o link ao e-mail do dono: o último vale por 1 hora.
      return json({ ok: true, mensagem: RESPOSTA_DO_PEDIDO });
    }
  }

  if (transporteDeEmail() === 'nenhum' || !urlDoPainel()) {
    return json({
      error: 'A senha nova por e-mail ainda não está funcionando. Fale com o suporte pelo WhatsApp.',
    }, 503);
  }

  // Sem `await`, de propósito — ver o cabeçalho. `pedirRedefinicao` não lança, e o
  // `catch` é a segunda rede: promessa rejeitada sem dono derruba o processo
  // inteiro no Node, e com ele o site de todas as barbearias.
  pedirRedefinicao(parsed.data.whatsapp)
    .then((resultado) => {
      if (resultado !== 'enviado' && resultado !== 'sem-cadastro') {
        console.warn(`[senha] pedido de senha nova não enviado: ${resultado}`);
      }
    })
    .catch((erro) => console.error('[senha] o pedido de senha nova falhou:', erro));

  return json({ ok: true, mensagem: RESPOSTA_DO_PEDIDO });
};

function minutos(segundos = 60): string {
  const m = Math.max(1, Math.ceil(segundos / 60));
  return m === 1 ? '1 minuto' : `${m} minutos`;
}
