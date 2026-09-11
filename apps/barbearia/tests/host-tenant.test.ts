// Passo 6: o ENDEREÇO decide de quem é o site.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Até 11/09/2026 `tenantDoHost()` devolvia a barbearia número 1, fixa. O produto
// tinha multi-tenant por dentro e uma barbearia só por fora: a segunda podia
// existir no banco, com dados isolados e RLS ligado, e **não tinha endereço**.
//
// Ligar a resolução por host, sozinha, não bastava — e o jeito como ela falharia
// é o que estes casos vigiam:
//
//  1. Doze componentes e layouts chamam `await getSettings()` SEM argumento. Com
//     `tenantAtual()` devolvendo 1 fixo, o endereço da segunda barbearia
//     renderizaria o site dela com a marca da primeira.
//  2. Página pública que não pergunta de quem é o endereço renderiza a barbearia
//     única — então um host desconhecido mostraria o site do primeiro cliente.
//
// Os dois defeitos são silenciosos: HTTP 200, página bonita, barbearia errada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** Uma requisição com o endereço que se quer testar. */
const pedido = (host: string | null) =>
  new Request('http://exemplo/', host ? { headers: { host } } : undefined);

let tenant: typeof import('../src/lib/tenant.js');
let comTenant: typeof import('../src/db/index.js')['comTenant'];

beforeAll(async () => {
  if (!TEM_BANCO) return;

  const conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);
  await conn`INSERT INTO tenants (id, slug, business_name, status, domain) VALUES
    (1, 'bayron',  'Barbearia Bayron',  'active',    NULL),
    (2, 'vintage', 'Barbearia Vintage', 'active',    'vintagebarber.com.br'),
    (3, 'sumida',  'Barbearia Sumida',  'suspended', NULL)`;
  await conn.end({ timeout: 5 });

  tenant = await import('../src/lib/tenant.js');
  comTenant = (await import('../src/db/index.js')).comTenant;
  await tenant.carregarTenants(true);
});

afterAll(async () => {
  if (!TEM_BANCO) return;
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o endereço decide a barbearia', () => {
  it('subdomínio resolve pelo slug', () => {
    expect(tenant.tenantDoHost(pedido('bayron.barbearianoar.com.br'))?.slug).toBe('bayron');
    expect(tenant.tenantDoHost(pedido('vintage.barbearianoar.com.br'))?.slug).toBe('vintage');
  });

  it('domínio próprio resolve pela coluna `domain`', () => {
    expect(tenant.tenantDoHost(pedido('vintagebarber.com.br'))?.slug).toBe('vintage');
  });

  it('endereço desconhecido devolve null — quem chama responde 404', () => {
    // ⚠️ Nunca um tenant padrão. Servir o site da barbearia errada é pior que
    // não servir nada, e o padrão silencioso é exatamente como isso aconteceria.
    expect(tenant.tenantDoHost(pedido('naoexiste.barbearianoar.com.br'))).toBeNull();
    expect(tenant.tenantDoHost(pedido('painel.barbearianoar.com.br'))).toBeNull();
    expect(tenant.tenantDoHost(pedido(null))).toBeNull();
  });

  it('barbearia suspensa não é servida — é assim que o inadimplente sai do ar', () => {
    expect(tenant.tenantDoHost(pedido('sumida.barbearianoar.com.br'))).toBeNull();
  });

  it('a porta no host não atrapalha', () => {
    // Em desenvolvimento o host chega como `bayron.localhost:4321`.
    expect(tenant.tenantDoHost(pedido('bayron.barbearianoar.com.br:4321'))?.slug).toBe('bayron');
  });

  it('`tenantAtual()` entrega a barbearia da requisição, não a número 1', async () => {
    // ESTE é o caso que impede o site da segunda barbearia sair com a marca da
    // primeira: os doze componentes chamam `getSettings()` sem argumento, e o
    // valor padrão deles sai daqui.
    const vintage = tenant.tenantDoHost(pedido('vintage.barbearianoar.com.br'))!;
    const dentro = await comTenant(vintage, async () => tenant.tenantAtual());
    expect(dentro.slug).toBe('vintage');
  });

  it('fora de requisição, `tenantAtual()` é a barbearia única — para scripts e testes', () => {
    expect(tenant.tenantAtual().id).toBe(1);
  });
});

describe('nenhuma página pública serve barbearia sem perguntar de quem é o endereço', () => {
  // O mesmo espírito de `tests/escopo-rotas.test.ts`: a rota 55, escrita com
  // pressa daqui a três meses, não pode nascer servindo a barbearia errada.
  //
  // Cada entrada aqui é uma exceção justificada. A lista fecha de propósito.
  const PERMITIDOS: Record<string, string> = {
    'src/pages/api/auth/login.ts':
      'é a porta: acha o barbeiro pelo telefone ANTES de saber a barbearia',
    'src/pages/api/auth/logout.ts':
      'só apaga cookie; não lê nem serve dado de barbearia nenhuma',
    'src/pages/api/customer/logout.ts':
      'idem',
    'src/pages/api/products/image/[name].ts':
      'as fotos de produto ainda moram numa pasta só, compartilhada — PENDENCIAS-ABERTAS.md §6.1',
  };

  it('toda rota e página pública chama `tenantDoHost`', () => {
    const publicos = [...globSync('src/pages/**/*.ts'), ...globSync('src/pages/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => !c.includes('/admin/'))
      .sort();

    // Guarda contra o glob falhar em silêncio e o teste passar sem ler nada.
    expect(publicos.length).toBeGreaterThan(15);

    const semPerguntar = publicos.filter(
      (c) => !(c in PERMITIDOS) && !/tenantDoHost/.test(readFileSync(c, 'utf8'))
    );
    expect(semPerguntar).toEqual([]);
  });

  it('quem pergunta também responde 404 quando não há barbearia', () => {
    // Perguntar e ignorar a resposta é pior que não perguntar: dá a impressão
    // de que a rota foi conferida.
    const publicos = [...globSync('src/pages/**/*.ts'), ...globSync('src/pages/**/*.astro')]
      .map((c) => c.split(sep).join('/'))
      .filter((c) => !c.includes('/admin/') && !(c in PERMITIDOS));

    const semGuarda = publicos.filter((c) => {
      const s = readFileSync(c, 'utf8');
      return !/if \(!tenant\)|if \(!tenantDoHost\(/.test(s);
    });
    expect(semGuarda).toEqual([]);
  });
});
