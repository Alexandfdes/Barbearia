/**
 * Os avisos por e-mail do teste e da cobrança — para o dono que não abre o painel.
 *
 * A faixa do painel avisa quem entra (`lib/assinatura.ts`). O risco registrado em
 * `docs/JORNADA-DO-BARBEIRO.md` §2.9 é o outro: o dono que gostou, não abriu o
 * painel e só descobre que o site saiu do ar quando um cliente reclama. O canal é o
 * e-mail, decidido em 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13, item 4).
 *
 * ── QUATRO AVISOS, UM DE CADA VEZ ────────────────────────────────────────────
 *
 *  - `teste-acabando`: faltando 2 dias para o fim do teste;
 *  - `teste-acabou`: o teste venceu e a carência começou;
 *  - `cobranca-falhou`: a cobrança não passou e a carência começou;
 *  - `fora-do-ar`: a carência venceu e o site saiu do ar.
 *
 * Sai só o aviso da fase de AGORA. Com a tarefa parada por dois dias, o dono que
 * já saiu do ar recebe "o site saiu do ar" — não "o seu teste acaba em 2 dias",
 * atrasado e falso.
 *
 * ── A TRAVA ──────────────────────────────────────────────────────────────────
 *
 * A tarefa roda de hora em hora (`scripts/avisos-daemon.mjs`). O que impede o dono
 * de receber o mesmo e-mail 24 vezes por dia é `avisos_enviados` (migration
 * 0008): um aviso por barbearia, por tipo, por prazo. O prazo é a `referencia`,
 * então o teste estendido à mão, ou uma segunda cobrança que falha, é aviso novo.
 *
 * A reserva vem ANTES do envio. Se o envio falha, a reserva é desfeita e a rodada
 * seguinte tenta de novo. Se o processo cai entre a reserva e o envio, aquele
 * aviso se perde — de propósito: perder um aviso é melhor que mandar o mesmo
 * repetido a cada hora por um defeito.
 *
 * ⚠️ Usa a conexão do DONO do banco: olhar todas as barbearias é o trabalho de uma
 * tarefa que não vem de requisição de ninguém. `tests/rls.test.ts` mantém a lista
 * de quem pode fechada.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lte, notInArray } from 'drizzle-orm';
import { dbDono } from '../db/index.js';
import { avisosEnviados, barbers, tenants } from '../db/schema.js';
import { diaDe, diasAte, situacaoDe, type Situacao } from './situacao.js';
import { cobrancaLigada, explicacaoDaSituacao, TELA_DE_ASSINATURA } from './assinatura.js';
import { enviarEmail, transporteDeEmail, type Email } from './email.js';
import { urlDoPainel } from './tenant.js';
import { linkDoSuporte, NOME_PRODUTO, PRAZO_DA_CONFERENCIA } from './produto.js';
import { emailDoOperador, fichaNoPainel } from './avisoAoOperador.js';

export type TipoDeAviso = 'teste-acabando' | 'teste-acabou' | 'cobranca-falhou' | 'fora-do-ar';

export interface AvisoDevido {
  tipo: TipoDeAviso;
  /** O prazo de que o aviso fala — a outra metade da trava. */
  referencia: Date;
}

/** Com quantos dias de antecedência sai o aviso do fim do teste. */
export const DIAS_DE_ANTECEDENCIA = 2;

/**
 * Fora do ar há mais tempo que isto, o aviso não sai mais. Existe para o primeiro
 * dia desta tarefa no ar: sem ele, toda barbearia abandonada desde o começo do
 * teste receberia de uma vez um "o site saiu do ar" de semanas atrás.
 */
const FORA_DO_AR_HA_NO_MAXIMO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O aviso que a fase de agora pede, ou `null`. Sem banco: é a regra. Os dias que
 * faltam se contam no calendário da barbearia (`fuso`).
 */
export function avisoDevido(s: Situacao, fuso: string, agora: Date = new Date()): AvisoDevido | null {
  switch (s.fase) {
    case 'teste':
      return diasAte(s.ate, fuso, agora) <= DIAS_DE_ANTECEDENCIA ? { tipo: 'teste-acabando', referencia: s.ate } : null;
    case 'carencia':
      return { tipo: s.motivo === 'teste' ? 'teste-acabou' : 'cobranca-falhou', referencia: s.ate };
    case 'suspensa':
      // Tirada do ar à mão não recebe aviso automático: quem tirou é quem conversa.
      if (s.motivo === 'manual' || !s.desde) return null;
      if (agora.getTime() - s.desde.getTime() > FORA_DO_AR_HA_NO_MAXIMO_MS) return null;
      return { tipo: 'fora-do-ar', referencia: s.desde };
    default:
      return null;
  }
}

