/**
 * O painel do operador — a saúde do servidor: o banco, as migrations, o backup,
 * o e-mail, a cobrança, o cadastro e o processo (decisão do dono em 12/10/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §3.9).
 *
 * ⚠️ **NENHUM SEGREDO SAI DAQUI.** Das variáveis de ambiente, a tela recebe só se
 * cada uma EXISTE — nunca o valor —, menos três que não são segredo: o endereço do
 * painel, o `DOMINIO_BASE` e a pasta do backup. `tests/operador-telas.test.ts` passa
 * segredos de mentira em todas e confere que nenhum chega à resposta.
 *
 * Usa a conexão do dono (lista fechada de `tests/rls.test.ts`) para perguntar ao
 * banco o que é do banco: a versão, o tamanho, quem está conectado e as migrations
 * aplicadas. Não lê tabela de barbearia nenhuma.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sqlConn } from '../db/index.js';
import { configDaAsaas, type AmbienteAsaas } from './asaas.js';
import { transporteDeEmail, type Transporte } from './email.js';
import { urlDoPainel } from './tenant.js';

type Ambiente = Record<string, string | undefined>;

/** Quanto a tela espera o banco antes de dizer que ele não respondeu — o mesmo do monitor. */
const PRAZO_DO_BANCO_MS = 3000;
/** O backup é diário: mais de 26 horas sem um novo é o daemon parado. */
const BACKUP_VENCE_EM_HORAS = 26;

export interface ArquivoDeBackup { arquivo: string; bytes: number; em: Date }

export interface AlertaDoSistema {
  estado: 'atencao' | 'problema';
  texto: string;
}

export interface SistemaNoPainel {
  banco: {
    responde: boolean; ms: number | null; versao: string | null; tamanho: string | null;
    usuario: string | null; superusuario: boolean | null;
  };
  /** `null` quando o banco não respondeu. */
  migracoes: { aplicadas: number; ultima: string | null; em: Date | null; noBuild: number | null } | null;
  backup: {
    pasta: string; ultimo: ArquivoDeBackup | null; fotos: ArquivoDeBackup | null; quantos: number;
    /** As quatro `S3_*` existem: o backup sobe para fora do servidor. */
    foraDoServidor: boolean;
  };
  email: { transporte: Transporte };
  cobranca: { ligada: boolean; ambiente: AmbienteAsaas | null; tokenDoWebhook: boolean };
  cadastro: { aberto: boolean };
  enderecos: { painel: string; dominioBase: string | null };
  processo: { noArDesde: Date; memoriaMb: number; node: string; ambiente: string };
  alertas: AlertaDoSistema[];
}

/** O último arquivo de backup — o do banco e o das fotos —, da pasta do `scripts/backup.mjs`. */
export function backupNoPainel(env: Ambiente = process.env): SistemaNoPainel['backup'] {
  const pasta = env.BACKUP_DIR?.trim() || '/data/backups';
  const foraDoServidor = Boolean(env.S3_ENDPOINT?.trim() && env.S3_BUCKET?.trim()
    && env.S3_ACCESS_KEY_ID?.trim() && env.S3_SECRET_ACCESS_KEY?.trim());
  let nomes: string[] = [];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return { pasta, ultimo: null, fotos: null, quantos: 0, foraDoServidor };
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
  return { pasta, ultimo: banco[0] ?? null, fotos: fotos[0] ?? null, quantos: banco.length, foraDoServidor };
}

/** O que só depende do ambiente — sem banco e sem disco. */
export function configuracaoNoPainel(env: Ambiente = process.env, agora: Date = new Date()) {
  const cfg = configDaAsaas(env);
  return {
    email: { transporte: transporteDeEmail(env) },
    cobranca: { ligada: cfg !== null, ambiente: cfg?.ambiente ?? null, tokenDoWebhook: Boolean(env.ASAAS_WEBHOOK_TOKEN?.trim()) },
    cadastro: { aberto: env.CADASTRO_ABERTO === '1' },
    enderecos: { painel: urlDoPainel(env), dominioBase: env.DOMINIO_BASE?.trim() || null },
    processo: {
      noArDesde: new Date(agora.getTime() - Math.round(process.uptime() * 1000)),
      memoriaMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      node: process.version,
      ambiente: env.NODE_ENV?.trim() || 'development',
    },
  };
}

async function comPrazo<T>(promessa: Promise<T>): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, falha) => { relogio = setTimeout(() => falha(new Error(`sem resposta em ${PRAZO_DO_BANCO_MS} ms`)), PRAZO_DO_BANCO_MS); }),
    ]);
  } finally {
    clearTimeout(relogio);
  }
}

