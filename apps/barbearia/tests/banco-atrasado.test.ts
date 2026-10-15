// O banco atrás do código, no `npm run dev` (`src/lib/bancoAtrasado.ts`).
//
// POR QUE ESTE TESTE EXISTE
//
// Em 13/10/2026 o servidor de desenvolvimento do dono, ligado desde a véspera, recebeu a 0015
// e a 0016 com o código novo: o Astro recarrega o código sozinho, e as migrations só se
// aplicam quando o `npm run dev` liga. Toda página caiu em "Failed query: select …
// carencia_ate … from tenants", sem dizer o que fazer (`docs/PENDENCIAS-ABERTAS.md` §2.42).
//
// A parte que lê o banco precisa de Postgres; a conta e a tela, não.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, recriarSchema } from './migrations.js';
import {
  aplicadasNoBanco, esquecerChecagem, faltamNoBanco, migrationsQueFaltam, respostaDoBancoAtrasado,
} from '../src/lib/bancoAtrasado.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const PASTA = ['0000_a.sql', '0001_b.sql', '0002_c.sql'];

describe('a conta: o que está na pasta e não no banco', () => {
  beforeEach(() => esquecerChecagem());

  it('as que faltam, na ordem da pasta — e nada, se o banco não respondeu', async () => {
    expect(await migrationsQueFaltam(PASTA, async () => new Set(['0000_a.sql']))).toEqual(['0001_b.sql', '0002_c.sql']);
    expect(await migrationsQueFaltam(PASTA, async () => new Set(PASTA))).toEqual([]);
    expect(await migrationsQueFaltam(PASTA, async () => new Set())).toEqual(PASTA);
    expect(await migrationsQueFaltam(PASTA, async () => null)).toBeNull();
  });

  it('pergunta ao banco só quando precisa: a pasta mudou, ou falta alguma há mais de 2 segundos', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let pasta = [...PASTA];
    let noBanco = new Set(['0000_a.sql', '0001_b.sql']);
    let perguntas = 0;
    const ler = () => pasta;
    const consultar = async () => { perguntas++; return new Set(noBanco); };

    expect(await faltamNoBanco(0, ler, consultar)).toEqual(['0002_c.sql']);
    expect(perguntas).toBe(1);
    expect(await faltamNoBanco(500, ler, consultar)).toEqual(['0002_c.sql']);   // dentro dos 2 s: a mesma resposta
    expect(perguntas).toBe(1);
    expect(await faltamNoBanco(2100, ler, consultar)).toEqual(['0002_c.sql']);  // passou dos 2 s: pergunta de novo
    expect(perguntas).toBe(2);

    noBanco = new Set(PASTA);                                                    // alguém aplicou por fora
    expect(await faltamNoBanco(4500, ler, consultar)).toEqual([]);              // a tela sai sozinha
    expect(perguntas).toBe(3);
    expect(await faltamNoBanco(60_000, ler, consultar)).toEqual([]);            // em dia: não pergunta mais
    expect(perguntas).toBe(3);

    pasta = [...PASTA, '0003_d.sql'];                                            // chegou migration nova
    expect(await faltamNoBanco(60_100, ler, consultar)).toEqual(['0003_d.sql']);
    expect(perguntas).toBe(4);

    // O terminal ganha uma linha por conjunto que falta — não uma por requisição.
    expect(aviso.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('[banco]'))).toHaveLength(2);
    aviso.mockRestore();
  });

  it('banco que não responde não é "atrasado": não trava a tela, e pergunta de novo depois', async () => {
    let perguntas = 0;
    let responde = false;
    const consultar = async () => { perguntas++; return responde ? new Set(['0000_a.sql']) : null; };
    expect(await faltamNoBanco(0, () => PASTA, consultar)).toEqual([]);
    expect(await faltamNoBanco(1000, () => PASTA, consultar)).toEqual([]);
    expect(perguntas).toBe(1);
    responde = true;
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await faltamNoBanco(2500, () => PASTA, consultar)).toEqual(['0001_b.sql', '0002_c.sql']);
    aviso.mockRestore();
    expect(perguntas).toBe(2);
  });

  it('sem pasta, ou pasta vazia: nada a dizer, e nenhuma pergunta ao banco', async () => {
    const consultar = vi.fn(async () => new Set<string>());
    expect(await faltamNoBanco(0, () => null, consultar)).toEqual([]);
    expect(await faltamNoBanco(0, () => [], consultar)).toEqual([]);
    expect(consultar).not.toHaveBeenCalled();
  });
});

