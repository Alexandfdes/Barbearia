/**
 * O token das tarefas agendadas, do lado do daemon — o mesmo de
 * `src/lib/tarefas.ts`, que explica por que ele existe e de onde vem.
 *
 * Duas cópias porque o daemon roda fora do bundle do app, em JavaScript puro.
 * `tests/avisos.test.ts` confere que as duas dão o mesmo resultado: se uma mudar
 * sozinha, os avisos param de sair sem erro nenhum, e o teste fica vermelho antes.
 */
import { createHmac } from 'node:crypto';

export const ROTULO_DAS_TAREFAS = 'tarefas-agendadas:v1';

export function tokenDasTarefas(segredo = process.env.SESSION_SECRET) {
  if (!segredo || segredo.length < 32) return null;
  return createHmac('sha256', segredo).update(ROTULO_DAS_TAREFAS).digest('hex');
}
