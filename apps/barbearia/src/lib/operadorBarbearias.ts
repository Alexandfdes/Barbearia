/**
 * O painel do operador — o que ele mostra e o que ele faz (decisão de 11/10/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §3.9). Quem entra é decidido em `lib/operador.ts`.
 *
 * ⚠️ RODA COMO DONO DO BANCO, POR CIMA DO RLS — e é o trabalho, não o descuido.
 *
 * Este é o lugar do produto que olha TODAS as barbearias de uma vez para mostrar
 * a alguém (com `lib/operadorNumeros.ts` e `lib/operadorSistema.ts`, desde as telas
 * de 12/10/2026). Por isso ele está na lista fechada de `tests/rls.test.ts`, e por
 * isso o que ele lê tem limite escrito aqui:
 *
 *  - **da barbearia:** nome, endereço do site, cidade, fase, prazos, se tem
 *    assinatura (e os ids dela na Asaas, para achar lá), o que falta no site;
 *  - **do dono:** nome, telefone e e-mail — o contato de quem é cliente do PRODUTO;
 *  - **do uso:** quantos barbeiros, serviços, fotos e agendamentos, o dia do
 *    primeiro e do último. Contagens.
 *
 * **Nenhum dado de cliente de barbearia** — nome, telefone, nascimento de quem
 * agenda — sai daqui: nenhuma consulta deste arquivo lê uma coluna `customer_`.
 * `tests/operador.test.ts` e `tests/operador-telas.test.ts` conferem na resposta.
 *
 * ⚠️ Data em SQL cru vai como texto ISO e volta como texto (`CLAUDE.md`): o Drizzle
 * desliga a conversão de data do driver na conexão inteira. E o `detalhe` vai como
 * `::text::jsonb`, nunca só `::jsonb`: antes de o Drizzle tocar o pool, o driver
 * gravava uma STRING JSON, e o `detalhe->>'statusAnterior'` do reativar não achava
 * nada (`lib/cobranca.ts`, `tests/jsonb-parametro.test.ts`).
 */
import type { TransactionSql } from 'postgres';
import { sqlConn } from '../db/index.js';
import {
  situacaoDe, fimDoTeste, fimDoTesteEstendido, fimDoPrazoEstendido, fimDaCarenciaDoAtraso, ultimoDia, diaDe,
  type Situacao, type StatusDaBarbearia,
} from './situacao.js';
import { invalidarTenants, urlDoSite } from './tenant.js';
import { fusoDe } from './timezone.js';
import { calcularCompletude, type Completude } from './completude.js';
import { parseBusinessHours } from './settings.js';
import { dinheiro, rotuloDoEvento } from './operadorTela.js';

/**
 * Até quantos dias o operador estende o teste — ou a carência — de uma vez. Mais
 * que isso não é teste, nem prazo para pagar.
 */
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

