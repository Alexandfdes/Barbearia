// Passo 5: a sessão do painel passa a decidir de qual barbearia são os dados.
//
// Antes, `tenantDaSessao()` devolvia um tenant fixo e os filtros que o passo 4
// espalhou pelas 53 rotas não tinham efeito real. Estes casos provam que agora
// têm — e que uma sessão de barbearia suspensa deixa de valer.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

let sql: ReturnType<typeof postgres>;
let lib: typeof import('../src/lib/tenant.ts');
let sessao: typeof import('../src/lib/session.ts');

/** Monta uma requisição com o cookie de sessão já selado. */
async function comSessao(cookie: string) {
  return new Request('http://painel.test/x', { headers: { cookie } });
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (slug, business_name, status) VALUES
              ('bayron','Barbearia Bayron','active'),
              ('cortes-do-ze','Cortes do Zé','active'),
              ('devendo','Barbearia Devendo','suspended')`;
  lib = await import('../src/lib/tenant.ts');
  sessao = await import('../src/lib/session.ts');
  await lib.carregarTenants(true);
});

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

describe.skipIf(!TEM_BANCO)('a sessão decide a barbearia', () => {
  it('cada sessão resolve para a SUA barbearia', () => {
    expect(lib.tenantDaSessao({ tenantId: 1 }).slug).toBe('bayron');
    expect(lib.tenantDaSessao({ tenantId: 2 }).slug).toBe('cortes-do-ze');
  });

  it('barbearia suspensa não resolve — o inadimplente para de entrar', () => {
    expect(lib.tenantDaSessaoOuNulo({ tenantId: 3 })).toBeNull();
  });

  it('getSession recusa cookie sem tenantId (sessão de antes do passo 7)', async () => {
    // O caso da virada: quem já estava logado precisa entrar de novo, em vez de
    // continuar operando sobre um tenant adivinhado.
    const cookie = await sessao.makeSessionCookie({ barberId: 1, role: 'admin' } as any);
    const valor = cookie.split(';')[0];
    expect(await sessao.getSession(await comSessao(valor))).toBeNull();
  });

  it('getSession aceita cookie com tenant ativo', async () => {
    const cookie = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const valor = cookie.split(';')[0];
    const s = await sessao.getSession(await comSessao(valor));
    expect(s?.tenantId).toBe(1);
  });

  it('getSession recusa cookie de barbearia suspensa', async () => {
    const cookie = await sessao.makeSessionCookie({ barberId: 9, role: 'admin', tenantId: 3 });
    const valor = cookie.split(';')[0];
    expect(await sessao.getSession(await comSessao(valor))).toBeNull();
  });

  it('suspender uma barbearia corta o acesso depois de invalidar o cache', async () => {
    const cookie = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 2 });
    const valor = cookie.split(';')[0];
    expect(await sessao.getSession(await comSessao(valor))).not.toBeNull();

    await sql`UPDATE tenants SET status = 'suspended' WHERE id = 2`;
    lib.invalidarTenants();
    await lib.carregarTenants();

    expect(await sessao.getSession(await comSessao(valor))).toBeNull();

    await sql`UPDATE tenants SET status = 'active' WHERE id = 2`;
    lib.invalidarTenants();
    await lib.carregarTenants();
  });

  it('resolverHost acha pelo subdomínio e recusa o que não existe', () => {
    expect(lib.resolverHost('bayron.barbearianoar.com.br')?.id).toBe(1);
    expect(lib.resolverHost('BAYRON.barbearianoar.com.br:443')?.id).toBe(1);
    expect(lib.resolverHost('devendo.barbearianoar.com.br')).toBeNull(); // suspensa
    expect(lib.resolverHost('naoexiste.barbearianoar.com.br')).toBeNull();
  });

  it('resolverHost acha por domínio próprio', async () => {
    await sql`UPDATE tenants SET domain = 'barbeariadoze.com.br' WHERE id = 2`;
    lib.invalidarTenants();
    await lib.carregarTenants();
    expect(lib.resolverHost('barbeariadoze.com.br')?.slug).toBe('cortes-do-ze');
    expect(lib.resolverHost('www.barbeariadoze.com.br')).toBeNull(); // www não é o slug
  });
});

describe('a armadilha da ordem: cache frio e sessão', () => {
  // ⚠️ Defeito encontrado em 15/09/2026 usando o produto: o dono do Salão Jovem
  // abriu o painel dele e leu "Vintage" no topo da tela.
  //
  // `tenantDaSessaoOuNulo()` LÊ O CACHE. Barbearia criada depois da última
  // carga não está lá, e a função devolve `null` — não porque a sessão seja
  // inválida, mas porque o cache está velho. No middleware isso fazia a
  // requisição correr sem contexto, e todo `getSettings()` caía no TENANT_UNICO.
  //
  // Metade da tela acertava (o que lê `session` direto) e metade errava (o que
  // passa pelo contexto). Meia tela certa não parece defeito de roteamento.

  it.skipIf(!TEM_BANCO)('barbearia criada depois da carga NÃO é vista até recarregar', async () => {
    await sql`INSERT INTO tenants (slug, business_name, status)
              VALUES ('recem-nascida','Recém Nascida','active')`;
    const [t] = await sql`SELECT id FROM tenants WHERE slug = 'recem-nascida'`;
    const id = Number(t.id);

    // Sem recarregar: o cache não a conhece. É ESTE `null` que derrubava o painel.
    expect(lib.tenantDaSessaoOuNulo({ tenantId: id } as never)).toBeNull();

    // Depois de recarregar, resolve normalmente.
    await lib.carregarTenants(true);
    const achado = lib.tenantDaSessaoOuNulo({ tenantId: id } as never);
    expect(achado?.slug).toBe('recem-nascida');
  });

  it('o middleware aquece o cache ANTES de ler a sessão', () => {
    // A ordem é o conserto. Se alguém trocar de volta, o defeito volta — e ele
    // não quebra nada de forma visível: ele mostra a barbearia errada.
    const fonte = readFileSync('src/middleware.ts', 'utf8');
    const posAquecer = fonte.indexOf('await carregarTenants()');
    const posSessao  = fonte.indexOf('await getSession(request)');
    expect(posAquecer).toBeGreaterThan(-1);
    expect(posSessao).toBeGreaterThan(-1);
    expect(posAquecer).toBeLessThan(posSessao);
  });
});

