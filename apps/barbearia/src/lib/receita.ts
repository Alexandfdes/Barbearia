/**
 * A receita de um período, no banco — o "Receita prevista" do Início, os cards "Esta
 * semana" e "Este mês" e o gráfico da semana.
 *
 * A conta é a de `lib/valorDoAtendimento.ts`, a mesma da agenda do dia: daqui sai só o que
 * ela precisa. Até 15/10/2026 o Início somava no banco só o preço do serviço dos
 * confirmados e concluídos — sem os extras da comanda e sem a venda avulsa, que a agenda
 * do dia somava —, e o mesmo "Receita prevista" mostrava dois números
 * (`docs/PENDENCIAS-ABERTAS.md` §2.43).
 *
 * O período vale como na agenda do dia: o agendamento pelo horário marcado (`starts_at`),
 * a venda avulsa pela hora da venda (`sold_at`), o início dentro e o fim fora.
 * `barbeiroId`: só os atendimentos e as vendas dele — o barbeiro que não é dono vê só os
 * seus —; `null`, os de todos.
 */
import { sql } from 'drizzle-orm';
import { db, first } from '../db/index.js';
import { receitaDe } from './valorDoAtendimento.js';

export async function receitaDoPeriodo(
  tenantId: number,
  inicioIso: string,
  fimIso: string,
  barbeiroId: number | null,
): Promise<{ centavos: number; considerados: number }> {
  // Todo atendimento do período, de qualquer situação: quem decide o que conta é a regra,
  // não um `WHERE` que teria de mudar junto com ela.
  const atendimentos = await db.execute<{ status: string; price_cents: number; itens_cents: string }>(sql`
    SELECT a.status, a.price_cents,
           COALESCE((SELECT SUM(ai.price_cents) FROM appointment_items ai
                      WHERE ai.appointment_id = a.id AND ai.tenant_id = ${tenantId}), 0) AS itens_cents
      FROM appointments a
     WHERE a.tenant_id = ${tenantId}
       AND a.starts_at >= ${inicioIso} AND a.starts_at < ${fimIso}
       AND (${barbeiroId}::int IS NULL OR a.barber_id = ${barbeiroId}::int)
  `);
  // SUM volta como bigint, que o driver entrega em texto: sem o Number(), "5000" + "3000"
  // viraria "50003000".
  const vendas = await first(db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(price_cents), 0) AS total FROM product_sales
     WHERE tenant_id = ${tenantId}
       AND sold_at >= ${inicioIso} AND sold_at < ${fimIso}
       AND (${barbeiroId}::int IS NULL OR barber_id = ${barbeiroId}::int)
  `));
  return receitaDe(
    atendimentos.map((a) => ({ status: a.status, priceCents: Number(a.price_cents), itemsCents: Number(a.itens_cents) })),
    Number(vendas?.total ?? 0),
  );
}
