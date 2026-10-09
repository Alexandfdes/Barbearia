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
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { dbDono } from '../db/index.js';
import { avisosEnviados, barbers, tenants } from '../db/schema.js';
import { diasAte, situacaoDe, type Situacao } from './situacao.js';
import { explicacaoDaSituacao, TELA_DE_ASSINATURA } from './assinatura.js';
import { enviarEmail, transporteDeEmail } from './email.js';
import { urlDoPainel } from './tenant.js';
import { NOME_PRODUTO } from './produto.js';

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

/** O aviso que a fase de agora pede, ou `null`. Sem banco: é a regra. */
export function avisoDevido(s: Situacao, agora: Date = new Date()): AvisoDevido | null {
  switch (s.fase) {
    case 'teste':
      return diasAte(s.ate, agora) <= DIAS_DE_ANTECEDENCIA ? { tipo: 'teste-acabando', referencia: s.ate } : null;
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
  d: { barbearia: string; nome: string; painel: string },
  agora: Date = new Date(),
): { assunto: string; texto: string } {
  const assunto = `${d.barbearia}: ${resumoDoAssunto(tipo, s, agora)}`;

  const abertura = tipo === 'teste-acabando' && s.fase === 'teste'
    ? [quantoFalta(diasAte(s.ate, agora)), '']
    : [];

  const texto = [
    `Olá, ${d.nome}.`,
    '',
    ...abertura,
    explicacaoDaSituacao(s, agora),
    '',
    'A tela de assinatura, no painel:',
    `${d.painel}${TELA_DE_ASSINATURA}`,
    '',
    `— ${NOME_PRODUTO}`,
  ].join('\n');

  return { assunto, texto };
}

function resumoDoAssunto(tipo: TipoDeAviso, s: Situacao, agora: Date): string {
  switch (tipo) {
    case 'teste-acabando': {
      const dias = s.fase === 'teste' ? diasAte(s.ate, agora) : 0;
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

  const resumo: ResumoDosAvisos = { avaliadas: 0, enviados: 0, falhas: 0, semDestinatario: 0 };

  // Pagando em dia, encerrada e tirada do ar à mão não têm prazo correndo.
  const barbearias = await dbDono
    .select({
      id: tenants.id,
      nome: tenants.businessName,
      status: tenants.status,
      testeAte: tenants.trialEndsAt,
      atrasadaDesde: tenants.pastDueSince,
    })
    .from(tenants)
    .where(inArray(tenants.status, ['trial', 'past_due']))
    .orderBy(tenants.id);

  for (const b of barbearias) {
    resumo.avaliadas++;
    const s = situacaoDe(b, agora);
    const devido = avisoDevido(s, agora);
    if (!devido) continue;

    const donos = await dbDono
      .select({ nome: barbers.name, email: barbers.email })
      .from(barbers)
      .where(and(
        eq(barbers.tenantId, b.id),
        eq(barbers.role, 'admin'),
        eq(barbers.active, true),
        isNotNull(barbers.email),
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
        await enviarEmail({ para: dono.email!, ...textoDoAviso(devido.tipo, s, { barbearia: b.nome, nome: dono.nome, painel }, agora) });
      }
      resumo.enviados++;
    } catch (erro) {
      await dbDono.delete(avisosEnviados).where(and(eq(avisosEnviados.id, reserva.id), eq(avisosEnviados.tenantId, b.id)));
      resumo.falhas++;
      console.error(`[avisos] barbearia ${b.id}, ${devido.tipo}: o e-mail não saiu —`, erro instanceof Error ? erro.message : erro);
    }
  }

  return resumo;
}
