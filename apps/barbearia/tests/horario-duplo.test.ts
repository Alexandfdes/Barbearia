// O banco recusa dois agendamentos do mesmo barbeiro no mesmo horário — a
// migration 0015, o passo 7 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9.
//
// ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
//
// Até 12/10/2026 quem garantia era só o código: uma fila por barbeiro e a
// conferência do conflito antes de gravar (`src/lib/bookAppointment.ts` e
// `src/lib/reagendar.ts`). Um caminho novo que esquecesse as duas marcaria dois
// clientes na mesma cadeira, sem erro nenhum. Agora o banco recusa — e estes casos
// conferem a recusa SEM o código no meio: inserção direta, e duas conexões ao mesmo
// tempo, sem a fila.
//
// E conferem o que a migration faz com o que já estava no banco: par sobreposto de
// antes da trava não pode parar o boot — todas as barbearias sairiam do ar pelo
// histórico de uma —, então a trava passa a valer depois do último.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, migrationSql, recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const NOVA = '0015_horario_duplo.sql';
const TRAVA = /appointments_sem_horario_duplo/;
const FORMATO = /appointments_horario_utc/;

/** Um agendamento cru, como o app grava: horário em texto ISO, UTC, com milissegundos. */
const ag = (sql: postgres.Sql, o: { id?: number; barbeiro?: number; inicio: string; fim: string; status?: string; token: string }) =>
  sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                starts_at, ends_at, duration_minutes, price_cents, manage_token, status)
      VALUES (1, ${o.barbeiro ?? 1}, 1, 'Cliente', '84999990000', ${o.inicio}, ${o.fim}, 30, 4000, ${o.token}, ${o.status ?? 'confirmed'})`;

async function basico(sql: postgres.Sql) {
  await sql`INSERT INTO tenants (id, slug, business_name) VALUES (1, 'teste', 'Barbearia Teste')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active)
            VALUES (1, 1, 'Um', 'um', 'admin', 'x', true), (2, 1, 'Dois', 'dois', 'barber', 'x', true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES (1, 1, 'Corte', 'corte', 4000, true)`;
}

describe('a trava no código', () => {
  it('o agendamento e o reagendamento traduzem a recusa do banco no mesmo 409 do conflito', () => {
    for (const arquivo of ['src/lib/bookAppointment.ts', 'src/lib/reagendar.ts']) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).toMatch(/violouExclusao\(err, TRAVA_DE_HORARIO_DUPLO\)/);
    }
    expect(readFileSync('src/lib/api.ts', 'utf8')).toMatch(/TRAVA_DE_HORARIO_DUPLO = 'appointments_sem_horario_duplo'/);
  });
});

describe.skipIf(!TEM_BANCO)('com banco: o banco recusa sozinho', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await basico(sql);
  }, 60_000);
  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('banco novo: a trava vale para tudo, e a regra do formato vale para as linhas que existem', async () => {
    const regras = await sql`SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
                              WHERE conname IN ('appointments_sem_horario_duplo', 'appointments_horario_utc') ORDER BY conname`;
    expect(regras.map((r) => [r.conname, r.convalidated])).toEqual([['appointments_horario_utc', true], ['appointments_sem_horario_duplo', true]]);
    expect(regras[1].def).not.toMatch(/starts_at >=/);
  });

  it('o mesmo barbeiro, horários que se cruzam: o segundo é recusado', async () => {
    await ag(sql, { inicio: '2030-03-15T13:00:00.000Z', fim: '2030-03-15T13:30:00.000Z', token: 'a1' });
    await expect(ag(sql, { inicio: '2030-03-15T13:15:00.000Z', fim: '2030-03-15T13:45:00.000Z', token: 'a2' })).rejects.toThrow(TRAVA);
    // Dentro do outro inteiro também.
    await expect(ag(sql, { inicio: '2030-03-15T13:05:00.000Z', fim: '2030-03-15T13:10:00.000Z', token: 'a3' })).rejects.toThrow(TRAVA);
  });

  it('encostado não é cruzado — o que termina às 13:30 e o que começa às 13:30', async () => {
    await ag(sql, { inicio: '2030-03-15T13:30:00.000Z', fim: '2030-03-15T14:00:00.000Z', token: 'b1' });
    await ag(sql, { inicio: '2030-03-15T12:30:00.000Z', fim: '2030-03-15T13:00:00.000Z', token: 'b2' });
  });

  it('outro barbeiro, no mesmo horário: aceito', async () => {
    await ag(sql, { barbeiro: 2, inicio: '2030-03-15T13:15:00.000Z', fim: '2030-03-15T13:45:00.000Z', token: 'c1' });
  });

  it('cancelado e falta não ocupam a cadeira; concluído ocupa', async () => {
    await ag(sql, { inicio: '2030-03-15T13:00:00.000Z', fim: '2030-03-15T13:30:00.000Z', status: 'cancelled', token: 'd1' });
    await ag(sql, { inicio: '2030-03-15T13:00:00.000Z', fim: '2030-03-15T13:30:00.000Z', status: 'no_show', token: 'd2' });
    await expect(ag(sql, { inicio: '2030-03-15T13:10:00.000Z', fim: '2030-03-15T13:20:00.000Z', status: 'completed', token: 'd3' })).rejects.toThrow(TRAVA);
  });

  it('o cancelado não volta a confirmado por cima de outro', async () => {
    await expect(sql`UPDATE appointments SET status = 'confirmed' WHERE manage_token = 'd1'`).rejects.toThrow(TRAVA);
  });

  it('mover o agendamento 15 minutos, por cima do próprio horário antigo: aceito', async () => {
    await ag(sql, { inicio: '2030-03-16T10:00:00.000Z', fim: '2030-03-16T10:30:00.000Z', token: 'm1' });
    await sql`UPDATE appointments SET starts_at = '2030-03-16T10:15:00.000Z', ends_at = '2030-03-16T10:45:00.000Z'
               WHERE manage_token = 'm1'`;
    const [{ starts_at }] = await sql`SELECT starts_at FROM appointments WHERE manage_token = 'm1'`;
    expect(starts_at).toBe('2030-03-16T10:15:00.000Z');
  });

  it('mover para cima de outro horário também é recusado', async () => {
    await expect(sql`UPDATE appointments SET starts_at = '2030-03-15T13:20:00.000Z', ends_at = '2030-03-15T13:50:00.000Z'
                      WHERE manage_token = 'b1'`).rejects.toThrow(TRAVA);
  });

  it('horário fora do formato do app, ou o fim antes do começo: recusado', async () => {
    await expect(ag(sql, { inicio: '2030-03-20 13:00:00', fim: '2030-03-20 13:30:00', token: 'e1' })).rejects.toThrow(FORMATO);
    await expect(ag(sql, { inicio: '2030-03-20T13:00:00Z', fim: '2030-03-20T13:30:00Z', token: 'e2' })).rejects.toThrow(FORMATO);
    await expect(ag(sql, { inicio: '2030-03-20T13:30:00.000Z', fim: '2030-03-20T13:00:00.000Z', token: 'e3' })).rejects.toThrow(FORMATO);
    // Um lado só fora do formato também — a conferência do app compara os dois como texto.
    await expect(ag(sql, { inicio: '2030-03-20T13:00:00Z', fim: '2030-03-20T13:30:00.000Z', token: 'e4' })).rejects.toThrow(FORMATO);
    await expect(ag(sql, { inicio: '2030-03-20T13:00:00.000Z', fim: '2030-03-20T13:30:00Z', token: 'e5' })).rejects.toThrow(FORMATO);
  });

  it('duas conexões ao mesmo tempo, sem a fila do código: uma grava, a outra é recusada', async () => {
    const um = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const dois = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const primeira = um.begin(async (tx) => {
        await ag(tx as unknown as postgres.Sql, { inicio: '2030-03-21T10:00:00.000Z', fim: '2030-03-21T10:30:00.000Z', token: 'f1' });
        await new Promise((r) => setTimeout(r, 400)); // segura a transação aberta
      });
      await new Promise((r) => setTimeout(r, 100));
      // A segunda espera a primeira terminar — e então é recusada.
      const segunda = ag(dois, { inicio: '2030-03-21T10:15:00.000Z', fim: '2030-03-21T10:45:00.000Z', token: 'f2' });
      const [r1, r2] = await Promise.allSettled([primeira, segunda]);
      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('rejected');
      expect(String((r2 as PromiseRejectedResult).reason)).toMatch(TRAVA);
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM appointments WHERE manage_token IN ('f1', 'f2')`;
      expect(n).toBe(1);
    } finally {
      await um.end({ timeout: 5 });
      await dois.end({ timeout: 5 });
    }
  });

  it('o erro que chega ao app é reconhecido como a trava — pelo Drizzle, como nas rotas', async () => {
    const { db } = await import('../src/db/index.js');
    const { violouExclusao, TRAVA_DE_HORARIO_DUPLO } = await import('../src/lib/api.js');
    const { sql: dsql } = await import('drizzle-orm');
    let pego: unknown;
    try {
      await db.execute(dsql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                starts_at, ends_at, duration_minutes, price_cents, manage_token)
                            VALUES (1, 1, 1, 'Cliente', '84999990000', '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z', 30, 4000, 'g1')`);
    } catch (e) { pego = e; }
    expect(pego).toBeDefined();
    expect(violouExclusao(pego, TRAVA_DE_HORARIO_DUPLO)).toBe(true);
    expect(violouExclusao(pego, 'outra_restricao')).toBe(false);
    expect(violouExclusao(new Error('qualquer'), TRAVA_DE_HORARIO_DUPLO)).toBe(false);
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });
});

/** O boot de verdade — `scripts/startup.mjs`, o que roda a cada deploy. */
function boot(...args: string[]) {
  const r = spawnSync(process.execPath, ['scripts/startup.mjs', ...args], {
    env: { ...process.env, NODE_ENV: 'test' }, encoding: 'utf8',
  });
  return { status: r.status, saida: r.stdout + r.stderr };
}

describe.skipIf(!TEM_BANCO)('com banco: a 0015 num banco que já tinha horário sobreposto', () => {
  let sql: postgres.Sql;
  const agendamentos = () => sql`SELECT id, starts_at, ends_at, status FROM appointments ORDER BY id`;
  let antes: Awaited<ReturnType<typeof agendamentos>>;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const todas = listarMigrations();
    expect(todas).toContain(NOVA);
    // O banco como o boot o deixou na véspera da 0015.
    const r = boot(`--ate=${todas[todas.indexOf(NOVA) - 1].slice(0, 4)}`);
    expect(r.status, r.saida).toBe(0);
    await basico(sql);
    // O que o SQLite da máquina de desenvolvimento tem: pares do mesmo barbeiro que se cruzam,
    // de antes da trava — com o mesmo fim do último par, 03/06/2026 14:10 UTC.
    await ag(sql, { inicio: '2026-05-25T12:00:00.000Z', fim: '2026-05-25T12:40:00.000Z', token: 'h1' });
    await ag(sql, { inicio: '2026-05-25T12:30:00.000Z', fim: '2026-05-25T13:10:00.000Z', status: 'completed', token: 'h2' });
    await ag(sql, { inicio: '2026-06-03T13:30:00.000Z', fim: '2026-06-03T13:50:00.000Z', token: 'h3' });
    await ag(sql, { inicio: '2026-06-03T13:40:00.000Z', fim: '2026-06-03T14:10:00.000Z', status: 'completed', token: 'h4' });
    // Um que não se cruza com ninguém, depois do último par.
    await ag(sql, { inicio: '2026-07-01T12:00:00.000Z', fim: '2026-07-01T12:30:00.000Z', token: 'h5' });
    // E um horário fora do formato.
    await ag(sql, { inicio: '2026-05-01 10:00:00', fim: '2026-05-01 10:30:00', token: 'h6' });
    antes = await agendamentos();
  }, 60_000);
  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('o boot aplica a 0015 sem parar, não mexe em nenhum agendamento, e diz desde quando a trava vale', async () => {
    const r = boot();
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/→ 0015_horario_duplo\.sql \.\.\. ok/);
    expect(r.saida).toMatch(/horário duplo: o banco recusa a partir de 03\/06\/2026 14:10 UTC/);
    expect(r.saida).toMatch(/1 agendamento\(s\) com o horário fora do formato do app/);
    expect(await agendamentos()).toEqual(antes);
  });

  it('a trava vale a partir do fim do último par sobreposto; a regra do formato, só para o que vier', async () => {
    const regras = await sql`SELECT conname, convalidated, pg_get_constraintdef(oid) AS def FROM pg_constraint
                              WHERE conname IN ('appointments_sem_horario_duplo', 'appointments_horario_utc') ORDER BY conname`;
    expect(regras[0]).toMatchObject({ conname: 'appointments_horario_utc', convalidated: false });
    expect(regras[1].def).toMatch(/starts_at >= '2026-06-03T14:10:00\.000Z'/);
  });

  it('depois do corte, o banco recusa; antes dele, é o histórico — só o código confere', async () => {
    await expect(ag(sql, { inicio: '2026-07-01T12:15:00.000Z', fim: '2026-07-01T12:45:00.000Z', token: 'i1' })).rejects.toThrow(TRAVA);
    await ag(sql, { inicio: '2026-05-25T12:05:00.000Z', fim: '2026-05-25T12:15:00.000Z', status: 'completed', token: 'i2' });
    await expect(ag(sql, { inicio: '2026-07-02 10:00:00', fim: '2026-07-02 10:30:00', token: 'i3' })).rejects.toThrow(FORMATO);
  });

  it('o boot seguinte não reaplica nada, e diz a mesma coisa', () => {
    const r = boot();
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/Banco já estava em dia/);
    expect(r.saida).toMatch(/horário duplo: o banco recusa a partir de 03\/06\/2026 14:10 UTC/);
  });

  it('o horário fora do formato não aceita cancelar até ser corrigido — o que o aviso do boot diz', async () => {
    await expect(sql`UPDATE appointments SET status = 'cancelled' WHERE manage_token = 'h6'`).rejects.toThrow(FORMATO);
    await sql`UPDATE appointments SET starts_at = '2026-05-01T13:00:00.000Z', ends_at = '2026-05-01T13:30:00.000Z',
                                      status = 'cancelled' WHERE manage_token = 'h6'`;
  });

  it('a migration roda de novo, à mão, sem erro — e o corte continua o mesmo', async () => {
    await sql.unsafe(migrationSql(NOVA));
    const [trava] = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'appointments_sem_horario_duplo'`;
    expect(trava.def).toMatch(/starts_at >= '2026-06-03T14:10:00\.000Z'/);
  });
});

