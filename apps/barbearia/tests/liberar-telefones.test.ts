// O operador libera os telefones da equipe de uma barbearia FORA DO AR (26/10/2026).
//
// Desde a 0017 o telefone de login é único só entre os barbeiros ativos. Mas a barbearia
// que sai do ar continua com a equipe ativa, e o dono fora do ar só alcança a tela de
// assinatura: o funcionário de um teste abandonado não entrava em outra barbearia nem
// cadastrava a dele. Só pelo `psql` — achado na varredura de 26/10/2026.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const DIA = 24 * 60 * 60 * 1000;
const PEDRO = '84988887777';

describe.skipIf(!TEM_BANCO)('liberar os telefones da equipe', () => {
  let sql: ReturnType<typeof postgres>;
  let op: typeof import('../src/lib/operadorBarbearias.js');
  let dbmod: typeof import('../src/db/index.js');

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const vencido = new Date(Date.now() - 20 * DIA).toISOString();
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at) VALUES
      (1, 'abandonada', 'Abandonada', 'trial', ${vencido}::timestamptz),
      (2, 'nova', 'Nova', 'active', NULL),
      (3, 'so-dono', 'Só Dono', 'trial', ${vencido}::timestamptz),
      (4, 'encerrada', 'Encerrada', 'cancelled', NULL)`;
    await sql`SELECT setval('tenants_id_seq', 4)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dono da Abandonada', 'dono', 'admin', 'x', true, '84911110001'),
      (2, 1, 'Pedro', 'pedro', 'barber', 'x', true, ${PEDRO}),
      (3, 2, 'Dona da Nova', 'dona', 'admin', 'x', true, '84911110003'),
      (4, 3, 'Dono Sozinho', 'dono', 'admin', 'x', true, '84911110004'),
      (5, 4, 'Dono da Encerrada', 'dono', 'admin', 'x', true, '84911110005'),
      (6, 4, 'Ana', 'ana', 'barber', 'x', true, '84911110006')`;
    await sql`SELECT setval('barbers_id_seq', 6)`;
    op = await import('../src/lib/operadorBarbearias.js');
    dbmod = await import('../src/db/index.js');
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  const entraNaNova = () => sql`
    INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active, phone)
    VALUES (2, 'Pedro na Nova', 'pedro', 'barber', 'x', true, ${PEDRO})`;

  it('antes: o número do Pedro, ativo na barbearia abandonada, não entra em outra', async () => {
    await expect(entraNaNova()).rejects.toThrow(/barbers_phone_ativo_uq/);
  });

  it('no ar, é recusado — quem desliga a equipe é o dono, na Equipe', async () => {
    await expect(op.liberarTelefones(2, '1.1.1.1')).rejects.toThrow(/fora do ar/);
    const [{ ativos }] = await sql`SELECT count(*)::int AS ativos FROM barbers WHERE tenant_id = 2 AND active`;
    expect(ativos).toBe(1);
  });

  it('fora do ar: desliga a equipe menos o dono, derruba as sessões e registra', async () => {
    const r = await op.liberarTelefones(1, '1.1.1.1');
    expect(r.desligados).toEqual(['Pedro']);
    const linhas = await sql<{ id: number; active: boolean; senha_trocada_em: string | null }[]>`
      SELECT id, active, senha_trocada_em FROM barbers WHERE tenant_id = 1 ORDER BY id`;
    expect(linhas.map((l) => [l.id, l.active])).toEqual([[1, true], [2, false]]);
    expect(linhas[1].senha_trocada_em).not.toBeNull();
    expect(linhas[0].senha_trocada_em).toBeNull();
    const [acao] = await sql`SELECT acao, detalhe FROM acoes_do_operador WHERE tenant_id = 1 ORDER BY id DESC LIMIT 1`;
    expect(acao.acao).toBe('liberou-telefones');
    expect(acao.detalhe).toEqual({ barbeiros: ['Pedro'] });
    expect(op.descreverAcao({ acao: 'liberou-telefones', detalhe: acao.detalhe, ip: null, quando: null, slug: 'abandonada', fuso: null }))
      .toBe('Liberou os telefones da equipe de abandonada — desligou Pedro');
  });

  it('depois: o Pedro entra na barbearia nova com o mesmo número', async () => {
    await expect(entraNaNova()).resolves.toBeDefined();
  });

  it('encerrada (saiu do produto) também libera', async () => {
    const r = await op.liberarTelefones(4, '1.1.1.1');
    expect(r.desligados).toEqual(['Ana']);
  });

  it('só o dono na equipe: nada a liberar, e diz isso', async () => {
    await expect(op.liberarTelefones(3, '1.1.1.1')).rejects.toThrow(/além do dono/);
  });

  it('o botão aparece fora do ar e encerrada, e a rota leva à função', async () => {
    const { readFileSync } = await import('node:fs');
    const acoes = readFileSync('src/components/operador/AcoesDaBarbearia.astro', 'utf8');
    expect(acoes).toMatch(/\(b\.tela\.tom === 'fora' \|\| b\.tela\.tom === 'encerrada'\) && \(/);
    expect(acoes).toContain('data-acao="liberar-telefones"');
    const rota = readFileSync('src/pages/api/operador/acao.ts', 'utf8');
    expect(rota).toMatch(/z\.literal\('liberar-telefones'\)/);
    expect(rota).toMatch(/await liberarTelefones\(d\.barbearia, ip\)/);
  });
});
