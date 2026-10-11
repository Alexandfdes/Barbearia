/**
 * O painel do operador — o que ele mostra e o que ele faz (decisão de 11/10/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §3.9). Quem entra é decidido em `lib/operador.ts`.
 *
 * ⚠️ RODA COMO DONO DO BANCO, POR CIMA DO RLS — e é o trabalho, não o descuido.
 *
 * Este é o único lugar do produto que olha TODAS as barbearias de uma vez para
 * mostrar a alguém. Por isso ele está na lista fechada de `tests/rls.test.ts`, e
 * por isso o que ele lê tem limite escrito aqui:
 *
 *  - **da barbearia:** nome, endereço do site, fase, prazos, se tem assinatura;
 *  - **do dono:** nome, telefone e e-mail — o contato de quem é cliente do PRODUTO;
 *  - **do uso:** quantos barbeiros ativos, quantos agendamentos em 30 dias, o dia
 *    do último. Contagens.
 *
 * **Nenhum dado de cliente de barbearia** — nome, telefone, nascimento de quem
 * agenda — sai daqui. `tests/operador.test.ts` confere na resposta.
 *
 * ⚠️ Data em SQL cru vai como texto ISO e volta como texto (`CLAUDE.md`): o Drizzle
 * desliga a conversão de data do driver na conexão inteira.
 */
import type { TransactionSql } from 'postgres';
import { sqlConn } from '../db/index.js';
import {
  situacaoDe, fimDoTeste, fimDoTesteEstendido, ultimoDia, diaDe,
  type Situacao, type StatusDaBarbearia,
} from './situacao.js';
import { invalidarTenants, urlDoSite } from './tenant.js';

/** Até quantos dias o operador estende o teste de uma vez. Mais que isso não é teste. */
export const DIAS_MAXIMOS_DE_EXTENSAO = 60;

/** Os status que tirar do ar sobrescreve — e que reativar devolve. */
const NO_AR_PELO_STATUS = new Set<StatusDaBarbearia>(['trial', 'active', 'past_due']);

export class ErroDoOperador extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) { super(message); }
}

const comoData = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

// ── O que a tela diz de cada fase ───────────────────────────────────────────

export type Tom = 'em-dia' | 'teste' | 'atencao' | 'fora' | 'encerrada';

export interface FaseNaTela {
  /** Para o filtro da tela: a `fase` de `lib/situacao.ts`. */
  fase: Situacao['fase'];
  rotulo: string;
  detalhe: string;
  tom: Tom;
}

export function faseNaTela(s: Situacao): FaseNaTela {
  switch (s.fase) {
    case 'ativa':
      return s.encerraEm
        ? { fase: s.fase, rotulo: 'Cancelou', detalhe: `no ar até ${ultimoDia(s.encerraEm)}`, tom: 'atencao' }
        : { fase: s.fase, rotulo: 'Em dia', detalhe: 'pagando', tom: 'em-dia' };
    case 'teste':
      return { fase: s.fase, rotulo: 'Teste', detalhe: `até ${ultimoDia(s.ate)}`, tom: 'teste' };
    case 'carencia':
      return {
        fase: s.fase, rotulo: 'Carência', tom: 'atencao',
        detalhe: `${s.motivo === 'teste' ? 'o teste venceu' : 'a cobrança falhou'} · no ar até ${ultimoDia(s.ate)}`,
      };
    case 'suspensa': {
      const porque = { teste: 'o teste venceu', cobranca: 'a cobrança não foi paga', cancelada: 'cancelou a assinatura', manual: 'tirada do ar à mão' }[s.motivo];
      return { fase: s.fase, rotulo: 'Fora do ar', detalhe: s.desde ? `${porque} · desde ${diaDe(s.desde)}` : porque, tom: 'fora' };
    }
    case 'cancelada':
      return { fase: s.fase, rotulo: 'Encerrada', detalhe: 'saiu do produto', tom: 'encerrada' };
  }
}

/** O status cru, dito em português — para as mensagens de recusa. */
export function statusPorExtenso(status: string): string {
  return ({
    trial: 'no teste', active: 'em dia', past_due: 'com a cobrança atrasada',
    suspended: 'fora do ar, tirada à mão', cancelled: 'encerrada',
  } as Record<string, string>)[status] ?? status;
}

// ── A lista ─────────────────────────────────────────────────────────────────

