/**
 * O painel do operador — os números do negócio: o Início e a tela de Cobrança
 * (decisão do dono em 12/10/2026, `docs/PENDENCIAS-ABERTAS.md` §3.9).
 *
 * ⚠️ RODA COMO DONO DO BANCO, POR CIMA DO RLS, como `lib/operadorBarbearias.ts`
 * (lista fechada de `tests/rls.test.ts`). O que lê:
 *
 *  - de `tenants`: a fase, os prazos, se cadastrou o cartão, quando se cadastrou;
 *  - de `webhook_events`: o NOME do evento, quando chegou, o desfecho, o id na
 *    Asaas, e do corpo SÓ o valor e o meio de pagamento. O resto do corpo — nome,
 *    e-mail e CPF do dono — nunca sai do banco.
 *
 * Nenhum dado de cliente de barbearia: este arquivo não lê `appointments`.
 *
 * ── O DINHEIRO, DITO COM CUIDADO ─────────────────────────────────────────────
 *
 *  · **Previsto** é conta: as barbearias em dia, sem ter cancelado, vezes
 *    `PRECO_MENSAL`. Não é dinheiro que entrou.
 *  · **Confirmado no mês** é o que a Asaas avisou: cada pagamento UMA vez — o
 *    cartão manda "confirmado" e, 32 dias depois, "recebido", com o mesmo id —, no
 *    mês em que foi confirmado, no relógio do operador. Valor bruto, antes da
 *    tarifa da Asaas.
 */
import { sqlConn } from '../db/index.js';
import { configDaAsaas, type AmbienteAsaas } from './asaas.js';
import { PRECO_MENSAL } from './produto.js';
import { ultimoDia } from './situacao.js';
import {
  eventosQuePedemOlho, listarBarbearias, pedeOlhoSql, resumoDasFases, ultimasAcoes,
  type EventoQuePedeOlho, type LinhaDoRegistro, type Tom,
} from './operadorBarbearias.js';
import { sistemaNoPainel, type AlertaDoSistema } from './operadorSistema.js';
import { grupoDoEvento, inicioDoMes, ultimasSemanas, type GrupoDeEvento } from './operadorTela.js';

type Ambiente = Record<string, string | undefined>;
const DIA = 24 * 60 * 60 * 1000;

const comoData = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

/**
 * O critério de "pede olho" — o MESMO de `eventosQuePedemOlho`: o evento que
 * falhou, o que não achou barbearia, e o que chegou para barbearia tirada do ar à
 * mão ou encerrada, que o webhook ignora de propósito.
 */
const pedeOlho = pedeOlhoSql;

// ── Os pagamentos ───────────────────────────────────────────────────────────

export interface Pagamentos {
  /** Em reais, bruto. */
  total: number;
  quantos: number;
}

/**
 * Os pagamentos confirmados de `desde` em diante — cada um uma vez só, pelo id
 * dele na Asaas, na data do PRIMEIRO aviso. Só os de barbearia achada: o que não
 * achou barbearia está em "pede olho", não na receita.
 */
export async function pagamentosDesde(desde: Date): Promise<Pagamentos> {
  const [r] = await sqlConn<{ total: number | string | null; quantos: number }[]>`
    SELECT count(*)::int AS quantos, COALESCE(sum(p.valor), 0)::float8 AS total
      FROM (
        SELECT DISTINCT ON (w.payload->'payment'->>'id')
               CASE WHEN w.payload->'payment'->>'value' ~ '^[0-9]+([.][0-9]+)?$'
                    THEN (w.payload->'payment'->>'value')::numeric END AS valor,
               w.received_at
          FROM webhook_events w
         WHERE w.tenant_id IS NOT NULL
           AND w.event IN ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
           AND w.payload->'payment'->>'id' IS NOT NULL
         ORDER BY w.payload->'payment'->>'id', w.received_at, w.id
      ) p
     WHERE p.received_at >= ${desde.toISOString()}::timestamptz AND p.valor IS NOT NULL`;
  return { total: Number(r?.total ?? 0), quantos: r?.quantos ?? 0 };
}

