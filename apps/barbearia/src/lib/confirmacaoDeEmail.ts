/**
 * A confirmação do e-mail — 30/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §2.64).
 *
 * ── O BURACO QUE ELA FECHA ───────────────────────────────────────────────────
 *
 * Até aqui, o e-mail digitado no cadastro, ou pelo dono na Equipe, recebia na hora tudo o
 * que o sistema manda: o link de senha nova, os avisos de agendamento, os do teste e da
 * cobrança. Dois estragos possíveis, os dois com o NOSSO remetente:
 *
 *  - **Digitado errado:** o link de senha nova ia para um estranho, e quem tivesse o
 *    WhatsApp do dono — que está no site — pedia o link para ele. O estranho ficava com o
 *    painel.
 *  - **Digitado de propósito:** quem se cadastra escolhe o nome da barbearia e os nomes da
 *    equipe, e os avisos levam esses nomes para o endereço que ele quiser.
 *
 * ── A REGRA ──────────────────────────────────────────────────────────────────
 *
 * Nada sai para e-mail não confirmado, **menos o próprio pedido de confirmação** — e ele
 * não leva nada que alguém tenha digitado: nem nome de barbearia, nem de pessoa. Quem
 * manda e-mail confere `barbers.email_confirmado_em` (o aviso de agenda, os avisos do
 * teste e da cobrança, a senha nova, o aviso de e-mail trocado).
 *
 *  - **O link confirma o endereço para onde foi**, não "o e-mail do barbeiro": trocou o
 *    e-mail depois, o link morre, e trocar o e-mail volta a confirmação para nula
 *    (`api/admin/barbers/[id].ts`).
 *  - **Só o hash do token fica no banco**, como na senha nova (`lib/redefinicaoDeSenha.ts`).
 *  - **Abrir o link não confirma:** a tela pede um clique. Antivírus de e-mail abre todo
 *    link que chega — confirmar na abertura confirmaria o endereço de um estranho que nem
 *    leu o e-mail.
 *  - **Limite de pedidos:** um por minuto e cinco por dia, por pessoa. Cada pedido é um
 *    e-mail nosso para um endereço que ninguém provou ser de quem pediu.
 *
 * ⚠️ Usa a conexão do DONO do banco, como a senha nova: a tela do link abre sem sessão, e
 * o token é a identidade — a barbearia sai dele. Toda consulta que não parte do token
 * filtra pela barbearia, e `tests/escopo-rotas.test.ts` justifica as que partem.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { dbDono, first } from '../db/index.js';
import { barbers, confirmacoesDeEmail } from '../db/schema.js';
import { enviarEmail, mascararEmail, normalizarEmail, transporteDeEmail, type Email } from './email.js';
import { NOME_PRODUTO } from './produto.js';
import { urlDoPainel } from './tenant.js';

/** Quanto o link vale. Três dias: o dono que se cadastra na sexta abre o e-mail na segunda. */
export const VALIDADE_DA_CONFIRMACAO_MS = 3 * 24 * 60 * 60 * 1000;
/** Entre um pedido e outro da mesma pessoa. */
export const ESPERA_ENTRE_PEDIDOS_MS = 60 * 1000;
/** Pedidos da mesma pessoa em 24 horas. */
export const PEDIDOS_POR_DIA = 5;

/** Onde o link leva. Pública: o middleware a deixa abrir sem sessão. */
export const TELA_DE_CONFIRMACAO = '/admin/confirmar-email';

/** 32 bytes em base64url: 43 caracteres, 256 bits. */
const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ResultadoDoPedidoDeConfirmacao =
  /** O link foi gravado e o e-mail saiu (ou foi disparado, com `esperarEnvio: false`). */
  | 'enviado'
  /** Barbeiro sem e-mail, desligado ou de outra barbearia. */
  | 'sem-email'
  | 'ja-confirmado'
  /** Pediu há menos de um minuto. */
  | 'cedo-demais'
  /** Cinco pedidos nas últimas 24 horas. */
  | 'limite-do-dia'
  /** Sem endereço do painel configurado — não há link para mandar. */
  | 'sem-painel'
  /**
   * Produção sem `SMTP_URL` (`lib/email.ts`): nada é gravado, para o pedido que não saiu
   * não contar no limite do dia.
   */
  | 'sem-envio'
  /** O envio falhou. O motivo vai para o log. */
  | 'falhou';

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * O e-mail com o link. Exportado para o teste ler o que vai sair.
 *
 * ⚠️ NADA digitado por alguém entra aqui — nem o nome da barbearia, nem o da pessoa. É o
 * único e-mail que vai para endereço não confirmado.
 */