/**
 * O e-mail de cada aviso. O miolo é o MESMO parágrafo da tela de assinatura
 * (`explicacaoDaSituacao`): o que o e-mail diz e o que o painel diz não podem
 * divergir, e um texto num lugar só não diverge.
 */
export function textoDoAviso(
  tipo: TipoDeAviso,
  s: Situacao,
  /** `fuso`: o da barbearia — as datas do e-mail são as do calendário dela. */
  d: { barbearia: string; nome: string; painel: string; fuso: string },
  agora: Date = new Date(),
  /** A cobrança está ligada (`cobrancaLigada`)? Desligada, o aviso manda falar com o suporte. */
  ligada = true,
): { assunto: string; texto: string } {
  const assunto = `${d.barbearia}: ${resumoDoAssunto(tipo, s, d.fuso, agora)}`;

  const abertura = tipo === 'teste-acabando' && s.fase === 'teste'
    ? [quantoFalta(diasAte(s.ate, d.fuso, agora)), '']
    : [];

  const texto = [
    `Olá, ${d.nome}.`,
    '',
    ...abertura,
    explicacaoDaSituacao(s, d.fuso, agora, ligada),
    '',
    ...(ligada ? [] : ['O WhatsApp do suporte:', linkDoSuporte(), '']),
    'A tela de assinatura, no painel:',
    `${d.painel}${TELA_DE_ASSINATURA}`,
    '',
    `— ${NOME_PRODUTO}`,
  ].join('\n');

  return { assunto, texto };
}

function resumoDoAssunto(tipo: TipoDeAviso, s: Situacao, fuso: string, agora: Date): string {
  switch (tipo) {
    case 'teste-acabando': {
      const dias = s.fase === 'teste' ? diasAte(s.ate, fuso, agora) : 0;
      return `o teste grátis termina ${dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}`;
    }
    case 'teste-acabou':
      return 'o teste grátis acabou';
    case 'cobranca-falhou':
      return 'a cobrança do cartão não passou';
    case 'fora-do-ar':
      return 'o site saiu do ar';
  }
}

function quantoFalta(dias: number): string {
  if (dias <= 0) return 'Hoje é o último dia do seu teste grátis.';
  if (dias === 1) return 'O seu teste grátis termina amanhã.';
  return `Faltam ${dias} dias para o fim do seu teste grátis.`;
}

export interface ResumoDosAvisos {
  /** Barbearias com prazo correndo — no teste ou com a cobrança atrasada. */
  avaliadas: number;
  enviados: number;
  falhas: number;
  /** Aviso devido, e nenhum dono ativo com e-mail para receber. */
  semDestinatario: number;
  /** Sites lembrados ao operador nesta rodada (`lembrarSitesQueEsperam`). */
  lembradosAoOperador: number;
}

/**
 * Manda os avisos que estão devidos agora, em todas as barbearias. Lança quando
 * não há como mandar nenhum — envio de e-mail desligado, endereço do painel vazio
 * —, para quem chamou ver o motivo em vez de um resumo de zeros.
 */
