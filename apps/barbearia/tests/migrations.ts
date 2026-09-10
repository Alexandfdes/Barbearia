/**
 * Aplica TODAS as migrations num banco de teste, lendo a pasta `drizzle/`.
 *
 * ⚠️ Lê a pasta de propósito, em vez de uma lista escrita à mão.
 *
 * Antes, cada arquivo de teste trazia sua própria lista
 * (`['0000_init_postgres.sql', '0001_tenants.sql']`), repetida em quatro
 * lugares. Migration nova exigia lembrar de atualizar as quatro — e o teste que
 * ficasse para trás não falhava de forma útil: ele rodava contra um schema
 * antigo e acusava "column does not exist" num teste sem relação nenhuma com a
 * migration esquecida.
 *
 * Ler a pasta é o mesmo que `scripts/startup.mjs` faz em produção. Uma fonte só.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type postgres from 'postgres';

/** Onde as migrations moram, do ponto de vista de quem roda o vitest. */
const PASTA = 'drizzle';

export function listarMigrations(): string[] {
  if (!existsSync(PASTA)) {
    throw new Error(
      `Pasta ${PASTA}/ não encontrada. Aplique o passo 2 primeiro:\n` +
      `  cp migracao-postgres/0000_init_postgres.sql apps/barbearia/drizzle/\n` +
      `Ver migracao-postgres/LEIA-ME.md §2.`
    );
  }
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort();
  if (arquivos.length === 0) throw new Error(`Nenhuma migration em ${PASTA}/.`);
  return arquivos;
}

export function migrationSql(nome: string): string {
  return readFileSync(join(PASTA, nome), 'utf8');
}

/** Derruba o schema e reconstrói do zero, na ordem dos arquivos. */
export async function recriarSchema(sql: postgres.Sql): Promise<void> {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of listarMigrations()) {
    await sql.unsafe(migrationSql(f));
  }
}
