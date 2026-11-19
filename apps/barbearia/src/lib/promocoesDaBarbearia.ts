/**
 * Promoções em horário ocioso — o que o painel lista e o que ativar grava (17/11/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §2.72). A regra do desconto máximo é `lib/promocoes.ts`; a
 * regra de qual desconto vale num horário, `lib/combo.ts`.
 *
 * Para cada combo ativo, em cada dia da semana em que ele vale e em cada faixa de horário
 * (as de `lib/occupancy.ts`):
 *
 *  - **os dias que contam** são os desse dia da semana nas últimas 8 semanas em que a
 *    barbearia CONCLUIU algum atendimento — dia sem atendimento nenhum é dia fechado ou de
 *    antes de usar o sistema, não dia vazio. Com menos de 4, não há sugestão;
 *  - **a ocupação** é a conta do relatório (`computeOccupancy` + `somarPorDiaDaSemanaEFaixa`),
 *    sobre esses dias. Abaixo de 30%, a faixa está ociosa;
 *  - **x** é a média de atendimentos concluídos que COMEÇARAM na faixa, nesses dias.
 *
 * Tudo isso só com os barbeiros que fazem o serviço do combo: é com eles que a promoção vai
 * ser marcada. A promoção não tem barbeiro — vale com qualquer um deles.
 *
 * ⚠️ O dia e a hora saem do fuso DA BARBEARIA (`fusoDe`), nunca do processo.
 * ⚠️ O custo do produto só sai daqui para o painel do dono — nunca para rota pública.
 */
import { and, eq, gt, gte, inArray, lt, ne } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db } from '../db/index.js';
import {
  appointments, barbers, barberServices, combos, products, promocoes, services, settings, timeOff, workingHours,
} from '../db/schema.js';
import type { Tenant } from './tenant.js';
import { fusoDe } from './timezone.js';
import { diaDaSemana, somarDias } from './calendario.js';
import { computeOccupancy, DEFAULT_BANDS, somarPorDiaDaSemanaEFaixa } from './occupancy.js';
import { getSettings } from './settings.js';
import { violouUnico } from './api.js';
import type { PromocaoNoHorario } from './combo.js';
import {
  descontoMaximo, emDecimosDePorcento, faixaOciosa, limiteDoCampo,
  SEMANAS_DO_HISTORICO, SEMANAS_MINIMAS,
} from './promocoes.js';

export interface FaixaDaPromocao {
  /** 'manha', 'tarde', 'fim' — as de `DEFAULT_BANDS`. */
  chave: string;
  /** "à tarde" — o rótulo do relatório. */
  rotulo: string;
  inicioMin: number;
  fimMin: number;
}

export type BloqueioDaSugestao =
  /** O produto do combo não tem custo informado: sem v, não há conta. */
  | 'sem-custo'
  /** O limite não passa do desconto que o combo já dá nesse dia: a promoção não mudaria nada. */
  | 'sem-espaco';

export interface SugestaoDePromocao {
  comboId: number;
  comboNome: string;
  produtoId: number;
  produtoNome: string;
  diaDaSemana: number;
  faixa: FaixaDaPromocao;
  /** 0–100: a ocupação da faixa nos dias que contaram. */
  ocupacaoPct: number;
  /** Quantos dias desse dia da semana entraram na conta (de 4 a 8). */
  semanas: number;
  /** Atendimentos concluídos que começaram na faixa, somados nesses dias. */
  atendidos: number;
  /** x, em décimos: 25 = 2,5 atendimentos por semana. */
  mediaDecimos: number;
  servicoCents: number;
  produtoCents: number;
  /** P: serviço + produto, sem desconto nenhum. */
  precoCheioCents: number;
  /** v; nulo quando o dono não informou. */
  custoCents: number | null;
  /** O desconto que o combo já dá nesse dia. */
  comboPct: number;
  /** d_max em décimos de ponto (200 = 20%); nulo sem custo. */
  limiteDecimos: number | null;
  /** O maior percentual inteiro que o campo aceita; nulo sem custo. */
  limitePct: number | null;
  bloqueio: BloqueioDaSugestao | null;
}

