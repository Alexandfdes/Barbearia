/**
 * O backup como o disco o mostra — os arquivos da pasta e os registros do envio para fora — e a
 * regra de como está o envio. Saiu de `lib/operadorSistema.ts` em 11/11/2026, para o aviso do
 * backup (`lib/avisoDoBackup.ts`) ler o mesmo que a tela de Sistema sem chegar à cobrança: a tela
 * conversa com a Asaas, e a tarefa dos avisos é rota que `tests/cobranca-isolada.test.ts` segue.
 *
 * Só lê o disco e o ambiente — nada de banco, nada de rede. ⚠️ Nenhum segredo sai daqui: das
 * `S3_*`, só se as quatro existem (`tests/operador-telas.test.ts`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Ambiente = Record<string, string | undefined>;

/** O backup é diário: mais de 26 horas sem um novo é o daemon parado. */
export const BACKUP_VENCE_EM_HORAS = 26;

/**
 * Os registros do envio para fora que o `scripts/backup.mjs` grava na pasta dos backups
 * (05/11/2026): os nomes são os de lá, e `tests/backup-envio.test.ts` confere que batem.
 */
export const REGISTRO_DO_ENVIO_CERTO = 'envio-para-fora.ok';
export const REGISTRO_DA_FALHA_DO_ENVIO = 'envio-para-fora.falhou';

export interface ArquivoDeBackup { arquivo: string; bytes: number; em: Date }

/** O que os registros do `scripts/backup.mjs` dizem do envio para fora. */
export interface EnvioParaFora {
  /** O último backup que subiu inteiro — o banco e as fotos. `null`: nenhum registrado. */
  ultimoCerto: Date | null;
  /** A última falha, se for mais nova que o último certo — o envio certo apaga a falha. */
  ultimaFalha: { em: Date; motivo: string } | null;
}

export interface BackupNoPainel {
  /**
   * Quantos arquivos do banco há na pasta — não "quantos dias": o daemon faz um no boot
   * (se o último tem mais de 12 horas) e um às 03:00, e dois podem ser do mesmo dia.
   */
  pasta: string; ultimo: ArquivoDeBackup | null; fotos: ArquivoDeBackup | null; quantos: number;
  /** Por quantos dias o `scripts/backup.mjs` guarda cada arquivo (`BACKUP_RETENTION_DAYS`). */
  retencaoDias: number;
  /** Das fotos, quantas cópias ficam neste disco — as mais novas (`BACKUP_FOTOS_LOCAIS`, 05/11/2026). */
  fotosLocais: number;
  /**
   * A hora do backup diário do `scripts/backup-daemon.mjs` (`BACKUP_HOUR`), no `TZ` do
   * container. `null` se a variável não é uma hora de 0 a 23 — e aí o diário nunca roda.
   */
  horaDoDiario: number | null;
  /** As quatro `S3_*` existem: o backup sobe para fora do servidor. */
  foraDoServidor: boolean;
  /**
   * O que de fato subiu (05/11/2026). Antes desta linha, a tela dizia só se as `S3_*` existiam —
   * o envio podia falhar todo dia sem ninguém saber.
   */
  envioParaFora: EnvioParaFora;
}

/** O último arquivo de backup — o do banco e o das fotos —, da pasta do `scripts/backup.mjs`. */
export function backupNoPainel(env: Ambiente = process.env): BackupNoPainel {
  const pasta = env.BACKUP_DIR?.trim() || '/data/backups';
  // A mesma leitura do `scripts/backup.mjs`, com o mesmo padrão.
  const retencao = Number.parseInt(env.BACKUP_RETENTION_DAYS ?? '30', 10);
  const retencaoDias = Number.isFinite(retencao) && retencao > 0 ? retencao : 30;
  const fotosLidas = Number.parseInt(env.BACKUP_FOTOS_LOCAIS ?? '7', 10);
  const fotosLocais = Number.isFinite(fotosLidas) && fotosLidas > 0 ? fotosLidas : 7;
  // O daemon compara a hora do relógio com este número: fora de 0 a 23, nunca bate.
  const hora = Number.parseInt(env.BACKUP_HOUR ?? '3', 10);
  const horaDoDiario = Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : null;
  const foraDoServidor = Boolean(env.S3_ENDPOINT?.trim() && env.S3_BUCKET?.trim()
    && env.S3_ACCESS_KEY_ID?.trim() && env.S3_SECRET_ACCESS_KEY?.trim());
  const envioParaFora = envioParaForaNaPasta(pasta);
  let nomes: string[] = [];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return { pasta, ultimo: null, fotos: null, quantos: 0, retencaoDias, fotosLocais, horaDoDiario, foraDoServidor, envioParaFora };
  }
  const ler = (fim: RegExp) => nomes
    .filter((n) => fim.test(n))
    .map((arquivo) => {
      try {
        const s = statSync(join(pasta, arquivo));
        return s.isFile() ? { arquivo, bytes: s.size, em: s.mtime } : null;
      } catch {
        return null;
      }
    })
    .filter((a): a is ArquivoDeBackup => a !== null)
    .sort((a, b) => b.em.getTime() - a.em.getTime());
  const banco = ler(/^barbearia_.*\.sql\.gz$/);
  const fotos = ler(/^barbearia_.*-fotos\.tar\.gz$/);
  return { pasta, ultimo: banco[0] ?? null, fotos: fotos[0] ?? null, quantos: banco.length, retencaoDias, fotosLocais, horaDoDiario, foraDoServidor, envioParaFora };
}

/** Um registro do `scripts/backup.mjs`: a hora, e o motivo se for o da falha. `null` se não há, ou não se lê. */
function lerRegistro(pasta: string, nome: string): { em: Date; motivo: string } | null {
  try {
    const dados = JSON.parse(readFileSync(join(pasta, nome), 'utf8')) as { em?: unknown; motivo?: unknown };
    const em = new Date(String(dados?.em));
    if (Number.isNaN(em.getTime())) return null;
    return { em, motivo: typeof dados.motivo === 'string' ? dados.motivo : '' };
  } catch {
    return null;
  }
}

export function envioParaForaNaPasta(pasta: string): EnvioParaFora {
  const certo = lerRegistro(pasta, REGISTRO_DO_ENVIO_CERTO);
  const falha = lerRegistro(pasta, REGISTRO_DA_FALHA_DO_ENVIO);
  return {
    ultimoCerto: certo?.em ?? null,
    ultimaFalha: falha && (!certo || falha.em > certo.em) ? falha : null,
  };
}

/**
 * Como está o envio para fora, para o alerta e para a tela — uma regra só:
 * `desligado` sem as `S3_*`; `falhou`, a última tentativa falhou; `nunca`, nada registrado ainda;
 * `parado`, o último certo tem mais de um dia; `ok`.
 */
export function situacaoDoEnvio(
  backup: BackupNoPainel, agora: Date = new Date(),
): 'desligado' | 'falhou' | 'nunca' | 'parado' | 'ok' {
  if (!backup.foraDoServidor) return 'desligado';
  const { ultimoCerto, ultimaFalha } = backup.envioParaFora;
  if (ultimaFalha) return 'falhou';
  if (!ultimoCerto) return 'nunca';
  if (agora.getTime() - ultimoCerto.getTime() > BACKUP_VENCE_EM_HORAS * 60 * 60 * 1000) return 'parado';
  return 'ok';
}