describe('a tela', () => {
  it('em português, com as que faltam e o que fazer — e sem guardar em cache', async () => {
    const r = respostaDoBancoAtrasado(['0015_horario_duplo.sql', '0016_carencia_estendida.sql'], '/admin');
    expect(r.status).toBe(503);
    expect(r.headers.get('content-type')).toMatch(/^text\/html/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const html = await r.text();
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toMatch(/<main>[\s\S]*<\/main>/);
    expect(html).toContain('O banco está atrás do código');
    expect(html).toContain('<code>0015_horario_duplo.sql</code>');
    expect(html).toContain('<code>0016_carencia_estendida.sql</code>');
    expect(html).toMatch(/Ctrl\+C/);
    expect(html).toMatch(/npm run dev<\/code> de novo/);
    expect(html).toContain('2 migrations que este banco ainda não tem');
  });

  it('uma só: no singular', async () => {
    const html = await respostaDoBancoAtrasado(['0016_carencia_estendida.sql'], '/').text();
    expect(html).toContain('uma migration que este banco ainda não tem');
    expect(html).toContain('a que falta');
  });

  it('nas rotas /api/, a mesma coisa em JSON — é o que a tela que chamou consegue mostrar', async () => {
    const r = respostaDoBancoAtrasado(['0016_carencia_estendida.sql'], '/api/admin/services');
    expect(r.status).toBe(503);
    expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    const corpo = (await r.json()) as { error: string };
    expect(corpo.error).toContain('0016_carencia_estendida.sql');
    expect(corpo.error).toMatch(/npm run dev de novo/);
  });

  it('o nome do arquivo entra escapado', async () => {
    const html = await respostaDoBancoAtrasado(['0099_<b>x</b>.sql'], '/').text();
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('0099_&lt;b&gt;x&lt;/b&gt;.sql');
  });
});

describe('o middleware', () => {
  const fonte = readFileSync('src/middleware.ts', 'utf8');

  it('confere só no desenvolvimento, e antes de qualquer rota que consulte o banco', () => {
    expect(fonte).toMatch(
      /if \(import\.meta\.env\.DEV\) \{\s*const faltam = await faltamNoBanco\(\);\s*if \(faltam\.length > 0\) return respostaDoBancoAtrasado\(faltam, caminho\);\s*\}/,
    );
    const conferencia = fonte.indexOf('await faltamNoBanco()');
    for (const depois of ["caminho.startsWith('/api/tarefas/')", 'ehRotaDoOperador(caminho)', 'await tenantDaRequisicao(']) {
      expect(fonte.indexOf(depois), depois).toBeGreaterThan(conferencia);
    }
    // e depois da conferência de origem, que continua antes de tudo
    expect(fonte.indexOf('motivoDaRecusa(contexto.request)')).toBeLessThan(conferencia);
  });
});

describe.skipIf(!TEM_BANCO)('lendo o banco de verdade', () => {
  let sql: ReturnType<typeof postgres>;
  const todas = listarMigrations();

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
  }, 60_000);

  afterAll(async () => {
    await sql`DROP TABLE IF EXISTS schema_migrations`;
    await sql.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  it('banco sem o registro das migrations: faltam todas', async () => {
    await sql`DROP TABLE IF EXISTS schema_migrations`;
    expect(await migrationsQueFaltam(todas)).toEqual(todas);
  });

  it('o registro do boot com as duas últimas de fora: faltam as duas — e, gravadas, nenhuma', async () => {
    await sql`CREATE TABLE schema_migrations (nome text PRIMARY KEY, hash text NOT NULL, aplicada_em timestamptz NOT NULL DEFAULT now())`;
    for (const nome of todas.slice(0, -2)) await sql`INSERT INTO schema_migrations (nome, hash) VALUES (${nome}, 'x')`;
    expect(await migrationsQueFaltam(todas)).toEqual(todas.slice(-2));
    for (const nome of todas.slice(-2)) await sql`INSERT INTO schema_migrations (nome, hash) VALUES (${nome}, 'x')`;
    expect(await migrationsQueFaltam(todas)).toEqual([]);
    expect((await aplicadasNoBanco())?.size).toBe(todas.length);
  });
});
