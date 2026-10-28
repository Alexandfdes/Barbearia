/**
 * Os agendamentos que a área do cliente mostra (`pages/cliente/index.astro`): todos os deste
 * telefone e desta data de nascimento, nesta barbearia, do mais novo para o mais velho —
 * cada um com a soma dos itens dele, para a área mostrar o que o cliente paga
 * (`totalParaOCliente`, em `lib/valorDoAtendimento.ts`).
 *
 * Até 15/10/2026 a consulta morava na página e não trazia os itens: a visita fechada com
 * mais R$ 30 de barba aparecia pelo preço do corte, e a página do agendamento, um clique
 * adiante, dizia o total (`docs/PENDENCIAS-ABERTAS.md` §2.43). Saiu da página para o teste
 * poder rodá-la contra um banco de verdade.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export interface AgendamentoDoCliente {
  id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_cents: number;
  /** A soma dos itens da comanda: os extras do fechamento e o produto do combo. */
  itens_cents: number;
  customer_name: string;
  customer_phone: string;
  manage_token: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  barber_name: string;
  service_name: string;
}

export async function agendamentosDoCliente(
  tenantId: number,
  telefone: string,
  nascimento: string,
): Promise<AgendamentoDoCliente[]> {
  const linhas = await db.execute<Omit<AgendamentoDoCliente, 'itens_cents'> & { itens_cents: string }>(sql`
    SELECT
      a.id              AS id,
      a.status          AS status,
      a.starts_at       AS starts_at,
      a.ends_at         AS ends_at,
      a.duration_minutes AS duration_minutes,
      a.price_cents     AS price_cents,
      COALESCE((SELECT SUM(ai.price_cents) FROM appointment_items ai
                 WHERE ai.appointment_id = a.id AND ai.tenant_id = ${tenantId}), 0) AS itens_cents,
      a.customer_name   AS customer_name,
      a.customer_phone  AS customer_phone,
      a.manage_token    AS manage_token,
      a.cancelled_at    AS cancelled_at,
      a.cancelled_by    AS cancelled_by,
      b.name            AS barber_name,
      s.name            AS service_name
    FROM appointments a
    INNER JOIN barbers  b ON b.id = a.barber_id
    INNER JOIN services s ON s.id = a.service_id
    WHERE a.tenant_id = ${tenantId} AND a.customer_phone = ${telefone}
      AND a.customer_birthdate = ${nascimento}
    ORDER BY a.starts_at DESC
  `);
  // SUM volta como bigint, que o driver entrega em texto.
  return linhas.map((l) => ({ ...l, itens_cents: Number(l.itens_cents) }));
}
