// O aceite do termo de uso no cadastro — `src/lib/termos.ts`, migration 0021 (10/11/2026).
//
// O mecanismo nasce DESLIGADO: o texto final espera o advogado, e aceitar um rascunho seria pior que
// não aceitar nada. Estes casos seguram as duas metades: desligado, nada muda — nem a tela, nem o
// banco, e as páginas não abrem em produção —; publicado, o cadastro sem o aceite da versão que vale
// não nasce (`tests/termos-publicados.test.ts`, com a versão simulada).
//
// O texto e as fontes não precisam de banco; o cadastro, sim.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  CAMINHO_DA_PRIVACIDADE, CAMINHO_DO_TERMO, VERSAO_DOS_TERMOS, paginasDosTermosAbrem, recusaDoAceite,
} from '../src/lib/termos';
import { ehCaminhoDoPainel } from '../src/lib/painelCentral';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const PLACEHOLDER = /entra aqui quando voltar do advogado/;
const soCodigo = (texto: string) => texto.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('a regra do aceite', () => {
  it('sem termo publicado, qualquer coisa passa — o aceite nem é pedido', () => {
    for (const enviada of [undefined, null, '', 'qualquer', true]) expect(recusaDoAceite(enviada, null)).toBeNull();
  });

  it('publicado: sem a versão, 400; com outra versão, 409 — a página ficou aberta durante a troca; com ela, passa', () => {
    const v = '2026-12-01';
    for (const sem of [undefined, null, '', '   ', false, true, 20261201]) {
      expect(recusaDoAceite(sem, v), String(sem)).toEqual({
        erro: 'Para criar a barbearia, marque que leu e aceita o termo de uso e o aviso de privacidade.', status: 400,
      });
    }
    expect(recusaDoAceite('2026-11-20', v)).toEqual({
      erro: 'O termo de uso mudou enquanto esta página estava aberta. Recarregue a página e leia a versão nova.', status: 409,
    });
    expect(recusaDoAceite(v, v)).toBeNull();
  });

  it('as páginas: publicadas, abrem; em rascunho, só no desenvolvimento', () => {
    expect(paginasDosTermosAbrem('2026-12-01', false)).toBe(true);
    expect(paginasDosTermosAbrem(null, true)).toBe(true);
    expect(paginasDosTermosAbrem(null, false)).toBe(false);
  });
});

