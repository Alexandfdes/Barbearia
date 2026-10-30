/**
 * O e-mail do que o CLIENTE muda na agenda — agendou, desmarcou ou remarcou pelo
 * site. Decidido pelo dono em 11/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §2.33).
 *
 * Até aqui nada avisava: com a agenda do dia aberta, ela se atualizava sozinha a
 * cada minuto; fechada, o barbeiro descobria o cliente novo quando ele chegava na
 * porta — e o que desmarcou, esperando.
 *
 * ── QUEM RECEBE ──────────────────────────────────────────────────────────────
 *
 * O barbeiro do horário, se tiver e-mail; e o dono — todo admin ativo —, que vê a
 * barbearia toda. Na barbearia de uma pessoa só, os dois são o mesmo, e sai UM
 * e-mail. Cada um pode ser desligado pelo dono na tela da Equipe
 * (`barbers.avisar_agendamentos`, migration 0011). Rejeitados pelo dono: só o
 * dono, e só o barbeiro — este deixaria sem aviso quem não tem e-mail, que na
 * equipe é quase todo mundo.
 *
 * ── O QUE NUNCA ACONTECE ─────────────────────────────────────────────────────
 *
 * O aviso nunca derruba o agendamento: o cliente já marcou, e o e-mail é um
 * extra. Os destinatários são lidos DENTRO da requisição, porque a conexão é a da
 * barbearia (`comTenant`, RLS) e acaba com ela; o envio, não — um provedor lento
 * não segura a resposta ao cliente. Em produção sem `SMTP_URL` o envio recusa
 * (`lib/email.ts`), e aqui isso vira uma linha no log.
 *
 * O que o barbeiro faz pelo painel não avisa ninguém: quem fez já sabe. E a mesma
 * chave de idempotência devolve o agendamento que já existe — o aviso saiu na
 * primeira vez (`bookAppointment`, `criado`).
 *
 * ⚠️ Texto puro, como todo e-mail do sistema (`lib/email.ts`). O nome do cliente
 * vem do formulário público do agendamento.
 */
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db, first } from '../db/index.js';
import { appointmentItems, appointments, barbers, services } from '../db/schema.js';
import { enviarEmail, mascararEmail, normalizarEmail, type Email } from './email.js';
import { getSettings } from './settings.js';
import { urlDoPainel, type Tenant } from './tenant.js';
import { fusoDe } from './timezone.js';
import { diaDaSemana } from './calendario.js';
import { formatarTelefone } from './phone.js';
import { waLink, waPhone } from './whatsapp.js';
import { reais } from './dinheiro.js';
import { totalParaOCliente } from './valorDoAtendimento.js';
import { NOME_PRODUTO } from './produto.js';

export type MudancaNaAgenda = 'novo' | 'desmarcado' | 'remarcado';

export interface DestinatarioDoAviso {
  nome: string;
  email: string;
}

/** O agendamento como o aviso precisa dele — lido do banco, nunca do pedido. */
export interface AgendamentoDoAviso {
  cliente: string;
  telefone: string;
  servico: string;
  barbeiro: string;
  /** ISO, como `appointments.starts_at` guarda. */
  inicio: string;
  precoCentavos: number;
  /**
   * Os itens que vêm com o agendamento — o produto do combo, a separar para o cliente.
   * Até 17/10/2026 o e-mail dizia só "Corte — R$ 32": o barbeiro não ficava sabendo do
   * produto, e o total para o cliente era outro.
   */
  itens?: { nome: string; precoCentavos: number }[];
}

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** O dia DA BARBEARIA — às 21h30 de Fortaleza já é o dia seguinte em UTC. */
const diaDe = (iso: string, fuso: string) => formatInTimeZone(new Date(iso), fuso, 'yyyy-MM-dd');

/** "terça-feira, 13/10, às 09:00", no fuso da barbearia. */
export function quandoPorExtenso(iso: string, fuso: string): string {
  const d = new Date(iso);
  return `${DIAS[diaDaSemana(diaDe(iso, fuso))]}, ${formatInTimeZone(d, fuso, 'dd/MM')}, às ${formatInTimeZone(d, fuso, 'HH:mm')}`;
}

