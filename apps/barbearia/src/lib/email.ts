/**
 * O envio de e-mail — o canal da senha nova e dos avisos do teste e da cobrança.
 *
 * Decisão do dono em 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13, item 4): um
 * canal só para as duas coisas, pedido no cadastro. Rejeitado: WhatsApp, que exige
 * um serviço de envio pago ou não oficial.
 *
 * ── ONDE O E-MAIL VAI PARAR ──────────────────────────────────────────────────
 *
 * Quatro destinos, e quem escolhe é o ambiente — nenhuma rota escolhe:
 *
 *  - `memoria`: nos testes, SEMPRE. Vai para `caixaDeSaida`, e teste nenhum manda
 *    e-mail de verdade, nem com `SMTP_URL` no `.env` de quem roda.
 *  - `smtp`: com `SMTP_URL` — o caminho de produção. Qualquer provedor serve, porque
 *    todo provedor sério aceita SMTP: a escolha dele não mexe neste arquivo.
 *  - `arquivo`: no desenvolvimento, sem `SMTP_URL`. Cada e-mail vira um `.txt` em
 *    `data/emails/` (ou `EMAIL_PASTA`) — é onde se pega o link da senha nova na
 *    máquina de desenvolvimento. A pasta está no `.gitignore`: tem link de senha.
 *  - `nenhum`: produção sem `SMTP_URL`. `enviarEmail` RECUSA, com o motivo, em vez
 *    de fingir que mandou. O boot avisa (`scripts/startup.mjs`), e a tela de
 *    "esqueci minha senha" diz que não está funcionando, em vez de prometer um
 *    e-mail que não vai sair.
 *
 * ⚠️ Texto puro, sem HTML, de propósito. O nome da barbearia vem do formulário
 * público de cadastro e entra no corpo: em HTML, ele teria que ser escapado em
 * cada aviso, e o primeiro esquecido vira link falso dentro de um e-mail com o
 * NOSSO remetente. Em texto puro não há o que escapar.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOME_PRODUTO } from './produto.js';

export interface Email {
  para: string;
  assunto: string;
  texto: string;
}

export interface EmailEnviado extends Email {
  de: string;
  respostaPara: string | null;
  enviadoEm: Date;
}

export type Transporte = 'memoria' | 'smtp' | 'arquivo' | 'nenhum';

/** As variáveis de ambiente — um parâmetro, para o teste poder passar as dele. */
type Ambiente = Record<string, string | undefined>;

/** O e-mail não saiu — e quem chamou precisa saber, não um log que ninguém lê. */
export class EmailNaoEnviado extends Error {
  constructor(motivo: string, options?: { cause?: unknown }) {
    super(motivo, options);
    this.name = 'EmailNaoEnviado';
  }
}

/**
 * Confere a FORMA, não a existência — a existência só a primeira mensagem prova.
 * Sem espaço em lugar nenhum: é também o que impede quebra de linha no cabeçalho.
 */
export const FORMA_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Como o e-mail é gravado: sem espaço nas pontas, minúsculo. Vazio vira `null`. */
export function normalizarEmail(bruto: string | null | undefined): string | null {
  const e = (bruto ?? '').trim().toLowerCase();
  return e || null;
}

/** O limite de 254 é o do protocolo, e o mesmo da trava da migration 0006. */
export function emailValido(email: string): boolean {
  return email.length <= 254 && FORMA_DE_EMAIL.test(email);
}

/** Os e-mails que os testes "mandaram". Limpe com `caixaDeSaida.length = 0`. */
export const caixaDeSaida: EmailEnviado[] = [];

/** Para onde o e-mail vai neste ambiente. Ver o cabeçalho. */
export function transporteDeEmail(env: Ambiente = process.env): Transporte {
  if (env.VITEST || env.NODE_ENV === 'test') return 'memoria';
  if (env.SMTP_URL?.trim()) return 'smtp';
  if (env.EMAIL_PASTA?.trim() || env.NODE_ENV !== 'production') return 'arquivo';
  return 'nenhum';
}

/**
 * Quem assina o e-mail. `EMAIL_REMETENTE` manda — em produção, o endereço tem que
 * ser um que o provedor de envio conhece, com o domínio verificado. Sem ele, o
 * `nao-responda@` do domínio do produto.
 */
export function remetente(env: Ambiente = process.env): string {
  const fixo = env.EMAIL_REMETENTE?.trim();
  if (fixo) return fixo;
  // O domínio sem a porta: `localhost:4321` vira `localhost`.
  const dominio = env.DOMINIO_BASE?.trim().split(':')[0] || 'localhost';
  return `${NOME_PRODUTO} <nao-responda@${dominio}>`;
}

