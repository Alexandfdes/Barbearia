/**
 * A cobrança da mensalidade, pela Asaas: o Checkout que leva o dono a cadastrar
 * o cartão, o webhook que mantém a barbearia em dia, e o cancelar.
 *
 * ── AS DECISÕES QUE ISTO IMPLEMENTA ──────────────────────────────────────────
 *
 * De 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13): o cartão é pedido no fim do
 * teste; a cobrança mora num módulo do app da barbearia; só plano mensal; a
 * cobrança que falha dá 3 dias de carência (`lib/situacao.ts`). O desenho dos
 * estados: `docs/ARQUITETURA-COBRANCA-V1.md` §5.2 — o cartão cadastrado leva a
 * barbearia de `trial` a `active`, a cobrança que falha a `past_due`, a paga de
 * volta a `active`.
 *
 * DECIDIDO NA IMPLEMENTAÇÃO E CONFIRMADO PELO DONO EM 10/10/2026
 * (`docs/PENDENCIAS-ABERTAS.md` §4.14): quem cancela fica no ar até o fim do
 * período pago, e depois sai do ar como quem não pagou — sem carência, e sem
 * apagar nada; assinando de novo, volta. É o que a jornada descrevia como o
 * comum no autoatendimento (`docs/JORNADA-DO-BARBEIRO.md` §2.10). Com a
 * cobrança atrasada também se cancela — senão a Asaas seguiria cobrando o
 * cartão de quem quis sair —, e o site fica só o que restava da carência.
 * E quem sai do ar pela cobrança SEM cancelar continua com a assinatura viva: a
 * Asaas tenta o cartão nos vencimentos seguintes, e o pagamento que passar põe a
 * barbearia em dia. Rejeitado no mesmo dia: remover a assinatura depois de 30
 * dias fora do ar.
 *
 * ── O QUE A ASAAS NÃO GARANTE, E COMO ISTO SE DEFENDE ────────────────────────
 *
 * - **Entrega "pelo menos uma vez".** O evento cru é gravado antes, na mesma
 *   transação, com `UNIQUE` no id dele (`webhook_events`, migration 0010): o
 *   repetido não faz nada (`docs/ARQUITETURA-COBRANCA-V1.md` §5.1).
 * - **Ordem.** Cada evento traz uma chave diferente — o do Checkout traz o id
 *   dele; o da assinatura, o cliente; o da cobrança, a assinatura. A barbearia é
 *   achada por qualquer uma, e cada evento ensina as que faltam. O cliente é a
 *   última: o mesmo dono pode ter duas barbearias, e aí ele não escolhe nenhuma.
 * - **O Checkout pago não é o último aberto.** O dono que clica duas vezes abre
 *   dois, e paga no que estiver na frente: a barbearia guarda os últimos 20.
 * - **Erro que se repetiria a cada reentrega** — um dado em conflito, um dado
 *   que o banco recusa — não volta para a fila: 15 falhas seguidas interrompem o
 *   webhook inteiro, e um evento torto pararia os pagamentos de todas as
 *   barbearias. Ele fica gravado com o erro, para tratar à mão (`erroDefinitivo`).
 * - **A cobrança de uma assinatura antiga.** Quem troca o cartão ganha uma
 *   assinatura nova, e a antiga é removida — com a cobrança vencida dela. Um
 *   evento atrasado da antiga não pode marcar a barbearia como atrasada: só conta
 *   a cobrança da assinatura em vigor.
 * - **Suspensa à mão continua suspensa.** Pagamento nenhum desfaz o que você
 *   fez à mão.
 *
 * Conferido na documentação da Asaas em 10/10/2026. **Não testado no sandbox:**
 * os eventos daqui são os do exemplo da documentação. A prova é a do
 * `docs/PENDENCIAS-ABERTAS.md` §4.14.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { TransactionSql } from 'postgres';
import { sqlConn } from '../db/index.js';
import { fusoDe } from './timezone.js';
import { fimDaCarenciaDoAtraso, situacaoDe, type Situacao, type StatusDaBarbearia } from './situacao.js';
import { NOME_PRODUTO, PRECO_MENSAL } from './produto.js';
import { TELA_DE_ASSINATURA } from './assinatura.js';
import { invalidarTenants } from './tenant.js';
import * as asaas from './asaas.js';

/** Erro que o dono lê — a mensagem vai para a tela, com o status da resposta. */
export class ErroDeCobranca extends Error {
  constructor(mensagem: string, readonly status: number) {
    super(mensagem);
    this.name = 'ErroDeCobranca';
  }
}

