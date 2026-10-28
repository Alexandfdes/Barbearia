// Configurações em abas (`src/pages/admin/configuracoes.astro`).
//
// POR QUE ESTE TESTE EXISTE
//
// Em 15/10/2026, testando o painel, o dono achou a tela longa demais: nove blocos numa
// rolagem só. Virou quatro abas — Aparência, Contato e endereço, Google e Seus dados —,
// escolhidas por ele (`docs/PENDENCIAS-ABERTAS.md` §2.45). Três coisas quebram em silêncio
// numa tela em abas, e é delas que este teste cuida:
//
// - o link que levava ao campo — o "corrigir o endereço" do Início, cada item do medidor de
//   completude — passa a abrir a aba errada, e o campo fica escondido;
// - o Salvar recusa um campo que está noutra aba, e o dono não vê qual;
// - uma aba sem o seu painel, ou dois painéis abertos.
//
// O que roda no navegador — clicar, as setas, o endereço, o ponto da mudança não salva — foi
// visto no navegador; aqui, o que dá para conferir no código, e a rota com o banco.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import type { Tenant } from '../src/lib/tenant.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const pagina = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');
const servidor = pagina.slice(0, pagina.indexOf('\n---', 4));
const ABAS = [...servidor.matchAll(/\{ id: '([\w-]+)', titulo: '([^']+)'(?:, curto: '([^']+)')? \}/g)]
  .map((m) => ({ id: m[1], titulo: m[2], ...(m[3] ? { curto: m[3] } : {}) }));
const DO_FORMULARIO = ['aparencia', 'contato', 'google'];

/** Os blocos de campos: o título, a âncora, a aba e os campos de cada um. */
const blocos = servidor.slice(servidor.indexOf('const secoes'), servidor.indexOf('const secoesDa'))
  .split(/\n  \{\n/).slice(1)
  .map((b) => ({
    titulo: /titulo: '([^']+)'/.exec(b)?.[1],
    ancora: /ancora: '([\w-]+)'/.exec(b)?.[1],
    aba: /aba: '([\w-]+)'/.exec(b)?.[1],
    campos: [...b.matchAll(/\{ id: '(\w+)', label:/g)].map((m) => m[1]),
  }));

/** Todo `id` para onde um link pode apontar: os painéis, as âncoras dos blocos e os blocos escritos à mão. */
const destinos = new Set([
  ...[...pagina.matchAll(/role="tabpanel" id="([\w-]+)"/g)].map((m) => m[1]),
  ...blocos.map((b) => b.ancora),
  ...[...pagina.matchAll(/<section id="([\w-]+)"/g)].map((m) => m[1]),
]);

