export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';

/**
 * GET /api/admin/appointments/:id/history
 *
 * Retorna últimas N visitas (default 5) do mesmo cliente (por telefone normalizado),
 * EXCLUINDO o próprio agendamento atual.
 *
 * Resposta: { ok: true, history: [{ id, startsAt, status, serviceName, barberName, priceCents }], total }
 */

/**
 * Todo agregado desta rota (COUNT, SUM) volta do Postgres como bigint, que o
 * driver entrega em string pra não perder precisão. `num()` é o ponto único de
 * conversão — sem ele, `total` viraria "12" e a soma de gasto viraria
 * concatenação de texto em vez de aritmética.
 */
const num = (v: unknown): number => Number(v ?? 0);

function buscarAtual(id: number, tenant: Tenant) {
  return first(db.execute<{ customer_phone: string; barber_id: number }>(sql`
    SELECT customer_phone, barber_id FROM appointments
     WHERE id = ${id} AND tenant_id = ${tenant.id}
  `));
}

// Total de visitas (qualquer status) — pro card de stat.
// customer_phone armazenado normalizado → comparação direta com índice.
function contarVisitas(phone: string, tenant: Tenant) {
  return first(db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total FROM appointments
    WHERE tenant_id = ${tenant.id} AND customer_phone = ${phone}
  `));
}

function historico(phone: string, exceto: number, limite: number, tenant: Tenant) {
  return db.execute<{
    id: number; starts_at: string; status: string; price_cents: number;
    service_name: string; barber_name: string;
  }>(sql`
    SELECT
      a.id              AS id,
      a.starts_at       AS starts_at,
      a.status          AS status,
      a.price_cents     AS price_cents,
      s.name            AS service_name,
      b.name            AS barber_name
    FROM appointments a
    INNER JOIN services s ON s.id = a.service_id
    INNER JOIN barbers  b ON b.id = a.barber_id
    WHERE a.tenant_id = ${tenant.id} AND a.customer_phone = ${phone}
      AND a.id != ${exceto}
    ORDER BY a.starts_at DESC
    LIMIT ${limite}
  `);
}

// Estatísticas agregadas pra "ficha do cliente": gasto, contagens, 1ª visita.
function estatisticas(phone: string, tenant: Tenant) {
  return first(db.execute<{
    total: string; completed: string; no_show: string;
    spent_appts: string | null; first_visit: string | null;
  }>(sql`
    SELECT
      COUNT(*)                                                   AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)      AS completed,
      SUM(CASE WHEN status = 'no_show'   THEN 1 ELSE 0 END)      AS no_show,
      SUM(CASE WHEN status = 'completed' THEN price_cents ELSE 0 END) AS spent_appts,
      MIN(starts_at)                                             AS first_visit
    FROM appointments
    WHERE tenant_id = ${tenant.id} AND customer_phone = ${phone}
  `));
}

// Soma dos itens da comanda (ex.: produtos) só de atendimentos concluídos.
function gastoEmItens(phone: string, tenant: Tenant) {
  return first(db.execute<{ spent_items: string }>(sql`
    SELECT COALESCE(SUM(ai.price_cents), 0) AS spent_items
    FROM appointment_items ai
    INNER JOIN appointments a ON a.id = ai.appointment_id
    WHERE a.tenant_id = ${tenant.id} AND a.customer_phone = ${phone} AND a.status = 'completed'
  `));
}

// Serviço favorito = mais frequente entre visitas não-canceladas.
//
// `GROUP BY a.service_id, s.name`: o SQLite aceitava agrupar só por service_id
// e ainda selecionar s.name; o Postgres exige que toda coluna do SELECT esteja
// no GROUP BY ou dentro de agregado. Como service_id determina o nome, incluir
// s.name não muda o agrupamento.
function servicoFavorito(phone: string, tenant: Tenant) {
  return first(db.execute<{ name: string; c: string }>(sql`
    SELECT s.name AS name, COUNT(*) AS c
    FROM appointments a
    INNER JOIN services s ON s.id = a.service_id
    WHERE a.tenant_id = ${tenant.id} AND a.customer_phone = ${phone} AND a.status != 'cancelled'
    GROUP BY a.service_id, s.name
    ORDER BY c DESC, MAX(a.starts_at) DESC
    LIMIT 1
  `));
}

import { normalizePhone } from '../../../../../lib/phone.js';
import { tenantDaSessao, type Tenant } from '../../../../../lib/tenant.js';

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = await buscarAtual(id, tenant);
  if (!current) return json({ error: 'Agendamento não encontrado' }, 404);

  if (session.role !== 'admin' && current.barber_id !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  const phoneKey = normalizePhone(current.customer_phone);
  if (!phoneKey) return json({ ok: true, history: [], total: 0 });

  const limit = parseInt(url.searchParams.get('limit') ?? '5', 10);
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  // As seis consultas são independentes entre si — em rede, uma de cada vez
  // custaria seis idas ao banco só pra montar a ficha.
  const [totalRow, rows, statsRow, itemsRow, favRow] = await Promise.all([
    contarVisitas(phoneKey, tenant),
    historico(phoneKey, id, safeLimit, tenant),
    estatisticas(phoneKey, tenant),
    gastoEmItens(phoneKey, tenant),
    servicoFavorito(phoneKey, tenant),
  ]);

  // ── Stats agregados (ficha do cliente) ──────────────────────────────────────
  const completed = num(statsRow?.completed);
  const noShow    = num(statsRow?.no_show);
  const fechados  = completed + noShow;

  const stats = {
    totalCount:     num(statsRow?.total),
    completedCount: completed,
    noShowCount:    noShow,
    noShowRate:     fechados ? Math.round((noShow / fechados) * 1000) / 10 : 0,
    totalSpentCents: num(statsRow?.spent_appts) + num(itemsRow?.spent_items),
    firstVisitAt:   statsRow?.first_visit ?? null,
    favoriteService: favRow?.name ?? null,
  };

  return json({
    ok: true,
    total: num(totalRow?.total),
    stats,
    history: rows.map(r => ({
      id:           r.id,
      startsAt:     r.starts_at,
      status:       r.status,
      priceCents:   r.price_cents,
      serviceName:  r.service_name,
      barberName:   r.barber_name,
    })),
  });
};
