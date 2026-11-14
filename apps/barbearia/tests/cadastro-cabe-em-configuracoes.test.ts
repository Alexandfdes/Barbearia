// O que o cadastro grava, Configurações salva (12/11/2026).
//
// Achado de passagem, fazendo o CEP (`docs/PENDENCIAS-ABERTAS.md` §2.71): o cadastro aceitava mais
// do que Configurações — o nome com 120, a rua com 200, a cidade com 120, o "sobre" com 1000, o @
// do Instagram e o nome curto sem teto. Quem passasse não salvava NADA em Configurações até achar e
// encurtar o campo, porque o Salvar manda todos — e o aviso vinha em inglês ("Too big: expected
// string to have <=40 characters"). O nome curto era o mais provável: ele sai do nome inteiro, menos
// o "Barbearia do", e um nome de 41 letras sem esse prefixo nascia sem caber.
//
// `LIMITES_DO_CADASTRO` (`lib/provisionarBarbearia.ts`) são agora os de Configurações. Aqui:
//  - os números são os mesmos dos dois lados, e os do `maxlength` do `/cadastrar`;
//  - o cadastro recusa o que passa, antes de tocar o banco, dizendo o campo;
//  - com cada campo no limite, o cadastro de verdade nasce e o Salvar de Configurações passa sem
//    mexer em nada — o caso que quebrava;
//  - todo teto de Configurações fala português.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { LIMITES_DO_CADASTRO as L, curtoPadrao, provisionarBarbearia } from '../src/lib/provisionarBarbearia.js';
import { parseBusinessHours } from '../src/lib/settings.js';
import { fusoDe } from '../src/lib/timezone.js';
import type { Tenant } from '../src/lib/tenant.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** Uma "conexão" que estoura se for usada: a recusa veio antes de tocar o banco. */
const semBanco = (() => { throw new Error('tocou o banco'); }) as unknown as ReturnType<typeof postgres>;

const BASE = {
  slug: 'no-limite',
  nome: 'Barbearia No Limite',
  dono: 'Dona do Limite',
  telefone: '84 98888-7777',
  endereco: 'R. das Flores, 42',
  cidade: 'Mossoró',
  estado: 'RN',
  senha: 'segredo123',
  email: 'limite@exemplo.com.br',
};

const settingsTs = readFileSync('src/pages/api/admin/settings.ts', 'utf8');
const configuracoes = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');