// ── O Checkout ──────────────────────────────────────────────────────────────

/** O que se lê da barbearia para cobrar — a linha de `tenants`, em resumo. */
interface LinhaDaBarbearia {
  id: number;
  status: StatusDaBarbearia;
  // Texto ou Date, conforme o Drizzle já tenha embrulhado a conexão: ver `comoData`.
  trial_ends_at: Date | string | null;
  past_due_since: Date | string | null;
  /** O fim da carência estendido pelo operador (migration 0016). */
  carencia_ate: Date | string | null;
  subscription_ends_at: Date | string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  /** O fuso da barbearia (migration 0013): os prazos acabam na meia-noite dela. */
  timezone: string;
}

/**
 * ⚠️ DATA EM SQL CRU: vai como texto ISO, volta como texto — e vira `Date` aqui.
 *
 * O Drizzle, ao embrulhar a conexão, desliga a conversão de data do driver nela
 * inteira (`drizzle-orm/postgres-js`): parâmetro `Date` passa a estourar ("Received
 * an instance of Date") e `timestamptz` passa a voltar como texto. Na suíte isso só
 * aparece quando o mesmo arquivo de teste também usa o Drizzle — e em produção ele
 * sempre usa. Achado em 10/10/2026, escrevendo este arquivo.
 */
const comoData = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

const fusoDaLinha = (t: LinhaDaBarbearia): string => fusoDe({ fuso: t.timezone });

const situacaoDaLinha = (t: LinhaDaBarbearia, agora: Date): Situacao => situacaoDe({
  status: t.status,
  testeAte: comoData(t.trial_ends_at),
  atrasadaDesde: comoData(t.past_due_since),
  carenciaAte: comoData(t.carencia_ate),
  encerraEm: comoData(t.subscription_ends_at),
  fuso: fusoDaLinha(t),
}, agora);

/**
 * Pode ir ao Checkout? No teste, na carência e fora do ar, sim — inclusive quem
 * cancelou. Em dia, não: já tem cartão. Tirada do ar à mão e encerrada, não.
 */
export function podeCadastrarCartao(s: Situacao): boolean {
  switch (s.fase) {
    case 'teste':
    case 'carencia':
      return true;
    case 'ativa':
      return Boolean(s.encerraEm); // cancelou e ainda está no período pago: reativa
    case 'suspensa':
      return s.motivo !== 'manual';
    case 'cancelada':
      return false;
  }
}

/**
 * O dia da primeira cobrança da assinatura que o Checkout cria ("AAAA-MM-DD").
 *
 * - No teste: o dia seguinte ao último dia do teste — nada é cobrado antes.
 * - Cancelou e ainda está no período pago: o dia em que ele acaba — a assinatura
 *   nova continua a antiga, sem cobrar duas vezes o mesmo mês.
 * - Na carência, fora do ar, com a cobrança atrasada: hoje.
 *
 * ⚠️ Dia no fuso da barbearia, por `formatInTimeZone` — nunca conta de offset.
 */
export function dataDaPrimeiraCobranca(s: Situacao, fuso: string, agora: Date = new Date()): string {
  if (s.fase === 'teste') return formatInTimeZone(s.ate, fuso, 'yyyy-MM-dd');
  if (s.fase === 'ativa' && s.encerraEm && s.encerraEm.getTime() > agora.getTime()) {
    return formatInTimeZone(s.encerraEm, fuso, 'yyyy-MM-dd');
  }
  return formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
}

/** Como a Asaas guarda de quem é o Checkout: o número da barbearia. */
export const referenciaDaBarbearia = (id: number) => `barbearia:${id}`;

function barbeariaDaReferencia(ref: unknown): number | null {
  const m = typeof ref === 'string' ? /^barbearia:(\d+)$/.exec(ref) : null;
  return m ? Number(m[1]) : null;
}

/**
 * A imagem do item no Checkout — a documentação exige uma, em Base64. Um "F"
 * branco no verde do produto, 128×128, gerado em 10/10/2026.
 */