describe.skipIf(!TEM_BANCO)('com banco: o par sobreposto ainda está por vir', () => {
  let sql: postgres.Sql;
  const daqui = (dias: number, minutos = 0) => {
    const d = new Date(Date.now() + dias * 86_400_000);
    d.setUTCHours(13, minutos, 0, 0);
    return d.toISOString();
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const todas = listarMigrations();
    const r = boot(`--ate=${todas[todas.indexOf(NOVA) - 1].slice(0, 4)}`);
    expect(r.status, r.saida).toBe(0);
    await basico(sql);
    // Dois clientes na mesma cadeira daqui a dez dias.
    await ag(sql, { inicio: daqui(10), fim: daqui(10, 30), token: 'p1' });
    await ag(sql, { inicio: daqui(10, 15), fim: daqui(10, 45), token: 'p2' });
  }, 60_000);
  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('o boot avisa alto — a trava não vale até lá —, e desmarcar um e rodar a 0015 de novo resolve', async () => {
    const r = boot();
    expect(r.status, r.saida).toBe(0);
    expect(r.saida).toMatch(/⚠️ {2}horário duplo: o banco só recusa a partir de .* marcados para depois de agora/s);
    expect(r.saida).not.toMatch(/ⓘ horário duplo/);

    await sql`UPDATE appointments SET status = 'cancelled' WHERE manage_token = 'p2'`;
    await sql.unsafe(migrationSql(NOVA));
    const depois = boot();
    expect(depois.saida).toMatch(/✓ horário duplo: o banco recusa dois agendamentos/);
    await expect(ag(sql, { inicio: daqui(10, 15), fim: daqui(10, 45), token: 'p3' })).rejects.toThrow(TRAVA);
  });
});