export async function enviarAvisosPendentes(agora: Date = new Date()): Promise<ResumoDosAvisos> {
  if (transporteDeEmail() === 'nenhum') {
    throw new Error('O envio de e-mail não está configurado (SMTP_URL): nenhum aviso sai.');
  }
  const painel = urlDoPainel();
  if (!painel) {
    throw new Error('PAINEL_URL e DOMINIO_BASE vazios: os avisos sairiam com o link do painel quebrado.');
  }

  const resumo: ResumoDosAvisos = { avaliadas: 0, enviados: 0, falhas: 0, semDestinatario: 0, lembradosAoOperador: 0 };

  // Pagando em dia, encerrada e tirada do ar à mão não têm prazo correndo. Nem o site que
  // espera a sua aprovação (migration 0020): o teste dele é recontado quando ele abrir
  // (`aprovarSite`), e "o seu teste está acabando" a quem nunca teve o site no ar seria mentira.
  const barbearias = await dbDono
    .select({
      id: tenants.id,
      nome: tenants.businessName,
      status: tenants.status,
      testeAte: tenants.trialEndsAt,
      atrasadaDesde: tenants.pastDueSince,
      carenciaAte: tenants.carenciaAte,
      fuso: tenants.timezone,
    })
    .from(tenants)
    .where(and(inArray(tenants.status, ['trial', 'past_due']), isNotNull(tenants.siteAprovadoEm)))
    .orderBy(tenants.id);

  for (const b of barbearias) {
    resumo.avaliadas++;
    const s = situacaoDe(b, agora);
    const devido = avisoDevido(s, b.fuso, agora);
    if (!devido) continue;

    const donos = await dbDono
      .select({ nome: barbers.name, email: barbers.email })
      .from(barbers)
      .where(and(
        eq(barbers.tenantId, b.id),
        eq(barbers.role, 'admin'),
        eq(barbers.active, true),
        isNotNull(barbers.email),
        // Só e-mail confirmado (`lib/confirmacaoDeEmail.ts`): o aviso leva o nome da barbearia.
        isNotNull(barbers.emailConfirmadoEm),
      ));
    if (donos.length === 0) {
      resumo.semDestinatario++;
      continue;
    }

    const [reserva] = await dbDono.insert(avisosEnviados)
      .values({ tenantId: b.id, tipo: devido.tipo, referencia: devido.referencia, enviadoEm: agora })
      .onConflictDoNothing()
      .returning({ id: avisosEnviados.id });
    if (!reserva) continue; // já foi

    try {
      // Mais de um dono: todos recebem. Se o segundo falhar, a reserva é
      // desfeita e o primeiro recebe de novo na rodada seguinte — raro, e melhor
      // que o segundo não receber nunca.
      for (const dono of donos) {
        await enviarEmail({
          para: dono.email!,
          ...textoDoAviso(devido.tipo, s, { barbearia: b.nome, nome: dono.nome, painel, fuso: b.fuso }, agora, cobrancaLigada()),
          barbearia: b.id,
          tipo: 'conta',
        });
      }
      resumo.enviados++;
    } catch (erro) {
      await dbDono.delete(avisosEnviados).where(and(eq(avisosEnviados.id, reserva.id), eq(avisosEnviados.tenantId, b.id)));
      resumo.falhas++;
      console.error(`[avisos] barbearia ${b.id}, ${devido.tipo}: o e-mail não saiu —`, erro instanceof Error ? erro.message : erro);
    }
  }

  resumo.lembradosAoOperador = await lembrarSitesQueEsperam(agora);
  return resumo;
}

// ── O lembrete ao operador ─────────────────────────────────────────────────────

/**
 * Quantas horas o site espera a aprovação antes do lembrete ao operador (decisão do dono em
 * 10/11/2026). O dono ouviu `PRAZO_DA_CONFERENCIA`; 20 horas corridas deixam folga antes do fim de
 * um dia, e no fim de semana o lembrete chega antes do prazo — nunca depois.
 */
export const HORAS_ATE_O_LEMBRETE = 20;
/** O tipo na trava de `avisos_enviados`, com o cadastro como `referencia`: um lembrete por site. */
export const TIPO_DO_LEMBRETE = 'operador-site-esperando';

/** O endereço do site como o cadastro grava (`provisionarBarbearia`). Fora disso, não vai para o e-mail. */
const FORMA_DO_ENDERECO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * O e-mail do lembrete. ⚠️ Recebe só o que o sistema monta: o endereço (do formato do cadastro),
 * a hora do cadastro e o link da ficha — nada digitado, como o aviso de cadastro novo
 * (`lib/avisoAoOperador.ts`). O assunto só muda com a quantidade.
 */