export function textoDoPedidoDeConfirmacao(link: string): Pick<Email, 'assunto' | 'texto'> {
  return {
    assunto: `Confirme o seu e-mail — ${NOME_PRODUTO}`,
    texto: [
      'Olá!',
      '',
      `Este endereço foi cadastrado para receber os e-mails de um painel do ${NOME_PRODUTO}:`,
      'o link de senha nova e os avisos de agendamento, do teste e da cobrança.',
      '',
      ...trechoDoLink(link),
      '',
      'Não reconhece? Ignore este e-mail: sem a confirmação, nada mais chega a este endereço.',
      '',
      `— ${NOME_PRODUTO}`,
    ].join('\n'),
  };
}

/** O pedaço do link — o mesmo no e-mail de confirmação e no de boas-vindas do cadastro. */
export function trechoDoLink(link: string): string[] {
  return [
    'Para confirmar que este e-mail é seu, abra o link abaixo e toque em "Confirmar".',
    'Ele vale por 3 dias:',
    '',
    link,
    '',
    'Até confirmar, nenhum desses e-mails chega aqui.',
  ];
}

/**
 * Grava um link novo e manda o e-mail. Nunca lança: o resultado é para a tela e para o log.
 *
 * `montar` troca o texto — o cadastro manda as boas-vindas com o link dentro. Quem passa
 * `montar` responde pelo que escreve: nada digitado por alguém.
 *
 * `esperarEnvio: false` grava o link e dispara o e-mail sem esperar o provedor — para o
 * cadastro, que não pode segurar a tela de fim por causa de um provedor lento.
 */
export async function pedirConfirmacao(p: {
  tenantId: number;
  barberId: number;
  agora?: Date;
  montar?: (link: string) => Pick<Email, 'assunto' | 'texto'>;
  esperarEnvio?: boolean;
  enviar?: (e: Email) => Promise<unknown>;
}): Promise<ResultadoDoPedidoDeConfirmacao> {
  const agora = p.agora ?? new Date();
  const enviar = p.enviar ?? enviarEmail;
  try {
    const quem = await first(dbDono
      .select({ email: barbers.email, confirmadoEm: barbers.emailConfirmadoEm, ativo: barbers.active })
      .from(barbers)
      .where(and(eq(barbers.id, p.barberId), eq(barbers.tenantId, p.tenantId))));
    const email = normalizarEmail(quem?.email);
    if (!quem?.ativo || !email) return 'sem-email';
    if (quem.confirmadoEm) return 'ja-confirmado';

    const desde = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const recentes = await dbDono
      .select({ criadaEm: confirmacoesDeEmail.criadaEm })
      .from(confirmacoesDeEmail)
      .where(and(
        eq(confirmacoesDeEmail.tenantId, p.tenantId),
        eq(confirmacoesDeEmail.barberId, p.barberId),
        gt(confirmacoesDeEmail.criadaEm, desde),
      ))
      .orderBy(desc(confirmacoesDeEmail.criadaEm));
    if (recentes[0] && agora.getTime() - recentes[0].criadaEm.getTime() < ESPERA_ENTRE_PEDIDOS_MS) return 'cedo-demais';
    if (recentes.length >= PEDIDOS_POR_DIA) return 'limite-do-dia';

    if (transporteDeEmail() === 'nenhum') return 'sem-envio';
    const painel = urlDoPainel();
    if (!painel) {
      console.error('[confirmacao] PAINEL_URL e DOMINIO_BASE vazios: não há endereço do painel para pôr no link.');
      return 'sem-painel';
    }

    const token = randomBytes(32).toString('base64url');
    // O link anterior ainda não usado deixa de valer — vence agora. Não é apagado: a linha
    // conta no limite do dia.
    await dbDono.update(confirmacoesDeEmail)
      .set({ expiraEm: agora })
      .where(and(
        eq(confirmacoesDeEmail.tenantId, p.tenantId),
        eq(confirmacoesDeEmail.barberId, p.barberId),
        isNull(confirmacoesDeEmail.usadaEm),
        gt(confirmacoesDeEmail.expiraEm, agora),
      ));
    await dbDono.insert(confirmacoesDeEmail).values({
      tenantId: p.tenantId,
      barberId: p.barberId,
      email,
      tokenHash: hashDoToken(token),
      expiraEm: new Date(agora.getTime() + VALIDADE_DA_CONFIRMACAO_MS),
      criadaEm: agora,
    });

    const link = `${painel}${TELA_DE_CONFIRMACAO}?token=${token}`;
    const conteudo = (p.montar ?? textoDoPedidoDeConfirmacao)(link);
    const naoSaiu = (erro: unknown) => console.error(
      `[confirmacao] o e-mail de confirmação para ${mascararEmail(email)} não saiu:`,
      erro instanceof Error ? erro.message : erro,
    );
    if (p.esperarEnvio === false) {
      try { enviar({ para: email, ...conteudo }).catch(naoSaiu); } catch (erro) { naoSaiu(erro); return 'falhou'; }
      return 'enviado';
    }
    try {
      await enviar({ para: email, ...conteudo });
    } catch (erro) {
      naoSaiu(erro);
      return 'falhou';
    }
    return 'enviado';
  } catch (erro) {
    console.error('[confirmacao] não consegui gravar o pedido de confirmação:', erro);
    return 'falhou';
  }
}

