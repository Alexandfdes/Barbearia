// O cadastro com o termo PUBLICADO — a versão simulada aqui, porque o texto final ainda não existe
// (`src/lib/termos.ts`). É o dia em que o advogado devolve o texto: sem o aceite da versão que vale,
// a barbearia não nasce; com ele, a versão e a hora ficam gravadas junto dela (migration 0021).
//
// Arquivo à parte de `tests/termos.test.ts`: o `vi.mock` vale para o arquivo inteiro.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

vi.mock('../src/lib/termos.js', async (original) => ({
  ...(await original<typeof import('../src/lib/termos.js')>()),
  VERSAO_DOS_TERMOS: '2026-12-01',
}));

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const BASE = {
  nome: 'Barbearia Com Termo', dono: 'José da Silva', endereco: 'R. das Flores, 42', cidade: 'Mossoró',
  estado: 'RN', senha: 'segredo123', email: 'ze@exemplo.com.br',
};

describe.skipIf(!TEM_BANCO)('o cadastro com o termo publicado', () => {
  let sql: postgres.Sql;
  let POST: typeof import('../src/pages/api/cadastrar.js').POST;
  const antes = { aberto: process.env.CADASTRO_ABERTO, base: process.env.DOMINIO_BASE };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    process.env.CADASTRO_ABERTO = '1';
    process.env.DOMINIO_BASE = 'fadeline.com.br';
    ({ POST } = await import('../src/pages/api/cadastrar.js'));
  }, 30_000);

  afterAll(async () => {
    if (antes.aberto === undefined) delete process.env.CADASTRO_ABERTO; else process.env.CADASTRO_ABERTO = antes.aberto;
    if (antes.base === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = antes.base;
    await sql.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  const cadastrar = (slug: string, telefone: string, termos: unknown, ip: string) => POST({
    request: new Request('http://x/api/cadastrar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...BASE, slug, telefone, ...(termos === undefined ? {} : { termos }) }),
    }),
    clientAddress: ip,
  } as never);

  it('controle: a versão simulada chegou à rota', async () => {
    const termos = await import('../src/lib/termos.js');
    expect(termos.VERSAO_DOS_TERMOS).toBe('2026-12-01');
  });

  it('sem o aceite, não nasce — e a tela recebe o porquê, apontando a caixa', async () => {
    const r = await cadastrar('sem-aceite', '84999990201', undefined, '10.8.0.1');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({
      error: 'Para criar a barbearia, marque que leu e aceita o termo de uso e o aviso de privacidade.', campo: 'termos',
    });
    expect(await sql`SELECT 1 FROM tenants WHERE slug = 'sem-aceite'`).toHaveLength(0);
  }, 30_000);

  it('com o aceite de outra versão — a página aberta antes da troca —, 409 e nada criado', async () => {
    const r = await cadastrar('versao-velha', '84999990202', '2026-11-20', '10.8.0.2');
    expect(r.status).toBe(409);
    expect((await r.json()).campo).toBe('termos');
    expect(await sql`SELECT 1 FROM tenants WHERE slug = 'versao-velha'`).toHaveLength(0);
  }, 30_000);

  it('com o aceite da versão que vale: nasce, com a versão e a hora gravadas', async () => {
    const antesDoCadastro = Date.now();
    const r = await cadastrar('com-aceite', '84999990203', '2026-12-01', '10.8.0.3');
    expect(r.status).toBe(201);
    const [t] = await sql`SELECT termos_versao, termos_aceitos_em FROM tenants WHERE slug = 'com-aceite'`;
    expect(t.termos_versao).toBe('2026-12-01');
    const em = new Date(t.termos_aceitos_em).getTime();
    expect(em).toBeGreaterThanOrEqual(antesDoCadastro - 1000);
    expect(em).toBeLessThanOrEqual(Date.now() + 1000);
  }, 30_000);
});
