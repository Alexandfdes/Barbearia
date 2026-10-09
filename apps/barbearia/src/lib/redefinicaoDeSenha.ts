/**
 * "Esqueci minha senha": o link por e-mail que troca a senha do painel.
 *
 * Até 09/10/2026 não existia — quem trocava a senha de um dono era o suporte,
 * rodando `scripts/set-admin-password.mjs` (`docs/PENDENCIAS-ABERTAS.md` §4.17). No
 * autoatendimento, cada senha esquecida virava um chamado.
 *
 * ── AS REGRAS, E O QUE CADA UMA IMPEDE ───────────────────────────────────────
 *
 *  - **Começa pelo WhatsApp de login**, o mesmo do login (único no mundo, migration
 *    0002), e o link vai para o e-mail GRAVADO — nunca para um e-mail digitado na
 *    hora. Quem sabe o número de alguém não recebe o link dele.
 *  - **A resposta é a mesma, exista o número ou não** (`api/auth/esqueci.ts`):
 *    "não achamos este número" entregaria a lista de quem é cliente a quem testasse.
 *  - **O token não é guardado**, só o hash dele: quem lesse a tabela — um backup
 *    esquecido — não trocaria a senha de ninguém.
 *  - **Uma hora, uma vez.** Pedir de novo invalida o anterior; usar invalida todos.
 *  - **Trocar derruba as sessões abertas** (`lib/session.ts`): quem pede senha nova
 *    porque desconfia de alguém quer esse alguém fora.
 *  - **O link aponta para o painel do produto**, nunca para o endereço de onde o
 *    pedido veio (`urlDoPainel`, em `lib/tenant.ts`, diz por quê).
 *
 * ⚠️ Usa a conexão do DONO do banco, como o login: o pedido chega antes de se saber
 * de qual barbearia ele é — descobrir isso é o trabalho. `tests/rls.test.ts` mantém
 * a lista de quem pode fechada, e as consultas sem filtro de barbearia estão
 * justificadas uma a uma em `tests/escopo-rotas.test.ts`.
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { dbDono, first } from '../db/index.js';
import { barbers, redefinicoesDeSenha, tenants } from '../db/schema.js';
import { normalizePhone } from './phone.js';
import { situacaoDe } from './situacao.js';
import { enviarEmail } from './email.js';
import { urlDoPainel } from './tenant.js';
import { NOME_PRODUTO } from './produto.js';

/** Quanto o link vale. Uma hora: o bastante para abrir o e-mail, pouco para ficar esquecido. */
export const VALIDADE_DO_LINK_MS = 60 * 60 * 1000;

/** A mesma régua do cadastro (`api/cadastrar.ts`). */
export const SENHA_MINIMA = 8;
const SENHA_MAXIMA = 200;
const BCRYPT_COST = 12;

/** Onde o link leva. Pública: o middleware a deixa abrir sem sessão. */
export const TELA_DE_SENHA_NOVA = '/admin/nova-senha';

/** 32 bytes em base64url: 43 caracteres, 256 bits. */
const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ResultadoDoPedido =
  /** O e-mail saiu. */
  | 'enviado'
  /** Número sem cadastro, barbeiro desativado ou barbearia encerrada. */
  | 'sem-cadastro'
  /** Cadastrado, sem e-mail: quem nasceu antes de o cadastro pedir, e a equipe. */
  | 'sem-email'
  /** Sem endereço do painel configurado — não há link para mandar. */
  | 'sem-painel'
  /** O envio falhou. O motivo vai para o log. */
  | 'falhou';

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Do WhatsApp de login ao e-mail com o link. Nunca lança: o resultado é para o
 * log — quem pediu recebe sempre a mesma resposta (`api/auth/esqueci.ts`).
 */
