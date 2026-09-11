// Passo 5.1: o BANCO recusa cruzar barbearia — não o cuidado de quem escreveu a rota.
//
// POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE É DIFERENTE DOS OUTROS
//
// `tests/escopo-rotas.test.ts` prova que as 54 rotas filtram por tenant. É uma
// prova sobre o CÓDIGO ATUAL: vale até alguém escrever a rota 55 com pressa.
//
// Estes casos provam outra coisa. Eles rodam consultas DE PROPÓSITO ERRADAS —
// sem `WHERE tenant_id`, e até um `DELETE` sem cláusula nenhuma — e exigem que
// o banco devolva nada e apague nada. É a diferença entre "nós tomamos cuidado"
// e "não tem como acontecer".
//
// ⚠️ Um teste de RLS que só verifica "a suíte continua verde" não prova coisa
// alguma: RLS mal configurado é invisível pelo lado de dentro, porque toda
// consulta que já filtra por tenant devolve o mesmo resultado com e sem
// política. O que prova é a consulta errada sendo barrada.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let conn: ReturnType<typeof postgres>;
let db: typeof import('../src/db/index.js')['db'];
let dbDono: typeof import('../src/db/index.js')['dbDono'];
let comTenant: typeof import('../src/db/index.js')['comTenant'];

/** A barbearia como o middleware a entrega: o objeto inteiro, não só o id. */
const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null };

/** Quantos barbeiros a conexão ENXERGA — a consulta não filtra nada. */
async function barbeirosVisiveis(qual: typeof db): Promise<number> {
  const linhas = await qual.execute(sql`SELECT COUNT(*)::int AS n FROM barbers`);
  return Number((linhas as unknown as { n: number }[])[0].n);
}