export interface PromocaoAtiva {
  id: number;
  comboId: number;
  comboNome: string;
  diaDaSemana: number;
  inicioMin: number;
  fimMin: number;
  descontoPct: number;
  servicoCents: number;
  produtoCents: number;
  ativadaEm: Date | null;
  ativadaPorNome: string | null;
}

export interface PainelDePromocoes {
  /** O g da barbearia (`settings.promo_clientes_novos`). */
  clientesNovos: number;
  sugestoes: SugestaoDePromocao[];
  ativas: PromocaoAtiva[];
  /** Produtos de combo ativo sem custo — a tela manda cadastrar. */
  produtosSemCusto: { id: number; nome: string }[];
  /** Quantos dias da semana de combo ficaram de fora por terem menos de 4 semanas com dado. */
  diasSemHistorico: number;
}

const comoData = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

/** Os 8 dias desse dia da semana antes de hoje, do mais recente ao mais antigo. */
export function diasDaSemanaAnteriores(hoje: string, dia: number, quantos = SEMANAS_DO_HISTORICO): string[] {
  const atras = ((diaDaSemana(hoje) - dia + 7) % 7) || 7;
  const primeiro = somarDias(hoje, -atras);
  return Array.from({ length: quantos }, (_, i) => somarDias(primeiro, -7 * i));
}

/** A data local e os minutos desde a meia-noite de um instante, no fuso da barbearia. */
export function dataEMinutoLocal(instante: string, fuso: string): { data: string; min: number } {
  const d = new Date(instante);
  const [h, m] = formatInTimeZone(d, fuso, 'HH:mm').split(':').map(Number);
  return { data: formatInTimeZone(d, fuso, 'yyyy-MM-dd'), min: h * 60 + m };
}

/**
 * O painel de promoções da barbearia: as sugestões (faixas ociosas com o limite calculado) e
 * as promoções ativas. Corre dentro da requisição do painel, e filtra a barbearia em tudo.
 */
