/**
 * O aviso ao operador do backup que não sobe para fora do servidor (11/11/2026).
 *
 * Em 10/11/2026 o envio para o armazenamento de fora começou a ser recusado, e a falha passou mais
 * de um dia num log que ninguém lê — foi achada lendo um print. A tela de Sistema acusava
 * (`situacaoDoEnvio`, em `lib/operadorSistema.ts`), mas só para quem a abre. Agora a MESMA regra vira
 * e-mail ao `OPERADOR_EMAIL`, na tarefa de hora em hora dos avisos (`lib/avisos.ts`).
 *
 * ── QUANDO ─────────────────────────────────────────────────────────────────
 *
 * Nas duas situações em que a tela diz "problema": `falhou` (a última tentativa falhou) e `parado`
 * (o último envio certo tem mais de um dia, sem falha registrada depois — o backup pode nem estar
 * rodando). `nunca` não avisa: é o estado de logo depois de ligar as `S3_*`, antes do primeiro
 * diário. Sem as `S3_*` (`desligado`), não há envio para avisar.
 *
 * ── UMA VEZ POR DIA ────────────────────────────────────────────────────────
 *
 * Enquanto a situação durar, um e-mail por dia, no calendário do operador (`RELOGIO_DO_OPERADOR`, de
 * `lib/operadorTela.ts` — ele não é de barbearia nenhuma): um só seria
 * esquecido; um por hora ensinaria a apagar sem ler. A trava é um arquivo na pasta dos backups,
 * `envio-para-fora.avisado`, ao lado dos registros que o `scripts/backup.mjs` grava — o aviso não é
 * de barbearia nenhuma, e `avisos_enviados` é por barbearia. O nome fica fora dos padrões que a
 * retenção apaga e que quem procura backup lê (`.sql.gz`, `-fotos.tar.gz`).
 *
 * A reserva vem antes do envio e é desfeita se ele falha, como nos avisos do dono. Se a trava não se
 * grava, o aviso não sai: sem ela, sairia a cada hora.
 *
 * ⚠️ O texto leva só o que o sistema monta: as horas, a situação e o motivo que o `backup.mjs`
 * registrou — a mensagem do provedor e o que o SDK sabe dela, sem credencial (`detalheDaFalha`).
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// De `backupNoDisco`, não de `operadorSistema`: este caminho não pode chegar à cobrança
// (`tests/cobranca-isolada.test.ts`) — a tela de Sistema conversa com a Asaas.
import { backupNoPainel, situacaoDoEnvio } from './backupNoDisco.js';
import { emailDoOperador } from './avisoAoOperador.js';
import { enviarEmail, type Email } from './email.js';
import { urlDoPainel } from './tenant.js';
import { diaDe } from './situacao.js';
import { RELOGIO_DO_OPERADOR } from './operadorTela.js';
import { NOME_PRODUTO } from './produto.js';

type Ambiente = Record<string, string | undefined>;

/** A trava do aviso, na pasta dos backups: o dia do último aviso mandado. */
export const MARCA_DO_AVISO_DO_BACKUP = 'envio-para-fora.avisado';

/** O tamanho do motivo no e-mail — o mesmo corte do registro do `backup.mjs`. */
const MOTIVO_MAXIMO = 300;

export type DadosDoAvisoDoBackup =
  | { situacao: 'falhou'; falha: { em: Date; motivo: string }; ultimoCerto: Date | null; sistema: string }
  | { situacao: 'parado'; ultimoCerto: Date; sistema: string; agora: Date };

/** O motivo numa linha: sem quebra nem caractere de controle, e curto. */
function motivoNumaLinha(motivo: string): string {
  const limpo = motivo.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return limpo.length > MOTIVO_MAXIMO ? `${limpo.slice(0, MOTIVO_MAXIMO - 1)}…` : limpo;
}

const quando = (instante: Date) => diaDe(instante, RELOGIO_DO_OPERADOR, "dd/MM 'às' HH:mm");

