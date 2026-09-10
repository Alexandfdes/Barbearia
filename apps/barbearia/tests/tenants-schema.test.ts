// Os 11 testes do passo 3: cada um TENTA violar uma regra do banco e espera
// levar não. Não é teste de "a migration roda" — é de "a migration barra".
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
//   DATABASE_URL='postgres://.../barbearia_test' npx vitest run
//
// ⚠️ Recria o schema. Aponte para um banco de TESTE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);

// ⚠️ Esta suíte roda DROP SCHEMA. A guarda recusa qualquer banco cujo nome não
// termine em _test — apontar DATABASE_URL para produção apagaria a barbearia.
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

function migrationSql(nome: string): string {
  for (const p of [`drizzle/${nome}`, `../../migracao-postgres/${nome}`]) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(`Migration ${nome} não encontrada. Ver migracao-postgres/LEIA-ME.md §2.`);
}

let sql: ReturnType<typeof postgres>;
let A = 0, B = 0;

beforeAll(async () => {
  if (!TEM_BANCO) return;
  // `onnotice` silenciado: a migration 0001 é toda `IF NOT EXISTS` e `RAISE
  // NOTICE`, então cada rodada cospe ~40 avisos do Postgres dizendo que está
  // funcionando ("already exists, skipping", "FK composta: ..."). São centenas de
  // linhas por suíte, e enterram o que interessa — inclusive uma falha de
  // verdade. Ver os avisos: rode a migration à mão no psql.
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of ['0000_init_postgres.sql', '0001_tenants.sql']) await sql.unsafe(migrationSql(f));
  // Os tenants são criados AQUI de propósito. A 0001 só cria o tenant de
  // backfill quando encontra dados antigos, e o banco de teste nasce vazio —
  // depender daquele INSERT era depender do seed, não do schema.
  await sql`INSERT INTO tenants (slug, business_name)
            VALUES ('bayron','Barbearia Bayron'), ('cortes-do-ze','Cortes do Zé')
            ON CONFLICT DO NOTHING`;
  [{ id: A }] = await sql`SELECT id FROM tenants WHERE slug='bayron'`;
  [{ id: B }] = await sql`SELECT id FROM tenants WHERE slug='cortes-do-ze'`;
});

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

/** Roda dentro de uma transação que SEMPRE desfaz, para um caso não sujar o outro. */
async function numaTransacao(fn: (t: postgres.TransactionSql) => Promise<void>) {
  const marca = Symbol('rollback');
  try {
    await sql.begin(async (t) => { await fn(t as postgres.TransactionSql); throw marca; });
  } catch (e) {
    if (e === marca) return null;
    return e as { constraint_name?: string; code?: string };
  }
  return null;
}

const barbeiro = (t: postgres.TransactionSql, tid: number, slug: string) =>
  t`INSERT INTO barbers (tenant_id,name,slug,role,password_hash)
    VALUES (${tid},'X',${slug},'admin','h') RETURNING id`;
const servico = (t: postgres.TransactionSql, tid: number, slug: string) =>
  t`INSERT INTO services (tenant_id,name,slug,price_cents)
    VALUES (${tid},'Corte',${slug},4000) RETURNING id`;
const agendar = (t: postgres.TransactionSql, tid: number, bid: number, sid: number, token: string) =>
  t`INSERT INTO appointments
    (tenant_id,barber_id,service_id,customer_name,customer_phone,starts_at,ends_at,
     duration_minutes,price_cents,status,manage_token,created_by)
    VALUES (${tid},${bid},${sid},'F','84','2026-09-10 10:00','2026-09-10 10:30',
            30,4000,'confirmed',${token},'customer') RETURNING id`;