// ── O Início ────────────────────────────────────────────────────────────────

export interface ItemDeAtencao {
  /** A barbearia — `null` quando o item é do painel inteiro (a Asaas, o sistema). */
  tenantId: number | null;
  titulo: string;
  texto: string;
  tom: Tom;
  href: string;
  /** O telefone do dono, para chamar no WhatsApp dali mesmo. */
  telefoneDoDono: string | null;
}

export interface NumerosDoNegocio {
  resumo: ReturnType<typeof resumoDasFases>;
  /** Em dia e sem ter cancelado: quem vai pagar o mês que vem. */
  pagando: number;
  /** Em dia, mas cancelou: no ar até o fim do período pago, e depois sai. */
  cancelando: number;
  /** `pagando` × `PRECO_MENSAL`, em reais. Conta, não dinheiro que entrou. */
  receitaPrevista: number;
  pagamentosDoMes: Pagamentos;
  cobranca: { ligada: boolean; ambiente: AmbienteAsaas | null };
  cadastros: { ultimos7Dias: number; ultimos30Dias: number; porSemana: { rotulo: string; quantos: number }[] };
  /** Das barbearias cujo teste já acabou, quantas cadastraram o cartão. */
  conversao: { terminaram: number; cadastraramCartao: number };
  atencao: ItemDeAtencao[];
  pedemOlho: number;
  alertasDoSistema: AlertaDoSistema[];
  ultimasAcoes: LinhaDoRegistro[];
}

/** Quantos dias antes do fim do teste ele entra em "pede atenção". */
export const DIAS_DE_AVISO_DO_TESTE = 3;
/** Quantos dias antes de sair, quem cancelou entra em "pede atenção". */
const DIAS_DE_AVISO_DE_QUEM_CANCELOU = 15;