export async function pedirRedefinicao(whatsapp: string, agora: Date = new Date()): Promise<ResultadoDoPedido> {
  const telefone = normalizePhone(whatsapp);
  if (!telefone) return 'sem-cadastro';

  // Colunas fora do comando, como no login: o guarda de escopo lê o comando, e
  // esta busca é das que NÃO filtram por barbearia, de propósito.
  const colunas = {
    id: barbers.id,
    barbearia: barbers.tenantId,
    nome: barbers.name,
    email: barbers.email,
    ativo: barbers.active,
  };
  const quem = await first(dbDono.select(colunas).from(barbers).where(eq(barbers.phone, telefone)));
  if (!quem || !quem.ativo) return 'sem-cadastro';

  const barbearia = await first(
    dbDono.select({ nome: tenants.businessName, status: tenants.status, testeAte: tenants.trialEndsAt, atrasadaDesde: tenants.pastDueSince })
      .from(tenants).where(eq(tenants.id, quem.barbearia)),
  );
  // Encerrada não entra no painel (`api/auth/login.ts`): senha nova não serviria.
  if (!barbearia || situacaoDe(barbearia, agora).fase === 'cancelada') {
    return 'sem-cadastro';
  }

  if (!quem.email) return 'sem-email';

  const painel = urlDoPainel();
  if (!painel) {
    console.error('[senha] PAINEL_URL e DOMINIO_BASE vazios: não há endereço do painel para pôr no link.');
    return 'sem-painel';
  }

  const token = randomBytes(32).toString('base64url');

  // O pedido anterior que ainda não foi usado deixa de valer: só o link mais novo abre.
  await dbDono.delete(redefinicoesDeSenha).where(and(
    eq(redefinicoesDeSenha.tenantId, quem.barbearia),
    eq(redefinicoesDeSenha.barberId, quem.id),
    isNull(redefinicoesDeSenha.usadaEm),
  ));
  await dbDono.insert(redefinicoesDeSenha).values({
    tenantId: quem.barbearia,
    barberId: quem.id,
    tokenHash: hashDoToken(token),
    expiraEm: new Date(agora.getTime() + VALIDADE_DO_LINK_MS),
  });

  const link = `${painel}${TELA_DE_SENHA_NOVA}?token=${token}`;
  try {
    await enviarEmail({
      para: quem.email,
      assunto: `Senha nova do painel — ${NOME_PRODUTO}`,
      texto: textoDoEmailDeSenha(quem.nome, barbearia.nome, link),
    });
  } catch (erro) {
    console.error('[senha] o e-mail de senha nova não saiu:', erro instanceof Error ? erro.message : erro);
    return 'falhou';
  }
  return 'enviado';
}

/** O texto do e-mail. Exportado para o teste ler o que o dono vai ler. */
export function textoDoEmailDeSenha(nome: string, barbearia: string, link: string): string {
  return [
    `Olá, ${nome}.`,
    '',
    `Recebemos um pedido de senha nova para o seu acesso ao painel — ${barbearia}.`,
    'Para criar a senha nova, abra o link abaixo. Ele vale por 1 hora e funciona uma vez só:',
    '',
    link,
    '',
    'Quando você trocar a senha, todo aparelho que estiver com o painel aberto vai pedir login de novo.',
    '',
    'Não foi você? Ignore este e-mail: a sua senha continua a mesma.',
    '',
    `— ${NOME_PRODUTO}`,
  ].join('\n');
}

export interface PedidoDeSenha {
  id: number;
  tenantId: number;
  barberId: number;
  nome: string;
}

/**
 * O pedido que este token abre — ainda não usado, dentro da hora, de um barbeiro
 * ativo. `null` em qualquer outro caso, sem dizer qual: a tela só precisa saber
 * se mostra o formulário ou o "peça outro link".
 */