export const IMAGEM_DO_ITEM =
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAABHVBMVEVMaXEZf2YAbW0Odm0PdW0Pdm4Pdm0OdW0Odm4Af38Qd20Pdm0PdW4Af38AVVUXc3MOdW0Af18TdWsNdW8Pdm4OdW4PdW4McnIPdW0NeGsPdW4PdG4PdW4Odm4Nc28PdW4Odm4Odm0Odm4Pdm4PdW4NeGsPdW4Nd2wOdm0OdW4KenAQd20Odm4Pdm4Pdm4OdW4Odm0Pdm4PdW8PdW0PdW0Odm0Odm4OdW0OdW4Pdm0QdW8Pdm0PdW4AZmYPdW4OdWsccXEOdm0OdW4OdG0RcnIPdm4PdW4Sdm0PdW0ScXEPdm4Pdm0Pdm4Vf2oPeHAPdm4MeWwOcXEMeW0Pdm0Ndm0Pdm4OdW0Pdm0PdmwPeG4PdW4OeG4OdW0Pdm7///88h4v2AAAAXXRSTlMACgf0+Znt394GTevsBAML4QgaJ+nzhBSCE+5R6ps3c/HvwPiRJoZLzc4ZT+CIy9Dyg1DdgK7Cw62qTnBxBak0CeLjIx3clBzbG/qXogwikigSFYU4gZxyUjOYNb9oTE/XAAAACXBIWXMAAAsTAAALEwEAmpwYAAAB90lEQVR42u3bCTOCURgF4LflaxcqqWizU9FCImTf9317/f+foRgqlRi+eyzv+QPnmfGNe5u5h6hJOiLRcN4W2uVvijlky4ejkQ76UOx9M2nWJbFC1t62/tTvYh3jyvS+W3+QMrHOMY10tu7PrrCCdCVa1HcPsaLsG5r1b02xsox7GvvXNlhhkt63/cf9rDS+4fr+HSsrzup63fc3xcozZqwBaAzIZrW/jyFxvPQbrBhA18v/xBSD4n/uD/agAKbnk+mMYbl4Ov9dOICzcj+4ZmDmy4AZJGCufP+LIQFxN50zNCWKYgELdIkFaDSLBQyQFQuwkQULcJIZCxgkBuf3AB4+HQEIQAACEIAABKAzAH4fEIAABCAAAQjgKyegAAQgAAEIQAB/AyD3AQEIQAACEIAABCAAAQhAAP8PwH/2FQ38IRP8KRf8MRv8OV8YC7ilKyygSBEs4Ab/rJcKSMASbt3ArxsH5OP2/sXK8/oMDjD9MwYONIICBH7KyIUSGMBodWi0h+g/qp16javvn6ydepFH+Wdgm6if23l9DJ37ER1uq+y3ehsnl54xhX//iWajU6Oy0atmbLG7dSSVfH6jrYfHBr/u50I6sPzu9joYcOp6/k6ftB+/z8/F9WkPLTkWPzbAd98taAM5y7f9ajNbcvdaseRu1vUITf9GC1EytFAAAAAASUVORK5CYII=';

/** Quantos Checkouts a barbearia guarda — o mais novo e os anteriores a ele. */
export const CHECKOUTS_GUARDADOS = 20;

export interface DonoDaBarbearia {
  nome: string;
  email: string | null;
  telefone: string | null;
}

async function linhaDaBarbearia(id: number): Promise<LinhaDaBarbearia | null> {
  const [t] = await sqlConn<LinhaDaBarbearia[]>`
    SELECT id, status, trial_ends_at, past_due_since, carencia_ate, subscription_ends_at,
           asaas_customer_id, asaas_subscription_id, timezone
    FROM tenants WHERE id = ${id}`;
  return t ?? null;
}

/** A barbearia tem assinatura na Asaas? É o que decide se a tela oferece o cancelar. */
export async function temAssinaturaNaAsaas(tenantId: number): Promise<boolean> {
  const t = await linhaDaBarbearia(tenantId);
  return Boolean(t?.asaas_subscription_id || t?.asaas_customer_id);
}

/**
 * Cria o Checkout da Asaas para a barbearia e devolve o endereço da página de
 * pagamento. O número do cartão é digitado lá: nunca passa por este servidor
 * (`docs/PLANO-PRODUTIZACAO.md` §13, custo 7).
 *
 * O id do Checkout fica gravado na barbearia: é por ele que o `CHECKOUT_PAID`
 * acha quem pagou — o evento não traz a referência (documentação, 10/10/2026).
 * Guardam-se os últimos `CHECKOUTS_GUARDADOS`, não só o último: o anterior ainda
 * pode ser pago (vale 60 minutos) e, sem ele, o pagamento ficaria sem barbearia.
 */