export interface BarbeariaNoPainel {
  id: number;
  slug: string;
  nome: string;
  status: StatusDaBarbearia;
  situacao: Situacao;
  tela: FaseNaTela;
  /** O endereço do site; vazio sem domínio próprio nem `DOMINIO_BASE`. */
  site: string;
  criadaEm: Date | null;
  dono: { nome: string; telefone: string | null; email: string | null } | null;
  barbeirosAtivos: number;
  agendamentos30Dias: number;
  /** `created_at` do agendamento mais recente: texto UTC "aaaa-mm-dd hh:mm:ss". */
  ultimoAgendamento: string | null;
  temAssinatura: boolean;
  /**
   * Fora do ar à mão: como ela estava antes — do registro de `acoes_do_operador`.
   * `null` quando foi tirada do ar fora deste painel, e aí o reativar pergunta.
   */
  antesDaSuspensao: StatusDaBarbearia | null;
}

interface LinhaDaLista {
  id: number; slug: string; business_name: string; nome_no_site: string | null;
  status: StatusDaBarbearia; domain: string | null;
  trial_ends_at: unknown; past_due_since: unknown; subscription_ends_at: unknown; created_at: unknown;
  tem_assinatura: boolean;
  dono_nome: string | null; dono_telefone: string | null; dono_email: string | null;
  barbeiros_ativos: number; agendamentos_30_dias: number; ultimo_agendamento: string | null;
  antes_da_suspensao: string | null;
}

export async function listarBarbearias(agora: Date = new Date()): Promise<BarbeariaNoPainel[]> {
  const linhas = await sqlConn<LinhaDaLista[]>`
    SELECT t.id, t.slug, t.business_name, s.business_name AS nome_no_site, t.status, t.domain,
           t.trial_ends_at, t.past_due_since, t.subscription_ends_at, t.created_at,
           (t.asaas_subscription_id IS NOT NULL) AS tem_assinatura,
           dono.name AS dono_nome, dono.phone AS dono_telefone, dono.email AS dono_email,
           (SELECT count(*)::int FROM barbers b WHERE b.tenant_id = t.id AND b.active) AS barbeiros_ativos,
           (SELECT count(*)::int FROM appointments a
             WHERE a.tenant_id = t.id
               AND a.created_at >= to_char((now() - interval '30 days') AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
           ) AS agendamentos_30_dias,
           (SELECT max(a.created_at) FROM appointments a WHERE a.tenant_id = t.id) AS ultimo_agendamento,
           -- A última palavra sobre suspender: se foi "suspendeu", o status de antes
           -- está nela; se foi "reativou", a suspensão de agora não passou por aqui.
           (SELECT CASE WHEN o.acao = 'suspendeu' THEN o.detalhe->>'statusAnterior' END
              FROM acoes_do_operador o
             WHERE o.tenant_id = t.id AND o.acao IN ('suspendeu', 'reativou')
             ORDER BY o.criada_em DESC, o.id DESC LIMIT 1) AS antes_da_suspensao
      FROM tenants t
      LEFT JOIN settings s ON s.tenant_id = t.id
      LEFT JOIN LATERAL (
        SELECT b.name, b.phone, b.email FROM barbers b
         WHERE b.tenant_id = t.id AND b.role = 'admin'
         ORDER BY b.active DESC, b.id
         LIMIT 1
      ) dono ON true
     ORDER BY t.created_at DESC, t.id DESC`;

  return linhas.map((l) => {
    const tenant = {
      id: l.id, slug: l.slug, status: l.status, domain: l.domain,
      testeAte: comoData(l.trial_ends_at), atrasadaDesde: comoData(l.past_due_since), encerraEm: comoData(l.subscription_ends_at),
    };
    const situacao = situacaoDe(tenant, agora);
    const antes = l.antes_da_suspensao as StatusDaBarbearia | null;
    return {
      id: l.id,
      slug: l.slug,
      nome: l.nome_no_site?.trim() || l.business_name,
      status: l.status,
      situacao,
      tela: faseNaTela(situacao),
      site: urlDoSite(tenant),
      criadaEm: comoData(l.created_at),
      dono: l.dono_nome ? { nome: l.dono_nome, telefone: l.dono_telefone, email: l.dono_email } : null,
      barbeirosAtivos: l.barbeiros_ativos,
      agendamentos30Dias: l.agendamentos_30_dias,
      ultimoAgendamento: l.ultimo_agendamento,
      temAssinatura: l.tem_assinatura,
      antesDaSuspensao: l.status === 'suspended' && antes && NO_AR_PELO_STATUS.has(antes) ? antes : null,
    };
  });
}

