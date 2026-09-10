export const prerender = false;

import type { APIRoute } from 'astro';
import { formatInTimeZone } from 'date-fns-tz';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { sql } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { TZ } from '../../../../lib/timezone.js';


// Busca por telefone (customer_phone é só dígitos) OU por nome. Quando um dos
// padrões vem vazio ('') o lado correspondente é ignorado.
//
// ⚠️ ILIKE, não LIKE: no SQLite o LIKE já era case-insensitive para ASCII, no
// Postgres não é. Trocar por LIKE aqui faria a busca por nome parar de achar
// "joão" quando o barbeiro digita "João" — sem erro nenhum, só resultado vazio.
function buscar(phonePattern: string, namePattern: string) {
  return db.execute<RawRow>(sql`
    SELECT
      a.id              AS id,
      a.status          AS status,
      a.starts_at       AS starts_at,
      a.ends_at         AS ends_at,
      a.duration_minutes AS duration_minutes,
      a.price_cents     AS price_cents,
      a.customer_name   AS customer_name,
      a.customer_phone  AS customer_phone,
      a.manage_token    AS manage_token,
      a.cancelled_at    AS cancelled_at,
      b.name            AS barber_name,
      s.name            AS service_name
    FROM appointments a
    INNER JOIN barbers  b ON b.id = a.barber_id
    INNER JOIN services s ON s.id = a.service_id
    WHERE (${phonePattern} <> '' AND a.customer_phone ILIKE ${phonePattern})
       OR (${namePattern}  <> '' AND a.customer_name  ILIKE ${namePattern})
    ORDER BY a.starts_at DESC
    LIMIT 50
  `);
}

type RawRow = {
  id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_cents: number;
  customer_name: string;
  customer_phone: string;
  manage_token: string;
  cancelled_at: string | null;
  barber_name: string;
  service_name: string;
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);

  // Aceita ?q= (telefone OU nome). Mantém ?phone= por compatibilidade.
  const raw        = (url.searchParams.get('q') ?? url.searchParams.get('phone') ?? '').trim();
  const digits     = raw.replace(/\D/g, '');
  const hasLetters = /[a-zA-ZÀ-ÿ]/.test(raw);

  // Telefone: 4+ dígitos. Nome: 2+ caracteres (removendo curingas do LIKE).
  const phonePattern = digits.length >= 4 ? `%${digits}%` : '';
  const namePattern  = hasLetters && raw.length >= 2 ? `%${raw.replace(/[%_]/g, '')}%` : '';

  if (!phonePattern && !namePattern) {
    return json({ results: [], info: 'Digite ao menos 4 dígitos do telefone ou 2 letras do nome' });
  }

  const rows = await buscar(phonePattern, namePattern);

  const results = rows.map(r => ({
    id:              r.id,
    status:          r.status,
    customerName:    r.customer_name,
    customerPhone:   r.customer_phone,
    barberName:      r.barber_name,
    serviceName:     r.service_name,
    manageToken:     r.manage_token,
    durationMinutes: r.duration_minutes,
    priceCents:      r.price_cents,
    startsAt:        r.starts_at,
    endsAt:          r.ends_at,
    cancelledAt:     r.cancelled_at,
    dateLocal:       formatInTimeZone(new Date(r.starts_at), TZ, 'dd/MM/yyyy'),
    timeLocal:       formatInTimeZone(new Date(r.starts_at), TZ, 'HH:mm'),
  }));

  return json({ results, count: results.length });
};
