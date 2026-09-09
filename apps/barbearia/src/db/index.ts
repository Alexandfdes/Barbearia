/**
 * Conexão com o Postgres.
 *
 * Passo 2 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9: o banco deixa de ser um
 * arquivo SQLite por barbearia e passa a ser um Postgres único.
 *
 * ⚠️ O export `sqlite` (better-sqlite3) NÃO existe mais. Quem usava SQL cru por
 * ele — `lib/bookAppointment.ts` e `pages/admin/index.astro` — passa a usar a
 * API assíncrona do Drizzle ou `sqlConn` para SQL literal.
 *
 * Onde o Postgres roda (VPS ou gerenciado) é decisão de infraestrutura e não
 * aparece aqui: entra inteira na `DATABASE_URL`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL não definido. Exemplo: postgres://usuario:senha@host:5432/barbearia'
  );
}

/**
 * Conexão para SQL literal (`sqlConn\`SELECT ...\``), usada onde o Drizzle não
 * expressa bem — agregações do painel, por exemplo.
 *
 * `max` limita o pool: com dois apps no mesmo Postgres, somar pools maiores que
 * o `max_connections` do servidor derruba os dois ao mesmo tempo.
 */
export const sqlConn = postgres(url, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  // As colunas de data são TEXT com ISO string, não timestamptz — o driver não
  // deve tentar converter nada sozinho. Ver o comentário no schema.
  transform: { undefined: null },
});

export const db = drizzle(sqlConn, { schema });

/**
 * Primeira linha de uma consulta, ou `undefined`.
 *
 * Substitui o `.get()` do better-sqlite3, que não existe no driver do Postgres.
 * Mantido como helper em vez de `(await q)[0]` espalhado: fica um lugar só se
 * um dia valer a pena acrescentar `LIMIT 1` automático.
 */
export async function first<T>(q: PromiseLike<T[]>): Promise<T | undefined> {
  return (await q)[0];
}