/** Quantas em cada fase — e quantas no ar, que é a pergunta de todo dia. */
export function resumoDasFases(lista: BarbeariaNoPainel[]): Record<Situacao['fase'] | 'total' | 'noAr', number> {
  const r = { total: lista.length, noAr: 0, ativa: 0, teste: 0, carencia: 0, suspensa: 0, cancelada: 0 };
  for (const b of lista) {
    r[b.situacao.fase]++;
    if (b.situacao.fase === 'ativa' || b.situacao.fase === 'teste' || b.situacao.fase === 'carencia') r.noAr++;
  }
  return r;
}

// ── O que pede olho ─────────────────────────────────────────────────────────

export interface EventoQuePedeOlho {
  recebidoEm: Date | null;
  evento: string;
  desfecho: string;
  idNaAsaas: string;
  slug: string | null;
}

/**
 * Os eventos da Asaas que o webhook não conseguiu resolver sozinho
 * (`lib/cobranca.ts`): os que falharam, os que não acharam barbearia, e os que
 * chegaram para barbearia tirada do ar à mão ou encerrada — esses o webhook
 * ignora de propósito, e um pagamento ignorado é exatamente o que o operador
 * precisa ver: tirar do ar NÃO cancela a cobrança na Asaas.
 *
 * Sem o corpo do evento: ele traz nome, e-mail e CPF do dono, e para achar o
 * evento na Asaas basta o id.
 */
export async function eventosQuePedemOlho(limite = 20): Promise<EventoQuePedeOlho[]> {
  const linhas = await sqlConn<{ received_at: unknown; event: string; outcome: string | null; gateway_event_id: string; slug: string | null }[]>`
    SELECT w.received_at, w.event, w.outcome, w.gateway_event_id, t.slug
      FROM webhook_events w
      LEFT JOIN tenants t ON t.id = w.tenant_id
     WHERE w.outcome IS NULL
        OR w.outcome LIKE 'erro%'
        OR w.outcome LIKE 'sem barbearia%'
        OR w.outcome LIKE 'nada muda: a barbearia está suspended%'
        OR w.outcome LIKE 'nada muda: a barbearia está cancelled%'
     ORDER BY w.received_at DESC, w.id DESC
     LIMIT ${limite}`;
  return linhas.map((l) => ({
    recebidoEm: comoData(l.received_at), evento: l.event, desfecho: l.outcome ?? 'sem desfecho gravado',
    idNaAsaas: l.gateway_event_id, slug: l.slug,
  }));
}

// ── O registro ──────────────────────────────────────────────────────────────

export type Acao = 'entrou' | 'estendeu-teste' | 'suspendeu' | 'reativou';

export interface AcaoRegistrada {
  acao: Acao;
  detalhe: Record<string, unknown>;
  ip: string | null;
  quando: Date | null;
  slug: string | null;
}

export async function ultimasAcoes(limite = 30): Promise<AcaoRegistrada[]> {
  const linhas = await sqlConn<{ acao: Acao; detalhe: unknown; ip: string | null; criada_em: unknown; slug: string | null }[]>`
    SELECT o.acao, o.detalhe, o.ip, o.criada_em, t.slug
      FROM acoes_do_operador o
      LEFT JOIN tenants t ON t.id = o.tenant_id
     ORDER BY o.criada_em DESC, o.id DESC
     LIMIT ${limite}`;
  return linhas.map((l) => ({
    acao: l.acao,
    detalhe: (typeof l.detalhe === 'string' ? JSON.parse(l.detalhe) : l.detalhe ?? {}) as Record<string, unknown>,
    ip: l.ip, quando: comoData(l.criada_em), slug: l.slug,
  }));
}

/** Uma linha do registro, em português — para a lista "Últimas ações" da tela. */
export function descreverAcao(a: AcaoRegistrada): string {
  const d = a.detalhe;
  const quem = a.slug ?? '—';
  switch (a.acao) {
    case 'entrou':
      return 'Entrou no painel';
    case 'estendeu-teste': {
      const ate = typeof d.depois === 'string' ? ` (até ${ultimoDia(new Date(d.depois))})` : '';
      return `Estendeu o teste de ${quem} em ${d.dias === 1 ? '1 dia' : `${String(d.dias ?? '?')} dias`}${ate}`;
    }
    case 'suspendeu': {
      const antes = typeof d.statusAnterior === 'string' ? ` — estava ${statusPorExtenso(d.statusAnterior)}` : '';
      const motivo = typeof d.motivo === 'string' && d.motivo ? `. Motivo: ${d.motivo}` : '';
      return `Tirou ${quem} do ar${antes}${motivo}`;
    }
    case 'reativou':
      return `Reativou ${quem}${typeof d.status === 'string' ? ` — ${statusPorExtenso(d.status)}` : ''}`;
    default:
      return String(a.acao);
  }
}

