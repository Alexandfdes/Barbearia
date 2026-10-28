export const prerender = false;

/**
 * O webhook da Asaas: os eventos do Checkout, da assinatura e das cobranças
 * (`lib/cobranca.ts`).
 *
 * ── O QUE ESTA ROTA GARANTE ──────────────────────────────────────────────────
 *
 * 1. **Só a Asaas entra.** O token configurado no webhook chega no cabeçalho
 *    `asaas-access-token` (documentação, 10/10/2026) e é comparado em tempo
 *    constante com `ASAAS_WEBHOOK_TOKEN`. Sem a variável, nada passa — webhook
 *    aberto seria qualquer um marcando qualquer barbearia como paga.
 * 2. **200 só depois do commit.** O evento é gravado e processado numa transação;
 *    se ela falha, a resposta é 500 e a Asaas reenvia. Repetido responde 200 sem
 *    fazer nada.
 * 3. **Evento que não interessa também responde 200.** Recusar faria a Asaas
 *    reenviar, e 15 falhas seguidas interrompem a fila do webhook inteiro
 *    (documentação) — os pagamentos de todas as barbearias param de chegar. Pelo
 *    mesmo motivo, o evento que falha por causa dele mesmo — um dado em conflito,
 *    um dado que o banco recusa — fica gravado com o erro e responde 200. Volta
 *    para a fila (500) a falha passageira, como o banco fora do ar, e o erro de
 *    programa, que quebraria todos os eventos iguais: aí a fila parar é o certo
 *    (`erroDefinitivo`, em `lib/cobranca.ts`).
 *
 * A lista de IPs da Asaas (`docs/ARQUITETURA-COBRANCA-V1.md` §4) não é conferida
 * aqui: atrás do proxy, o IP que chega é o do proxy. O token é a parede.
 *
 * Não é rota de barbearia: o `src/middleware.ts` a deixa passar antes de decidir
 * a barbearia, como as tarefas agendadas — quem diz de quem é o evento é o evento.
 */
import type { APIRoute } from 'astro';
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '../../../lib/api.js';
import { configDaAsaas } from '../../../lib/asaas.js';
import {
  erroDefinitivo, executarEfeitos, processarEventoDaAsaas, registrarEventoComFalha, type EventoAsaas,
} from '../../../lib/cobranca.js';
import { invalidarTenants } from '../../../lib/tenant.js';

/** O token confere? Em tempo constante — e sem token configurado, nunca. */
export function tokenConfere(recebido: string | null, esperado: string | undefined): boolean {
  const certo = esperado?.trim();
  if (!certo || !recebido) return false;
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(certo).digest();
  return timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request }) => {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado?.trim()) {
    console.error('[cobrança] webhook recusado: ASAAS_WEBHOOK_TOKEN não está definido.');
    return json({ error: 'Webhook não configurado.' }, 503);
  }
  if (!tokenConfere(request.headers.get('asaas-access-token'), esperado)) {
    console.warn('[cobrança] webhook recusado: o token não confere.');
    return json({ error: 'Não autorizado.' }, 401);
  }

  let evento: Partial<EventoAsaas> | null;
  try {
    evento = await request.json();
  } catch {
    return json({ error: 'O corpo não é JSON.' }, 400);
  }
  if (!evento || typeof evento.id !== 'string' || !evento.id || typeof evento.event !== 'string' || !evento.event) {
    return json({ error: 'Evento sem id ou sem tipo.' }, 400);
  }

  let resultado;
  try {
    resultado = await processarEventoDaAsaas(evento as EventoAsaas);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : erro;
    if (erroDefinitivo(erro)) {
      try {
        await registrarEventoComFalha(evento as EventoAsaas, erro);
      } catch {
        return json({ error: 'Falha ao processar o evento.' }, 500);
      }
      console.error(`[cobrança] ⚠️ ${evento.event} ${evento.id} falhou de um jeito que se repetiria — ` +
        'gravado com o erro em webhook_events, para tratar à mão; a fila segue:', motivo);
      return json({ ok: true, falhou: true });
    }
    console.error(`[cobrança] ${evento.event} ${evento.id} não foi processado — a Asaas vai reenviar:`, motivo);
    return json({ error: 'Falha ao processar o evento.' }, 500);
  }

  if (resultado.duplicado) return json({ ok: true, duplicado: true });

  // O status mudou no banco: o cache de barbearias não espera os 30 segundos.
  invalidarTenants();
  const quem = resultado.tenantId ? ` (barbearia ${resultado.tenantId})` : '';
  console.log(`[cobrança] ${evento.event} ${evento.id}${quem}: ${resultado.desfecho}`);
  if (resultado.efeitos.length) void executarEfeitos(resultado.efeitos, configDaAsaas());
  return json({ ok: true });
};
