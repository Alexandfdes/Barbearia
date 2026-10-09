export const prerender = false;

/**
 * A tarefa de hora em hora dos avisos por e-mail (`lib/avisos.ts`).
 *
 * Quem chama é o `scripts/avisos-daemon.mjs`, no mesmo container — o mesmo jeito
 * do backup diário (`scripts/backup-daemon.mjs`), lançado pelo CMD do Dockerfile.
 *
 * Rejeitado: o cron do EasyPanel. Para app com Dockerfile, ele roda DENTRO do
 * container e pede o `crond` no lugar do comando que sobe o servidor (conferido
 * na documentação do EasyPanel em 09/10/2026). Rejeitado também: um serviço de
 * cron de fora, como o cron-job.org — mais uma conta, e a tarefa parando sem
 * ninguém ver no dia em que ela vencer.
 *
 * Sem o token certo responde 404, como se não existisse: rota que responde
 * "proibido" anuncia que existe. O token vem de `lib/tarefas.ts`.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../lib/api.js';
import { chamadaDaTarefa } from '../../../lib/tarefas.js';
import { enviarAvisosPendentes } from '../../../lib/avisos.js';

export const POST: APIRoute = async ({ request }) => {
  if (!chamadaDaTarefa(request)) return new Response('Not found', { status: 404 });

  try {
    const resumo = await enviarAvisosPendentes();
    return json({ ok: true, ...resumo });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error('[avisos] a tarefa não rodou:', motivo);
    return json({ error: motivo }, 503);
  }
};