/** A entrada no painel, gravada — sem barbearia. As tentativas erradas vão só para o log. */
export async function registrarEntrada(ip: string): Promise<void> {
  await sqlConn`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip) VALUES (NULL, 'entrou', '{}'::jsonb, ${ip})`;
}

// ── As ações ────────────────────────────────────────────────────────────────

export interface ResultadoDaAcao {
  slug: string;
  situacao: Situacao;
  tela: FaseNaTela;
}

interface LinhaDaBarbearia {
  id: number; slug: string; status: StatusDaBarbearia;
  trial_ends_at: unknown; past_due_since: unknown; subscription_ends_at: unknown;
}

// ⚠️ Não `Parameters<typeof sqlConn.begin>`: o `begin` tem duas assinaturas, e o
// tipo vira `never` (o mesmo aviso de `lib/cobranca.ts`).
type Tx = TransactionSql<{}>;

async function travar(tx: Tx, tenantId: number): Promise<LinhaDaBarbearia> {
  const [t] = await tx<LinhaDaBarbearia[]>`
    SELECT id, slug, status, trial_ends_at, past_due_since, subscription_ends_at
      FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
  if (!t) throw new ErroDoOperador('Barbearia não encontrada.', 404);
  return t;
}

function resultado(t: LinhaDaBarbearia, agora: Date): ResultadoDaAcao {
  const situacao = situacaoDe({
    status: t.status, testeAte: comoData(t.trial_ends_at),
    atrasadaDesde: comoData(t.past_due_since), encerraEm: comoData(t.subscription_ends_at),
  }, agora);
  return { slug: t.slug, situacao, tela: faseNaTela(situacao) };
}

/**
 * Dá mais `dias` de teste: depois do último dia do teste, ou de hoje, se ele já
 * venceu — e aí a barbearia que tinha saído do ar pelo teste volta na hora.
 *
 * Só para quem está NO TESTE (status `trial`, em qualquer fase: no prazo, na
 * carência ou fora do ar por ele). Quem paga não tem teste para estender; quem foi
 * tirada do ar à mão, reativa primeiro.
 */
export async function estenderTeste(tenantId: number, dias: number, ip: string, agora: Date = new Date()): Promise<ResultadoDaAcao> {
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DE_EXTENSAO) {
    throw new ErroDoOperador(`Estenda de 1 a ${DIAS_MAXIMOS_DE_EXTENSAO} dias.`, 400);
  }
  const r = await sqlConn.begin(async (tx) => {
    const t = await travar(tx, tenantId);
    if (t.status !== 'trial') {
      throw new ErroDoOperador(`Só dá para estender o teste de quem está no teste — esta está ${statusPorExtenso(t.status)}.`, 409);
    }
    const antes = comoData(t.trial_ends_at);
    const depois = fimDoTesteEstendido(antes, dias, agora);
    await tx`UPDATE tenants SET trial_ends_at = ${depois.toISOString()}::timestamptz WHERE id = ${tenantId}`;
    const detalhe = { dias, antes: antes?.toISOString() ?? null, depois: depois.toISOString() };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'estendeu-teste', ${JSON.stringify(detalhe)}::jsonb, ${ip})`;
    return resultado({ ...t, trial_ends_at: depois }, agora);
  });
  // O cache de barbearias (`lib/tenant.ts`) segura o status por até 30 s: sem
  // isto, o site que voltou continuaria fora do ar, e o operador acharia que a
  // ação não pegou.
  invalidarTenants();
  return r as ResultadoDaAcao;
}

/**
 * Tira a barbearia do ar: o site mostra "temporariamente indisponível" e o painel
 * abre só a tela de assinatura (`src/middleware.ts`) — e o webhook da Asaas não a
 * reativa sozinho (`lib/cobranca.ts`, `MEXE_SOZINHO`).
 *
 * Exige digitar o endereço (`slug`) dela: o botão errado na linha errada é o
 * acidente mais provável numa lista de barbearias parecidas.
 *
 * ⚠️ NÃO CANCELA A ASSINATURA NA ASAAS. Quem paga por cartão continua sendo
 * cobrado até alguém cancelar lá — a tela diz isso antes do botão, e os pagamentos
 * que chegarem aparecem em "eventos que pedem olho".
 */
