/**
 * O tenant da requisição em curso, carregado pelo `AsyncLocalStorage`.
 *
 * Mora num arquivo só dele, sem importar mais nada, para quebrar o ciclo:
 * `db/index.ts` precisa do contexto para escolher a conexão, e quem cria o
 * contexto precisa da conexão de `db/index.ts`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema.js';

export interface ContextoTenant {
  /** A barbearia desta requisição. Já gravada em `app.tenant_id` na conexão. */
  tenantId: number;
  /** Drizzle amarrado à conexão reservada, que roda como `barbearia_app`. */
  db: PostgresJsDatabase<typeof schema>;
}

export const armazemTenant = new AsyncLocalStorage<ContextoTenant>();
