// A operação sem volta: o banco da barbearia mudando de SQLite para Postgres.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `scripts/carregar-sqlite.mjs` roda **uma vez na vida de cada barbearia**, com
// o sistema parado e o dono esperando. Não existe segunda tentativa boa: se a
// carga sair torta e o SQLite antigo já tiver sido descartado, o que se perde é
// o histórico de agendamento de um negócio que está funcionando.
//
// Ferramenta que roda uma vez só é exatamente a que ninguém testa — e a que
// menos pode falhar. Estes casos rodam a carga de verdade, contra um Postgres
// de verdade, a partir de um SQLite construído na hora com o mesmo schema.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
//   DATABASE_URL='postgres://.../barbearia_test' npx vitest run
//
// ⚠️ Recria o schema. Aponte para um banco de TESTE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, migrationSql } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** As tabelas que a carga copia, na ordem das chaves estrangeiras. */
const ORDEM = [
  'barbers', 'services', 'products', 'combos', 'settings', 'working_hours',
  'barber_services', 'appointments', 'appointment_items', 'product_sales',
  'reservations', 'time_off',
];

let sql: ReturnType<typeof postgres>;
let pasta: string;
let caminhoDb: string;

/** Só as tabelas — antes da 0001, que é quem cria o `tenant_id`. */
async function schemaAte0000(): Promise<void> {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await sql.unsafe(migrationSql(listarMigrations()[0]));
}

async function todasAsMigrations(): Promise<void> {
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of listarMigrations()) await sql.unsafe(migrationSql(f));
}

/**
 * Monta um SQLite com o mesmo schema do Postgres em 0000.
 *
 * Derivado do catálogo, não escrito à mão: coluna nova numa migration entra
 * aqui sozinha. Uma lista fixa envelheceria em silêncio e o teste passaria a
 * exercitar um schema que não existe mais.
 */
async function montarSqlite(): Promise<void> {
  const colunas = await sql<{ tabela: string; coluna: string; tipo: string; obrigatoria: boolean }[]>`
    SELECT table_name AS tabela, column_name AS coluna, data_type AS tipo,
           (is_nullable = 'NO') AS obrigatoria
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${ORDEM})
    ORDER BY table_name, ordinal_position`;

  rmSync(caminhoDb, { force: true });
  const db = new DatabaseSync(caminhoDb);
  const porTabela = new Map<string, typeof colunas>();
  for (const c of colunas) {
    if (!porTabela.has(c.tabela)) porTabela.set(c.tabela, [] as never);
    porTabela.get(c.tabela)!.push(c);
  }

  const tipoSqlite = (pg: string) =>
    pg === 'integer' || pg === 'bigint' || pg === 'boolean' ? 'INTEGER'
    : pg === 'real' || pg === 'double precision' || pg === 'numeric' ? 'REAL'
    : 'TEXT';

  for (const tabela of ORDEM) {
    const cs = porTabela.get(tabela) ?? [];
    db.exec(`CREATE TABLE "${tabela}" (${cs.map((c) => `"${c.coluna}" ${tipoSqlite(c.tipo)}`).join(', ')})`);
  }

  /** Valor plausível para uma coluna obrigatória. */
  const valor = (c: { coluna: string; tipo: string }, i: number) => {
    if (c.coluna === 'active') return 1;                       // vira boolean no Postgres
    // Coluna que aponta para outra tabela sempre aponta para a linha 1: as
    // chaves estrangeiras valem no Postgres, e a fixture semeia poucos pais.
    if (c.coluna.endsWith('_id')) return 1;
    if (c.tipo === 'integer' || c.tipo === 'bigint') return i;
    if (c.tipo === 'boolean') return 1;
    if (c.tipo === 'real' || c.tipo === 'double precision' || c.tipo === 'numeric') return 1;
    return `${c.coluna}-${i}`;
  };

  /** Insere `quantas` linhas com ids 1..quantas, preenchendo o obrigatório. */
  const semear = (tabela: string, quantas: number) => {
    const cs = (porTabela.get(tabela) ?? []).filter((c) => c.obrigatoria || c.coluna === 'id' || c.coluna === 'active');
    for (let i = 1; i <= quantas; i++) {
      const nomes = cs.map((c) => `"${c.coluna}"`).join(', ');
      const marcas = cs.map(() => '?').join(', ');
      // `i` entra no valor: colunas com UNIQUE (slug, manage_token) não podem repetir.
      const valores = cs.map((c) => (c.coluna === 'id' ? i : valor(c, i)));
      db.prepare(`INSERT INTO "${tabela}" (${nomes}) VALUES (${marcas})`).run(...(valores as never[]));
    }
  };

  semear('barbers', 2);
  semear('services', 3);
  semear('settings', 1);
  semear('appointments', 5);
  db.close();
}

