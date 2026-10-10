// `db.transaction()` DENTRO da requisição — do jeito que roda em produção.
//
// ── O DEFEITO, ACHADO EM 25/09/2026 ──────────────────────────────────────────
//
// `comTenant` reserva uma conexão do pool (`sqlConn.reserve()`) e entrega ao
// Drizzle. Só que a conexão reservada do postgres.js NÃO TEM `begin()` — o objeto
// dela expõe `unsafe`, `array`, `json`, `file` e pouco mais. E `db.transaction()`
// do Drizzle é, por dentro, `client.begin(...)`.
//
// Resultado: TODA transação dentro de uma requisição com barbearia estourava
// "this.client.begin is not a function". São seis: **o agendamento pelo site**,
// o reagendamento, concluir atendimento, retirar reserva, salvar expediente e
// criar barbeiro. Depois da migração para Postgres, o site do Bayron deixaria de
// aceitar agendamento — com a suíte inteira verde.
//
// Por que a suíte não via: os testes chamam as rotas FORA de `comTenant`, onde
// `db` é o pool do dono, que tem `begin()`. E os testes de RLS usam consultas
// soltas, nunca transação. Achado por acaso, ao testar o telefone repetido em
// `tests/telefone-unico.test.ts` rodando a rota como em produção.
//
// ⚠️ Os casos abaixo rodam SEMPRE dentro de `comTenant`. É o ponto deles.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

// Pool de UMA conexão: assim "a próxima requisição" pega a mesma conexão da
// anterior, e uma transação que ficasse aberta ou abortada apareceria no caso
// seguinte em vez de se esconder entre dez conexões.
const POOL_ANTES = process.env.DATABASE_POOL_MAX;
process.env.DATABASE_POOL_MAX = '1';

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null };
const VINTAGE = { id: 2, slug: 'vintage', status: 'active', domain: null };

let db: typeof import('../src/db/index.js')['db'];
let dbDono: typeof import('../src/db/index.js')['dbDono'];
let comTenant: typeof import('../src/db/index.js')['comTenant'];