/** "ter 13/10 às 09:00" — o do assunto, que tem que caber na lista de e-mails. */
export function quandoCurto(iso: string, fuso: string): string {
  const d = new Date(iso);
  return `${DIAS_CURTOS[diaDaSemana(diaDe(iso, fuso))]} ${formatInTimeZone(d, fuso, 'dd/MM')} às ${formatInTimeZone(d, fuso, 'HH:mm')}`;
}

/**
 * O e-mail, pronto para ler. Exportado para o teste ler o que o barbeiro vai ler.
 *
 * Sem a data de nascimento do cliente e sem o link de gerenciar o agendamento: o
 * primeiro é dado que o barbeiro não precisa, e o segundo é a chave que desmarca.
 *
 * ⚠️ **Sem o nome do cliente, no assunto e no texto** (revisão de 27/10/2026): ele é texto
 * livre de qualquer pessoa no site, e o e-mail sai com o remetente do produto — "Agendamento
 * novo: FADELINE: regularize em http://golpe…" chegava ao dono como se fosse nosso. É a regra
 * do e-mail de boas-vindas (`api/cadastrar.ts`). O nome está na agenda, pelo link abaixo; o
 * telefone vai, só com dígitos.
 */
export function textoDoAvisoDeAgenda(
  tipo: MudancaNaAgenda,
  a: AgendamentoDoAviso,
  /** `fuso`: o da barbearia — o dia e a hora do e-mail são os dela. */
  contexto: { destinatario: string; barbearia: string; painel: string; fuso: string; inicioAnterior?: string | null },
): Pick<Email, 'assunto' | 'texto'> {
  const primeiroNome = contexto.destinatario.trim().split(/\s+/)[0];
  const telefone = formatarTelefone(a.telefone);
  const zap = waPhone(a.telefone);
  const { fuso } = contexto;
  const agenda = contexto.painel ? `${contexto.painel}/admin/dia/${diaDe(a.inicio, fuso)}` : '';

  const linhas: string[] = [primeiroNome ? `Olá, ${primeiroNome}.` : 'Olá.', ''];
  let assunto: string;

  if (tipo === 'novo') {
    assunto = `Agendamento novo: ${quandoCurto(a.inicio, fuso)}`;
    linhas.push(
      `Um cliente agendou pelo site da ${contexto.barbearia}:`,
      '',
      `  ${quandoPorExtenso(a.inicio, fuso)}`,
      `  ${a.servico} — ${reais(a.precoCentavos)}`,
      ...(a.itens ?? []).map((i) => `  + ${i.nome} — ${reais(i.precoCentavos)} (separar para o cliente)`),
      ...(a.itens?.length
        ? [`  Total para o cliente: ${reais(totalParaOCliente({ priceCents: a.precoCentavos, itemsCents: a.itens.reduce((s, i) => s + i.precoCentavos, 0) }))}`]
        : []),
      `  Com: ${a.barbeiro}`,
    );
  } else if (tipo === 'desmarcado') {
    assunto = `Desmarcado: ${quandoCurto(a.inicio, fuso)}`;
    linhas.push(
      'O cliente desmarcou, pelo link do agendamento, o horário de',
      `${quandoPorExtenso(a.inicio, fuso)} — ${a.servico}, com ${a.barbeiro}.`,
      '',
      'O horário ficou livre no site.',
    );
  } else {
    const antes = contexto.inicioAnterior ?? a.inicio;
    assunto = `Remarcado: ${quandoCurto(antes, fuso)} → ${quandoCurto(a.inicio, fuso)}`;
    linhas.push(
      'O cliente remarcou pelo link do agendamento:',
      '',
      `  Era:   ${quandoPorExtenso(antes, fuso)}`,
      `  Agora: ${quandoPorExtenso(a.inicio, fuso)}`,
      `  ${a.servico}, com ${a.barbeiro}`,
    );
  }

  linhas.push('', `WhatsApp do cliente: ${telefone}${zap ? ` — ${waLink(zap)}` : ''}`);
  if (agenda) linhas.push(`A agenda do dia: ${agenda}`);
  linhas.push(
    '',
    '—',
    `${NOME_PRODUTO}. Este e-mail sai quando um cliente agenda, desmarca ou remarca pelo site.`,
    'Para não receber mais, o dono da barbearia desliga na tela da Equipe, no painel.',
  );

  return { assunto, texto: linhas.join('\n') };
}

