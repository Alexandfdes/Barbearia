/**
 * Os dados da barbearia em planilha: a lista de clientes e todos os agendamentos,
 * em CSV, baixados pelo dono no painel (`PENDENCIAS-ABERTAS.md` §3.6 — feito em
 * 11/10/2026).
 *
 * É a resposta à pergunta que o dono faz antes de assinar — *"se eu sair, levo a
 * minha lista de clientes?"*. Por isso, decidido pelo dono no mesmo dia:
 *
 *  - **abre também com a barbearia fora do ar** — pela cobrança, pelo teste vencido
 *    ou por ter cancelado (`src/middleware.ts` libera estas duas rotas, como a do
 *    cartão). Quem saiu não fica refém dos próprios dados. Encerrada não entra no
 *    painel, e aí o caminho é o suporte;
 *  - **leva a data de nascimento**, com aviso na tela: é dado do cliente da
 *    barbearia, e o dono já a vê no painel — mas é também a senha da área do
 *    cliente, e o arquivo vazado deixa entrar no lugar dele.
 *
 * Só o dono baixa. Nunca sai daqui o link de desmarcar (`manage_token`) — é uma
 * credencial —, nem a chave de idempotência, nem id interno.
 *
 * ── O FORMATO: O EXCEL EM PORTUGUÊS ABRE COM DOIS CLIQUES ───────────────────
 *
 * `;` entre as colunas (a vírgula é a dos centavos), UTF-8 com BOM (sem ele, o
 * Excel lê "José" como "JosÃ©"), fim de linha CRLF, toda célula entre aspas.
 * Dinheiro sem "R$" ("40,00") e data como "15/03/2030", para virarem número e data
 * na planilha. Hora e dia no fuso da barbearia (regra 5 do `CLAUDE.md`).
 *
 * ⚠️ **Fórmula injetada.** O nome do cliente é digitado por qualquer pessoa no site
 * de agendamento. Célula que começa com `=`, `+`, `-`, `@`, tab ou retorno vira
 * FÓRMULA quando o dono abre o arquivo — `=HYPERLINK(...)` num nome de cliente é
 * um link plantado na planilha dele. Essas células saem com um apóstrofo na frente,
 * que o Excel não mostra e que desliga a fórmula.
 */
import { sql } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '../db/index.js';
import { TZ } from './timezone.js';
import { formatarTelefone } from './phone.js';

export const ROTA_DOS_CLIENTES = '/api/admin/exportar/clientes.csv';
export const ROTA_DOS_AGENDAMENTOS = '/api/admin/exportar/agendamentos.csv';

/** As duas rotas que o `src/middleware.ts` deixa abrir com a barbearia fora do ar. */
export const ROTAS_DA_EXPORTACAO: ReadonlySet<string> = new Set([ROTA_DOS_CLIENTES, ROTA_DOS_AGENDAMENTOS]);

const SEPARADOR = ';';
const FIM_DE_LINHA = '\r\n';
const BOM = '﻿';

type Valor = string | number | null | undefined;

