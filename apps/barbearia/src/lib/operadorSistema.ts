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
import { configDaAsaas, webhooksDaConta, type AmbienteAsaas, type ConfigAsaas, type WebhookAsaas } from './asaas.js';
import { transporteDeEmail, type Transporte } from './email.js';
import { urlDoPainel } from './tenant.js';
import { lerSegundoFator } from './segundoFator.js';

type Ambiente = Record<string, string | undefined>;

/** Quanto a tela espera o banco antes de dizer que ele não respondeu — o mesmo do monitor. */
const PRAZO_DO_BANCO_MS = 3000;
/** O backup é diário: mais de 26 horas sem um novo é o daemon parado. */
const BACKUP_VENCE_EM_HORAS = 26;
/** Quanto a tela espera a Asaas dizer como está a fila do webhook. */
const PRAZO_DA_ASAAS_MS = 4000;

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
    /**
     * Quantos arquivos do banco há na pasta — não "quantos dias": o daemon faz um no boot
     * (se o último tem mais de 12 horas) e um às 03:00, e dois podem ser do mesmo dia.
     */
    pasta: string; ultimo: ArquivoDeBackup | null; fotos: ArquivoDeBackup | null; quantos: number;
    /** Por quantos dias o `scripts/backup.mjs` guarda cada arquivo (`BACKUP_RETENTION_DAYS`). */
    retencaoDias: number;
    /**
     * A hora do backup diário do `scripts/backup-daemon.mjs` (`BACKUP_HOUR`), no `TZ` do
     * container. `null` se a variável não é uma hora de 0 a 23 — e aí o diário nunca roda.
     */
    horaDoDiario: number | null;
    /** As quatro `S3_*` existem: o backup sobe para fora do servidor. */
    foraDoServidor: boolean;
  };
  email: { transporte: Transporte };
  cobranca: { ligada: boolean; ambiente: AmbienteAsaas | null; tokenDoWebhook: boolean };
  cadastro: { aberto: boolean };
  enderecos: { painel: string; dominioBase: string | null };
  /** A entrada do próprio painel do operador pede o código do aplicativo (`lib/segundoFator.ts`). */
  operador: { segundoFator: boolean };
  processo: { noArDesde: Date; memoriaMb: number; node: string; ambiente: string };
  alertas: AlertaDoSistema[];
}

/** O último arquivo de backup — o do banco e o das fotos —, da pasta do `scripts/backup.mjs`. */
export function backupNoPainel(env: Ambiente = process.env): SistemaNoPainel['backup'] {
  const pasta = env.BACKUP_DIR?.trim() || '/data/backups';
  // A mesma leitura do `scripts/backup.mjs`, com o mesmo padrão.
  const retencao = Number.parseInt(env.BACKUP_RETENTION_DAYS ?? '30', 10);
  const retencaoDias = Number.isFinite(retencao) && retencao > 0 ? retencao : 30;
  // O daemon compara a hora do relógio com este número: fora de 0 a 23, nunca bate.
  const hora = Number.parseInt(env.BACKUP_HOUR ?? '3', 10);
  const horaDoDiario = Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : null;
  const foraDoServidor = Boolean(env.S3_ENDPOINT?.trim() && env.S3_BUCKET?.trim()
    && env.S3_ACCESS_KEY_ID?.trim() && env.S3_SECRET_ACCESS_KEY?.trim());
  let nomes: string[] = [];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return { pasta, ultimo: null, fotos: null, quantos: 0, retencaoDias, horaDoDiario, foraDoServidor };
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
  return { pasta, ultimo: banco[0] ?? null, fotos: fotos[0] ?? null, quantos: banco.length, retencaoDias, horaDoDiario, foraDoServidor };
}