export function textoDoLembrete(
  sites: { slug: string; criadaEm: Date; fuso: string; ficha: string }[],
  agora: Date = new Date(),
): { assunto: string; texto: string } {
  const um = sites.length === 1;
  const linhas = sites.flatMap((x) => {
    const horas = Math.floor((agora.getTime() - x.criadaEm.getTime()) / (60 * 60 * 1000));
    const endereco = FORMA_DO_ENDERECO.test(x.slug) ? x.slug : '(endereço fora do formato — veja na ficha)';
    return [
      `- ${endereco}: cadastrou em ${diaDe(x.criadaEm, x.fuso, "dd/MM 'às' HH:mm")}, há ${horas} horas`,
      `  ${x.ficha || 'abra o painel do operador, em Barbearias'}`,
    ];
  });
  return {
    assunto: um
      ? `Site esperando a sua aprovação há mais de ${HORAS_ATE_O_LEMBRETE} horas`
      : `${sites.length} sites esperando a sua aprovação há mais de ${HORAS_ATE_O_LEMBRETE} horas`,
    texto: [
      um
        ? `O dono ouviu que o site abre em até ${PRAZO_DA_CONFERENCIA}, e ele ainda espera a sua aprovação:`
        : `Os donos ouviram que o site abre em até ${PRAZO_DA_CONFERENCIA}, e estes ainda esperam a sua aprovação:`,
      '',
      ...linhas,
      '',
      'Na ficha, "Ver como o site está" abre a prévia. Até você aprovar, o endereço mostra "em preparação".',
      '',
      `Este é o único lembrete de cada site: depois dele, ${um ? 'ele continua' : 'eles continuam'} no Início do operador, o mais antigo primeiro.`,
      '',
      'Este e-mail não traz o nome nem o texto que a pessoa digitou, de propósito: é na prévia que se confere.',
      '',
      `— ${NOME_PRODUTO}`,
    ].join('\n'),
  };
}

/**
 * Lembra o operador dos sites que esperam a aprovação há mais de `HORAS_ATE_O_LEMBRETE` horas —
 * um e-mail por rodada, com todos os que passaram da hora, e um lembrete por site, nunca mais
 * (decisão do dono em 10/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.70).
 *
 * O aviso de cadastro novo sai na hora do cadastro (`avisarOperadorDoCadastro`); este é para o dia
 * em que ele se perdeu na caixa de entrada. Sem o `OPERADOR_EMAIL`, nada é reservado: o lembrete
 * sai na primeira rodada depois de a variável entrar. Barbearia encerrada ou tirada do ar à mão não
 * entra — alguém já olhou para ela.
 *
 * A trava é a mesma dos avisos do dono, `avisos_enviados`, com a hora do cadastro como prazo; a
 * reserva vem antes do envio e é desfeita se o envio falha. Devolve quantos sites foram lembrados.
 * Nunca lança por falha de envio: o resto da tarefa já rodou.
 */
export async function lembrarSitesQueEsperam(
  agora: Date = new Date(),
  opcoes: { env?: Record<string, string | undefined>; enviar?: (e: Email) => Promise<unknown> } = {},
): Promise<number> {
  const env = opcoes.env ?? process.env;
  const para = emailDoOperador(env);
  if (!para) return 0;

  const limite = new Date(agora.getTime() - HORAS_ATE_O_LEMBRETE * 60 * 60 * 1000);
  const esperando = await dbDono
    .select({ id: tenants.id, slug: tenants.slug, criadaEm: tenants.createdAt, fuso: tenants.timezone })
    .from(tenants)
    .where(and(
      isNull(tenants.siteAprovadoEm),
      notInArray(tenants.status, ['cancelled', 'suspended']),
      lte(tenants.createdAt, limite),
    ))
    .orderBy(asc(tenants.createdAt), asc(tenants.id));

  const reservados: typeof esperando = [];
  const reservas: { id: number; tenantId: number }[] = [];
  for (const site of esperando) {
    const [reserva] = await dbDono.insert(avisosEnviados)
      .values({ tenantId: site.id, tipo: TIPO_DO_LEMBRETE, referencia: site.criadaEm, enviadoEm: agora })
      .onConflictDoNothing()
      .returning({ id: avisosEnviados.id });
    if (!reserva) continue; // já foi lembrado
    reservados.push(site);
    reservas.push({ id: reserva.id, tenantId: site.id });
  }
  if (reservados.length === 0) return 0;

  try {
    const conteudo = textoDoLembrete(
      reservados.map((x) => ({ slug: x.slug, criadaEm: x.criadaEm, fuso: x.fuso, ficha: fichaNoPainel(x.id, env) })),
      agora,
    );
    // Um e-mail só, de vários sites: sai da parte do operador, sem barbearia (`lib/email.ts`).
    await (opcoes.enviar ?? enviarEmail)({ para, ...conteudo, barbearia: null, tipo: 'operador' });
    return reservados.length;
  } catch (erro) {
    for (const r of reservas) {
      await dbDono.delete(avisosEnviados).where(and(eq(avisosEnviados.id, r.id), eq(avisosEnviados.tenantId, r.tenantId)));
    }
    console.error(`[avisos] o lembrete ao operador de ${reservados.length} site(s) esperando não saiu —`, erro instanceof Error ? erro.message : erro);
    return 0;
  }
}