beforeAll(async () => {
  if (!TEM_BANCO) return;

  conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);

  // Duas barbearias, cada uma com o seu barbeiro.
  await conn`INSERT INTO tenants (id, slug, business_name, status) VALUES
    (1, 'bayron', 'Barbearia Bayron', 'active'),
    (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await conn`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active) VALUES
    (1, 'Dono do Bayron', 'bayron', 'admin', 'x', true),
    (1, 'Barbeiro do Bayron', 'barbeiro', 'barber', 'x', true),
    (2, 'Dono da Vintage', 'vintage', 'admin', 'x', true)`;
  await conn`INSERT INTO services (tenant_id, name, slug, price_cents, active) VALUES
    (1, 'Corte do Bayron', 'corte-bayron', 4000, true),
    (2, 'Corte da Vintage', 'corte-vintage', 5000, true)`;
  await conn.end({ timeout: 5 });

  const mod = await import('../src/db/index.js');
  db = mod.db;
  dbDono = mod.dbDono;
  comTenant = mod.comTenant;
});

afterAll(async () => {
  if (!TEM_BANCO) return;
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o banco separa as barbearias sozinho', () => {
  it('dentro do contexto, a consulta SEM filtro só alcança a própria barbearia', async () => {
    // Esta é a prova. A consulta está errada de propósito — é o erro que uma
    // rota nova escreveria com pressa — e mesmo assim não vaza.
    const doBayron = await comTenant(BAYRON, () => barbeirosVisiveis(db));
    const daVintage = await comTenant(VINTAGE, () => barbeirosVisiveis(db));

    expect(doBayron).toBe(2);
    expect(daVintage).toBe(1);
  });

  it('o dono das tabelas continua enxergando tudo — é assim que a manutenção funciona', async () => {
    // Migrations, carga e provisionamento precisam olhar todas as barbearias.
    // Se o dono também ficasse cego, nada disso rodaria.
    expect(await barbeirosVisiveis(dbDono)).toBe(3);
  });

  it('GRAVAR na barbearia dos outros é recusado pelo banco', async () => {
    let recusa = '';
    try {
      await comTenant(VINTAGE, () => db.execute(sql`
        INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active)
        VALUES (1, 'Infiltrado', 'infiltrado', 'admin', 'x', true)`));
    } catch (e) {
      // O Drizzle embrulha o erro do Postgres; o motivo está na causa.
      const erro = e as { message?: string; cause?: { message?: string } };
      recusa = `${erro.message ?? ''} ${erro.cause?.message ?? ''}`;
    }

    expect(recusa).toMatch(/row-level security/i);
    expect(await barbeirosVisiveis(dbDono)).toBe(3); // nada entrou
  });

  it('um DELETE sem cláusula nenhuma não alcança a agenda da outra barbearia', async () => {
    // O pior comando possível, rodado pela barbearia errada.
    await comTenant(VINTAGE, () => db.execute(sql`DELETE FROM barbers`));

    // A Vintage apagou o dela; o Bayron continua inteiro.
    expect(await barbeirosVisiveis(dbDono)).toBe(2);
    expect(await comTenant(BAYRON, () => barbeirosVisiveis(db))).toBe(2);
  });

  it('um UPDATE sem cláusula nenhuma não mexe no preço da outra barbearia', async () => {
    await comTenant(VINTAGE, () => db.execute(sql`UPDATE services SET price_cents = 1`));

    const linhas = await dbDono.execute(sql`
      SELECT tenant_id, price_cents FROM services ORDER BY tenant_id`);
    const precos = (linhas as unknown as { tenant_id: number; price_cents: number }[]);
    expect(precos.find((p) => p.tenant_id === 1)?.price_cents).toBe(4000);
    expect(precos.find((p) => p.tenant_id === 2)?.price_cents).toBe(1);
  });

  it('a conexão volta limpa para o pool', async () => {
    // Se o papel ou o tenant sobrassem na conexão devolvida, a PRÓXIMA
    // requisição rodaria com o crachá da anterior — pior que não ter rede.
    await comTenant(VINTAGE, async () => { /* usa e devolve */ });

    const quem = await dbDono.execute(sql`
      SELECT current_user AS papel, current_setting('app.tenant_id', true) AS tenant`);
    const [linha] = quem as unknown as { papel: string; tenant: string | null }[];
    expect(linha.papel).not.toBe('barbearia_app');
    // ⚠️ Depois de um RESET a variável vira string VAZIA, não NULL — é por isso
    // que a política usa NULLIF. Aqui aceitamos as duas formas de "sem tenant".
    expect(linha.tenant === null || linha.tenant === '').toBe(true);
  });

  it('fora de qualquer requisição, `db` é o dono — e isso é decisão, não acidente', async () => {
    // Scripts, migrations e testes rodam fora de requisição e precisam de visão
    // completa. Quem garante que uma REQUISIÇÃO nunca cai aqui é o middleware,
    // coberto pelo caso abaixo.
    expect(await barbeirosVisiveis(db)).toBe(2);
  });
});

describe('a rede não tem furo por descuido', () => {
  it('o middleware embrulha toda requisição que tem tenant', () => {
    const fonte = readFileSync('src/middleware.ts', 'utf8');
    expect(fonte).toMatch(/comTenant\(/);
    // Lê o corpo inteiro dentro do contexto: o Astro devolve a página como
    // stream, e o que falta renderizar ainda consulta o banco.
    expect(fonte).toMatch(/arrayBuffer\(\)/);
  });

  it('`dbDono` só é usado onde olhar todas as barbearias é o trabalho', () => {
    // Cada arquivo novo nesta lista é um furo na rede. A lista fecha de
    // propósito: crescer exige passar por aqui e justificar.
    const PERMITIDOS = [
      'src/db/index.ts',                  // quem define os dois
      'src/pages/api/auth/login.ts',      // acha o barbeiro antes de saber a barbearia
    ];

    const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => /\bdbDono\b/.test(readFileSync(c, 'utf8')))
      .sort();

    expect(arquivos).toEqual(PERMITIDOS.sort());
  });
});
