export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db, first } from '../../../../../db/index.js';
import { json } from '../../../../../lib/api.js';
import { getSession } from '../../../../../lib/session.js';
import { normalizePhone } from '../../../../../lib/phone.js';
import type { Tenant } from '../../../../../lib/tenant.js';
import { tenantDaSessao } from '../../../../../lib/tenant.js';
import { dataExiste } from '../../../../../lib/dataExiste.js';

const bodySchema = z.object({
  customerName:      z.string().min(2).max(100),
  customerPhone:     z.string().min(8).max(25),
  customerBirthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

// Plausibilidade da data (5–100 anos atrás)
function isPlausibleBirthdate(iso: string | null): boolean {
  if (iso === null) return true;
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return false;
  // `new Date` empurra 31/02 para 03/03 em silêncio; a data tem de voltar igual.
  // Gravada torta, o cliente não entrava mais na área dele (26/10/2026).
  if (!dataExiste(iso)) return false;
  const now = new Date();
  const minDate = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
  const maxDate = new Date(now.getFullYear() - 5,   now.getMonth(), now.getDate());
  return d >= minDate && d <= maxDate;
}

interface DadosDoCliente {
  nome:      string;
  telefone:  string;
  nascimento: string | null;
  editorId:  number;
  quando:    string;
}

// Busca o appointment e seu telefone normalizado
function buscarAppointment(id: number, tenant: Tenant) {
  return first(db.execute<{ id: number; customer_phone: string; barber_id: number }>(sql`
    SELECT id, customer_phone, barber_id FROM appointments
     WHERE id = ${id} AND tenant_id = ${tenant.id}
  `));
}

/**
 * Atualiza TODOS os appointments do mesmo telefone **desta barbearia**.
 *
 * ⚠️ O telefone NÃO é escopado por barbearia: o mesmo cliente pode cortar
 * cabelo em duas. Sem `tenant_id` no WHERE, esta função reescreveria o nome e a
 * data de nascimento do cliente na barbearia do vizinho.
 *
 * (coluna de telefone já normalizada).
 *
 * `RETURNING id` substitui o `result.changes` do better-sqlite3: no driver do
 * Postgres a contagem de linhas afetadas não vem no mesmo formato, e devolver
 * os ids é o jeito que não depende de detalhe do driver.
 */
async function propagarPorTelefone(
  d: DadosDoCliente, telefoneOriginal: string, tenant: Tenant, soDoBarbeiro: number | null,
): Promise<number> {
  // ⚠️ O barbeiro comum propaga só nos agendamentos DELE (26/10/2026). Antes, a
  // permissão era conferida só no agendamento do pedido e a gravação alcançava os
  // de todos os colegas: e telefone e nascimento são o login da área do cliente —
  // um barbeiro trancava o cliente para fora, ou trocava pelo próprio número e
  // entrava como ele. O dono continua propagando em todos.
  const filtroDoBarbeiro = soDoBarbeiro === null ? sql`` : sql` AND barber_id = ${soDoBarbeiro}`;
  const linhas = await db.execute<{ id: number }>(sql`
    UPDATE appointments
       SET customer_name = ${d.nome},
           customer_phone = ${d.telefone},
           customer_birthdate = ${d.nascimento},
           last_modified_by_id = ${d.editorId},
           last_modified_at = ${d.quando}
     WHERE tenant_id = ${tenant.id} AND customer_phone = ${telefoneOriginal}${filtroDoBarbeiro}
    RETURNING id
  `);
  return linhas.length;
}

// Atualiza só esse appointment (fallback)
async function atualizarUm(d: DadosDoCliente, id: number, tenant: Tenant): Promise<number> {
  const linhas = await db.execute<{ id: number }>(sql`
    UPDATE appointments
       SET customer_name = ${d.nome},
           customer_phone = ${d.telefone},
           customer_birthdate = ${d.nascimento},
           last_modified_by_id = ${d.editorId},
           last_modified_at = ${d.quando}
     WHERE id = ${id} AND tenant_id = ${tenant.id}
    RETURNING id
  `);
  return linhas.length;
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  if (!isPlausibleBirthdate(parsed.data.customerBirthdate)) {
    return json({ error: 'Data de nascimento inválida' }, 400);
  }

  const appt = await buscarAppointment(id, tenant);
  if (!appt) return json({ error: 'Agendamento não encontrado' }, 404);

  if (session.role !== 'admin' && appt.barber_id !== session.barberId) {
    return json({ error: 'Sem permissão' }, 403);
  }

  const origPhoneKey = normalizePhone(appt.customer_phone);
  const newPhone     = normalizePhone(parsed.data.customerPhone);
  if (!newPhone) return json({ error: 'Telefone inválido — informe DDD + número' }, 400);

  const dados: DadosDoCliente = {
    nome:       parsed.data.customerName.trim(),
    telefone:   newPhone,
    nascimento: parsed.data.customerBirthdate,
    editorId:   session.barberId,
    quando:     new Date().toISOString(),
  };

  // Propaga se o telefone original tem >= 10 dígitos (chave estável)
  if (origPhoneKey.length >= 10) {
    const soDoBarbeiro = session.role === 'admin' ? null : session.barberId;
    const updated = await propagarPorTelefone(dados, origPhoneKey, tenant, soDoBarbeiro);
    return json({ ok: true, updated, propagated: true });
  }

  // Caso raro: telefone original muito curto, só atualiza esse
  const updated = await atualizarUm(dados, id, tenant);
  return json({ ok: true, updated, propagated: false });
};