export async function suspender(
  tenantId: number, confirmacao: string, motivo: string | undefined, ip: string, agora: Date = new Date(),
): Promise<ResultadoDaAcao> {
  const r = await sqlConn.begin(async (tx) => {
    const t = await travar(tx, tenantId);
    if (confirmacao.trim().toLowerCase() !== t.slug) {
      throw new ErroDoOperador(`Para tirar do ar, digite o endereço dela exatamente: ${t.slug}`, 400);
    }
    if (!NO_AR_PELO_STATUS.has(t.status)) {
      throw new ErroDoOperador(`Esta barbearia já está ${statusPorExtenso(t.status)}.`, 409);
    }
    await tx`UPDATE tenants SET status = 'suspended' WHERE id = ${tenantId}`;
    const detalhe = { statusAnterior: t.status, ...(motivo?.trim() ? { motivo: motivo.trim() } : {}) };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'suspendeu', ${JSON.stringify(detalhe)}::jsonb, ${ip})`;
    return resultado({ ...t, status: 'suspended' }, agora);
  });
  invalidarTenants();
  return r as ResultadoDaAcao;
}

/**
 * Devolve ao ar a barbearia tirada do ar À MÃO, com o status que ela tinha antes.
 *
 * ⚠️ VOLTA COMO ESTAVA — inclusive com os prazos de antes. O relógio não parou
 * durante a suspensão: quem estava no teste e teve o teste vencido nesse meio-tempo
 * volta fora do ar pelo teste, e a resposta diz isso. Aí é estender o teste.
 *
 * Sem registro de como ela estava (tirada do ar fora deste painel), `comoEra`
 * decide: `trial` — com 7 dias a partir de hoje, se não houver prazo — ou `active`.
 * Com registro, `comoEra` diferente do registro é recusado: seria esconder do
 * operador que a barbearia estava noutra situação.
 */
export async function reativar(
  tenantId: number, comoEra: 'trial' | 'active' | undefined, ip: string, agora: Date = new Date(),
): Promise<ResultadoDaAcao> {
  const r = await sqlConn.begin(async (tx) => {
    const t = await travar(tx, tenantId);
    if (t.status !== 'suspended') {
      throw new ErroDoOperador(
        `Reativar é para quem foi tirada do ar à mão — esta está ${statusPorExtenso(t.status)}.`
        + (t.status === 'trial' ? ' Se o teste venceu, estenda o teste.' : ''), 409);
    }
    const [ultima] = await tx<{ acao: Acao; antes: string | null }[]>`
      SELECT acao, detalhe->>'statusAnterior' AS antes
        FROM acoes_do_operador
       WHERE tenant_id = ${tenantId} AND acao IN ('suspendeu', 'reativou')
       ORDER BY criada_em DESC, id DESC LIMIT 1`;
    const registrado = ultima?.acao === 'suspendeu' && ultima.antes && NO_AR_PELO_STATUS.has(ultima.antes as StatusDaBarbearia)
      ? ultima.antes as StatusDaBarbearia
      : null;

    let novo: StatusDaBarbearia;
    if (registrado) {
      if (comoEra && comoEra !== registrado) {
        throw new ErroDoOperador(`Ela estava ${statusPorExtenso(registrado)} quando saiu do ar, e volta assim.`, 400);
      }
      novo = registrado;
    } else {
      if (!comoEra) {
        throw new ErroDoOperador(
          'Não há registro de como ela estava antes de sair do ar — foi tirada fora deste painel. Escolha como ela volta.', 409);
      }
      novo = comoEra;
    }

    // As travas da 0007: teste tem fim, atraso tem começo.
    const testeAte = novo === 'trial' ? comoData(t.trial_ends_at) ?? fimDoTeste(agora) : comoData(t.trial_ends_at);
    const atrasadaDesde = novo === 'past_due' ? comoData(t.past_due_since) ?? agora : comoData(t.past_due_since);
    await tx`
      UPDATE tenants SET status = ${novo},
             trial_ends_at = ${testeAte?.toISOString() ?? null}::timestamptz,
             past_due_since = ${atrasadaDesde?.toISOString() ?? null}::timestamptz
       WHERE id = ${tenantId}`;
    const detalhe = { status: novo, registrado: Boolean(registrado) };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'reativou', ${JSON.stringify(detalhe)}::jsonb, ${ip})`;
    return resultado({ ...t, status: novo, trial_ends_at: testeAte, past_due_since: atrasadaDesde }, agora);
  });
  invalidarTenants();
  return r as ResultadoDaAcao;
}