export async function painelDePromocoes(tenant: Tenant, agora: Date = new Date()): Promise<PainelDePromocoes> {
  const tenantId = tenant.id;
  const fuso = fusoDe(tenant);
  const hoje = formatInTimeZone(agora, fuso, 'yyyy-MM-dd');
  const inicioDaJanela = fromZonedTime(`${somarDias(hoje, -7 * SEMANAS_DO_HISTORICO)}T00:00:00`, fuso).toISOString();
  const fimDaJanela = fromZonedTime(`${hoje}T00:00:00`, fuso).toISOString();

  const { promoClientesNovos: clientesNovos } = await getSettings(tenant);

  const listaDeCombos = await db
    .select({
      id: combos.id, nome: combos.name, serviceId: combos.serviceId, weekdays: combos.weekdays,
      descontoPct: combos.discountPct,
      servicoCents: services.priceCents,
      produtoId: products.id, produtoNome: products.name, produtoCents: products.priceCents, custoCents: products.costCents,
    })
    .from(combos)
    .innerJoin(services, and(eq(services.id, combos.serviceId), eq(services.tenantId, tenantId)))
    .innerJoin(products, and(eq(products.id, combos.productId), eq(products.tenantId, tenantId)))
    .where(and(eq(combos.tenantId, tenantId), eq(combos.active, true), eq(services.active, true), eq(products.active, true)))
    .orderBy(combos.sortOrder, combos.id);

  const ativasRows = await db
    .select({
      id: promocoes.id, comboId: promocoes.comboId, diaDaSemana: promocoes.diaDaSemana,
      inicioMin: promocoes.inicioMin, fimMin: promocoes.fimMin, descontoPct: promocoes.descontoPct,
      ativadaEm: promocoes.ativadaEm, ativadaPor: promocoes.ativadaPor,
    })
    .from(promocoes)
    .where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.ativa, true)))
    .orderBy(promocoes.diaDaSemana, promocoes.inicioMin, promocoes.id);

  const quemAtivou = new Map<number, string>();
  const idsDeQuemAtivou = [...new Set(ativasRows.map((a) => a.ativadaPor).filter((x): x is number => x != null))];
  if (idsDeQuemAtivou.length) {
    const nomes = await db.select({ id: barbers.id, nome: barbers.name }).from(barbers)
      .where(and(eq(barbers.tenantId, tenantId), inArray(barbers.id, idsDeQuemAtivou)));
    for (const n of nomes) quemAtivou.set(n.id, n.nome);
  }

  // As promoções ativas de combo que não está mais no ar continuam na lista, para poderem ser
  // desativadas — com o nome e o preço que dá para achar.
  const comboPorId = new Map(listaDeCombos.map((c) => [c.id, c]));
  const idsSemCombo = [...new Set(ativasRows.map((a) => a.comboId).filter((id) => !comboPorId.has(id)))];
  const nomeDeComboFora = new Map<number, string>();
  if (idsSemCombo.length) {
    const fora = await db.select({ id: combos.id, nome: combos.name }).from(combos)
      .where(and(eq(combos.tenantId, tenantId), inArray(combos.id, idsSemCombo)));
    for (const c of fora) nomeDeComboFora.set(c.id, c.nome);
  }

  const ativas: PromocaoAtiva[] = ativasRows.map((a) => {
    const c = comboPorId.get(a.comboId);
    return {
      id: a.id, comboId: a.comboId, comboNome: c?.nome ?? nomeDeComboFora.get(a.comboId) ?? 'Combo fora do ar',
      diaDaSemana: a.diaDaSemana, inicioMin: a.inicioMin, fimMin: a.fimMin, descontoPct: a.descontoPct,
      servicoCents: c?.servicoCents ?? 0, produtoCents: c?.produtoCents ?? 0,
      ativadaEm: comoData(a.ativadaEm), ativadaPorNome: a.ativadaPor != null ? quemAtivou.get(a.ativadaPor) ?? null : null,
    };
  });

  const produtosSemCusto = [...new Map(
    listaDeCombos.filter((c) => c.custoCents == null).map((c) => [c.produtoId, { id: c.produtoId, nome: c.produtoNome }]),
  ).values()];

  if (listaDeCombos.length === 0) {
    return { clientesNovos, sugestoes: [], ativas, produtosSemCusto, diasSemHistorico: 0 };
  }

  // Quem faz cada serviço: barbeiro ativo, com o serviço ligado.
  const quemFaz = await db
    .select({ barberId: barberServices.barberId, serviceId: barberServices.serviceId })
    .from(barberServices)
    .innerJoin(barbers, and(eq(barbers.id, barberServices.barberId), eq(barbers.tenantId, tenantId)))
    .where(and(eq(barberServices.tenantId, tenantId), eq(barberServices.active, true), eq(barbers.active, true)));

  const expediente = await db
    .select({ barberId: workingHours.barberId, weekday: workingHours.weekday, startTime: workingHours.startTime, endTime: workingHours.endTime })
    .from(workingHours)
    .where(eq(workingHours.tenantId, tenantId));

  const bloqueios = await db
    .select({ barberId: timeOff.barberId, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt })
    .from(timeOff)
    .where(and(eq(timeOff.tenantId, tenantId), lt(timeOff.startsAt, fimDaJanela), gt(timeOff.endsAt, inicioDaJanela)));

  // Os mesmos agendamentos que o relatório conta como ocupação: todos menos os cancelados.
  const agendados = (await db
    .select({ barberId: appointments.barberId, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status })
    .from(appointments)
    .where(and(
      eq(appointments.tenantId, tenantId), ne(appointments.status, 'cancelled'),
      gte(appointments.startsAt, inicioDaJanela), lt(appointments.startsAt, fimDaJanela),
    )))
    .map((a) => ({ ...a, ...dataEMinutoLocal(a.startsAt, fuso) }));

  const chaveDaAtiva = new Set(ativasRows.map((a) => `${a.comboId}-${a.diaDaSemana}-${a.inicioMin}`));
  const sugestoes: SugestaoDePromocao[] = [];
  let diasSemHistorico = 0;

  for (const c of listaDeCombos) {
    const daEquipe = new Set(quemFaz.filter((q) => q.serviceId === c.serviceId).map((q) => q.barberId));
    if (daEquipe.size === 0) continue;
    const seus = agendados.filter((a) => daEquipe.has(a.barberId));
    const concluidos = seus.filter((a) => a.status === 'completed');

    for (let dia = 0; dia < 7; dia++) {
      if ((c.weekdays & (1 << dia)) === 0) continue; // a promoção vale nos dias do combo
      const comDado = diasDaSemanaAnteriores(hoje, dia).filter((d) => concluidos.some((a) => a.data === d));
      if (comDado.length < SEMANAS_MINIMAS) { diasSemHistorico++; continue; }

      const ocupacao = somarPorDiaDaSemanaEFaixa(computeOccupancy({
        days: comDado.map((dateStr) => ({ dateStr, weekday: dia })),
        workingHours: expediente.filter((w) => daEquipe.has(w.barberId)),
        timeOff: bloqueios.filter((t) => t.barberId === null || daEquipe.has(t.barberId)),
        appointments: seus,
        tz: fuso,
      }));

      for (const banda of DEFAULT_BANDS) {
        const o = ocupacao.find((f) => f.bandKey === banda.key);
        if (!o || !faixaOciosa(o.avail, o.booked)) continue;
        if (chaveDaAtiva.has(`${c.id}-${dia}-${banda.startMin}`)) continue; // já ativa: aparece lá

        const dias = new Set(comDado);
        const atendidos = concluidos.filter((a) => dias.has(a.data) && a.min >= banda.startMin && a.min < banda.endMin).length;
        const precoCheioCents = c.servicoCents + c.produtoCents;
        const limite = c.custoCents == null ? null : descontoMaximo({
          atendidos, semanas: comDado.length, clientesNovos, precoCents: precoCheioCents, custoCents: c.custoCents,
        });
        const limitePct = limite ? limiteDoCampo(limite) : null;

        sugestoes.push({
          comboId: c.id, comboNome: c.nome, produtoId: c.produtoId, produtoNome: c.produtoNome,
          diaDaSemana: dia,
          faixa: { chave: banda.key, rotulo: banda.label, inicioMin: banda.startMin, fimMin: banda.endMin },
          ocupacaoPct: o.avail > 0 ? Math.min(100, Math.round((100 * o.booked) / o.avail)) : 0,
          semanas: comDado.length,
          atendidos,
          mediaDecimos: emDecimosDePorcento({ num: atendidos, den: comDado.length * 100 }),
          servicoCents: c.servicoCents,
          produtoCents: c.produtoCents,
          precoCheioCents,
          custoCents: c.custoCents,
          comboPct: c.descontoPct,
          limiteDecimos: limite ? emDecimosDePorcento(limite) : null,
          limitePct,
          bloqueio: c.custoCents == null ? 'sem-custo' : limitePct === null || limitePct <= c.descontoPct ? 'sem-espaco' : null,
        });
      }
    }
  }

  return { clientesNovos, sugestoes, ativas, produtosSemCusto, diasSemHistorico };
}