/** O que só depende do ambiente — sem banco e sem disco. */
export function configuracaoNoPainel(env: Ambiente = process.env, agora: Date = new Date()) {
  const cfg = configDaAsaas(env);
  return {
    email: { transporte: transporteDeEmail(env) },
    cobranca: { ligada: cfg !== null, ambiente: cfg?.ambiente ?? null, tokenDoWebhook: Boolean(env.ASAAS_WEBHOOK_TOKEN?.trim()) },
    cadastro: { aberto: env.CADASTRO_ABERTO === '1' },
    enderecos: { painel: urlDoPainel(env), dominioBase: env.DOMINIO_BASE?.trim() || null },
    operador: { segundoFator: lerSegundoFator(env).ligado === true },
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

/**
 * A fila do webhook, como a Asaas a vê (17/10/2026).
 *
 * ── POR QUE ───────────────────────────────────────────────────────────────────
 *
 * O aviso de pagamento chega pelo webhook. Com o app fora do ar — ou recusando —, a Asaas
 * tenta de novo e, com 15 falhas seguidas, INTERROMPE a fila: os avisos novos param de
 * sair até alguém reativá-la, e os parados há mais de 14 dias são apagados (documentação
 * da Asaas, conferida em 17/10/2026). Enquanto isso, quem pôs o cartão no fim do teste ou
 * pagou na carência continua com o prazo correndo e sai do ar tendo pago. A Asaas manda
 * e-mail; esta tela é o segundo lugar onde dá para ver (`ARQUITETURA-COBRANCA-V1.md` §5.3).
 *
 * Só lê: reativar é no painel da Asaas (Integrações → Webhooks), depois de consertar o
 * motivo — reativar sem consertar interrompe de novo. *Não conferido contra a Asaas de
 * verdade: só contra a documentação e uma Asaas de mentira.*
 */
export type EstadoDaFila = 'ativa' | 'interrompida' | 'desligada' | 'sem-webhook' | 'sem-resposta' | 'nao-consultada';

export interface FilaDoWebhook {
  estado: EstadoDaFila;
  /** O endereço que a Asaas tem de chamar — o do painel, `/api/asaas/webhook`. */
  endereco: string;
  /** Os envios que a Asaas marcou como falhos (`penalizedRequestsCount`). */
  penalizados: number | null;
  /** Envio sequencial: os avisos chegam na ordem em que aconteceram. */
  sequencial: boolean | null;
  /** A Asaas tem o token que o webhook confere — sem ele, o app recusa todo aviso. */
  comToken: boolean | null;
  /** Por que não deu para consultar — a mensagem da Asaas, nunca a chave. */
  motivo?: string;
}

/**
 * O mesmo destino? Esquema, nome com a porta e caminho — sem a barra do fim. As
 * maiúsculas do nome não contam: o `URL` já o devolve em minúsculas.
 */
function mesmoEndereco(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const caminho = (u: URL) => u.pathname.replace(/\/+$/, '');
    return x.protocol === y.protocol && x.host === y.host && caminho(x) === caminho(y);
  } catch {
    return false;
  }
}

export async function filaDoWebhook(
  env: Ambiente = process.env,
  consultar: (cfg: ConfigAsaas, prazoMs: number) => Promise<WebhookAsaas[]> = webhooksDaConta,
): Promise<FilaDoWebhook> {
  const painel = urlDoPainel(env);
  const endereco = painel ? `${painel}/api/asaas/webhook` : '';
  const vazio = { endereco, penalizados: null, sequencial: null, comToken: null };
  const cfg = configDaAsaas(env);
  if (!cfg) return { estado: 'nao-consultada', ...vazio };
  let lista: WebhookAsaas[];
  try {
    lista = await consultar(cfg, PRAZO_DA_ASAAS_MS);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    console.error(`[operador] a Asaas não respondeu à consulta da fila do webhook: ${motivo}`);
    return { estado: 'sem-resposta', ...vazio, motivo };
  }
  const nossos = endereco ? lista.filter((w) => typeof w.url === 'string' && mesmoEndereco(w.url, endereco)) : [];
  if (nossos.length === 0) return { estado: 'sem-webhook', ...vazio };
  return {
    estado: nossos.some((w) => w.interrupted === true) ? 'interrompida'
      : nossos.some((w) => w.enabled === false) ? 'desligada' : 'ativa',
    endereco,
    penalizados: nossos.reduce((soma, w) => soma + (Number.isFinite(w.penalizedRequestsCount) ? Number(w.penalizedRequestsCount) : 0), 0),
    sequencial: nossos.every((w) => w.sendType === 'SEQUENTIALLY'),
    comToken: nossos.every((w) => w.hasAuthToken === true),
  };
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
  if (producao && !s.operador.segundoFator) {
    a.push({ estado: 'atencao', texto: 'Este painel entra só com a senha: ligue o código do aplicativo (npm run operador:segundo-fator).' });
  }
  return a.sort((x, y) => (x.estado === y.estado ? 0 : x.estado === 'problema' ? -1 : 1));
}

/**
 * Os alertas do sistema com os da fila do webhook, do mais grave para o menos.
 *
 * ⚠️ A fila é consultada à parte, pela TELA (o Início e o Sistema do operador), e não por
 * `sistemaNoPainel`: perguntar à Asaas é sair da máquina, e o que monta os números tem de
 * poder rodar — e ser testado — sem rede.
 */
export function comAFila(alertas: AlertaDoSistema[], fila: FilaDoWebhook): AlertaDoSistema[] {
  return [...alertas, ...alertasDaFila(fila)].sort((x, y) => (x.estado === y.estado ? 0 : x.estado === 'problema' ? -1 : 1));
}

/** O que a fila do webhook pede — nada quando ela não foi consultada (a cobrança desligada). */
export function alertasDaFila(f: FilaDoWebhook): AlertaDoSistema[] {
  const a: AlertaDoSistema[] = [];
  if (f.estado === 'interrompida') {
    a.push({ estado: 'problema', texto: 'A fila do webhook está interrompida na Asaas: os avisos de pagamento estão parados. Conserte o motivo e reative em Integrações → Webhooks — a Asaas guarda os avisos por 14 dias.' });
  } else if (f.estado === 'desligada') {
    a.push({ estado: 'problema', texto: 'O webhook está desligado na Asaas: nenhum aviso de pagamento chega.' });
  } else if (f.estado === 'sem-webhook') {
    a.push({ estado: 'problema', texto: `Nenhum webhook da Asaas aponta para ${f.endereco || 'este app — e o endereço do painel não está configurado'}: nenhum aviso de pagamento chega.` });
  } else if (f.estado === 'sem-resposta') {
    a.push({ estado: 'atencao', texto: 'A Asaas não respondeu quando a tela perguntou pela fila do webhook.' });
  }
  if (f.comToken === false) a.push({ estado: 'problema', texto: 'O webhook na Asaas está sem o token: o app recusa todo aviso de pagamento.' });
  if (f.sequencial === false) a.push({ estado: 'atencao', texto: 'O webhook na Asaas não está em envio sequencial: os avisos podem chegar fora de ordem.' });
  if ((f.penalizados ?? 0) > 0) {
    a.push({ estado: 'atencao', texto: `A Asaas marcou ${f.penalizados} ${f.penalizados === 1 ? 'envio' : 'envios'} do webhook como falha: com 15 seguidas, a fila para.` });
  }
  return a;
}