export async function abrirCheckout(o: {
  tenantId: number;
  dono: DonoDaBarbearia;
  painel: string;
  cfg: asaas.ConfigAsaas;
  agora?: Date;
}): Promise<string> {
  const agora = o.agora ?? new Date();
  const t = await linhaDaBarbearia(o.tenantId);
  if (!t) throw new ErroDeCobranca('Barbearia não encontrada.', 404);
  const s = situacaoDaLinha(t, agora);
  if (!podeCadastrarCartao(s)) {
    throw new ErroDeCobranca(s.fase === 'ativa'
      ? 'A assinatura já está em dia.'
      : 'Esta barbearia não pode cadastrar o cartão por aqui. Fale com o suporte.', 409);
  }

  const voltar = (como: string) => `${o.painel}${TELA_DE_ASSINATURA}?cartao=${como}`;
  const corpo: asaas.CorpoDoCheckout = {
    billingTypes: ['CREDIT_CARD'],
    chargeTypes: ['RECURRENT'],
    minutesToExpire: 60,
    externalReference: referenciaDaBarbearia(t.id),
    callback: { successUrl: voltar('ok'), cancelUrl: voltar('cancelado'), expiredUrl: voltar('expirou') },
    items: [{
      name: `${NOME_PRODUTO} — mensal`.slice(0, 30),
      description: 'Site, agendamento e painel da barbearia.',
      quantity: 1,
      value: PRECO_MENSAL,
      imageBase64: IMAGEM_DO_ITEM,
    }],
    subscription: { cycle: 'MONTHLY', nextDueDate: dataDaPrimeiraCobranca(s, fusoDaLinha(t), agora) },
    // Cliente que já existe na Asaas continua o mesmo — é a chave dos eventos.
    // Novo: os dados que o cadastro tem; o CPF ou CNPJ, a página pede.
    ...(t.asaas_customer_id
      ? { customer: t.asaas_customer_id }
      : {
          customerData: {
            name: o.dono.nome,
            ...(o.dono.email ? { email: o.dono.email } : {}),
            ...(o.dono.telefone ? { phone: o.dono.telefone } : {}),
          },
        }),
  };

  const checkout = await asaas.criarCheckout(o.cfg, corpo);
  await sqlConn`
    UPDATE tenants
    SET asaas_checkout_ids = asaas_checkout_ids[greatest(cardinality(asaas_checkout_ids) - ${CHECKOUTS_GUARDADOS - 2}, 1):]
                             || ${checkout.id}::text
    WHERE id = ${t.id}`;
  return checkout.link;
}

// ── O webhook ───────────────────────────────────────────────────────────────

interface ObjetoComCliente {
  id?: string;
  customer?: string | null;
  externalReference?: string | null;
}

/** O que se lê de um evento. Campo novo da Asaas é ignorado, nunca erro. */
export interface EventoAsaas {
  id: string;
  event: string;
  checkout?: ObjetoComCliente & { status?: string };
  subscription?: ObjetoComCliente & { nextDueDate?: string; checkoutSession?: string | null; status?: string };
  payment?: ObjetoComCliente & { subscription?: string | null; status?: string; dueDate?: string };
  [campo: string]: unknown;
}

export type Efeito =
  | { tipo: 'desligar-notificacoes'; cliente: string }
  | { tipo: 'remover-assinatura'; assinatura: string };

export type ResultadoDoEvento =
  | { duplicado: true }
  | { duplicado: false; tenantId: number | null; desfecho: string; efeitos: Efeito[] };