export interface PedidoDeAtivacao {
  comboId: number;
  diaDaSemana: number;
  /** A chave da faixa: 'manha', 'tarde', 'fim'. */
  faixa: string;
  descontoPct: number;
}

export type ResultadoDaAtivacao =
  | { ok: true; id: number }
  | { ok: false; status: 400 | 409; erro: string };

/**
 * Ativa uma promoção — só se ela é, AGORA, uma das sugestões: a conta é refeita aqui, e o
 * desconto não passa do limite nem fica no desconto que o combo já dá. A tela também limita,
 * mas quem decide é o servidor. Dois pedidos ao mesmo tempo, o banco recusa o segundo
 * (`promocoes_uma_ativa_por_faixa`).
 */
export async function ativarPromocao(
  tenant: Tenant, quemAtiva: number, pedido: PedidoDeAtivacao, agora: Date = new Date(),
): Promise<ResultadoDaAtivacao> {
  const painel = await painelDePromocoes(tenant, agora);
  const jaAtiva = painel.ativas.find((a) => a.comboId === pedido.comboId && a.diaDaSemana === pedido.diaDaSemana
    && DEFAULT_BANDS.some((b) => b.key === pedido.faixa && b.startMin === a.inicioMin));
  if (jaAtiva) {
    return { ok: false, status: 409, erro: 'Já há uma promoção ativa neste combo, neste dia e nesta faixa. Desative a de agora para trocar o desconto.' };
  }
  const s = painel.sugestoes.find((x) => x.comboId === pedido.comboId && x.diaDaSemana === pedido.diaDaSemana && x.faixa.chave === pedido.faixa);
  if (!s) {
    return { ok: false, status: 409, erro: 'Este horário não está mais entre as sugestões: deixou de estar ocioso, ou o combo mudou. Atualize a tela.' };
  }
  if (s.bloqueio === 'sem-custo') {
    return { ok: false, status: 409, erro: `Informe o custo de "${s.produtoNome}" em Produtos: sem ele não dá para calcular o desconto que mantém o lucro.` };
  }
  if (s.limitePct === null || s.bloqueio === 'sem-espaco') {
    return { ok: false, status: 409, erro: `O combo já dá ${s.comboPct}% neste dia, e o limite deste horário não passa disso.` };
  }
  if (!Number.isInteger(pedido.descontoPct) || pedido.descontoPct > s.limitePct) {
    return { ok: false, status: 400, erro: `O desconto deste horário vai até ${s.limitePct}%. Mais que isso, a promoção dá prejuízo.` };
  }
  if (pedido.descontoPct <= s.comboPct) {
    return { ok: false, status: 400, erro: `O combo já dá ${s.comboPct}% neste dia: a promoção precisa passar disso para mudar o preço.` };
  }

  try {
    const [nova] = await db.insert(promocoes).values({
      tenantId: tenant.id,
      comboId: s.comboId,
      diaDaSemana: s.diaDaSemana,
      inicioMin: s.faixa.inicioMin,
      fimMin: s.faixa.fimMin,
      descontoPct: pedido.descontoPct,
      ativa: true,
      ativadaPor: quemAtiva,
      ativadaEm: agora,
    }).returning({ id: promocoes.id });
    // A conta foi feita antes do INSERT, sem trava (19/11/2026): se o preço, o custo, o combo ou os
    // clientes novos mudaram nesse meio-tempo, a desativação que a mudança dispara não achou esta
    // promoção — ela ainda não existia. Relidos agora, depois de gravada: diferiu, ela sai na hora.
    if (!(await mesmosValores(tenant.id, s, painel.clientesNovos))) {
      await desativarPromocao(tenant.id, nova.id, agora);
      return { ok: false, status: 409, erro: 'O preço, o custo ou o combo mudou enquanto a promoção era ativada. Atualize a tela e confira o limite novo.' };
    }
    return { ok: true, id: nova.id };
  } catch (err) {
    if (violouUnico(err, 'promocoes_uma_ativa_por_faixa')) {
      return { ok: false, status: 409, erro: 'Já há uma promoção ativa neste combo, neste dia e nesta faixa. Atualize a tela.' };
    }
    throw err;
  }
}