/** Uma célula: entre aspas, aspas dobradas, fórmula desligada. */
export function celula(valor: Valor): string {
  if (valor === null || valor === undefined) return '""';
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function arquivoCsv(cabecalho: string[], linhas: Valor[][]): string {
  return BOM + [cabecalho, ...linhas].map((l) => l.map(celula).join(SEPARADOR)).join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

/** "40,00" — sem "R$", para a planilha ler como número. */
export function dinheiroDaPlanilha(centavos: number): string {
  return (Math.round(centavos) / 100).toFixed(2).replace('.', ',');
}

/** "1990-05-20" → "20/05/1990". Data de calendário: não passa por fuso nenhum. */
export function dataDeCalendario(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Um instante (ISO, ou o "aaaa-mm-dd hh:mm:ss" UTC das colunas `created_at`) no fuso da barbearia. */
export function noFuso(instante: string | null | undefined, formato: string): string {
  if (!instante) return '';
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(instante) ? `${instante.replace(' ', 'T')}Z` : instante;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatInTimeZone(d, TZ, formato);
}

const SITUACAO: Record<string, string> = {
  confirmed: 'Marcado', completed: 'Atendido', no_show: 'Faltou', cancelled: 'Desmarcado',
};
const QUEM_DESMARCOU: Record<string, string> = { customer: 'Cliente', barber: 'Barbeiro', admin: 'Dono' };
const QUEM_MARCOU: Record<string, string> = { customer: 'Cliente, pelo site', barber: 'Barbearia, pelo painel' };

/** O nome do arquivo baixado: `clientes-<endereço>-<dia>.csv`. */
export function nomeDoArquivo(tipo: 'clientes' | 'agendamentos', slug: string, agora: Date = new Date()): string {
  return `${tipo}-${slug}-${formatInTimeZone(agora, TZ, 'yyyy-MM-dd')}.csv`;
}

export function respostaCsv(nome: string, conteudo: string): Response {
  return new Response(conteudo, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ── Os agendamentos ─────────────────────────────────────────────────────────

interface LinhaDoAgendamento {
  id: number; starts_at: string; duration_minutes: number; customer_name: string; customer_phone: string;
  customer_birthdate: string | null; servico: string | null; barbeiro: string | null; price_cents: number;
  status: string; cancelled_by: string | null; notes: string | null; created_at: string; created_by: string;
}

interface Extra { appointment_id: number; name: string; price_cents: number }

export const CABECALHO_DOS_AGENDAMENTOS = [
  'Data', 'Hora', 'Duração (min)', 'Cliente', 'Telefone', 'Data de nascimento', 'Serviço', 'Barbeiro',
  'Preço (R$)', 'Extras (R$)', 'Itens extras', 'Situação', 'Desmarcado por', 'Observações',
  'Agendado em', 'Agendado por',
];

async function agendamentosComExtras(tenantId: number): Promise<{ ags: LinhaDoAgendamento[]; extras: Map<number, Extra[]> }> {
  const ags = await db.execute(sql`
    SELECT a.id, a.starts_at, a.duration_minutes, a.customer_name, a.customer_phone, a.customer_birthdate,
           s.name AS servico, b.name AS barbeiro, a.price_cents, a.status, a.cancelled_by, a.notes,
           a.created_at, a.created_by
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = ${tenantId}
      LEFT JOIN barbers  b ON b.id = a.barber_id  AND b.tenant_id = ${tenantId}
     WHERE a.tenant_id = ${tenantId}
     ORDER BY a.starts_at, a.id`) as unknown as LinhaDoAgendamento[];
  const itens = await db.execute(sql`
    SELECT appointment_id, name, price_cents FROM appointment_items
     WHERE tenant_id = ${tenantId} ORDER BY id`) as unknown as Extra[];
  const extras = new Map<number, Extra[]>();
  for (const i of itens) extras.set(i.appointment_id, [...(extras.get(i.appointment_id) ?? []), i]);
  return { ags, extras };
}

export async function arquivoDosAgendamentos(tenantId: number): Promise<{ conteudo: string; linhas: number }> {
  const { ags, extras } = await agendamentosComExtras(tenantId);
  const linhas = ags.map((a) => {
    const deste = extras.get(a.id) ?? [];
    return [
      noFuso(a.starts_at, 'dd/MM/yyyy'), noFuso(a.starts_at, 'HH:mm'), a.duration_minutes,
      a.customer_name, formatarTelefone(a.customer_phone), dataDeCalendario(a.customer_birthdate),
      a.servico ?? '', a.barbeiro ?? '', dinheiroDaPlanilha(a.price_cents),
      deste.length ? dinheiroDaPlanilha(deste.reduce((s, i) => s + i.price_cents, 0)) : '',
      deste.map((i) => i.name).join(', '),
      SITUACAO[a.status] ?? a.status, a.cancelled_by ? QUEM_DESMARCOU[a.cancelled_by] ?? a.cancelled_by : '',
      a.notes ?? '', noFuso(a.created_at, 'dd/MM/yyyy HH:mm'), QUEM_MARCOU[a.created_by] ?? a.created_by,
    ];
  });
  return { conteudo: arquivoCsv(CABECALHO_DOS_AGENDAMENTOS, linhas), linhas: linhas.length };
}

// ── Os clientes ─────────────────────────────────────────────────────────────

export const CABECALHO_DOS_CLIENTES = [
  'Nome', 'Telefone', 'Data de nascimento', 'Agendamentos', 'Atendidos', 'Faltas', 'Desmarcados',
  'Gasto nos atendimentos (R$)', 'Reservas de produto', 'Primeiro horário', 'Último horário',
];

interface Cliente {
  nome: string; nascimento: string | null; agendamentos: number; atendidos: number;
  faltas: number; desmarcados: number; gastoCentavos: number; reservas: number;
  primeiro: string | null; ultimo: string | null;
}

/**
 * Um cliente por TELEFONE — é como o produto reconhece a pessoa (a área do
 * cliente entra por ele). Quem só reservou produto, sem nunca agendar, também é
 * cliente e entra na lista. O nome é o do agendamento mais recente: gente
 * corrige o próprio nome entre uma visita e outra.
 */
export async function arquivoDosClientes(tenantId: number): Promise<{ conteudo: string; linhas: number }> {
  const { ags, extras } = await agendamentosComExtras(tenantId);
  const reservas = await db.execute(sql`
    SELECT customer_phone, customer_name, created_at FROM reservations
     WHERE tenant_id = ${tenantId} ORDER BY created_at, id`) as unknown as
    { customer_phone: string; customer_name: string; created_at: string }[];

  const porTelefone = new Map<string, Cliente>();
  const doTelefone = (tel: string): Cliente => {
    let c = porTelefone.get(tel);
    if (!c) {
      c = { nome: '', nascimento: null, agendamentos: 0, atendidos: 0, faltas: 0, desmarcados: 0,
            gastoCentavos: 0, reservas: 0, primeiro: null, ultimo: null };
      porTelefone.set(tel, c);
    }
    return c;
  };

  // Os agendamentos vêm em ordem de horário: o último a passar é o mais recente.
  for (const a of ags) {
    const c = doTelefone(a.customer_phone);
    c.agendamentos++;
    if (a.status === 'completed') {
      c.atendidos++;
      c.gastoCentavos += a.price_cents + (extras.get(a.id) ?? []).reduce((s, i) => s + i.price_cents, 0);
    }
    if (a.status === 'no_show') c.faltas++;
    if (a.status === 'cancelled') c.desmarcados++;
    c.nome = a.customer_name;
    if (a.customer_birthdate) c.nascimento = a.customer_birthdate;
    c.primeiro ??= a.starts_at;
    c.ultimo = a.starts_at;
  }
  for (const r of reservas) {
    const c = doTelefone(r.customer_phone);
    c.reservas++;
    // O nome da reserva só vale para quem nunca agendou: o do agendamento é o que a
    // barbearia usa na agenda.
    if (c.agendamentos === 0) c.nome = r.customer_name;
  }

  const linhas = [...porTelefone.entries()]
    .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(([tel, c]) => [
      c.nome, formatarTelefone(tel), dataDeCalendario(c.nascimento), c.agendamentos, c.atendidos, c.faltas,
      c.desmarcados, dinheiroDaPlanilha(c.gastoCentavos), c.reservas,
      noFuso(c.primeiro, 'dd/MM/yyyy'), noFuso(c.ultimo, 'dd/MM/yyyy'),
    ]);
  return { conteudo: arquivoCsv(CABECALHO_DOS_CLIENTES, linhas), linhas: linhas.length };
}