export async function pedidoValido(token: string, agora: Date = new Date()): Promise<PedidoDeSenha | null> {
  if (!FORMA_DO_TOKEN.test(token)) return null;

  // Como a busca pelo telefone: o token É a identidade, e a barbearia sai dele.
  const colunas = {
    id: redefinicoesDeSenha.id,
    barbearia: redefinicoesDeSenha.tenantId,
    barbeiro: redefinicoesDeSenha.barberId,
    expiraEm: redefinicoesDeSenha.expiraEm,
    usadaEm: redefinicoesDeSenha.usadaEm,
  };
  const pedido = await first(
    dbDono.select(colunas).from(redefinicoesDeSenha).where(eq(redefinicoesDeSenha.tokenHash, hashDoToken(token))),
  );
  if (!pedido || pedido.usadaEm || pedido.expiraEm.getTime() <= agora.getTime()) return null;

  const barbeiro = await first(
    dbDono.select({ nome: barbers.name, ativo: barbers.active })
      .from(barbers)
      .where(and(eq(barbers.id, pedido.barbeiro), eq(barbers.tenantId, pedido.barbearia))),
  );
  if (!barbeiro?.ativo) return null;

  return { id: pedido.id, tenantId: pedido.barbearia, barberId: pedido.barbeiro, nome: barbeiro.nome };
}

export type ResultadoDaTroca =
  | { ok: true; tenantId: number; barberId: number }
  | { ok: false; motivo: 'senha-curta' | 'senha-longa' | 'link-invalido' };

/**
 * Troca a senha pelo link. O token é gasto e a senha trocada NA MESMA transação:
 * dois cliques no mesmo link — o duplo clique, ou o link aberto em dois aparelhos —
 * trocam a senha uma vez só, e o segundo recebe "link inválido".
 */
export async function redefinirSenha(token: string, senha: string, agora: Date = new Date()): Promise<ResultadoDaTroca> {
  if (senha.length < SENHA_MINIMA) return { ok: false, motivo: 'senha-curta' };
  if (senha.length > SENHA_MAXIMA) return { ok: false, motivo: 'senha-longa' };

  // Confere ANTES do bcrypt: o hash custa ~250 ms de CPU, e link inválido não
  // pode ser um jeito de ocupar o processo que atende os sites.
  const pedido = await pedidoValido(token, agora);
  if (!pedido) return { ok: false, motivo: 'link-invalido' };

  const passwordHash = await bcrypt.hash(senha, BCRYPT_COST);

  const trocou = await dbDono.transaction(async (tx) => {
    const gasto = await tx.update(redefinicoesDeSenha)
      .set({ usadaEm: agora })
      .where(and(
        eq(redefinicoesDeSenha.id, pedido.id),
        eq(redefinicoesDeSenha.tenantId, pedido.tenantId),
        isNull(redefinicoesDeSenha.usadaEm),
        gt(redefinicoesDeSenha.expiraEm, agora),
      ))
      .returning({ id: redefinicoesDeSenha.id });
    if (gasto.length === 0) return false;

    // `senha_trocada_em` com o relógio do APP, não o `now()` do banco: a sessão
    // nova é carimbada pelo mesmo relógio (`lib/session.ts`), e relógios
    // diferentes derrubariam a sessão que acabou de nascer.
    const trocados = await tx.update(barbers)
      .set({ passwordHash, senhaTrocadaEm: agora })
      .where(and(eq(barbers.id, pedido.barberId), eq(barbers.tenantId, pedido.tenantId), eq(barbers.active, true)))
      .returning({ id: barbers.id });
    if (trocados.length === 0) return false;

    // Os outros links pendentes do mesmo barbeiro morrem junto.
    await tx.delete(redefinicoesDeSenha).where(and(
      eq(redefinicoesDeSenha.tenantId, pedido.tenantId),
      eq(redefinicoesDeSenha.barberId, pedido.barberId),
      isNull(redefinicoesDeSenha.usadaEm),
    ));
    return true;
  });

  return trocou
    ? { ok: true, tenantId: pedido.tenantId, barberId: pedido.barberId }
    : { ok: false, motivo: 'link-invalido' };
}
