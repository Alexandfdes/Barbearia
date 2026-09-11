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
  /**
   * A barbearia desta requisição, inteira.
   *
   * O `id` já está gravado em `app.tenant_id` na conexão (é o que liga o RLS).
   * O objeto completo fica aqui porque `tenantAtual()` o entrega aos 12
   * componentes e layouts que renderizam o site — eles chamam
   * `await getSettings()` sem argumento e, até o passo 6, recebiam a barbearia
   * número 1 sempre.
   */
  tenant: { id: number; slug: string; status: string; domain: string | null };
  /** Drizzle amarrado à conexão reservada, que roda como `barbearia_app`. */
  db: PostgresJsDatabase<typeof schema>;
}

export const armazemTenant = new AsyncLocalStorage<ContextoTenant>();