describe('as quatro abas', () => {
  it('Aparência, Contato e endereço, Google e Seus dados — nessa ordem; no celular, "Contato"', () => {
    expect(ABAS).toEqual([
      { id: 'aparencia', titulo: 'Aparência' },
      { id: 'contato', titulo: 'Contato e endereço', curto: 'Contato' },
      { id: 'google', titulo: 'Google' },
      { id: 'dados', titulo: 'Seus dados' },
    ]);
  });

  it('cada aba tem o seu painel, e só o da primeira nasce aberto', () => {
    for (const { id } of ABAS) {
      const painel = new RegExp(`<div role="tabpanel" id="${id}" aria-labelledby="aba-${id}"( hidden)?`).exec(pagina);
      expect(painel, id).not.toBeNull();
      expect(Boolean(painel![1]), `${id} escondido`).toBe(id !== 'aparencia');
    }
    expect((pagina.match(/<div role="tabpanel"/g) ?? []).length).toBe(ABAS.length);
  });

  it('o botão de cada aba diz ao leitor de tela qual painel controla e se está aberta', () => {
    const botao = pagina.slice(pagina.indexOf('{ABAS.map((aba, i) => ('), pagina.indexOf('</button>'));
    for (const atributo of [
      'role="tab"', 'id={`aba-${aba.id}`}', 'aria-controls={aba.id}',
      "aria-selected={i === 0 ? 'true' : 'false'}", 'tabindex={i === 0 ? 0 : -1}',
    ]) {
      expect(botao, atributo).toContain(atributo);
    }
    expect(pagina).toMatch(/<div role="tablist" aria-label="Partes das configurações"/);
  });

  it('o formulário tem as três primeiras; Seus dados fica fora dele — baixar não é salvar', () => {
    const formulario = pagina.slice(pagina.indexOf('<form id="form-cfg"'), pagina.indexOf('</form>'));
    for (const id of DO_FORMULARIO) expect(formulario, id).toContain(`role="tabpanel" id="${id}"`);
    expect(formulario).not.toContain('role="tabpanel" id="dados"');
    expect(pagina.indexOf('role="tabpanel" id="dados"')).toBeGreaterThan(pagina.indexOf('</form>'));
    expect(pagina.slice(pagina.indexOf('role="tabpanel" id="dados"'))).toMatch(/^[^]*?<ExportarDados \/>/);
  });

  it('todo bloco de campos tem aba do formulário e âncora própria, e nenhum campo aparece duas vezes', () => {
    expect(blocos.map((b) => b.titulo)).toEqual([
      'Nomes e textos do site', 'Contato', 'Endereço', 'Avaliações do Google', 'Busca e compartilhamento',
    ]);
    for (const b of blocos) {
      expect(DO_FORMULARIO, b.titulo).toContain(b.aba);
      expect(b.ancora, b.titulo).toBeTruthy();
    }
    const ancoras = blocos.map((b) => b.ancora);
    expect(new Set(ancoras).size).toBe(ancoras.length);
    const campos = blocos.flatMap((b) => b.campos);
    expect(new Set(campos).size).toBe(campos.length);
    // O título da seção de produtos é texto do site: mora com os textos, não com o Google.
    expect(blocos.find((b) => b.titulo === 'Nomes e textos do site')?.campos).toContain('productsSectionTitle');
  });

  it('cada painel do formulário começa pelos blocos de campos da própria aba', () => {
    const abrem = [...pagina.matchAll(/<div role="tabpanel" id="(\w+)"[^>]*>\s*\{secoesDa\('(\w+)'\)/g)].map((m) => [m[1], m[2]]);
    expect(abrem).toEqual(DO_FORMULARIO.map((id) => [id, id]));
  });

  it('cada parte escrita à mão está na aba certa', () => {
    const painel = (id: string) => {
      const ini = pagina.indexOf(`role="tabpanel" id="${id}"`);
      const fim = pagina.indexOf('role="tabpanel"', ini + 10);
      return pagina.slice(ini, fim === -1 ? undefined : fim);
    };
    for (const [id, partes] of [
      ['aparencia', ['<section id="imagens"', '<section id="cor"', 'id="cores-da-logo"', '<section id="ainda-nao-editavel"']],
      ['contato', ['<section id="horario-do-site"', '<div id="horarios"']],
    ] as const) {
      for (const parte of partes) expect(painel(id), `${parte} em ${id}`).toContain(parte);
    }
  });
});

describe('os links levam à aba certa', () => {
  const arquivos = [...globSync('src/**/*.astro'), ...globSync('src/**/*.ts')].map((c) => c.split(sep).join('/'));

  it('todo link para um pedaço de Configurações aponta para um lugar que existe', () => {
    const quebrados: string[] = [];
    let achados = 0;
    for (const c of arquivos) {
      for (const m of readFileSync(c, 'utf8').matchAll(/\/admin\/configuracoes#([\w-]+)/g)) {
        achados++;
        if (!destinos.has(m[1])) quebrados.push(`${c}: #${m[1]}`);
      }
    }
    expect(quebrados).toEqual([]);
    expect(achados).toBeGreaterThanOrEqual(13);
  });

  it('o medidor de completude leva cada item ao bloco dele, e não ao topo da tela', () => {
    const completude = readFileSync('src/lib/completude.ts', 'utf8');
    expect(completude).not.toMatch(/'\/admin\/configuracoes'/);
    expect(completude).toMatch(/id: 'endereco',[\s\S]*?href: '\/admin\/configuracoes#endereco'/);
    expect(completude).toMatch(/id: 'avaliacoes',[\s\S]*?href: '\/admin\/configuracoes#avaliacoes'/);
  });

  it('o endereço decide a aba: o script abre a aba de quem o endereço aponta', () => {
    const script = pagina.slice(pagina.indexOf('// ── As abas (15/10/2026)'));
    expect(script).toMatch(/function irParaOEndereco\(\)/);
    expect(script).toMatch(/el\?\.closest\('\[role="tabpanel"\]'\)/);
    expect(script).toMatch(/window\.addEventListener\('hashchange', irParaOEndereco\)/);
    // e as setas andam entre as abas
    expect(script).toMatch(/e\.key === 'ArrowRight'/);
    expect(script).toMatch(/e\.key === 'ArrowLeft'/);
  });

  it('controle: o padrão acha o link do Início, e acusaria um destino inventado', () => {
    expect(destinos.has('endereco')).toBe(true);
    expect(destinos.has('nao-existe')).toBe(false);
  });
});

describe('o Salvar com as abas', () => {
  it('a recusa abre a aba do campo e põe o cursor nele', () => {
    expect(pagina).toMatch(/document\.dispatchEvent\(new CustomEvent\('configuracoes:erro', \{ detail: \{ campo: data\.campo \?\? null, erro: data\.error \?\? 'Erro ao salvar' \} \}\)\)/);
    // o porquê fica ao lado do Salvar, que está sempre à vista
    expect(pagina).toMatch(/dizerNoSalvar\(`Não salvou: \$\{erro\}`, true\)/);
    const erro = pagina.slice(pagina.indexOf("document.addEventListener('configuracoes:erro'"));
    expect(erro).toMatch(/abrirAbaDe\(el\)/);
    expect(erro).toMatch(/setAttribute\('aria-invalid', 'true'\)/);
    expect(erro).toMatch(/nome\.startsWith\('businessHours'\)/);
  });

  it('salvo, os pontos de "não salvo" somem', () => {
    expect(pagina).toMatch(/document\.dispatchEvent\(new CustomEvent\('configuracoes:salvo'\)\)/);
    expect(pagina).toMatch(/document\.addEventListener\('configuracoes:salvo'/);
  });

  it('a rota diz o campo à parte, e a mensagem sai limpa para o dono ler', () => {
    const rota = readFileSync('src/pages/api/admin/settings.ts', 'utf8');
    expect(rota).toMatch(/return json\(\{ error: issue\.message, campo: issue\.path\.join\('\.'\) \|\| null \}, 400\)/);
    expect(rota).not.toMatch(/\$\{campo\}: \$\{issue\.message\}/);
  });
});

describe.skipIf(!TEM_BANCO)('a rota, com o banco: a recusa diz o campo', () => {
  let sql: ReturnType<typeof postgres>;
  let dbmod: typeof import('../src/db/index.js');
  let PATCH: typeof import('../src/pages/api/admin/settings.ts')['PATCH'];
  let A: Tenant;
  let cookie = '';

  const salvar = (corpo: unknown) => {
    const url = 'http://painel.test/api/admin/settings';
    const request = new Request(url, {
      method: 'PATCH',
      headers: { host: 'painel.test', cookie, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return dbmod.comTenant(A, async () => PATCH({ request, url: new URL(url) } as never));
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'barbearia-a', 'A', 'active')`;
    await sql`SELECT setval('tenants_id_seq', 1)`;
    await sql`INSERT INTO settings (id, tenant_id, business_name, short_name, whatsapp_number, address_street, address_city)
              VALUES (1, 1, 'A', 'A', '5584999990000', 'R. A, 1', 'Mossoró/RN')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone)
              VALUES (1, 1, 'Dono de A', 'dono-a', 'admin', 'x', true, '84990000001')`;
    await sql`SELECT setval('barbers_id_seq', 1)`;
    dbmod = await import('../src/db/index.js');
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    A = tenant.tenantPorIdMesmoForaDoAr(1)!;
    ({ PATCH } = await import('../src/pages/api/admin/settings.ts'));
    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookie = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  it('a nota 5,9: a mensagem, sem o nome do campo, e o campo à parte', async () => {
    const r = await salvar({ googleRating: '5.9' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'A nota deve ser um número de 0 a 5 (ex: 4.8)', campo: 'googleRating' });
  });

  it('uma linha do horário sem rótulo: o campo diz qual linha', async () => {
    const r = await salvar({ businessHours: [{ label: '', hours: '09:00 — 18:00', closed: false }] });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'O rótulo do horário não pode ficar vazio', campo: 'businessHours.0.label' });
  });

  it('o que vale, grava — e nada mudou para quem salva certo', async () => {
    const r = await salvar({ googleRating: '4.8', googleReviewCount: 127 });
    expect(r.status).toBe(200);
    const [linha] = await sql`SELECT google_rating, google_review_count FROM settings WHERE tenant_id = 1`;
    expect([linha.google_rating, linha.google_review_count]).toEqual(['4.8', 127]);
  });
});