/** O teto de um campo de Configurações, lido do schema da rota. */
function tetoEmConfiguracoes(campo: string): number {
  const linha = new RegExp(`^\\s*${campo}:\\s+(.+)$`, 'm').exec(settingsTs)?.[1] ?? '';
  const n = /\.max\((\d+)|ate\((\d+)/.exec(linha);
  return Number(n?.[1] ?? n?.[2]);
}

describe('os mesmos números dos dois lados', () => {
  it('cada campo que o cadastro grava tem o teto do campo de Configurações que o mostra', () => {
    expect({
      nome: tetoEmConfiguracoes('businessName'),
      curto: tetoEmConfiguracoes('shortName'),
      endereco: tetoEmConfiguracoes('addressStreet'),
      cidade: tetoEmConfiguracoes('addressCity'),
      sobre: tetoEmConfiguracoes('aboutText'),
      frase: tetoEmConfiguracoes('tagline'),
      instagram: tetoEmConfiguracoes('instagramHandle'),
    }).toEqual(L);
  });

  it('e o /cadastrar não deixa digitar mais — a cidade, 3 a menos: ela ganha "/UF" no fim', () => {
    const pagina = readFileSync('src/pages/cadastrar.astro', 'utf8');
    const maximo = (id: string) => Number(new RegExp(`<(?:input|textarea) id="${id}"[^>]*maxlength="(\\d+)"`).exec(pagina)?.[1]);
    expect({ nome: maximo('nome'), endereco: maximo('endereco'), cidade: maximo('cidade'), sobre: maximo('sobre'), frase: maximo('frase') })
      .toEqual({ nome: L.nome, endereco: L.endereco, cidade: L.cidade - 3, sobre: L.sobre, frase: L.frase });
  });
});

describe('o nome curto nasce cabendo', () => {
  it('o de sempre não muda: sem o "Barbearia do", e inteiro', () => {
    expect(curtoPadrao('Barbearia Cortes do Zé')).toBe('Cortes do Zé');
    expect(curtoPadrao('Vintage')).toBe('Vintage');
    expect(curtoPadrao('C'.repeat(L.curto))).toBe('C'.repeat(L.curto));
  });

  it('o comprido corta na última palavra que cabe — sem pendurar a ligação nem a vírgula', () => {
    expect(curtoPadrao('Espaço Masculino Zé Silva Barba Cabelo e Bigode Premium')).toBe('Espaço Masculino Zé Silva Barba Cabelo');
    expect(curtoPadrao('Cortes, Barbas, Bigodes, Sobrancelhas, Tatuagens')).toBe('Cortes, Barbas, Bigodes, Sobrancelhas');
    expect(curtoPadrao(`Barbearia do ${'Abc '.repeat(12)}`)).toBe('Abc Abc Abc Abc Abc Abc Abc Abc Abc Abc');
  });

  it('uma palavra só, maior que o teto: corta no teto', () => {
    expect(curtoPadrao('X'.repeat(L.curto + 10))).toBe('X'.repeat(L.curto));
  });
});

describe('o cadastro recusa o que não caberia — antes de tocar o banco, dizendo o campo', () => {
  const casos: [string, Record<string, unknown>, RegExp][] = [
    ['nome', { nome: 'N'.repeat(L.nome + 1) }, /^O nome da barbearia passa de 100 caracteres\.$/],
    ['curto', { curto: 'C'.repeat(L.curto + 1) }, /^O nome curto passa de 40 caracteres/],
    ['endereco', { endereco: 'R'.repeat(L.endereco + 1) }, /^A rua e o número passam de 150 caracteres\.$/],
    // Com o estado à parte, a cidade ganha "/RN": sobram 77 para ela.
    ['cidade', { cidade: 'C'.repeat(L.cidade - 3 + 1) }, /^A cidade passa de 77 caracteres\.$/],
    // Com a sigla escrita na própria cidade, ela é guardada como veio: os 80 são dela.
    ['cidade', { cidade: `${'C'.repeat(L.cidade - 3 + 1)}/RN` }, /^A cidade passa de 80 caracteres\.$/],
    ['sobre', { sobre: 'S'.repeat(L.sobre + 1) }, /^O texto sobre a barbearia passa de 600 caracteres\.$/],
    ['instagram', { instagram: `@${'i'.repeat(L.instagram)}` }, /^Confira o Instagram/],
    ['frase', { frase: 'F'.repeat(L.frase + 1) }, /^A frase do topo passa de 200 caracteres\.$/],
  ];
  for (const [campo, mais, erro] of casos) {
    it(`${campo}: ${JSON.stringify(mais).slice(0, 40)}…`, async () => {
      const r = await provisionarBarbearia(semBanco, { ...BASE, ...mais } as never);
      expect(r).toMatchObject({ ok: false, campo });
      expect(r.ok === false && r.erro).toMatch(erro);
    });
  }
});

describe('todo teto de Configurações fala português', () => {
  it('nenhum .max, .min ou .int sem a mensagem — sem ela, o zod responde em inglês', () => {
    const codigo = settingsTs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Controle: a guarda acha o que procura.
    expect(codigo.match(/\.max\(/g)?.length).toBeGreaterThan(8);
    // Um argumento só — o número, ou a variável dele — é o teto sem a frase.
    expect(codigo.match(/\.(max|min)\(\s*[^,()]+\)|\.int\(\s*\)/g) ?? []).toEqual([]);
    expect(codigo).not.toMatch(/z\.number\(\s*\)/);
  });
});

// ── Com banco: o cadastro de verdade, no limite, e o Salvar de Configurações ──

describe.skipIf(!TEM_BANCO)('com banco: no limite, a barbearia nasce e Configurações salva sem mexer em nada', () => {
  let sql: ReturnType<typeof postgres>;
  let dbmod: typeof import('../src/db/index.js');
  let tenantMod: typeof import('../src/lib/tenant.js');
  let cadastrar: typeof import('../src/pages/api/cadastrar.js')['POST'];
  let rota: typeof import('../src/pages/api/admin/settings.ts');
  const antes = process.env.CADASTRO_ABERTO;

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    process.env.CADASTRO_ABERTO = '1';
    dbmod = await import('../src/db/index.js');
    tenantMod = await import('../src/lib/tenant.js');
    ({ POST: cadastrar } = await import('../src/pages/api/cadastrar.js'));
    rota = await import('../src/pages/api/admin/settings.ts');
  }, 60_000);

  afterAll(async () => {
    if (antes === undefined) delete process.env.CADASTRO_ABERTO;
    else process.env.CADASTRO_ABERTO = antes;
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  /** O corpo do Salvar, como a tela monta (`pages/admin/configuracoes.astro`): todo `data-campo`, do jeito que ela lê. */
  function corpoDoSalvar(linha: Record<string, unknown>, t: Tenant): Record<string, unknown> {
    const servidor = configuracoes.slice(0, configuracoes.indexOf('\n---', 4));
    const blocos = servidor.slice(servidor.indexOf('const secoes'), servidor.indexOf('const secoesDa'));
    // Os campos dos blocos — menos o CEP, que não tem `data-campo` —, e a cor, que mora fora deles.
    const campos = [...blocos.matchAll(/\{ id: '(\w+)', label:/g)].map((m) => m[1]).filter((c) => c !== 'cep');
    expect(configuracoes).toMatch(/data-campo="accentColor"/);
    const corpo: Record<string, unknown> = { accentColor: linha.accentColor };
    for (const c of campos) {
      if (c === 'fuso') corpo.fuso = fusoDe(t);
      else if (c === 'googleReviewCount') corpo[c] = Number(String(linha[c] ?? '') || 0);
      else corpo[c] = String(linha[c] ?? '').trim();
    }
    corpo.businessHours = parseBusinessHours(linha.businessHours as string)
      .map((h) => ({ label: h.label.trim(), hours: h.hours.trim(), closed: h.closed }))
      .filter((h) => h.label || h.hours);
    return corpo;
  }

  it('cada campo no limite: 201 no cadastro, e o Salvar de Configurações passa como veio', async () => {
    const corpo = {
      ...BASE,
      // 100 letras sem o "Barbearia do": é daqui que o nome curto sai — e tem de sair cabendo.
      nome: `Espaço ${'M'.repeat(L.nome - 7)}`,
      endereco: 'R'.repeat(L.endereco),
      cidade: 'C'.repeat(L.cidade - 3),
      sobre: 'S'.repeat(L.sobre),
      frase: 'F'.repeat(L.frase),
      // O endereço inteiro do perfil, com o rastro que o app do Instagram põe no fim.
      instagram: `https://www.instagram.com/${'i'.repeat(L.instagram - 1)}/?igsh=MWZ3bG1ra2V3`,
    };
    const r = await cadastrar({
      request: new Request('http://painel.test/api/cadastrar', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
      }),
      clientAddress: '10.98.76.54',
    } as never);
    expect(r.status, await r.clone().text()).toBe(201);
    const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];

    const [linhaDoTenant] = await sql`SELECT id FROM tenants WHERE slug = ${BASE.slug}`;
    await tenantMod.carregarTenants(true);
    const t = tenantMod.tenantPorIdMesmoForaDoAr(Number(linhaDoTenant.id))!;
    const doPainel = (handler: (ctx: never) => Response | Promise<Response>, init: RequestInit = {}) => {
      const request = new Request('http://painel.test/api/admin/settings', {
        ...init, headers: { host: 'painel.test', cookie, ...(init.headers ?? {}) },
      });
      return dbmod.comTenant(t, async () => handler({ request } as never));
    };

    const lida = await doPainel(rota.GET);
    expect(lida.status).toBe(200);
    const linha = await lida.json() as Record<string, unknown>;
    // O que nasceu, cada um no teto.
    expect(String(linha.businessName)).toHaveLength(L.nome);
    expect(String(linha.shortName).length).toBeGreaterThan(0);
    expect(String(linha.shortName).length).toBeLessThanOrEqual(L.curto);
    expect(String(linha.addressStreet)).toHaveLength(L.endereco);
    expect(linha.addressCity).toBe(`${'C'.repeat(L.cidade - 3)}/RN`);
    expect(String(linha.aboutText)).toHaveLength(L.sobre);
    expect(String(linha.tagline)).toHaveLength(L.frase);
    expect(linha.instagramHandle).toBe(`@${'i'.repeat(L.instagram - 1)}`);

    const salvar = (c: Record<string, unknown>) => doPainel(rota.PATCH, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c),
    });
    const tudo = corpoDoSalvar(linha, t);
    const salvo = await salvar(tudo);
    expect(salvo.status, await salvo.clone().text()).toBe(200);

    // E o controle: um a mais, a recusa diz qual campo — em português.
    const curtoDemais = await salvar({ ...tudo, shortName: 'C'.repeat(L.curto + 1) });
    expect(curtoDemais.status).toBe(400);
    expect(await curtoDemais.json()).toEqual({ error: 'O nome curto passa de 40 caracteres', campo: 'shortName' });
    const sobreDemais = await salvar({ ...tudo, aboutText: 'S'.repeat(L.sobre + 1) });
    expect(await sobreDemais.json()).toEqual({ error: 'O texto sobre a barbearia passa de 600 caracteres', campo: 'aboutText' });
  });
});