/** O assunto e o texto. O assunto não muda com o motivo: o filtro de e-mail de quem lê fica estável. */
export function textoDoAvisoDoBackup(d: DadosDoAvisoDoBackup): { assunto: string; texto: string } {
  const fim = [
    '',
    d.sistema ? `A tela de Sistema do operador mostra o mesmo: ${d.sistema}` : 'A tela de Sistema do operador mostra o mesmo.',
    '',
    'Enquanto isso durar, este aviso chega uma vez por dia.',
    '',
    `— ${NOME_PRODUTO}`,
  ];
  if (d.situacao === 'falhou') {
    const motivo = motivoNumaLinha(d.falha.motivo);
    return {
      assunto: 'O backup não está chegando ao armazenamento de fora',
      texto: [
        `O envio do backup para fora do servidor falhou em ${quando(d.falha.em)}${motivo ? ':' : '.'}`,
        ...(motivo ? ['', `  ${motivo}`] : []),
        '',
        d.ultimoCerto ? `O último envio que deu certo: ${quando(d.ultimoCerto)}.` : 'Não há envio certo registrado.',
        '',
        'O backup continua sendo feito no disco do servidor. O que falta é a cópia de fora: se o servidor se perder, é ela que traz o banco e as fotos de volta.',
        ...fim,
      ].join('\n'),
    };
  }
  const horas = Math.floor((d.agora.getTime() - d.ultimoCerto.getTime()) / (60 * 60 * 1000));
  return {
    assunto: 'O backup não sobe para fora do servidor há mais de um dia',
    texto: [
      `O último backup que subiu para fora do servidor foi em ${quando(d.ultimoCerto)}, há ${horas} horas, e nenhuma falha foi registrada depois dele.`,
      '',
      'O backup diário pode não estar rodando: na tela de Sistema, confira quando foi o último backup no disco.',
      ...fim,
    ].join('\n'),
  };
}

/** O conteúdo da trava, ou `null` se não há. */
function lerTrava(caminho: string): string | null {
  try {
    return readFileSync(caminho, 'utf8');
  } catch {
    return null;
  }
}

/** O dia gravado na trava, ou `null` se ela não existe ou não se lê. */
function diaDaTrava(conteudo: string | null): string | null {
  if (conteudo === null) return null;
  try {
    const dia = (JSON.parse(conteudo) as { dia?: unknown })?.dia;
    return typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
  } catch {
    return null;
  }
}

/** Grava em `.parcial` e renomeia, como os registros do `backup.mjs`: quem lê nunca pega pela metade. */
function gravarTrava(caminho: string, conteudo: string): void {
  writeFileSync(`${caminho}.parcial`, conteudo);
  renameSync(`${caminho}.parcial`, caminho);
}

/**
 * Avisa o operador, uma vez por dia, enquanto o backup não sobe para fora do servidor. Devolve se o
 * e-mail saiu nesta rodada. Nunca lança por falha de envio ou de disco: o resto da tarefa já rodou.
 */
export async function avisarBackupQueNaoSobe(
  agora: Date = new Date(),
  opcoes: { env?: Ambiente; enviar?: (e: Email) => Promise<unknown> } = {},
): Promise<boolean> {
  const env = opcoes.env ?? process.env;
  const para = emailDoOperador(env);
  if (!para) return false;

  const backup = backupNoPainel(env);
  const situacao = situacaoDoEnvio(backup, agora);
  const { ultimoCerto, ultimaFalha } = backup.envioParaFora;
  let dados: DadosDoAvisoDoBackup;
  const painel = urlDoPainel(env);
  const sistema = painel ? `${painel}/operador/sistema` : '';
  if (situacao === 'falhou' && ultimaFalha) dados = { situacao, falha: ultimaFalha, ultimoCerto, sistema };
  else if (situacao === 'parado' && ultimoCerto) dados = { situacao, ultimoCerto, sistema, agora };
  else return false;

  const dia = diaDe(agora, RELOGIO_DO_OPERADOR, 'yyyy-MM-dd');
  const trava = join(backup.pasta, MARCA_DO_AVISO_DO_BACKUP);
  const anterior = lerTrava(trava);
  if (diaDaTrava(anterior) === dia) return false; // já avisado hoje

  try {
    gravarTrava(trava, `${JSON.stringify({ dia, situacao, em: agora.toISOString() })}\n`);
  } catch (erro) {
    console.error(`[avisos] o aviso do backup ao operador não saiu: a trava não se grava em ${trava} —`,
      erro instanceof Error ? erro.message : erro);
    return false;
  }

  try {
    // Sai da parte do operador, sem barbearia (`lib/email.ts`), como o lembrete do site que espera.
    await (opcoes.enviar ?? enviarEmail)({ para, ...textoDoAvisoDoBackup(dados), barbearia: null, tipo: 'operador' });
    return true;
  } catch (erro) {
    try {
      if (anterior === null) unlinkSync(trava);
      else gravarTrava(trava, anterior);
    } catch { /* a trava fica: o aviso de hoje se perde, e o de amanhã sai */ }
    console.error('[avisos] o aviso do backup ao operador não saiu —', erro instanceof Error ? erro.message : erro);
    return false;
  }
}