/**
 * Quem recebe: o barbeiro do horário e os donos, ativos, com e-mail CONFIRMADO e com
 * o aviso ligado. O e-mail repetido sai uma vez só — e o do barbeiro do horário vem
 * primeiro, para o "Olá" ser dele.
 */
export async function destinatariosDoAviso(tenant: Tenant, barbeiroDoHorario: number): Promise<DestinatarioDoAviso[]> {
  const linhas = await db
    .select({ id: barbers.id, nome: barbers.name, email: barbers.email })
    .from(barbers)
    .where(and(
      eq(barbers.tenantId, tenant.id),
      eq(barbers.active, true),
      eq(barbers.avisarAgendamentos, true),
      isNotNull(barbers.email),
      // Só e-mail confirmado (`lib/confirmacaoDeEmail.ts`): o aviso leva nomes digitados.
      isNotNull(barbers.emailConfirmadoEm),
      or(eq(barbers.id, barbeiroDoHorario), eq(barbers.role, 'admin')),
    ))
    .orderBy(barbers.id);

  const ordem = [...linhas.filter((l) => l.id === barbeiroDoHorario), ...linhas.filter((l) => l.id !== barbeiroDoHorario)];
  const vistos = new Set<string>();
  const saida: DestinatarioDoAviso[] = [];
  for (const l of ordem) {
    const email = normalizarEmail(l.email);
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    saida.push({ nome: l.nome, email });
  }
  return saida;
}

/**
 * Avisa o barbeiro e o dono. Nunca lança: o agendamento já está feito. Devolve
 * quantos e-mails foram mandados — para o teste.
 *
 * `enviar` existe para o teste simular o provedor que recusa.
 */
export async function avisarMudancaNaAgenda(p: {
  tenant: Tenant;
  tipo: MudancaNaAgenda;
  agendamentoId: number;
  /** Na remarcação: o horário de antes, ISO. */
  inicioAnterior?: string | null;
  enviar?: (e: Email) => Promise<unknown>;
}): Promise<number> {
  const enviar = p.enviar ?? enviarEmail;
  try {
    const appt = await first(db
      .select({
        barberId: appointments.barberId,
        cliente: appointments.customerName,
        telefone: appointments.customerPhone,
        inicio: appointments.startsAt,
        precoCentavos: appointments.priceCents,
        barbeiro: barbers.name,
        servico: services.name,
      })
      .from(appointments)
      .innerJoin(barbers, eq(barbers.id, appointments.barberId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(and(eq(appointments.id, p.agendamentoId), eq(appointments.tenantId, p.tenant.id))));
    if (!appt) return 0;
    const itens = await db.select({ nome: appointmentItems.name, precoCentavos: appointmentItems.priceCents })
      .from(appointmentItems)
      .where(and(eq(appointmentItems.appointmentId, p.agendamentoId), eq(appointmentItems.tenantId, p.tenant.id)))
      .orderBy(appointmentItems.id);

    const destinatarios = await destinatariosDoAviso(p.tenant, appt.barberId);
    if (destinatarios.length === 0) return 0;

    const barbearia = (await getSettings(p.tenant)).businessName;
    const painel = urlDoPainel();
    for (const d of destinatarios) {
      const conteudo = textoDoAvisoDeAgenda(p.tipo, { ...appt, itens }, {
        destinatario: d.nome, barbearia, painel, fuso: fusoDe(p.tenant), inicioAnterior: p.inicioAnterior,
      });
      const naoSaiu = (erro: unknown) => console.warn(
        `[agenda] o aviso "${p.tipo}" para ${mascararEmail(d.email)} não saiu:`,
        erro instanceof Error ? erro.message : erro,
      );
      // Sem `await`, de propósito: ver o cabeçalho. O `try` pega o envio que
      // estoura antes de devolver a promessa.
      try { enviar({ para: d.email, ...conteudo }).catch(naoSaiu); } catch (erro) { naoSaiu(erro); }
    }
    return destinatarios.length;
  } catch (erro) {
    console.error(`[agenda] não consegui montar o aviso "${p.tipo}" do agendamento ${p.agendamentoId}:`, erro);
    return 0;
  }
}