/** Os valores que entraram no limite de `s` continuam os do banco — lidos dele, sem o cache das configurações. */
async function mesmosValores(tenantId: number, s: SugestaoDePromocao, clientesNovos: number): Promise<boolean> {
  const [agora] = await db
    .select({
      servicoCents: services.priceCents, produtoCents: products.priceCents, custoCents: products.costCents,
      produtoId: products.id, descontoPct: combos.discountPct, weekdays: combos.weekdays, ativo: combos.active,
    })
    .from(combos)
    .innerJoin(services, and(eq(services.id, combos.serviceId), eq(services.tenantId, tenantId)))
    .innerJoin(products, and(eq(products.id, combos.productId), eq(products.tenantId, tenantId)))
    .where(and(eq(combos.id, s.comboId), eq(combos.tenantId, tenantId)));
  const [cfg] = await db.select({ g: settings.promoClientesNovos }).from(settings).where(eq(settings.tenantId, tenantId));
  return Boolean(agora && cfg)
    && agora.ativo
    && agora.servicoCents === s.servicoCents
    && agora.produtoCents === s.produtoCents
    && agora.produtoId === s.produtoId
    && agora.custoCents === s.custoCents
    && agora.descontoPct === s.comboPct
    && (agora.weekdays & (1 << s.diaDaSemana)) !== 0
    && cfg.g === clientesNovos;
}

/**
 * Desativa: a linha fica, com a hora em que saiu. A condição vai no próprio UPDATE — dois
 * pedidos ao mesmo tempo, um só desativa. Devolve se foi ESTE pedido que desativou.
 */
