/**
 * Daemon dos avisos por e-mail: chama a tarefa do app de hora em hora.
 *
 * Lançado em background pelo CMD do Dockerfile, como o de backup. Não faz o
 * trabalho: a regra dos avisos mora no app (`src/lib/avisos.ts`), testada, e este
 * script só bate na porta local — `POST /api/tarefas/avisos`, com o token de
 * `scripts/tarefas.mjs`.
 *
 * A primeira chamada sai 2 minutos depois do boot, quando o servidor já está de
 * pé; depois, de hora em hora. Deploy repetido não repete aviso: a trava está no
 * banco (`avisos_enviados`, migration 0008).
 *
 * Para rodar uma vez, à mão, com o servidor de pé (na máquina de desenvolvimento,
 * os e-mails vão para `data/emails/`):
 *
 *   node --env-file-if-exists=.env scripts/avisos-daemon.mjs --uma-vez
 */
import { tokenDasTarefas } from './tarefas.mjs';

const PORTA = process.env.PORT?.trim() || '4321';
const ENDERECO = `http://127.0.0.1:${PORTA}/api/tarefas/avisos`;
const UMA_HORA_MS = 60 * 60 * 1000;
const ESPERA_DO_BOOT_MS = 2 * 60 * 1000;
const PRAZO_DA_CHAMADA_MS = 10 * 60 * 1000;

/**
 * O mesmo erro, de hora em hora, sai no log uma vez só — e de novo quando muda ou
 * quando a tarefa volta a funcionar. Com o e-mail ainda não configurado, 24 linhas
 * iguais por dia ensinariam a não ler o log; uma só, na hora do deploy, se lê.
 */
let ultimoErro = '';
let ultimoResumo = '';
function falhou(mensagem) {
  if (mensagem !== ultimoErro) console.error(mensagem);
  ultimoErro = mensagem;
  return false;
}

export async function rodarAvisos() {
  const token = tokenDasTarefas();
  if (!token) return falhou('[avisos-daemon] ✕ SESSION_SECRET ausente ou curto: sem como chamar a tarefa.');
  try {
    const resposta = await fetch(ENDERECO, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PRAZO_DA_CHAMADA_MS),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return falhou(`[avisos-daemon] ✕ a tarefa respondeu ${resposta.status}: ${corpo.error ?? 'sem detalhe'}`);
    if (ultimoErro) {
      console.log('[avisos-daemon] ✓ a tarefa voltou a rodar.');
      ultimoErro = '';
    }
    // Rodada sem nada a fazer não escreve nada, e o mesmo "1 sem e-mail para
    // avisar" não se repete a cada hora: 24 linhas iguais por dia enterram no log
    // a linha que importa. E-mail mandado sai sempre.
    const resumo = `${corpo.enviados} enviado(s), ${corpo.falhas} falha(s), ${corpo.semDestinatario} sem e-mail para avisar`;
    if (corpo.enviados || ((corpo.falhas || corpo.semDestinatario) && resumo !== ultimoResumo)) {
      console.log(`[avisos-daemon] ✓ ${resumo}`);
    }
    ultimoResumo = resumo;
    return true;
  } catch (erro) {
    return falhou(`[avisos-daemon] ✕ a tarefa não respondeu: ${erro instanceof Error ? erro.message : erro}`);
  }
}

if (process.argv.includes('--uma-vez')) {
  const ok = await rodarAvisos();
  if (ok) console.log('[avisos-daemon] rodada única concluída.');
  process.exitCode = ok ? 0 : 1;
} else if (process.argv[1]?.endsWith('avisos-daemon.mjs')) {
  setTimeout(() => {
    rodarAvisos();
    setInterval(rodarAvisos, UMA_HORA_MS);
  }, ESPERA_DO_BOOT_MS);
  console.log(`[avisos-daemon] agendado: de hora em hora, a primeira em 2 minutos (${ENDERECO})`);
}