describe.skipIf(!TEM_BANCO)('o que a migration 0001 tem que garantir', () => {
  it('mesmo slug de barbeiro em tenants diferentes é ACEITO', async () => {
    const erro = await numaTransacao(async (t) => {
      await barbeiro(t, A, 'joao'); await barbeiro(t, B, 'joao');
    });
    expect(erro).toBeNull();
  });

  it('slug de barbeiro repetido no mesmo tenant é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      await barbeiro(t, A, 'pedro'); await barbeiro(t, A, 'pedro');
    });
    expect(erro?.constraint_name).toBe('barbers_tenant_slug_uq');
  });

  it('slug de serviço repetido no mesmo tenant é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      await servico(t, A, 'corte-social'); await servico(t, A, 'corte-social');
    });
    expect(erro?.constraint_name).toBe('services_tenant_slug_uq');
  });

  it('agendamento apontando para barbeiro de OUTRO tenant é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      const [b] = await barbeiro(t, B, 'ze');
      const [s] = await servico(t, A, 'corte-a');
      await agendar(t, A, b.id, s.id, 'tok-cross');
    });
    expect(erro?.constraint_name).toContain('tenant_fkey');
  });

  it('agendamento apontando para serviço de OUTRO tenant é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      const [b] = await barbeiro(t, A, 'ana');
      const [s] = await servico(t, B, 'corte-b');
      await agendar(t, A, b.id, s.id, 'tok-cross2');
    });
    expect(erro?.constraint_name).toContain('tenant_fkey');
  });

  it('barber_services cruzando tenants é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      const [b] = await barbeiro(t, A, 'bs');
      const [s] = await servico(t, B, 'bs');
      await t`INSERT INTO barber_services (tenant_id,barber_id,service_id,duration_minutes)
              VALUES (${A},${b.id},${s.id},30)`;
    });
    expect(erro?.constraint_name).toContain('tenant_fkey');
  });

  it('manage_token repetido, mesmo entre tenants, é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      const [b1] = await barbeiro(t, A, 'x1'); const [s1] = await servico(t, A, 'x1');
      const [b2] = await barbeiro(t, B, 'x2'); const [s2] = await servico(t, B, 'x2');
      await agendar(t, A, b1.id, s1.id, 'tok-igual');
      await agendar(t, B, b2.id, s2.id, 'tok-igual');
    });
    expect(erro?.constraint_name).toContain('manage_token');
  });

  it('settings: uma linha por tenant, com id gerado sozinho', async () => {
    const erro = await numaTransacao(async (t) => {
      await t`INSERT INTO settings (tenant_id,business_name,short_name,whatsapp_number,address_street,address_city)
              VALUES (${A},'Bayron','Bayron','8499','Rua A','Mossoró')`;
      await t`INSERT INTO settings (tenant_id,business_name,short_name,whatsapp_number,address_street,address_city)
              VALUES (${B},'Zé','Zé','8498','Rua B','Mossoró')`;
    });
    expect(erro).toBeNull();
  });

  it('settings: duas linhas para o mesmo tenant é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      await t`INSERT INTO settings (tenant_id,business_name,short_name,whatsapp_number,address_street,address_city)
              VALUES (${A},'A','A','1','R','M')`;
      await t`INSERT INTO settings (tenant_id,business_name,short_name,whatsapp_number,address_street,address_city)
              VALUES (${A},'B','B','2','R','M')`;
    });
    expect(erro?.constraint_name).toBe('settings_tenant_uq');
  });

  it('tenant com status inválido é recusado', async () => {
    const erro = await numaTransacao(async (t) => {
      await t`INSERT INTO tenants (slug,business_name,status) VALUES ('z','Z','banido')`;
    });
    expect(erro?.constraint_name).toBe('tenants_status_valido');
  });

  it('linha sem tenant_id é recusada', async () => {
    const erro = await numaTransacao(async (t) => {
      await t`INSERT INTO barbers (name,slug,role,password_hash) VALUES ('sem','sem','admin','h')`;
    });
    expect(erro?.code).toBe('23502');
  });

  it('banco novo NÃO nasce com o tenant do Bayron', async () => {
    // A 0001 cria 'bayron' só para dar tenant_id aos dados que já existem. Num
    // banco recém-criado ela não deve criar nada: o cliente novo nasceria com o
    // subdomínio e o nome de outra barbearia (`PENDENCIAS-ABERTAS.md` §4.6).
    const s2 = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      await s2.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      for (const f of ['0000_init_postgres.sql', '0001_tenants.sql']) await s2.unsafe(migrationSql(f));
      const [{ c }] = await s2`SELECT COUNT(*)::int AS c FROM tenants`;
      expect(c).toBe(0);
    } finally {
      // devolve o schema como os outros casos esperam
      await s2.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      for (const f of ['0000_init_postgres.sql', '0001_tenants.sql']) await s2.unsafe(migrationSql(f));
      await s2`INSERT INTO tenants (slug, business_name)
               VALUES ('bayron','Barbearia Bayron'), ('cortes-do-ze','Cortes do Zé')
               ON CONFLICT DO NOTHING`;
      await s2.end();
    }
  });

  it('a migration roda duas vezes sem erro (idempotente)', async () => {
    await expect(sql.unsafe(migrationSql('0001_tenants.sql'))).resolves.toBeDefined();
  });
});