export type EstadoDoLink =
  | { estado: 'valido'; id: number; tenantId: number; barberId: number; emailMascarado: string }
  /** O link já foi usado, e o e-mail dele continua confirmado: o segundo clique. */
  | { estado: 'ja-confirmado'; emailMascarado: string }
  | { estado: 'invalido' };

/**
 * O que este link vale agora. Para a tela decidir se mostra o botão.
 *
 * Válido só se: não usado, dentro do prazo, de barbeiro ativo, e o e-mail do barbeiro
 * continua sendo o endereço para onde o link foi.
 */
export async function estadoDoLink(token: string, agora: Date = new Date()): Promise<EstadoDoLink> {
  if (!FORMA_DO_TOKEN.test(token)) return { estado: 'invalido' };

  // O token é a identidade: a barbearia sai dele, como na senha nova.
  const colunas = {
    id: confirmacoesDeEmail.id,
    barbearia: confirmacoesDeEmail.tenantId,
    barbeiro: confirmacoesDeEmail.barberId,
    email: confirmacoesDeEmail.email,
    expiraEm: confirmacoesDeEmail.expiraEm,
    usadaEm: confirmacoesDeEmail.usadaEm,
  };
  const pedido = await first(
    dbDono.select(colunas).from(confirmacoesDeEmail).where(eq(confirmacoesDeEmail.tokenHash, hashDoToken(token))),
  );
  if (!pedido) return { estado: 'invalido' };

  const barbeiro = await first(dbDono
    .select({ email: barbers.email, confirmadoEm: barbers.emailConfirmadoEm, ativo: barbers.active })
    .from(barbers)
    .where(and(eq(barbers.id, pedido.barbeiro), eq(barbers.tenantId, pedido.barbearia))));
  const mesmoEmail = !!barbeiro?.ativo && normalizarEmail(barbeiro.email) === pedido.email;
  if (!mesmoEmail) return { estado: 'invalido' };

  if (pedido.usadaEm) {
    return barbeiro!.confirmadoEm
      ? { estado: 'ja-confirmado', emailMascarado: mascararEmail(pedido.email) }
      : { estado: 'invalido' };
  }
  if (pedido.expiraEm.getTime() <= agora.getTime()) return { estado: 'invalido' };

  return {
    estado: 'valido',
    id: pedido.id,
    tenantId: pedido.barbearia,
    barberId: pedido.barbeiro,
    emailMascarado: mascararEmail(pedido.email),
  };
}

/**
 * Confirma pelo link. O token é gasto e o e-mail confirmado NA MESMA transação, e o
 * e-mail só é confirmado se ainda for o endereço do link — trocado no meio, nada muda.
 */
export async function confirmarEmail(token: string, agora: Date = new Date()): Promise<boolean> {
  const link = await estadoDoLink(token, agora);
  if (link.estado !== 'valido') return false;

  const NAO_CONFIRMOU = Symbol('nao-confirmou');
  try {
    await dbDono.transaction(async (tx) => {
      const gasto = await tx.update(confirmacoesDeEmail)
        .set({ usadaEm: agora })
        .where(and(
          eq(confirmacoesDeEmail.id, link.id),
          eq(confirmacoesDeEmail.tenantId, link.tenantId),
          isNull(confirmacoesDeEmail.usadaEm),
          gt(confirmacoesDeEmail.expiraEm, agora),
        ))
        .returning({ email: confirmacoesDeEmail.email });
      if (gasto.length === 0) throw NAO_CONFIRMOU;

      const confirmados = await tx.update(barbers)
        .set({ emailConfirmadoEm: agora })
        .where(and(
          eq(barbers.id, link.barberId),
          eq(barbers.tenantId, link.tenantId),
          eq(barbers.active, true),
          // Como `normalizarEmail`: o e-mail gravado antes da regra pode ter maiúscula.
          sql`lower(trim(${barbers.email})) = ${gasto[0].email}`,
        ))
        .returning({ id: barbers.id });
      // Desfaz o gasto do token: o e-mail mudou entre a tela e o clique.
      if (confirmados.length === 0) throw NAO_CONFIRMOU;
    });
  } catch (erro) {
    if (erro === NAO_CONFIRMOU) return false;
    throw erro;
  }
  return true;
}
