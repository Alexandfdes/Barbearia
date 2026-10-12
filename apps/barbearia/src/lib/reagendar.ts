/**
 * Reagendamento atômico — o re-check de conflito e o UPDATE numa transação só.
 *
 * Existem dois caminhos para reagendar (painel do barbeiro e link do cliente
 * pelo manage_token) e eles faziam a MESMA transação com strings de erro
 * diferentes. Duplicado, era questão de tempo até um dos dois ganhar uma
 * correção que o outro não. Aqui é um lugar só.
 *
 * A validação de negócio (permissão, expediente, janela de datas) fica em cada
 * rota — o que mora aqui é só a parte que precisa ser atômica.
 */
import { sql } from 'drizzle-orm';
import { db, first } from '../db/index.js';
import { TRAVA_DE_HORARIO_DUPLO, violouExclusao } from './api.js';

export type ResultadoReagendamento =
  | { ok: true }
  | { ok: false; httpStatus: number; motivo: 'conflito_agendamento' | 'conflito_bloqueio' | 'status_mudou' };

interface Pedido {
  /**
   * De quem é o agendamento. Vem do resolvedor da rota, nunca do corpo.
   *
   * ⚠️ As três consultas abaixo filtram por ele, e não é redundante com o RLS.
   * `appointmentId` chega pela URL nos dois caminhos que chamam esta função —
   * sem o filtro na aplicação, o UPDATE tem uma parede só entre um id de outra
   * barbearia e a agenda dela.
   */
  tenantId:      number;
  appointmentId: number;
  barberId:      number;
  newStartIso:   string;
  newEndIso:     string;
  /** id do barbeiro que fez a edição; `null` quando quem reagenda é o cliente. */
  editorId:      number | null;
}

/** COUNT volta do Postgres como bigint → string. Sempre converter antes de comparar. */
const num = (v: unknown): number => Number(v ?? 0);

export async function reagendarAtomicamente(p: Pedido): Promise<ResultadoReagendamento> {
  try {
    return await reagendarNaTransacao(p);
  } catch (err) {
    // A trava do banco (migration 0015) pegou o que a checagem deixou passar: a
    // mesma resposta do conflito, e não um 500.
    if (violouExclusao(err, TRAVA_DE_HORARIO_DUPLO)) {
      return { ok: false as const, httpStatus: 409, motivo: 'conflito_agendamento' as const };
    }
    throw err;
  }
}

function reagendarNaTransacao(p: Pedido): Promise<ResultadoReagendamento> {
  return db.transaction(async (tx) => {
    // Equivalente ao `BEGIN IMMEDIATE` do SQLite: serializa as escritas do MESMO
    // barbeiro, pra que dois reagendamentos simultâneos não passem os dois pela
    // checagem abaixo. Cai sozinho no fim da transação. Mesmo lock usado em
    // `bookAppointment` — de propósito: reagendar e agendar disputam o mesmo
    // horário, então precisam disputar o mesmo lock. E o banco recusa sozinho
    // desde 12/10/2026 (`appointments_sem_horario_duplo`, migration 0015).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${p.barberId})`);

    const conflitoAppt = num((await first(tx.execute<{ c: string }>(sql`
      SELECT COUNT(*) AS c FROM appointments
      WHERE tenant_id = ${p.tenantId}
        AND barber_id = ${p.barberId}
        AND status IN ('confirmed','completed')
        AND id != ${p.appointmentId}
        AND starts_at < ${p.newEndIso}
        AND ends_at   > ${p.newStartIso}
    `)))?.c);
    if (conflitoAppt > 0) {
      return { ok: false as const, httpStatus: 409, motivo: 'conflito_agendamento' as const };
    }

    const conflitoOff = num((await first(tx.execute<{ c: string }>(sql`
      SELECT COUNT(*) AS c FROM time_off
      WHERE tenant_id = ${p.tenantId}
        AND (barber_id = ${p.barberId} OR barber_id IS NULL)
        AND starts_at < ${p.newEndIso}
        AND ends_at   > ${p.newStartIso}
    `)))?.c);
    if (conflitoOff > 0) {
      return { ok: false as const, httpStatus: 409, motivo: 'conflito_bloqueio' as const };
    }

    // `AND status = 'confirmed'` no WHERE: se outro processo cancelou entre o
    // SELECT da rota e este UPDATE, nenhuma linha volta e o reagendamento falha
    // em vez de ressuscitar um agendamento cancelado.
    //
    // `RETURNING id` no lugar de `result.changes` — a contagem de linhas do
    // better-sqlite3 não tem equivalente direto no driver do Postgres.
    const atualizadas = p.editorId === null
      ? await tx.execute<{ id: number }>(sql`
          UPDATE appointments
             SET starts_at = ${p.newStartIso}, ends_at = ${p.newEndIso}
           WHERE id = ${p.appointmentId} AND tenant_id = ${p.tenantId}
             AND status = 'confirmed'
          RETURNING id
        `)
      : await tx.execute<{ id: number }>(sql`
          UPDATE appointments
             SET starts_at = ${p.newStartIso}, ends_at = ${p.newEndIso},
                 last_modified_by_id = ${p.editorId},
                 last_modified_at = ${new Date().toISOString()}
           WHERE id = ${p.appointmentId} AND tenant_id = ${p.tenantId}
             AND status = 'confirmed'
          RETURNING id
        `);

    if (atualizadas.length === 0) {
      return { ok: false as const, httpStatus: 409, motivo: 'status_mudou' as const };
    }

    return { ok: true as const };
  });
}
