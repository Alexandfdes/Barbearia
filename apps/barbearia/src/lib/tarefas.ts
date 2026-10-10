/**
 * Quem pode chamar as tarefas agendadas do app — hoje, só a dos avisos por e-mail
 * (`pages/api/tarefas/avisos.ts`).
 *
 * Quem chama é o `scripts/avisos-daemon.mjs`, no mesmo container, pela porta
 * local. A senha da chamada não é uma variável nova: é derivada do
 * `SESSION_SECRET`, que os dois processos já recebem do ambiente. Uma variável a
 * mais seria uma a mais para esquecer no EasyPanel — e a tarefa esquecida não dá
 * erro nenhum: os avisos simplesmente param de sair.
 *
 * O HMAC não revela o segredo de onde vem, e quem tem o `SESSION_SECRET` já
 * forjaria qualquer sessão: não há permissão nova aqui.
 *
 * ⚠️ O daemon calcula o mesmo token em `scripts/tarefas.mjs`, em JavaScript puro,
 * porque roda fora do bundle do app. `tests/avisos.test.ts` confere que os dois
 * dão o mesmo resultado.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ROTULO_DAS_TAREFAS = 'tarefas-agendadas:v1';

export function tokenDasTarefas(segredo: string | undefined = process.env.SESSION_SECRET): string | null {
  if (!segredo || segredo.length < 32) return null;
  return createHmac('sha256', segredo).update(ROTULO_DAS_TAREFAS).digest('hex');
}

/** O pedido traz o token certo? Comparação em tempo constante. */
export function chamadaDaTarefa(request: Request): boolean {
  const esperado = tokenDasTarefas();
  if (!esperado) return false;
  const recebido = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