describe('o estado de agora, e o que publicar exige', () => {
  const textos = ['src/termos/uso.md', 'src/termos/privacidade.md'].map((f) => [f, readFileSync(f, 'utf8')] as const);

  it('a versão e o texto andam juntos: sem versão, o aviso de que o texto vem; com ela, o texto e a data', () => {
    if (VERSAO_DOS_TERMOS === null) {
      for (const [f, t] of textos) expect(t, f).toMatch(PLACEHOLDER);
    } else {
      // Publicar com o texto de espera no lugar seria pedir aceite de um aviso.
      expect(VERSAO_DOS_TERMOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const [f, t] of textos) expect(t, f).not.toMatch(PLACEHOLDER);
    }
    // Cada texto começa pelo título dele.
    expect(textos.map(([, t]) => t.split('\n')[0])).toEqual(['# Termo de uso', '# Aviso de privacidade']);
  });

  it('as duas páginas respondem 404 antes de desenhar, quando não abrem — e usam a versão em vigor', () => {
    for (const [pagina, md] of [['src/pages/termos/uso.astro', 'uso'], ['src/pages/termos/privacidade.astro', 'privacidade']]) {
      const fonte = readFileSync(pagina, 'utf8');
      expect(fonte, pagina).toMatch(/if \(!paginasDosTermosAbrem\(VERSAO_DOS_TERMOS, import\.meta\.env\.DEV\)\) \{\s*return new Response\('Not found', \{ status: 404 \}\);/);
      expect(fonte, pagina).toMatch(new RegExp(`import \\{ Content \\} from '\\.\\./\\.\\./termos/${md}\\.md';`));
      expect(fonte, pagina).toMatch(/versao=\{VERSAO_DOS_TERMOS\}/);
    }
    expect(CAMINHO_DO_TERMO).toBe('/termos/uso');
    expect(CAMINHO_DA_PRIVACIDADE).toBe('/termos/privacidade');
  });

  it('as páginas são do painel: no endereço de uma barbearia, vão para ele', () => {
    expect(ehCaminhoDoPainel(CAMINHO_DO_TERMO)).toBe(true);
    expect(ehCaminhoDoPainel(CAMINHO_DA_PRIVACIDADE)).toBe(true);
    // O `/privacidade` do site da barbearia é de outro texto — o aviso a quem agenda.
    expect(ehCaminhoDoPainel('/privacidade')).toBe(false);
    expect(ehCaminhoDoPainel('/termos')).toBe(false);
  });

  it('o cadastro: a caixa só com o termo publicado, com a versão nela — e manda a versão só se marcada', () => {
    const tela = readFileSync('src/pages/cadastrar.astro', 'utf8');
    expect(tela).toMatch(/\{VERSAO_DOS_TERMOS !== null && \(\s*<p class="aceite">\s*<input type="checkbox" id="aceite" required data-versao=\{VERSAO_DOS_TERMOS\} \/>/);
    expect(tela).toMatch(/href=\{CAMINHO_DO_TERMO\} target="_blank" rel="noopener">termo de uso<\/a>/);
    expect(tela).toMatch(/href=\{CAMINHO_DA_PRIVACIDADE\} target="_blank" rel="noopener">aviso de privacidade<\/a>/);
    expect(soCodigo(tela)).toMatch(/termos: \$\('aceite'\)\?\.checked \? \$\('aceite'\)\.dataset\.versao : undefined,/);
  });

  it('a rota confere o aceite antes de criar, e grava a versão que vale — nunca a que veio no corpo', () => {
    const rota = soCodigo(readFileSync('src/pages/api/cadastrar.ts', 'utf8'));
    const confere = rota.indexOf('const recusaDoTermo = recusaDoAceite(parsed.data.termos, VERSAO_DOS_TERMOS);');
    expect(confere).toBeGreaterThan(-1);
    expect(confere).toBeLessThan(rota.indexOf('await provisionarBarbearia('));
    expect(rota).toMatch(/termosAceitos: VERSAO_DOS_TERMOS === null \? null : \{ versao: VERSAO_DOS_TERMOS \},/);
    expect(rota).not.toMatch(/versao: parsed\.data\.termos/);
  });
});

describe.skipIf(!TEM_BANCO)('no banco', () => {
  let sql: postgres.Sql;
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
  }, 30_000);
  afterAll(async () => {
    await sql.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  it('a versão e a hora andam juntas — uma sem a outra, o banco recusa', async () => {
    await expect(sql`INSERT INTO tenants (slug, business_name, termos_versao) VALUES ('so-versao', 'X', '2026-12-01')`)
      .rejects.toThrow(/tenants_termos_juntos/);
    await expect(sql`INSERT INTO tenants (slug, business_name, termos_aceitos_em) VALUES ('so-hora', 'X', now())`)
      .rejects.toThrow(/tenants_termos_juntos/);
    await sql`INSERT INTO tenants (slug, business_name, termos_versao, termos_aceitos_em) VALUES ('as-duas', 'X', '2026-12-01', now())`;
    const [t] = await sql`SELECT termos_versao FROM tenants WHERE slug = 'as-duas'`;
    expect(t.termos_versao).toBe('2026-12-01');
  });

  it('sem termo publicado, o cadastro pela web nasce como sempre — e nada de aceite gravado, nem com versão no corpo', async () => {
    expect(VERSAO_DOS_TERMOS).toBeNull(); // este caso é do estado de hoje; publicado, ele sai
    const antes = { aberto: process.env.CADASTRO_ABERTO, base: process.env.DOMINIO_BASE };
    process.env.CADASTRO_ABERTO = '1';
    process.env.DOMINIO_BASE = 'fadeline.com.br';
    try {
      const { POST } = await import('../src/pages/api/cadastrar.js');
      const r = await POST({
        request: new Request('http://x/api/cadastrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slug: 'sem-termo', nome: 'Barbearia Sem Termo', dono: 'José da Silva', telefone: '84 99999-0101',
            endereco: 'R. das Flores, 42', cidade: 'Mossoró', estado: 'RN', senha: 'segredo123', email: 'ze@exemplo.com.br',
            termos: '2099-01-01',
          }),
        }),
        clientAddress: '10.9.9.1',
      } as never);
      expect(r.status).toBe(201);
      const [t] = await sql`SELECT termos_versao, termos_aceitos_em FROM tenants WHERE slug = 'sem-termo'`;
      expect(t).toEqual({ termos_versao: null, termos_aceitos_em: null });
    } finally {
      if (antes.aberto === undefined) delete process.env.CADASTRO_ABERTO; else process.env.CADASTRO_ABERTO = antes.aberto;
      if (antes.base === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = antes.base;
    }
  }, 30_000);
});