export async function desativarPromocao(tenantId: number, id: number, agora: Date = new Date()): Promise<boolean> {
  const feitas = await db.update(promocoes)
    .set({ ativa: false, desativadaEm: agora })
    .where(and(eq(promocoes.id, id), eq(promocoes.tenantId, tenantId), eq(promocoes.ativa, true)))
    .returning({ id: promocoes.id });
  return feitas.length > 0;
}

/**
 * Desativa as promoções ativas dos combos que usam este serviço, este produto ou que são este
 * combo — chamada quando muda o que entra na conta: o serviço ou o produto do combo, o preço do
 * serviço, o preço ou o custo do produto. O limite que o dono confirmou foi calculado com os
 * valores de antes; com os novos, ele pode ser outro, e a promoção venderia abaixo do lucro sem
 * ninguém ter confirmado (achado na revisão de 17/11/2026). A sugestão volta, com a conta nova.
 * Devolve quantas desativou.
 */
export async function desativarPromocoesAfetadas(
  tenantId: number,
  pelo: { comboId: number } | { serviceId: number } | { productId: number } | { todas: true },
  agora: Date = new Date(),
  /** A transação de quem chama, para a desativação desfazer junto com a mudança (`api/admin/settings.ts`). */
  banco: Pick<typeof db, 'select' | 'update'> = db,
): Promise<number> {
  // `todas`: o que mudou vale para a barbearia inteira — os clientes novos (g) que o dono estima
  // (19/11/2026). Com um g menor, o limite de cada promoção ativa é menor.
  if ('todas' in pelo) {
    const feitas = await banco.update(promocoes)
      .set({ ativa: false, desativadaEm: agora })
      .where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.ativa, true)))
      .returning({ id: promocoes.id });
    return feitas.length;
  }
  const ids = 'comboId' in pelo
    ? [pelo.comboId]
    : (await banco.select({ id: combos.id }).from(combos).where(and(
        eq(combos.tenantId, tenantId),
        'serviceId' in pelo ? eq(combos.serviceId, pelo.serviceId) : eq(combos.productId, pelo.productId),
      ))).map((c) => c.id);
  if (ids.length === 0) return 0;
  const feitas = await banco.update(promocoes)
    .set({ ativa: false, desativadaEm: agora })
    .where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.ativa, true), inArray(promocoes.comboId, ids)))
    .returning({ id: promocoes.id });
  return feitas.length;
}

/**
 * As promoções ativas dos combos, para o site e o agendamento — só o dia, a faixa e o
 * desconto. Nada de custo.
 */
export async function promocoesAtivasDosCombos(tenantId: number, comboIds: number[]): Promise<Map<number, PromocaoNoHorario[]>> {
  const porCombo = new Map<number, PromocaoNoHorario[]>();
  if (comboIds.length === 0) return porCombo;
  const linhas = await db
    .select({
      id: promocoes.id, comboId: promocoes.comboId, diaDaSemana: promocoes.diaDaSemana,
      inicioMin: promocoes.inicioMin, fimMin: promocoes.fimMin, descontoPct: promocoes.descontoPct,
    })
    .from(promocoes)
    .where(and(eq(promocoes.tenantId, tenantId), eq(promocoes.ativa, true), inArray(promocoes.comboId, comboIds)))
    .orderBy(promocoes.diaDaSemana, promocoes.inicioMin);
  for (const { comboId, ...p } of linhas) {
    const lista = porCombo.get(comboId) ?? [];
    lista.push(p);
    porCombo.set(comboId, lista);
  }
  return porCombo;
}

/** Uma promoção, ativa ou não, pelo id — para o remarcar do link conferir a faixa. */
export async function promocaoPorId(tenantId: number, id: number): Promise<(PromocaoNoHorario & { ativa: boolean }) | null> {
  const [p] = await db
    .select({
      id: promocoes.id, diaDaSemana: promocoes.diaDaSemana, inicioMin: promocoes.inicioMin,
      fimMin: promocoes.fimMin, descontoPct: promocoes.descontoPct, ativa: promocoes.ativa,
    })
    .from(promocoes)
    .where(and(eq(promocoes.id, id), eq(promocoes.tenantId, tenantId)));
  return p ?? null;
}