export async function numerosDoNegocio(agora: Date = new Date(), env: Ambiente = process.env): Promise<NumerosDoNegocio> {
  const lista = await listarBarbearias(agora);
  const resumo = resumoDasFases(lista);

  let pagando = 0;
  let cancelando = 0;
  const atencao: (ItemDeAtencao & { ordem: number })[] = [];
  for (const b of lista) {
    const s = b.situacao;
    const telefoneDoDono = b.dono?.telefone ?? null;
    const daBarbearia = { tenantId: b.id, titulo: b.nome, href: `/operador/barbearias/${b.id}`, telefoneDoDono };
    if (s.fase === 'ativa') {
      if (s.encerraEm) {
        cancelando++;
        if (s.encerraEm.getTime() - agora.getTime() <= DIAS_DE_AVISO_DE_QUEM_CANCELOU * DIA) {
          atencao.push({ ...daBarbearia, tom: 'atencao', ordem: s.encerraEm.getTime(),
            texto: `Cancelou a assinatura — fica no ar até ${ultimoDia(s.encerraEm, b.fuso)}` });
        }
      } else {
        pagando++;
      }
    } else if (s.fase === 'teste' && s.ate.getTime() - agora.getTime() <= DIAS_DE_AVISO_DO_TESTE * DIA) {
      atencao.push({ ...daBarbearia, tom: 'teste', ordem: s.ate.getTime(),
        texto: `O teste vai até ${ultimoDia(s.ate, b.fuso)}, e ainda não cadastrou o cartão` });
    } else if (s.fase === 'carencia') {
      atencao.push({ ...daBarbearia, tom: 'atencao', ordem: s.ate.getTime(),
        texto: `${s.motivo === 'teste' ? 'O teste venceu sem cartão' : 'A cobrança falhou'} — sai do ar depois de ${ultimoDia(s.ate, b.fuso)}` });
    }
  }
  atencao.sort((a, b) => a.ordem - b.ordem);

  const pedemOlho = (await eventosQuePedemOlho(100)).length;
  if (pedemOlho > 0) {
    atencao.push({
      tenantId: null, titulo: 'Asaas', tom: 'fora', href: '/operador/cobranca', telefoneDoDono: null, ordem: 0,
      texto: pedemOlho === 1 ? '1 evento da Asaas que o sistema não resolveu sozinho' : `${pedemOlho} eventos da Asaas que o sistema não resolveu sozinho`,
    });
  }

  // Os cadastros: dos últimos 7 e 30 dias, e por semana, no relógio do operador.
  const semanas = ultimasSemanas(agora, 8);
  const porSemana = semanas.map((s, i) => {
    const fim = semanas[i + 1]?.inicio.getTime() ?? Infinity;
    return {
      rotulo: s.rotulo,
      quantos: lista.filter((b) => b.criadaEm && b.criadaEm.getTime() >= s.inicio.getTime() && b.criadaEm.getTime() < fim).length,
    };
  });
  const desde = (dias: number) => lista.filter((b) => b.criadaEm && agora.getTime() - b.criadaEm.getTime() <= dias * DIA).length;

  const [conv] = await sqlConn<{ terminaram: number; cadastraram: number }[]>`
    SELECT count(*) FILTER (WHERE trial_ends_at <= ${agora.toISOString()}::timestamptz)::int AS terminaram,
           count(*) FILTER (WHERE trial_ends_at <= ${agora.toISOString()}::timestamptz
                              AND asaas_customer_id IS NOT NULL)::int AS cadastraram
      FROM tenants`;

  const cfg = configDaAsaas(env);
  const sistema = await sistemaNoPainel(env, agora);

  return {
    resumo,
    pagando,
    cancelando,
    receitaPrevista: pagando * PRECO_MENSAL,
    pagamentosDoMes: await pagamentosDesde(inicioDoMes(agora)),
    cobranca: { ligada: cfg !== null, ambiente: cfg?.ambiente ?? null },
    cadastros: { ultimos7Dias: desde(7), ultimos30Dias: desde(30), porSemana },
    conversao: { terminaram: conv?.terminaram ?? 0, cadastraramCartao: conv?.cadastraram ?? 0 },
    atencao: atencao.map(({ ordem: _ordem, ...i }) => i),
    pedemOlho,
    alertasDoSistema: sistema.alertas,
    ultimasAcoes: await ultimasAcoes(6),
  };
}

// ── A Cobrança ──────────────────────────────────────────────────────────────

export interface EventoNaCobranca {
  id: number;
  recebidoEm: Date | null;
  evento: string;
  grupo: GrupoDeEvento;
  tenantId: number | null;
  slug: string | null;
  nome: string | null;
  /** Do corpo do evento, só isto: o valor e o meio do pagamento. */
  valor: number | null;
  meio: string | null;
  desfecho: string | null;
  idNaAsaas: string;
  pedeOlho: boolean;
}

export interface CobrancaNoPainel {
  ligada: boolean;
  ambiente: AmbienteAsaas | null;
  /** O token que o webhook confere está configurado — sem ele, a rota recusa tudo. */
  tokenDoWebhook: boolean;
  assinaturasEmVigor: number;
  atrasadas: number;
  cancelando: number;
  pagamentosDoMes: Pagamentos;
  /** Cobranças vencidas e cartões recusados no mês — cada cobrança uma vez. */
  falhasDoMes: number;
  pedemOlho: EventoQuePedeOlho[];
  eventos: EventoNaCobranca[];
  /** O `antesDe` da página seguinte, ou `null` se esta é a última. */
  proximo: number | null;
}

const PREFIXO_DO_GRUPO: Record<Exclude<GrupoDeEvento, 'outros'>, string> = {
  pagamentos: 'PAYMENT_', assinaturas: 'SUBSCRIPTION_', checkout: 'CHECKOUT_',
};