/** Roda o carregador como processo, igual a quem digita o comando. */
function carregar(): { codigo: number; saida: string } {
  try {
    const saida = execFileSync('node', ['scripts/carregar-sqlite.mjs', caminhoDb], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL! },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { codigo: 0, saida };
  } catch (e) {
    const err = e as { status: number; stdout?: string; stderr?: string };
    return { codigo: err.status ?? 1, saida: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

beforeAll(() => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  pasta = mkdtempSync(join(tmpdir(), 'carga-'));
  caminhoDb = join(pasta, 'origem.db');
});

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql?.end({ timeout: 5 });
  rmSync(pasta, { recursive: true, force: true });
});

describe.skipIf(!TEM_BANCO)('a carga do SQLite para o Postgres', () => {
  it('copia as linhas e a contagem bate', async () => {
    await schemaAte0000();
    await montarSqlite();

    const r = carregar();
    expect(r.saida).toContain('contagem confere');
    expect(r.codigo).toBe(0);

    const [{ barbeiros }] = await sql`SELECT COUNT(*)::int AS barbeiros FROM barbers`;
    const [{ agendamentos }] = await sql`SELECT COUNT(*)::int AS agendamentos FROM appointments`;
    expect(barbeiros).toBe(2);
    expect(agendamentos).toBe(5);
  });

  it('preserva os ids — eles estão nos links já mandados para os clientes', async () => {
    // O link de gerenciar agendamento aponta para uma linha por id. Renumerar na
    // carga faria cada link antigo abrir o agendamento de outra pessoa.
    const ids = (await sql`SELECT id FROM appointments ORDER BY id`).map((r) => r.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('converte `active` de 0/1 para boolean', async () => {
    // Única conversão de tipo do porte inteiro. Passar o inteiro cru faria o
    // Postgres recusar a linha — ou pior, aceitar com o significado trocado.
    const [{ ativo }] = await sql`SELECT active AS ativo FROM barbers WHERE id = 1`;
    expect(ativo).toBe(true);
  });

  it('adianta a sequence — senão o primeiro agendamento novo colide', async () => {
    // Sem isto o próximo INSERT tentaria o id 1, que já existe: a barbearia
    // migra bem e quebra no primeiro cliente que tenta marcar horário.
    const [{ proximo }] = await sql`SELECT nextval('appointments_id_seq')::int AS proximo`;
    expect(proximo).toBeGreaterThan(5);
  });

  it('a 0001 encontra os dados e cria o tenant com backfill', async () => {
    for (const f of listarMigrations().slice(1)) await sql.unsafe(migrationSql(f));

    const tenants = await sql`SELECT id, slug FROM tenants`;
    expect(tenants).toHaveLength(1);

    const [{ orfas }] = await sql`SELECT COUNT(*)::int AS orfas FROM appointments WHERE tenant_id IS NULL`;
    expect(orfas).toBe(0);
  });

  it('RECUSA a segunda carga — rodar duas vezes duplicaria o histórico', async () => {
    await schemaAte0000();
    await montarSqlite();
    expect(carregar().codigo).toBe(0);

    const r = carregar();
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('RECUSANDO CARREGAR');

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM appointments`;
    expect(n).toBe(5); // nada duplicou
  });

  it('RECUSA quando a origem tem vazio onde o destino exige valor, e diz onde', async () => {
    // O banco barraria de qualquer jeito — está tudo numa transação, nada é
    // gravado. O que a guarda acrescenta é a lista: quem roda isto está com o
    // sistema parado, e "null value in column X" não diz quantas linhas, nem
    // quais tabelas, nem se falta mais alguma depois de corrigir essa.
    await schemaAte0000();
    await montarSqlite();

    const db = new DatabaseSync(caminhoDb);
    db.exec(`UPDATE "barbers" SET "name" = NULL WHERE id = 1`);
    db.close();

    const r = carregar();
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('vazio onde o destino exige valor');
    expect(r.saida).toContain('barbers.name: 1 linha(s)');

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM barbers`;
    expect(n).toBe(0); // recusou antes de escrever qualquer coisa
  });

  it('RECUSA carregar depois da 0001 — a ordem é obrigatória', async () => {
    // Carregar depois da 0001 deixa as linhas sem tenant_id. O banco até barra
    // (a coluna é NOT NULL), mas com uma mensagem que não diz o que fazer. Aqui
    // a recusa explica a ordem, que é o que alguém precisa às 6 da manhã.
    await todasAsMigrations();

    const r = carregar();
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('a 0001 já rodou');
  });
});
