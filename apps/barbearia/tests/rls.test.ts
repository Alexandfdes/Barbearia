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
import { recriarSchema, listarMigrations, migrationSql } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let conn: ReturnType<typeof postgres>;
let db: typeof import('../src/db/index.js')['db'];
let dbDono: typeof import('../src/db/index.js')['dbDono'];
let comTenant: typeof import('../src/db/index.js')['comTenant'];

/** A barbearia como o middleware a entrega: o objeto inteiro, não só o id. */
const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null, fuso: 'America/Fortaleza' };

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

describe('o app consegue ASSUMIR o papel — sem isso nada funciona', () => {
  // ⚠️ Defeito encontrado em 13/09/2026, antes da migração de produção.
  //
  // A `0003` cria `barbearia_app`. Criar não dá o direito de assumir: `SET ROLE`
  // exige ser MEMBRO. Superusuário assume qualquer papel, e todo o
  // desenvolvimento rodou como `postgres` — então o buraco ficou invisível.
  //
  // Reproduzido contra Postgres 16.13 com um usuário comum `CREATEROLE`:
  // `CREATE ROLE` passa, e o `SET ROLE` seguinte devolve
  // "permission denied to set role". Em produção isso seria 500 em TODA
  // requisição, com a migration verde e o deploy verde.

  // ⚠️ `conn` NÃO serve aqui: o `beforeAll` a fecha depois de montar o schema.
  // Daqui para baixo quem fala com o banco é o pool do próprio app.

  it.skipIf(!TEM_BANCO)('o GRANT existe de verdade no banco, não só por ser superusuário', async () => {
    // `pg_has_role()` NÃO serve: para superusuário ele devolve true mesmo sem
    // concessão nenhuma, e é justamente o superusuário que escondeu o defeito.
    // `pg_auth_members` só tem linha se o GRANT da 0004 tiver rodado.
    const linhas = await dbDono.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_auth_members m
          JOIN pg_roles papel  ON papel.oid  = m.roleid
          JOIN pg_roles membro ON membro.oid = m.member
        WHERE papel.rolname = 'barbearia_app'
          AND membro.rolname = current_user
      ) AS concedido`);
    expect((linhas as unknown as { concedido: boolean }[])[0].concedido).toBe(true);
  });

  it.skipIf(!TEM_BANCO)('dentro da requisição o app É o papel restrito, não o dono', async () => {
    // Os casos acima provam a CONSEQUÊNCIA (a linha da outra barbearia some).
    // Este prova a CAUSA, e é o que quebraria primeiro sem a 0004: se o
    // `SET ROLE` falhasse, `comTenant` estouraria antes de chegar aqui.
    const dentro = await comTenant(BAYRON, async () => {
      const r = await db.execute(sql`SELECT current_user AS quem`);
      return (r as unknown as { quem: string }[])[0].quem;
    });
    const fora = await dbDono.execute(sql`SELECT current_user AS quem`);

    expect(dentro).toBe('barbearia_app');
    expect((fora as unknown as { quem: string }[])[0].quem).not.toBe('barbearia_app');
  });

  it('a migration que concede o papel continua existindo', () => {
    // Esta é a guarda que roda mesmo sem banco. Apagar a linha do GRANT não
    // quebraria nada rodando como superusuário — só em produção.
    const nomes = listarMigrations();
    const concessao = nomes.filter((n) => /GRANT barbearia_app TO/.test(migrationSql(n)));
    expect(concessao.length).toBeGreaterThan(0);
  });

  it('o boot para se o papel não puder ser assumido', () => {
    // Migration roda uma vez. Se a credencial do DATABASE_URL mudar depois, o
    // usuário novo não é membro de nada — e só o boot pega isso.
    const fonte = readFileSync('scripts/startup.mjs', 'utf8');
    expect(fonte).toMatch(/SET LOCAL ROLE barbearia_app/);
    expect(fonte).toMatch(/conferirPapelDoApp/);
  });
});

describe.skipIf(!TEM_BANCO)('toda tabela de barbearia tem a rede — inclusive as que vierem depois', () => {
  // ⚠️ Os casos acima provam que a política FUNCIONA, olhando `barbers` e
  // `services`. Não provam que ela EXISTE nas outras. A 0003 liga o RLS numa
  // lista escrita à mão; tabela nova com `tenant_id` que não passasse por uma
  // linha igual ficaria sem rede — e nada ficaria vermelho, porque toda consulta
  // que já filtra devolve o mesmo com e sem política.
  //
  // Escrito em 25/09/2026, junto com a `gallery_images` (0005): a primeira
  // tabela com `tenant_id` depois da 0003.
  interface Linha { tabela: string; rls: boolean; politicas: number }

  async function tabelasComTenant(): Promise<Linha[]> {
    const r = await dbDono.execute(sql`
      SELECT c.table_name AS tabela,
             cl.relrowsecurity AS rls,
             (SELECT COUNT(*)::int FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.table_name
                 AND p.policyname = 'tenant_isolado') AS politicas
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name
                      AND cl.relnamespace = 'public'::regnamespace
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      ORDER BY 1`);
    return r as unknown as Linha[];
  }

  it('RLS ligado e a política tenant_isolado em cada uma', async () => {
    const linhas = await tabelasComTenant();
    expect(linhas.length).toBeGreaterThanOrEqual(13); // as 12 da 0003 + gallery_images
    const semRede = linhas.filter((l) => !l.rls || l.politicas !== 1).map((l) => l.tabela);
    expect(semRede).toEqual([]);
  });

  it('a política é a MESMA em todas — nenhuma nasceu frouxa', async () => {
    // Uma política `USING (true)` com o nome certo passaria no caso acima.
    const r = await dbDono.execute(sql`
      SELECT DISTINCT qual, with_check, roles::text AS papeis, cmd
      FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolado'`);
    const formas = r as unknown as { qual: string; with_check: string; papeis: string; cmd: string }[];
    expect(formas).toHaveLength(1);
    expect(formas[0].qual).toMatch(/app\.tenant_id/);
    expect(formas[0].with_check).toMatch(/app\.tenant_id/);
    expect(formas[0].papeis).toBe('{barbearia_app}');
    expect(formas[0].cmd).toBe('ALL');
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

  it('a conexão do DONO só é usada onde olhar todas as barbearias é o trabalho', () => {
    // Cada arquivo novo nesta lista é um furo na rede. A lista fecha de
    // propósito: crescer exige passar por aqui e justificar.
    //
    // ⚠️ `sqlConn` entrou na busca em 14/09/2026. Antes a guarda só olhava
    // `dbDono`, e `sqlConn` — que é a MESMA conexão de dono, crua — passava por
    // baixo dela sem ninguém notar. Guarda que cobre um dos dois nomes da mesma
    // coisa é guarda que dá a impressão de existir.
    const PERMITIDOS = [
      'src/db/index.ts',                  // quem define os dois
      'src/pages/api/auth/login.ts',      // acha o barbeiro antes de saber a barbearia
      'src/pages/api/cadastrar.ts',       // cria a barbearia: ela ainda não existe para ter contexto
      'src/lib/redefinicaoDeSenha.ts',    // a senha nova: acha o barbeiro pelo telefone, como o login
      'src/lib/avisos.ts',                // a tarefa dos avisos: não vem de requisição de barbearia nenhuma
      'src/lib/cobranca.ts',              // o webhook da Asaas acha a barbearia pelo evento, e a cobrança grava em
                                          // `tenants`, que o papel do app só lê (0003)
      'src/lib/operadorBarbearias.ts',    // o painel do operador: lista TODAS as barbearias e muda `tenants`;
                                          // atrás da senha do operador (`lib/operador.ts`), sem dado de cliente
      'src/lib/operadorNumeros.ts',       // o Início e a Cobrança do operador: contagens de `tenants` e os eventos
                                          // da Asaas — do corpo, só o valor —, atrás da mesma senha
      'src/lib/operadorSistema.ts',       // a tela de Sistema: pergunta ao banco a versão, o tamanho e as migrations;
                                          // não lê tabela de barbearia nenhuma
      'src/lib/fusoDaBarbearia.ts',       // o fuso de Configurações mora em `tenants`, que o papel do app só lê
                                          // (0003): um UPDATE só, com o WHERE na barbearia da sessão
    ];

    const arquivos = [...globSync('src/**/*.ts'), ...globSync('src/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => /\b(dbDono|sqlConn)\b/.test(readFileSync(c, 'utf8')))
      .sort();

    expect(arquivos).toEqual(PERMITIDOS.sort());
  });
});