/** Quantas migrations o build traz — a mesma pasta que o `scripts/startup.mjs` lê. */
function migrationsNoBuild(): number | null {
  try {
    return readdirSync('drizzle').filter((f) => f.endsWith('.sql')).length;
  } catch {
    return null;
  }
}

export async function sistemaNoPainel(env: Ambiente = process.env, agora: Date = new Date()): Promise<SistemaNoPainel> {
  const config = configuracaoNoPainel(env, agora);
  const backup = backupNoPainel(env);

  let banco: SistemaNoPainel['banco'] = { responde: false, ms: null, versao: null, tamanho: null, usuario: null, superusuario: null };
  let migracoes: SistemaNoPainel['migracoes'] = null;
  try {
    const inicio = Date.now();
    const [b] = await comPrazo(sqlConn<{ versao: string; tamanho: string; usuario: string; superusuario: boolean | null }[]>`
      SELECT current_setting('server_version') AS versao,
             pg_size_pretty(pg_database_size(current_database())) AS tamanho,
             current_user AS usuario,
             (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario`);
    banco = { responde: true, ms: Date.now() - inicio, versao: b.versao, tamanho: b.tamanho, usuario: b.usuario, superusuario: b.superusuario };

    const [existe] = await comPrazo(sqlConn<{ ok: boolean }[]>`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`);
    if (existe?.ok) {
      const [m] = await comPrazo(sqlConn<{ aplicadas: number; ultima: string | null; em: unknown }[]>`
        SELECT count(*)::int AS aplicadas, max(nome) AS ultima, max(aplicada_em) AS em FROM schema_migrations`);
      migracoes = { aplicadas: m.aplicadas, ultima: m.ultima, em: m.em ? new Date(String(m.em)) : null, noBuild: migrationsNoBuild() };
    } else {
      migracoes = { aplicadas: 0, ultima: null, em: null, noBuild: migrationsNoBuild() };
    }
  } catch (erro) {
    console.error(`[operador] o banco não respondeu à tela de sistema: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  const sistema = { banco, migracoes, backup, ...config, alertas: [] as AlertaDoSistema[] };
  sistema.alertas = alertasDoSistema(sistema, agora);
  return sistema;
}

/** O que está errado, do mais grave para o menos — para o Início e para o topo da tela. */
export function alertasDoSistema(s: Omit<SistemaNoPainel, 'alertas'>, agora: Date = new Date()): AlertaDoSistema[] {
  const a: AlertaDoSistema[] = [];
  const producao = s.processo.ambiente === 'production';
  if (!s.banco.responde) a.push({ estado: 'problema', texto: 'O banco não respondeu.' });
  if (s.migracoes && s.migracoes.noBuild !== null && s.migracoes.aplicadas < s.migracoes.noBuild) {
    a.push({ estado: 'problema', texto: `Faltam migrations: o banco tem ${s.migracoes.aplicadas} de ${s.migracoes.noBuild}.` });
  }
  if (!s.backup.ultimo) {
    a.push({ estado: producao ? 'problema' : 'atencao', texto: 'Nenhum backup do banco nesta máquina.' });
  } else if (agora.getTime() - s.backup.ultimo.em.getTime() > BACKUP_VENCE_EM_HORAS * 60 * 60 * 1000) {
    a.push({ estado: 'problema', texto: 'O último backup do banco tem mais de um dia: o backup diário parou.' });
  }
  if (!s.backup.foraDoServidor) a.push({ estado: 'atencao', texto: 'O backup não sai deste servidor: perdido o disco, vai tudo.' });
  if (s.email.transporte === 'nenhum') {
    a.push({ estado: 'problema', texto: 'O e-mail está desligado: a senha esquecida e os avisos não saem.' });
  } else if (s.email.transporte === 'arquivo' && producao) {
    a.push({ estado: 'atencao', texto: 'O e-mail vai para uma pasta do servidor, não para o dono.' });
  }
  if (!s.cobranca.ligada) {
    a.push({ estado: 'atencao', texto: 'A cobrança está desligada: ninguém consegue pagar.' });
  } else {
    if (s.cobranca.ambiente === 'sandbox' && producao) a.push({ estado: 'atencao', texto: 'A cobrança está no ambiente de teste da Asaas: o dinheiro não é de verdade.' });
    if (!s.cobranca.tokenDoWebhook) a.push({ estado: 'problema', texto: 'Falta o token do webhook da Asaas: todo aviso de pagamento é recusado.' });
  }
  if (s.banco.superusuario) a.push({ estado: 'atencao', texto: 'O app fala com o banco como superusuário — a troca do usuário está pronta e falta rodar.' });
  return a.sort((x, y) => (x.estado === y.estado ? 0 : x.estado === 'problema' ? -1 : 1));
}