async function nomesDosServicos(): Promise<string[]> {
  const r = await dbDono.execute(sql`SELECT name FROM services ORDER BY name`);
  return (r as unknown as { name: string }[]).map((l) => l.name);
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  const conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);
  await conn`INSERT INTO tenants (id, slug, business_name, status) VALUES
    (1, 'bayron', 'Barbearia Bayron', 'active'),
    (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await conn`INSERT INTO services (tenant_id, name, slug, price_cents, active) VALUES
    (1, 'Corte do Bayron', 'corte-bayron', 4000, true)`;
  await conn.end({ timeout: 5 });

  ({ db, dbDono, comTenant } = await import('../src/db/index.js'));
}, 30_000);

afterAll(async () => {
  if (POOL_ANTES === undefined) delete process.env.DATABASE_POOL_MAX;
  else process.env.DATABASE_POOL_MAX = POOL_ANTES;
  if (!TEM_BANCO) return;
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

const insere = (nome: string, tenantId = 1) => db.execute(sql`
  INSERT INTO services (tenant_id, name, slug, price_cents, active)
  VALUES (${tenantId}, ${nome}, ${nome.toLowerCase().replace(/\W+/g, '-')}, 1000, true)`);

describe.skipIf(!TEM_BANCO)('transação dentro da requisição', () => {
  it('abre, grava e confirma', async () => {
    await comTenant(BAYRON, () => db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO services (tenant_id, name, slug, price_cents, active)
        VALUES (1, 'Barba', 'barba', 3000, true)`);
    }));
    expect(await nomesDosServicos()).toContain('Barba');
  });

  it('erro no meio desfaz tudo — é para isso que a transação existe', async () => {
    await expect(comTenant(BAYRON, () => db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO services (tenant_id, name, slug, price_cents, active)
        VALUES (1, 'Sobrancelha', 'sobrancelha', 1500, true)`);
      throw new Error('falha depois de gravar');
    }))).rejects.toThrow('falha depois de gravar');
    expect(await nomesDosServicos()).not.toContain('Sobrancelha');
  });

  it('o RLS continua valendo dentro da transação', async () => {
    // A transação corre na MESMA conexão reservada, com o papel restrito e a
    // barbearia gravada. Se ela abrisse em outra conexão do pool, sairia como
    // dono — e enxergaria tudo.
    const vistos = await comTenant(VINTAGE, () => db.transaction(async (tx) => {
      const r = await tx.execute(sql`SELECT COUNT(*)::int AS n FROM services`);
      return (r as unknown as { n: number }[])[0].n;
    }));
    expect(vistos).toBe(0);

    let recusa = '';
    try {
      await comTenant(VINTAGE, () => db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO services (tenant_id, name, slug, price_cents, active)
          VALUES (1, 'Infiltrado', 'infiltrado', 1, true)`);
      }));
    } catch (e) {
      const erro = e as { message?: string; cause?: { message?: string } };
      recusa = `${erro.message ?? ''} ${erro.cause?.message ?? ''}`;
    }
    expect(recusa).toMatch(/row-level security/i);
    expect(await nomesDosServicos()).not.toContain('Infiltrado');
  });

  it('transação dentro de transação vira savepoint', async () => {
    await comTenant(BAYRON, () => db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO services (tenant_id, name, slug, price_cents, active)
        VALUES (1, 'Pezinho', 'pezinho', 1000, true)`);
      await expect(tx.transaction(async (interna) => {
        await interna.execute(sql`
          INSERT INTO services (tenant_id, name, slug, price_cents, active)
          VALUES (1, 'Luzes', 'luzes', 9000, true)`);
        throw new Error('desfaz só a interna');
      })).rejects.toThrow('desfaz só a interna');
    }));
    const nomes = await nomesDosServicos();
    expect(nomes).toContain('Pezinho');
    expect(nomes).not.toContain('Luzes');
  });

  it('duas transações ao mesmo tempo na mesma requisição são recusadas com o motivo', async () => {
    // Na conexão reservada elas se intercalariam: o COMMIT da primeira
    // confirmaria metade da segunda. Melhor recusar do que corromper.
    //
    // `allSettled`, não `all`: a primeira precisa terminar antes de a conexão
    // voltar para o pool — senão o COMMIT dela sairia numa conexão já devolvida.
    const resultados = await comTenant(BAYRON, () => Promise.allSettled([
      db.transaction(async (tx) => { await tx.execute(sql`SELECT pg_sleep(0.05)`); }),
      db.transaction(async (tx) => { await tx.execute(sql`SELECT 1`); }),
    ]));
    const recusas = resultados
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason as Error).message);
    expect(recusas).toHaveLength(1);
    expect(recusas[0]).toMatch(/uma transação por vez/i);
  });

  it('a conexão volta limpa para o pool mesmo depois de uma transação que falhou', async () => {
    // O pool deste arquivo tem UMA conexão (ver o topo): a próxima requisição
    // pega exatamente a que acabou de falhar.
    await comTenant(BAYRON, () => db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1`);
      throw new Error('x');
    })).catch(() => {});
    // Sem o ROLLBACK, a conexão voltaria "em transação abortada" e a próxima
    // requisição que a pegasse do pool levaria erro em toda consulta.
    const r = await comTenant(BAYRON, () => db.execute(sql`SELECT 1 AS ok`));
    expect((r as unknown as { ok: number }[])[0].ok).toBe(1);
    const quem = await dbDono.execute(sql`SELECT current_user AS papel`);
    expect((quem as unknown as { papel: string }[])[0].papel).not.toBe('barbearia_app');
  });

  it('consulta solta continua funcionando fora de transação', async () => {
    await comTenant(BAYRON, () => insere('Hidratação'));
    expect(await nomesDosServicos()).toContain('Hidratação');
  });
});