const PAGOU = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const FALHOU = new Set(['PAYMENT_OVERDUE', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED']);
const DEVOLVEU = new Set([
  'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
]);
const ENCERROU = new Set(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED']);

/** Status que o pagamento pode mexer. Suspensa à mão e encerrada, nunca. */
const MEXE_SOZINHO = new Set<StatusDaBarbearia>(['trial', 'active', 'past_due']);

const textoOuNulo = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * O instante em que o período pago termina: a meia-noite, no fuso, do dia da
 * próxima cobrança que não vai mais acontecer. Sem data, ou com ela no passado:
 * agora.
 */
export function fimDoPeriodoPago(proximoVencimento: string | null | undefined, fuso: string, agora: Date = new Date()): Date {
  if (proximoVencimento && /^\d{4}-\d{2}-\d{2}$/.test(proximoVencimento)) {
    const fim = fromZonedTime(`${proximoVencimento}T00:00:00`, fuso);
    if (fim.getTime() > agora.getTime()) return fim;
  }
  return agora;
}

// ⚠️ Não `Parameters<typeof sqlConn.begin>`: o `begin` tem duas assinaturas, o
// TypeScript pega a última, e o tipo vira `never` — sem erro nenhum no vitest.
type Tx = TransactionSql<{}>;

const clienteDoEvento = (e: EventoAsaas) =>
  textoOuNulo(e.checkout?.customer) ?? textoOuNulo(e.subscription?.customer) ?? textoOuNulo(e.payment?.customer);

/**
 * Acha a barbearia do evento pela primeira chave que casar, e a trava até o fim da
 * transação. `ambigua`: a chave casou com mais de uma — só o cliente pode, e aí o
 * evento não escolhe nenhuma. Chutar seria reativar ou atrasar a barbearia errada.
 */
async function acharBarbearia(tx: Tx, e: EventoAsaas): Promise<{ t: LinhaDaBarbearia | null; ambigua: boolean }> {
  const checkout = textoOuNulo(e.checkout?.id) ?? textoOuNulo(e.subscription?.checkoutSession);
  const referencia = barbeariaDaReferencia(e.subscription?.externalReference) ?? barbeariaDaReferencia(e.payment?.externalReference);
  const assinatura = textoOuNulo(e.payment?.subscription) ?? textoOuNulo(e.subscription?.id);
  const cliente = clienteDoEvento(e);
  // Fragmentos do postgres.js: só rodam como parte da consulta de baixo.
  const chaves = [
    checkout && tx`asaas_checkout_ids @> ARRAY[${checkout}::text]`,
    referencia !== null && tx`id = ${referencia}`,
    assinatura && tx`asaas_subscription_id = ${assinatura}`,
    cliente && tx`asaas_customer_id = ${cliente}`,
  ];
  for (const chave of chaves) {
    if (!chave) continue;
    const achadas = await tx<LinhaDaBarbearia[]>`
      SELECT id, status, trial_ends_at, past_due_since, carencia_ate, subscription_ends_at,
             asaas_customer_id, asaas_subscription_id, timezone
      FROM tenants WHERE ${chave}
      ORDER BY id LIMIT 2 FOR UPDATE`;
    if (achadas.length === 1) return { t: achadas[0], ambigua: false };
    if (achadas.length > 1) return { t: null, ambigua: true };
  }
  return { t: null, ambigua: false };
}

/**
 * Processa um evento do webhook, numa transação: grava o evento cru, acha a
 * barbearia, muda o que tiver de mudar e anota o desfecho no evento. Repetido,
 * não faz nada.
 *
 * Os efeitos fora do banco — desligar as notificações, remover a assinatura
 * antiga — voltam para quem chamou rodar DEPOIS do commit: se a Asaas estiver
 * fora, o evento continua processado, e o efeito que falhou fica no log.
 */
export async function processarEventoDaAsaas(e: EventoAsaas, agora: Date = new Date()): Promise<ResultadoDoEvento> {
  return sqlConn.begin(async (tx) => {
    // ⚠️ `::text::jsonb`, e NÃO só `::jsonb` (achado em 12/10/2026): com o parâmetro
    // tipado jsonb, o driver serializa o texto DE NOVO enquanto o Drizzle não tiver
    // tocado o pool — e o webhook pode ser a primeira requisição depois de um deploy
    // (a Asaas reenvia a fila assim que o app volta). O corpo ficava gravado como
    // uma STRING JSON, e `payload->'payment'` não achava nada. Pelo texto, o banco
    // sempre recebe o JSON e o lê como objeto (`tests/jsonb-parametro.test.ts`).
    const [novo] = await tx<{ id: number }[]>`
      INSERT INTO webhook_events (gateway, gateway_event_id, event, payload)
      VALUES ('asaas', ${e.id}, ${e.event}, ${JSON.stringify(e)}::text::jsonb)
      ON CONFLICT (gateway, gateway_event_id) DO NOTHING
      RETURNING id`;
    if (!novo) return { duplicado: true } as const;

    const { t, ambigua } = await acharBarbearia(tx, e);
    const efeitos: Efeito[] = [];
    let desfecho: string;

    if (!t) {
      desfecho = ambigua
        ? 'sem barbearia: o cliente da Asaas é de mais de uma barbearia, e o evento não diz qual — tratar à mão'
        : 'sem barbearia: nenhuma chave do evento casou';
    } else {
      desfecho = await aplicar(tx, e, t, agora, efeitos);
    }

    await tx`UPDATE webhook_events SET tenant_id = ${t?.id ?? null}, outcome = ${desfecho} WHERE id = ${novo.id}`;
    return { duplicado: false, tenantId: t?.id ?? null, desfecho, efeitos } as const;
  }) as Promise<ResultadoDoEvento>;
}

async function aplicar(tx: Tx, e: EventoAsaas, t: LinhaDaBarbearia, agora: Date, efeitos: Efeito[]): Promise<string> {
  const cliente = clienteDoEvento(e);

  if (e.event === 'CHECKOUT_PAID') {
    if (!MEXE_SOZINHO.has(t.status)) return `nada muda: a barbearia está ${t.status}`;
    // O cartão foi cadastrado e a assinatura nasceu. Em dia — inclusive quem
    // estava fora do ar ou tinha cancelado.
    await tx`
      UPDATE tenants SET status = 'active', past_due_since = NULL, subscription_ends_at = NULL,
             asaas_customer_id = COALESCE(${cliente}, asaas_customer_id)
      WHERE id = ${t.id}`;
    if (cliente) efeitos.push({ tipo: 'desligar-notificacoes', cliente });
    return 'em dia: o cartão foi cadastrado';
  }

  if (e.event === 'SUBSCRIPTION_CREATED') {
    const nova = textoOuNulo(e.subscription?.id);
    if (!nova) return 'nada muda: assinatura sem id';
    // Cartão trocado: a assinatura de antes sai — e as cobranças em aberto dela
    // com ela (documentação), senão o dono seria cobrado duas vezes.
    if (t.asaas_subscription_id && t.asaas_subscription_id !== nova) {
      efeitos.push({ tipo: 'remover-assinatura', assinatura: t.asaas_subscription_id });
    }
    await tx`
      UPDATE tenants SET asaas_subscription_id = ${nova},
             asaas_customer_id = COALESCE(asaas_customer_id, ${cliente})
      WHERE id = ${t.id}`;
    return 'assinatura ligada à barbearia';
  }

  if (PAGOU.has(e.event) || FALHOU.has(e.event)) {
    const daAssinatura = textoOuNulo(e.payment?.subscription);
    if (!daAssinatura) return 'nada muda: cobrança avulsa, fora da assinatura';
    if (t.asaas_subscription_id && t.asaas_subscription_id !== daAssinatura) {
      return 'nada muda: cobrança de uma assinatura que não é mais a desta barbearia';
    }
    // O evento da cobrança chegou antes do da assinatura: ele ensina qual é.
    await tx`
      UPDATE tenants SET asaas_subscription_id = COALESCE(asaas_subscription_id, ${daAssinatura}),
             asaas_customer_id = COALESCE(asaas_customer_id, ${cliente})
      WHERE id = ${t.id}`;
    if (!MEXE_SOZINHO.has(t.status)) return `nada muda: a barbearia está ${t.status}`;

    if (PAGOU.has(e.event)) {
      await tx`UPDATE tenants SET status = 'active', past_due_since = NULL WHERE id = ${t.id}`;
      return 'em dia: a cobrança foi paga';
    }
    if (t.status === 'past_due') return 'continua atrasada desde a primeira falha';
    if (t.status !== 'active' || t.subscription_ends_at) return `nada muda: a barbearia está ${t.status}`;
    await tx`UPDATE tenants SET status = 'past_due', past_due_since = ${agora.toISOString()} WHERE id = ${t.id}`;
    return 'atrasada: a cobrança não passou — começa a carência';
  }

  if (DEVOLVEU.has(e.event)) {
    // Estorno e contestação, à mão (`docs/ARQUITETURA-COBRANCA-V1.md` §4): nunca
    // automatizar dinheiro devolvido.
    console.warn(`[cobrança] ⚠️ ${e.event} na barbearia ${t.id} (${e.payment?.id ?? 'sem id'}): trate à mão — nada muda sozinho.`);
    return 'alerta: estorno ou contestação — tratar à mão';
  }

  if (ENCERROU.has(e.event)) {
    const encerrada = textoOuNulo(e.subscription?.id);
    if (!encerrada || encerrada !== t.asaas_subscription_id) return 'nada muda: não é a assinatura em vigor';
    if (t.status !== 'active') return `nada muda: a barbearia está ${t.status}`;
    // Cancelada pelo painel: a data já está gravada — inclusive a de quem cancelou
    // com a cobrança atrasada, que é o fim da carência, não o próximo vencimento.
    if (t.subscription_ends_at) return 'nada muda: a saída já estava marcada pelo cancelamento no painel';
    // Removida na Asaas, por fora do painel: no ar até o fim do período pago.
    const fim = fimDoPeriodoPago(e.subscription?.nextDueDate, fusoDaLinha(t), agora);
    await tx`UPDATE tenants SET subscription_ends_at = ${fim.toISOString()}::timestamptz WHERE id = ${t.id}`;
    return 'assinatura encerrada: no ar até o fim do período pago';
  }

  return 'registrado';
}

/**
 * A assinatura ainda existe na Asaas? A de quem cancelou e assinou de novo já foi
 * removida no cancelar: removê-la outra vez daria erro — e um alarme falso de
 * "faça no painel" a cada reativação, que ensina a ignorar o alarme verdadeiro.
 */
async function aindaExiste(cfg: asaas.ConfigAsaas, assinaturaId: string): Promise<boolean> {
  try {
    return !(await asaas.assinatura(cfg, assinaturaId)).deleted;
  } catch (erro) {
    if (erro instanceof asaas.ErroDaAsaas && erro.status === 404) return false;
    throw erro;
  }
}

/**
 * Roda os efeitos fora do banco. Falha não desfaz o evento — fica no log, com o
 * que fazer à mão.
 */
export async function executarEfeitos(efeitos: Efeito[], cfg: asaas.ConfigAsaas | null): Promise<void> {
  if (!cfg) {
    if (efeitos.length) console.warn('[cobrança] ⚠️ efeitos sem ASAAS_API_KEY para rodar:', efeitos.map((e) => e.tipo).join(', '));
    return;
  }
  for (const ef of efeitos) {
    try {
      if (ef.tipo === 'desligar-notificacoes') await asaas.desligarNotificacoes(cfg, ef.cliente);
      else if (await aindaExiste(cfg, ef.assinatura)) await asaas.removerAssinatura(cfg, ef.assinatura);
    } catch (erro) {
      const alvo = ef.tipo === 'desligar-notificacoes' ? `o cliente ${ef.cliente}` : `a assinatura ${ef.assinatura}`;
      console.warn(`[cobrança] ⚠️ ${ef.tipo} falhou para ${alvo} — faça no painel da Asaas:`,
        erro instanceof Error ? erro.message : erro);
    }
  }
}

/**
 * O erro é do EVENTO, e se repetiria igual em toda reentrega? Dado em conflito
 * (classe 23 do Postgres) ou dado que o banco recusa (22): sim — esse não volta
 * para a fila da Asaas.
 *
 * Todo o resto volta (500), de propósito: conexão caída e concorrência passam
 * sozinhas; erro de PROGRAMA (42, coluna que não existe, um `TypeError`) quebra
 * todos os eventos iguais, e aí a fila parar é o certo — conserta-se, religa-se a
 * fila no painel da Asaas, e eles chegam todos, em ordem. Gravados como falha,
 * cada um teria de ser refeito à mão.
 */
export function erroDefinitivo(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return typeof codigo === 'string' && /^(22|23)[0-9A-Z]{3}$/.test(codigo);
}

/** Grava o evento que falhou de vez, com o erro, para tratar à mão. Repetido, nada. */
export async function registrarEventoComFalha(e: EventoAsaas, erro: unknown): Promise<void> {
  const motivo = `erro: ${erro instanceof Error ? erro.message : String(erro)}`.slice(0, 500);
  const bruto = JSON.stringify(e);
  try {
    await sqlConn`
      INSERT INTO webhook_events (gateway, gateway_event_id, event, payload, outcome)
      VALUES ('asaas', ${e.id}, ${e.event}, ${bruto}::text::jsonb, ${motivo})
      ON CONFLICT (gateway, gateway_event_id) DO NOTHING`;
  } catch (doCorpo) {
    if (!erroDefinitivo(doCorpo)) throw doCorpo;
    // O problema é o próprio corpo — um \u0000, que o jsonb recusa: vai como
    // texto. Guardado de qualquer jeito é o que impede a fila de travar.
    await sqlConn`
      INSERT INTO webhook_events (gateway, gateway_event_id, event, payload, outcome)
      VALUES ('asaas', ${e.id}, ${e.event}, to_jsonb(${bruto}::text), ${motivo})
      ON CONFLICT (gateway, gateway_event_id) DO NOTHING`;
  }
}

// ── O cancelar ──────────────────────────────────────────────────────────────

/**
 * Cancela a assinatura na Asaas e marca até quando o site fica no ar. Cancelar de
 * novo não faz nada.
 *
 * - **Em dia:** até o fim do período pago — a próxima cobrança, que não vai haver.
 * - **Com a cobrança atrasada** — na carência ou já fora do ar: o mês que falhou
 *   não foi pago, então fica só o que restava da carência — estendida pelo
 *   operador, se foi (`fimDaCarenciaDoAtraso`). E cancela de verdade:
 *   a assinatura atrasada continua viva na Asaas, e sem isto ela tentaria de novo
 *   o cartão de quem pediu para sair. Remover a assinatura leva junto a cobrança
 *   vencida (documentação) — a dívida não é cobrada.
 *
 * Nos dois casos a barbearia passa a `active` com `subscription_ends_at`: é como
 * o cancelamento se escreve (`lib/situacao.ts`), e é o que deixa assinar de novo.
 */
export async function cancelarAssinatura(tenantId: number, cfg: asaas.ConfigAsaas, agora: Date = new Date()): Promise<Date> {
  const t = await linhaDaBarbearia(tenantId);
  if (!t) throw new ErroDeCobranca('Barbearia não encontrada.', 404);
  const jaCancelada = comoData(t.subscription_ends_at);
  if (jaCancelada) return jaCancelada;
  if (t.status === 'trial') {
    throw new ErroDeCobranca('No teste grátis não há assinatura: nada é cobrado sem o cartão cadastrado.', 409);
  }
  if (t.status !== 'active' && t.status !== 'past_due') {
    throw new ErroDeCobranca('Esta assinatura não se cancela por aqui. Fale com o suporte.', 409);
  }

  let alvos: asaas.AssinaturaAsaas[];
  if (t.asaas_subscription_id) alvos = [await asaas.assinatura(cfg, t.asaas_subscription_id)];
  else if (t.asaas_customer_id) alvos = await asaas.assinaturasDoCliente(cfg, t.asaas_customer_id);
  else throw new ErroDeCobranca('Esta barbearia não tem assinatura na Asaas para cancelar.', 409);
  alvos = alvos.filter((a) => a && !a.deleted);

  const maior = (a: Date, b: Date) => (b.getTime() > a.getTime() ? b : a);
  const atrasadaDesde = comoData(t.past_due_since);
  const fim = t.status === 'past_due'
    ? (atrasadaDesde
      ? maior(agora, fimDaCarenciaDoAtraso({ atrasadaDesde, carenciaAte: comoData(t.carencia_ate), fuso: fusoDaLinha(t) }))
      : agora)
    : alvos.reduce((m, a) => maior(m, fimDoPeriodoPago(a.nextDueDate, fusoDaLinha(t), agora)), agora);

  for (const a of alvos) await asaas.removerAssinatura(cfg, a.id);
  // Só se nada mudou desde a leitura: um pagamento que chegou no meio já pôs a
  // barbearia em dia, e aí quem marca a saída é o SUBSCRIPTION_DELETED, pelo
  // período que ele pagou.
  const [gravada] = await sqlConn<{ subscription_ends_at: Date | string }[]>`
    UPDATE tenants SET status = 'active', past_due_since = NULL, subscription_ends_at = ${fim.toISOString()}
    WHERE id = ${tenantId} AND status = ${t.status} AND subscription_ends_at IS NULL
    RETURNING subscription_ends_at`;
  invalidarTenants();
  if (gravada) return comoData(gravada.subscription_ends_at)!;
  return comoData((await linhaDaBarbearia(tenantId))?.subscription_ends_at) ?? fim;
}