/**
 * Manda o e-mail pelo transporte do ambiente. Devolve o que saiu; recusa com
 * `EmailNaoEnviado` quando não sai — destinatário sem forma de e-mail, envio não
 * configurado, provedor fora do ar.
 */
export async function enviarEmail(email: Email): Promise<EmailEnviado> {
  const para = normalizarEmail(email.para);
  if (!para || !emailValido(para)) {
    throw new EmailNaoEnviado(`Destinatário sem forma de e-mail: "${email.para}".`);
  }

  const enviado: EmailEnviado = {
    para,
    // Quebra de linha no assunto viraria cabeçalho novo. O nome da barbearia
    // chega aqui, e ele vem de um formulário público.
    assunto: email.assunto.replace(/[\r\n]+/g, ' ').trim(),
    texto: email.texto,
    de: remetente(),
    respostaPara: process.env.EMAIL_RESPONDER_PARA?.trim() || null,
    enviadoEm: new Date(),
  };

  const transporte = transporteDeEmail();
  switch (transporte) {
    case 'memoria':
      caixaDeSaida.push(enviado);
      return enviado;
    case 'arquivo':
      gravarEmArquivo(enviado, process.env.EMAIL_PASTA?.trim() || join('data', 'emails'));
      return enviado;
    case 'smtp':
      await enviarPorSmtp(enviado, process.env.SMTP_URL!.trim());
      return enviado;
    case 'nenhum':
      throw new EmailNaoEnviado(
        'O envio de e-mail não está configurado: defina SMTP_URL (ver docs/PENDENCIAS-ABERTAS.md §4.17).',
      );
  }
}

/** `ze@gmail.com` vira `z***@gmail.com` — o bastante para achar no log, sem expor o endereço. */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  return `${local.slice(0, 1)}***@${dominio ?? ''}`;
}

/**
 * O e-mail como um arquivo de texto: o que a máquina de desenvolvimento faz no
 * lugar de mandar. Exportado para o teste — quem escolhe o transporte é
 * `enviarEmail`.
 */
export function gravarEmArquivo(e: EmailEnviado, pasta: string): string {
  mkdirSync(pasta, { recursive: true });
  const quando = e.enviadoEm.toISOString().replace(/[:.]/g, '-');
  const caminho = join(pasta, `${quando}-${e.para.replace(/[^a-z0-9.@_-]/g, '_')}.txt`);
  const cabecalho = [
    `De: ${e.de}`,
    `Para: ${e.para}`,
    ...(e.respostaPara ? [`Responder para: ${e.respostaPara}`] : []),
    `Assunto: ${e.assunto}`,
    `Data: ${e.enviadoEm.toISOString()}`,
  ];
  writeFileSync(caminho, `${cabecalho.join('\n')}\n\n${e.texto}\n`, 'utf8');
  console.log(`[email] (arquivo) → ${e.para}: "${e.assunto}" — ${caminho}`);
  return caminho;
}

type Enviador = { sendMail(mensagem: Record<string, unknown>): Promise<unknown> };
const enviadores = new Map<string, Promise<Enviador>>();

/**
 * Pelo SMTP do provedor, com o `nodemailer`.
 *
 * ⚠️ O `nodemailer` é carregado SÓ AQUI, na hora de mandar. Quem atualiza o código
 * e ainda não rodou `npm install` continua subindo o `npm run dev` — que manda
 * para arquivo e nunca passa por esta função. Importado no topo, o servidor de
 * desenvolvimento cairia inteiro por causa de uma dependência que ele não usa.
 *
 * Os prazos são curtos de propósito: os padrões do `nodemailer` esperam até 2
 * minutos para conectar e 10 de silêncio. Um provedor fora do ar seguraria a
 * tarefa de avisos por horas.
 */
export async function enviarPorSmtp(e: EmailEnviado, url: string): Promise<void> {
  let enviador = enviadores.get(url);
  if (!enviador) {
    enviador = import('nodemailer').then(({ createTransport }) =>
      createTransport({
        url,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      }) as unknown as Enviador,
    );
    enviadores.set(url, enviador);
  }

  try {
    await (await enviador).sendMail({
      from: e.de,
      to: e.para,
      ...(e.respostaPara ? { replyTo: e.respostaPara } : {}),
      subject: e.assunto,
      text: e.texto,
    });
  } catch (erro) {
    // O carregamento que falhou não fica guardado: a próxima tentativa recomeça.
    enviadores.delete(url);
    throw new EmailNaoEnviado(
      `O provedor de e-mail recusou ou não respondeu: ${erro instanceof Error ? erro.message : String(erro)}`,
      { cause: erro },
    );
  }
  console.log(`[email] (smtp) → ${mascararEmail(e.para)}: "${e.assunto}"`);
}