/** As datas no calendário DA BARBEARIA (`fuso`): o prazo é dela, não do operador. */
export function faseNaTela(s: Situacao, fuso: string): FaseNaTela {
  switch (s.fase) {
    case 'ativa':
      return s.encerraEm
        ? { fase: s.fase, rotulo: 'Cancelou', detalhe: `no ar até ${ultimoDia(s.encerraEm, fuso)}`, tom: 'atencao' }
        : { fase: s.fase, rotulo: 'Em dia', detalhe: 'pagando', tom: 'em-dia' };
    case 'teste':
      return { fase: s.fase, rotulo: 'Teste', detalhe: `até ${ultimoDia(s.ate, fuso)}`, tom: 'teste' };
    case 'carencia':
      return {
        fase: s.fase, rotulo: 'Carência', tom: 'atencao',
        detalhe: `${s.motivo === 'teste' ? 'o teste venceu' : 'a cobrança falhou'} · no ar até ${ultimoDia(s.ate, fuso)}`
          + (s.estendida ? ' (estendida)' : ''),
      };
    case 'suspensa': {
      const porque = { teste: 'o teste venceu', cobranca: 'a cobrança não foi paga', cancelada: 'cancelou a assinatura', manual: 'tirada do ar à mão' }[s.motivo];
      return { fase: s.fase, rotulo: 'Fora do ar', detalhe: s.desde ? `${porque} · desde ${diaDe(s.desde, fuso)}` : porque, tom: 'fora' };
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
  /** O fuso da barbearia (`tenants.timezone`). */
  fuso: string;
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
  trial_ends_at: unknown; past_due_since: unknown; carencia_ate: unknown; subscription_ends_at: unknown; created_at: unknown;
  timezone: string;
  tem_assinatura: boolean;
  dono_nome: string | null; dono_telefone: string | null; dono_email: string | null;
  barbeiros_ativos: number; agendamentos_30_dias: number; ultimo_agendamento: string | null;
  antes_da_suspensao: string | null;
}

/** Todas as barbearias — ou só uma, com `apenas` (a ficha dela). */
export async function listarBarbearias(agora: Date = new Date(), apenas?: number): Promise<BarbeariaNoPainel[]> {
  const so = apenas === undefined ? sqlConn`` : sqlConn`WHERE t.id = ${apenas}`;
  const linhas = await sqlConn<LinhaDaLista[]>`
    SELECT t.id, t.slug, t.business_name, s.business_name AS nome_no_site, t.status, t.domain,
           t.trial_ends_at, t.past_due_since, t.carencia_ate, t.subscription_ends_at, t.created_at, t.timezone,
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
      ${so}
     ORDER BY t.created_at DESC, t.id DESC`;

  return linhas.map((l) => {
    const tenant = {
      id: l.id, slug: l.slug, status: l.status, domain: l.domain,
      testeAte: comoData(l.trial_ends_at), atrasadaDesde: comoData(l.past_due_since),
      carenciaAte: comoData(l.carencia_ate), encerraEm: comoData(l.subscription_ends_at),
      fuso: fusoDe({ fuso: l.timezone }),
    };
    const situacao = situacaoDe(tenant, agora);
    const antes = l.antes_da_suspensao as StatusDaBarbearia | null;
    return {
      id: l.id,
      slug: l.slug,
      nome: l.nome_no_site?.trim() || l.business_name,
      status: l.status,
      fuso: tenant.fuso,
      situacao,
      tela: faseNaTela(situacao, tenant.fuso),
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

export type Acao = 'entrou' | 'estendeu-teste' | 'estendeu-carencia' | 'suspendeu' | 'reativou' | 'anotou';

export interface AcaoRegistrada {
  acao: Acao;
  detalhe: Record<string, unknown>;
  ip: string | null;
  quando: Date | null;
  slug: string | null;
  /** O fuso da barbearia da ação: o "até 18/10" do teste estendido é o dia dela. */
  fuso: string | null;
}

/** Uma linha do registro com o que a tela precisa para levar à ficha. */
export interface LinhaDoRegistro extends AcaoRegistrada {
  id: number;
  tenantId: number | null;
  /** O nome que o dono mantém no site — ou o do cadastro. */
  nome: string | null;
}

/** Os filtros da tela de Registro. */
export type FiltroDoRegistro = 'tudo' | 'entradas' | 'acoes' | 'anotacoes';

const ACOES_DO_FILTRO: Record<Exclude<FiltroDoRegistro, 'tudo'>, Acao[]> = {
  entradas: ['entrou'],
  acoes: ['estendeu-teste', 'estendeu-carencia', 'suspendeu', 'reativou'],
  anotacoes: ['anotou'],
};

interface LinhaCruaDoRegistro {
  id: number; tenant_id: number | null; acao: Acao; detalhe: unknown; ip: string | null; criada_em: unknown;
  slug: string | null; fuso: string | null; nome: string | null;
}

const doRegistro = (l: LinhaCruaDoRegistro): LinhaDoRegistro => ({
  id: l.id, tenantId: l.tenant_id, nome: l.nome,
  acao: l.acao,
  detalhe: (typeof l.detalhe === 'string' ? JSON.parse(l.detalhe) : l.detalhe ?? {}) as Record<string, unknown>,
  ip: l.ip, quando: comoData(l.criada_em), slug: l.slug, fuso: l.fuso,
});

export async function ultimasAcoes(limite = 30): Promise<LinhaDoRegistro[]> {
  return (await registro({ limite })).itens;
}

/**
 * O registro, mais novo primeiro: tudo, ou só as entradas, as ações ou as
 * anotações; de todas as barbearias ou de uma (`tenantId`). Pagina pelo `id` —
 * `antesDe` é o `proximo` da página anterior.
 */
export async function registro(o: {
  filtro?: FiltroDoRegistro; tenantId?: number; antesDe?: number; limite?: number;
} = {}): Promise<{ itens: LinhaDoRegistro[]; proximo: number | null }> {
  const limite = Math.min(Math.max(o.limite ?? 50, 1), 200);
  const acoes = o.filtro && o.filtro !== 'tudo' ? ACOES_DO_FILTRO[o.filtro] : null;
  const linhas = await sqlConn<LinhaCruaDoRegistro[]>`
    SELECT o.id, o.tenant_id, o.acao, o.detalhe, o.ip, o.criada_em, t.slug, t.timezone AS fuso,
           COALESCE(NULLIF(trim(s.business_name), ''), t.business_name) AS nome
      FROM acoes_do_operador o
      LEFT JOIN tenants t ON t.id = o.tenant_id
      LEFT JOIN settings s ON s.tenant_id = o.tenant_id
     WHERE true
       ${acoes ? sqlConn`AND o.acao IN ${sqlConn(acoes)}` : sqlConn``}
       ${o.tenantId ? sqlConn`AND o.tenant_id = ${o.tenantId}` : sqlConn``}
       ${o.antesDe ? sqlConn`AND o.id < ${o.antesDe}` : sqlConn``}
     ORDER BY o.id DESC
     LIMIT ${limite + 1}`;
  const itens = linhas.slice(0, limite).map(doRegistro);
  return { itens, proximo: linhas.length > limite ? itens[itens.length - 1].id : null };
}

/** O começo de um texto longo, para caber numa linha. */
function resumo(texto: string, maximo = 120): string {
  const uma = texto.replace(/\s+/g, ' ').trim();
  return uma.length > maximo ? `${uma.slice(0, maximo - 1).trimEnd()}…` : uma;
}

/** Uma linha do registro, em português — para a lista "Últimas ações" da tela. */
export function descreverAcao(a: AcaoRegistrada): string {
  const d = a.detalhe;
  const quem = a.slug ?? '—';
  switch (a.acao) {
    case 'anotou':
      return `Anotou em ${quem}: ${resumo(typeof d.texto === 'string' ? d.texto : '')}`;
    case 'entrou':
      return 'Entrou no painel';
    case 'estendeu-teste':
    case 'estendeu-carencia': {
      const ate = typeof d.depois === 'string' ? ` (até ${ultimoDia(new Date(d.depois), fusoDe(a))})` : '';
      const prazo = a.acao === 'estendeu-teste' ? 'o teste' : 'a carência';
      return `Estendeu ${prazo} de ${quem} em ${d.dias === 1 ? '1 dia' : `${String(d.dias ?? '?')} dias`}${ate}`;
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

/** O tamanho máximo de uma anotação. Mais que isso é documento, não anotação. */
export const ANOTACAO_MAXIMA = 1000;

/**
 * Anota na ficha da barbearia o que se combinou com o dono — "liguei dia 12, paga
 * sexta" (decisão do dono em 12/10/2026). Vai para o MESMO registro das ações
 * (`acao = 'anotou'`, migration 0014): só se acrescenta, nunca se edita nem se
 * apaga. A anotação errada se corrige com outra.
 */
export async function anotar(tenantId: number, texto: string, ip: string): Promise<{ slug: string }> {
  const limpo = texto.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!limpo) throw new ErroDoOperador('Escreva a anotação.', 400);
  if (limpo.length > ANOTACAO_MAXIMA) throw new ErroDoOperador(`A anotação passa de ${ANOTACAO_MAXIMA} caracteres.`, 400);
  const [t] = await sqlConn<{ slug: string }[]>`SELECT slug FROM tenants WHERE id = ${tenantId}`;
  if (!t) throw new ErroDoOperador('Barbearia não encontrada.', 404);
  await sqlConn`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
                VALUES (${tenantId}, 'anotou', ${JSON.stringify({ texto: limpo })}::text::jsonb, ${ip})`;
  return { slug: t.slug };
}

// ── As ações ────────────────────────────────────────────────────────────────

export interface ResultadoDaAcao {
  slug: string;
  situacao: Situacao;
  tela: FaseNaTela;
}

interface LinhaDaBarbearia {
  id: number; slug: string; status: StatusDaBarbearia;
  trial_ends_at: unknown; past_due_since: unknown; carencia_ate: unknown; subscription_ends_at: unknown;
  timezone: string;
}

// ⚠️ Não `Parameters<typeof sqlConn.begin>`: o `begin` tem duas assinaturas, e o
// tipo vira `never` (o mesmo aviso de `lib/cobranca.ts`).
type Tx = TransactionSql<{}>;

async function travar(tx: Tx, tenantId: number): Promise<LinhaDaBarbearia> {
  const [t] = await tx<LinhaDaBarbearia[]>`
    SELECT id, slug, status, trial_ends_at, past_due_since, carencia_ate, subscription_ends_at, timezone
      FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
  if (!t) throw new ErroDoOperador('Barbearia não encontrada.', 404);
  return t;
}

function resultado(t: LinhaDaBarbearia, agora: Date): ResultadoDaAcao {
  const fuso = fusoDe({ fuso: t.timezone });
  const situacao = situacaoDe({
    status: t.status, testeAte: comoData(t.trial_ends_at),
    atrasadaDesde: comoData(t.past_due_since), carenciaAte: comoData(t.carencia_ate),
    encerraEm: comoData(t.subscription_ends_at), fuso,
  }, agora);
  return { slug: t.slug, situacao, tela: faseNaTela(situacao, fuso) };
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
    const depois = fimDoTesteEstendido(antes, dias, fusoDe({ fuso: t.timezone }), agora);
    await tx`UPDATE tenants SET trial_ends_at = ${depois.toISOString()}::timestamptz WHERE id = ${tenantId}`;
    const detalhe = { dias, antes: antes?.toISOString() ?? null, depois: depois.toISOString() };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'estendeu-teste', ${JSON.stringify(detalhe)}::text::jsonb, ${ip})`;
    return resultado({ ...t, trial_ends_at: depois }, agora);
  });
  // O cache de barbearias (`lib/tenant.ts`) segura o status por até 30 s: sem
  // isto, o site que voltou continuaria fora do ar, e o operador acharia que a
  // ação não pegou.
  invalidarTenants();
  return r as ResultadoDaAcao;
}

/**
 * Dá mais `dias` de carência a quem está com a COBRANÇA ATRASADA (status
 * `past_due`): depois do último dia da carência de agora, ou de hoje, se ela já
 * venceu — e aí o site que tinha saído do ar pela cobrança volta na hora.
 *
 * Grava o FIM novo em `carencia_ate` (migration 0016); `past_due_since` continua
 * dizendo quando a cobrança falhou. A extensão vale para este atraso: pagou, ou
 * atrasou de novo, o banco a apaga.
 *
 * ⚠️ Não mexe na Asaas: ela continua tentando o cartão nos vencimentos dela, e o
 * pagamento que passar põe a barbearia em dia — com ou sem a carência estendida.
 */
export async function estenderCarencia(tenantId: number, dias: number, ip: string, agora: Date = new Date()): Promise<ResultadoDaAcao> {
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DE_EXTENSAO) {
    throw new ErroDoOperador(`Estenda de 1 a ${DIAS_MAXIMOS_DE_EXTENSAO} dias.`, 400);
  }
  const r = await sqlConn.begin(async (tx) => {
    const t = await travar(tx, tenantId);
    const atrasadaDesde = comoData(t.past_due_since);
    if (t.status !== 'past_due' || !atrasadaDesde) {
      throw new ErroDoOperador(
        `Só dá para estender a carência de quem está com a cobrança atrasada — esta está ${statusPorExtenso(t.status)}.`
        + (t.status === 'trial' ? ' No teste, estenda o teste.' : ''), 409);
    }
    const fuso = fusoDe({ fuso: t.timezone });
    const antes = fimDaCarenciaDoAtraso({ atrasadaDesde, carenciaAte: comoData(t.carencia_ate), fuso });
    const depois = fimDoPrazoEstendido(antes, dias, fuso, agora);
    await tx`UPDATE tenants SET carencia_ate = ${depois.toISOString()}::timestamptz WHERE id = ${tenantId}`;
    const detalhe = { dias, antes: antes.toISOString(), depois: depois.toISOString() };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'estendeu-carencia', ${JSON.stringify(detalhe)}::text::jsonb, ${ip})`;
    return resultado({ ...t, carencia_ate: depois }, agora);
  });
  // O cache de barbearias segura o status por até 30 s — o mesmo motivo de `estenderTeste`.
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
             VALUES (${tenantId}, 'suspendeu', ${JSON.stringify(detalhe)}::text::jsonb, ${ip})`;
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
    const testeAte = novo === 'trial' ? comoData(t.trial_ends_at) ?? fimDoTeste(agora, fusoDe({ fuso: t.timezone })) : comoData(t.trial_ends_at);
    const atrasadaDesde = novo === 'past_due' ? comoData(t.past_due_since) ?? agora : comoData(t.past_due_since);
    await tx`
      UPDATE tenants SET status = ${novo},
             trial_ends_at = ${testeAte?.toISOString() ?? null}::timestamptz,
             past_due_since = ${atrasadaDesde?.toISOString() ?? null}::timestamptz
       WHERE id = ${tenantId}`;
    const detalhe = { status: novo, registrado: Boolean(registrado) };
    await tx`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe, ip)
             VALUES (${tenantId}, 'reativou', ${JSON.stringify(detalhe)}::text::jsonb, ${ip})`;
    return resultado({ ...t, status: novo, trial_ends_at: testeAte, past_due_since: atrasadaDesde }, agora);
  });
  invalidarTenants();
  return r as ResultadoDaAcao;
}

// ── A ficha ─────────────────────────────────────────────────────────────────

export interface EventoDaFicha {
  quando: Date;
  /** De onde veio — decide a cor do ponto na linha do tempo. */
  origem: 'cadastro' | 'prazo' | 'asaas' | 'operador' | 'aviso' | 'agendamento';
  texto: string;
  /** A segunda linha, quando há: o desfecho do evento da Asaas, o valor. */
  detalhe?: string;
}

export interface Anotacao { id: number; quando: Date | null; texto: string; ip: string | null }

export interface FichaDaBarbearia extends BarbeariaNoPainel {
  cidade: string | null;
  dominioProprio: string | null;
  /** Os ids na Asaas — para achar a barbearia no painel de lá. */
  asaas: { cliente: string | null; assinatura: string | null };
  equipe: { total: number; ativos: number };
  servicos: { ativos: number; comPreco: number };
  agendamentos: {
    total: number; ultimos7Dias: number; ultimos30Dias: number; proximos: number;
    /** `created_at` do primeiro e do último: texto UTC "aaaa-mm-dd hh:mm:ss". */
    primeiro: string | null; ultimo: string | null;
  };
  fotosNaGaleria: number;
  /** O medidor do Início do dono (`lib/completude.ts`), visto daqui. */
  completude: Completude;
  /** O que aconteceu, mais novo primeiro — sem as anotações, que têm o quadro delas. */
  linhaDoTempo: EventoDaFicha[];
  anotacoes: Anotacao[];
}

interface LinhaDaFicha {
  domain: string | null; asaas_customer_id: string | null; asaas_subscription_id: string | null;
  trial_ends_at: unknown; past_due_since: unknown; subscription_ends_at: unknown;
  address_city: string | null; address_street: string | null; whatsapp_number: string | null;
  logo_path: string | null; hero_path: string | null; tagline: string | null; about_text: string | null;
  instagram_url: string | null; google_reviews_url: string | null; seo_title: string | null;
  seo_description: string | null; accent_color: string | null; business_hours: string | null;
  equipe_total: number; servicos_ativos: number; servicos_com_preco: number; barbeiros_com_agenda: number;
  fotos: number; agendamentos_total: number; agendamentos_7_dias: number; proximos: number;
  primeiro_agendamento: string | null;
}

const AVISO_POR_EXTENSO: Record<string, string> = {
  'teste-acabando': 'E-mail ao dono: o teste está acabando',
  'teste-acabou': 'E-mail ao dono: o teste acabou',
  'cobranca-falhou': 'E-mail ao dono: a cobrança falhou',
  'fora-do-ar': 'E-mail ao dono: o site saiu do ar',
};

/** "2026-10-11 14:05:00", UTC, como `appointments.created_at` guarda. */
const textoUtc = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');
const deTextoUtc = (t: string) => new Date(`${t.replace(' ', 'T')}Z`);

/**
 * Tudo de uma barbearia numa tela: a situação, o dono, o uso, o que falta no site,
 * o que aconteceu e as anotações. `null` quando ela não existe.
 *
 * Como a lista: contagens e o contato do dono — nenhuma coluna de cliente. O
 * evento da Asaas entra pelo nome, pelo desfecho e pelo VALOR; o corpo dele, que
 * traz nome, e-mail e CPF do dono, nunca sai do banco.
 */
export async function fichaDaBarbearia(tenantId: number, agora: Date = new Date()): Promise<FichaDaBarbearia | null> {
  const [base] = await listarBarbearias(agora, tenantId);
  if (!base) return null;

  const seteDias = textoUtc(new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000));
  const [f] = await sqlConn<LinhaDaFicha[]>`
    SELECT t.domain, t.asaas_customer_id, t.asaas_subscription_id,
           t.trial_ends_at, t.past_due_since, t.subscription_ends_at,
           s.address_city, s.address_street, s.whatsapp_number, s.logo_path, s.hero_path, s.tagline,
           s.about_text, s.instagram_url, s.google_reviews_url, s.seo_title, s.seo_description,
           s.accent_color, s.business_hours,
           (SELECT count(*)::int FROM barbers b WHERE b.tenant_id = t.id) AS equipe_total,
           (SELECT count(*)::int FROM services sv WHERE sv.tenant_id = t.id AND sv.active) AS servicos_ativos,
           (SELECT count(*)::int FROM services sv WHERE sv.tenant_id = t.id AND sv.active AND sv.price_cents > 0) AS servicos_com_preco,
           (SELECT count(DISTINCT b.id)::int FROM barbers b JOIN working_hours w ON w.barber_id = b.id
             WHERE b.tenant_id = t.id AND b.active) AS barbeiros_com_agenda,
           (SELECT count(*)::int FROM gallery_images g WHERE g.tenant_id = t.id) AS fotos,
           (SELECT count(*)::int FROM appointments a WHERE a.tenant_id = t.id) AS agendamentos_total,
           (SELECT count(*)::int FROM appointments a WHERE a.tenant_id = t.id AND a.created_at >= ${seteDias}) AS agendamentos_7_dias,
           (SELECT count(*)::int FROM appointments a
             WHERE a.tenant_id = t.id AND a.status = 'confirmed' AND a.starts_at > ${agora.toISOString()}) AS proximos,
           (SELECT min(a.created_at) FROM appointments a WHERE a.tenant_id = t.id) AS primeiro_agendamento
      FROM tenants t
      LEFT JOIN settings s ON s.tenant_id = t.id
     WHERE t.id = ${tenantId}`;

  const completude = calcularCompletude({
    logoPath: f.logo_path, heroPath: f.hero_path, tagline: f.tagline, aboutText: f.about_text,
    whatsappNumber: f.whatsapp_number, addressStreet: f.address_street, addressCity: f.address_city,
    instagramUrl: f.instagram_url, googleReviewsUrl: f.google_reviews_url,
    seoTitle: f.seo_title, seoDescription: f.seo_description, accentColor: f.accent_color,
    horariosPublicados: parseBusinessHours(f.business_hours).length,
    servicosAtivos: f.servicos_ativos,
    barbeirosComAgenda: f.barbeiros_com_agenda,
    fotosNaGaleria: f.fotos,
  });

  // ── A linha do tempo ──
  const linha: EventoDaFicha[] = [];
  if (base.criadaEm) linha.push({ quando: base.criadaEm, origem: 'cadastro', texto: 'Cadastrou a barbearia' });

  const testeAte = comoData(f.trial_ends_at);
  if (testeAte && testeAte.getTime() <= agora.getTime()) {
    linha.push({ quando: testeAte, origem: 'prazo', texto: 'O teste de 7 dias acabou' });
  }
  const atrasadaDesde = comoData(f.past_due_since);
  if (atrasadaDesde && base.status === 'past_due') {
    linha.push({ quando: atrasadaDesde, origem: 'prazo', texto: 'A cobrança falhou — começou a carência' });
  }
  const encerraEm = comoData(f.subscription_ends_at);
  if (encerraEm && encerraEm.getTime() <= agora.getTime()) {
    linha.push({ quando: encerraEm, origem: 'prazo', texto: 'Saiu do ar: acabou o período pago' });
  }
  if (f.primeiro_agendamento) {
    linha.push({ quando: deTextoUtc(f.primeiro_agendamento), origem: 'agendamento', texto: 'Primeiro agendamento' });
  }

  const eventos = await sqlConn<{ received_at: unknown; event: string; outcome: string | null; valor: string | null }[]>`
    SELECT w.received_at, w.event, w.outcome, w.payload->'payment'->>'value' AS valor
      FROM webhook_events w
     WHERE w.tenant_id = ${tenantId}
     ORDER BY w.received_at DESC, w.id DESC
     LIMIT 30`;
  for (const e of eventos) {
    const quando = comoData(e.received_at);
    if (!quando) continue;
    const valor = e.valor !== null && /^\d+(\.\d+)?$/.test(e.valor) ? dinheiro(Number(e.valor)) : null;
    linha.push({
      quando, origem: 'asaas', texto: `${rotuloDoEvento(e.event)}${valor ? ` — ${valor}` : ''}`,
      detalhe: e.outcome ?? undefined,
    });
  }

  const avisos = await sqlConn<{ tipo: string; enviado_em: unknown }[]>`
    SELECT tipo, enviado_em FROM avisos_enviados WHERE tenant_id = ${tenantId} ORDER BY enviado_em DESC LIMIT 20`;
  for (const a of avisos) {
    const quando = comoData(a.enviado_em);
    if (quando) linha.push({ quando, origem: 'aviso', texto: AVISO_POR_EXTENSO[a.tipo] ?? `E-mail ao dono: ${a.tipo}` });
  }

  const doOperador = (await registro({ tenantId, limite: 200 })).itens;
  for (const a of doOperador) {
    if (a.acao === 'anotou' || !a.quando) continue;
    linha.push({ quando: a.quando, origem: 'operador', texto: descreverAcao(a) });
  }

  linha.sort((x, y) => y.quando.getTime() - x.quando.getTime());

  return {
    ...base,
    cidade: f.address_city?.trim() || null,
    dominioProprio: f.domain,
    asaas: { cliente: f.asaas_customer_id, assinatura: f.asaas_subscription_id },
    equipe: { total: f.equipe_total, ativos: base.barbeirosAtivos },
    servicos: { ativos: f.servicos_ativos, comPreco: f.servicos_com_preco },
    agendamentos: {
      total: f.agendamentos_total, ultimos7Dias: f.agendamentos_7_dias, ultimos30Dias: base.agendamentos30Dias,
      proximos: f.proximos, primeiro: f.primeiro_agendamento, ultimo: base.ultimoAgendamento,
    },
    fotosNaGaleria: f.fotos,
    completude,
    linhaDoTempo: linha.slice(0, 60),
    anotacoes: doOperador
      .filter((a) => a.acao === 'anotou')
      .map((a) => ({ id: a.id, quando: a.quando, texto: typeof a.detalhe.texto === 'string' ? a.detalhe.texto : '', ip: a.ip })),
  };
}