export async function cobrancaNoPainel(o: {
  grupo?: GrupoDeEvento | 'todos'; tenantId?: number; antesDe?: number; limite?: number;
} = {}, agora: Date = new Date(), env: Ambiente = process.env): Promise<CobrancaNoPainel> {
  const limite = Math.min(Math.max(o.limite ?? 50, 1), 200);
  const cfg = configDaAsaas(env);

  const [n] = await sqlConn<{ em_vigor: number; atrasadas: number; cancelando: number }[]>`
    SELECT count(*) FILTER (WHERE asaas_subscription_id IS NOT NULL AND status IN ('active', 'past_due')
                              AND subscription_ends_at IS NULL)::int AS em_vigor,
           count(*) FILTER (WHERE status = 'past_due')::int AS atrasadas,
           count(*) FILTER (WHERE status = 'active' AND subscription_ends_at > ${agora.toISOString()}::timestamptz)::int AS cancelando
      FROM tenants`;

  const [falhas] = await sqlConn<{ quantas: number }[]>`
    SELECT count(DISTINCT COALESCE(w.payload->'payment'->>'id', w.gateway_event_id))::int AS quantas
      FROM webhook_events w
     WHERE w.tenant_id IS NOT NULL
       AND w.event IN ('PAYMENT_OVERDUE', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED')
       AND w.received_at >= ${inicioDoMes(agora).toISOString()}::timestamptz`;

  const grupo = o.grupo && o.grupo !== 'todos' ? o.grupo : null;
  const doGrupo = grupo === null ? sqlConn``
    : grupo === 'outros'
      ? sqlConn`AND NOT (starts_with(w.event, 'PAYMENT_') OR starts_with(w.event, 'SUBSCRIPTION_') OR starts_with(w.event, 'CHECKOUT_'))`
      : sqlConn`AND starts_with(w.event, ${PREFIXO_DO_GRUPO[grupo]})`;

  const linhas = await sqlConn<{
    id: number; received_at: unknown; event: string; outcome: string | null; gateway_event_id: string;
    tenant_id: number | null; slug: string | null; nome: string | null; valor: number | string | null;
    meio: string | null; pede_olho: boolean;
  }[]>`
    SELECT w.id, w.received_at, w.event, w.outcome, w.gateway_event_id, w.tenant_id, t.slug,
           COALESCE(NULLIF(trim(s.business_name), ''), t.business_name) AS nome,
           CASE WHEN w.payload->'payment'->>'value' ~ '^[0-9]+([.][0-9]+)?$'
                THEN (w.payload->'payment'->>'value')::float8 END AS valor,
           w.payload->'payment'->>'billingType' AS meio,
           ${pedeOlho()} AS pede_olho
      FROM webhook_events w
      LEFT JOIN tenants t ON t.id = w.tenant_id
      LEFT JOIN settings s ON s.tenant_id = w.tenant_id
     WHERE true
       ${doGrupo}
       ${o.tenantId ? sqlConn`AND w.tenant_id = ${o.tenantId}` : sqlConn``}
       ${o.antesDe ? sqlConn`AND w.id < ${o.antesDe}` : sqlConn``}
     ORDER BY w.id DESC
     LIMIT ${limite + 1}`;

  const eventos = linhas.slice(0, limite).map((l) => ({
    id: l.id, recebidoEm: comoData(l.received_at), evento: l.event, grupo: grupoDoEvento(l.event),
    tenantId: l.tenant_id, slug: l.slug, nome: l.nome,
    valor: l.valor === null ? null : Number(l.valor), meio: l.meio,
    desfecho: l.outcome, idNaAsaas: l.gateway_event_id, pedeOlho: l.pede_olho,
  }));

  return {
    ligada: cfg !== null,
    ambiente: cfg?.ambiente ?? null,
    tokenDoWebhook: Boolean(env.ASAAS_WEBHOOK_TOKEN?.trim()),
    assinaturasEmVigor: n?.em_vigor ?? 0,
    atrasadas: n?.atrasadas ?? 0,
    cancelando: n?.cancelando ?? 0,
    pagamentosDoMes: await pagamentosDesde(inicioDoMes(agora)),
    falhasDoMes: falhas?.quantas ?? 0,
    pedemOlho: await eventosQuePedemOlho(20),
    eventos,
    proximo: linhas.length > limite ? eventos[eventos.length - 1].id : null,
  };
}
