// O site novo só vai ao ar depois da aprovação do operador (05/11/2026, migration 0020).
//
// POR QUE ESTE TESTE EXISTE
//
// Com o cadastro aberto e o certificado curinga, a página de um estranho iria ao ar sob o domínio
// do produto em minutos, sem ninguém ver — e uma só que seja golpe derruba o domínio inteiro nos
// filtros de e-mail e nos alertas do navegador, com o site de todo cliente junto (revisão de
// 05/11/2026). Decisão do dono: nos primeiros meses, o site de quem se cadastra pela web abre
// depois que o operador olhar. Estes casos seguram:
//
//  - o endereço que espera mostra "em preparação", SEM nada que a pessoa escreveu — nem o aviso
//    de "fora do ar", que traz o nome e o WhatsApp; o painel funciona inteiro;
//  - a prévia: o link do painel vale 2 minutos e só para a barbearia dele, vira um cookie daquele
//    endereço, e o cookie de uma não abre outra; adulterado, vencido ou trocado de uso, nada abre;
//  - aprovar abre o site, conta o teste de hoje (sem encurtar o estendido), e fica no registro;
//  - o cadastro pela web nasce esperando — o corpo do pedido não escolhe —, e `SITE_SEM_APROVACAO=1`
//    desliga; só ele cria tenant no código, escrevendo a aprovação;
//  - os avisos do teste não vão para quem nunca teve o site no ar, e o Início do operador o
//    mostra primeiro.
//
// O middleware não roda no vitest (`astro:middleware`): o que ele faz é conferido pelo código
// aqui, e rodando no build (o ensaio de 05/11/2026, no `PENDENCIAS-ABERTAS.md` §2.70).
//
// A parte com banco precisa de Postgres; sem DATABASE_URL, é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import * as previa from '../src/lib/previaDoSite.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const AGORA = new Date('2026-11-06T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const ENV = { SESSION_SECRET: 'um-segredo-de-teste-com-mais-de-32-caracteres', NODE_ENV: 'production' };
const SITE = 'https://nova.fadeline.com.br';
const normal = (c: string) => c.split(sep).join('/');
const seloDe = (link: string) => new URL(link).searchParams.get('previa')!;
const cookieDe = (r: Response) => r.headers.get('set-cookie')?.split(';')[0] ?? null;
const pedidoCom = (cookie: string | null, url = `${SITE}/agendar`) =>
  new Request(url, { headers: { ...(cookie ? { cookie } : {}), host: new URL(url).host } });

describe('a prévia: o link do painel e o cookie do endereço', () => {
  it('o link, aberto no endereço do site, vira o cookie e sai da barra', () => {
    const link = previa.linkDaPrevia(SITE, 7, AGORA, ENV)!;
    expect(link).toMatch(/^https:\/\/nova\.fadeline\.com\.br\/\?previa=\d{13}\.[A-Za-z0-9_-]{43}$/);

    const r = previa.respostaDoLinkDaPrevia(new Request(`${link}&servico=corte`), 7, AGORA, ENV);
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/?servico=corte');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('set-cookie')).toMatch(/^previa_do_site=\d{13}\.[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Lax; Max-Age=28800; Path=\/$/);

    const cookie = cookieDe(r);
    expect(previa.emPrevia(pedidoCom(cookie), 7, AGORA, ENV)).toBe(true);
    expect(previa.emPrevia(pedidoCom(cookie), 7, new Date(AGORA.getTime() + 8 * 60 * 60 * 1000 - 1), ENV)).toBe(true);
    expect(previa.emPrevia(pedidoCom(cookie), 7, new Date(AGORA.getTime() + 8 * 60 * 60 * 1000 + 1), ENV)).toBe(false);
    expect(previa.emPrevia(pedidoCom(cookie), 8, AGORA, ENV)).toBe(false); // o cookie é DESTA barbearia
    expect(previa.emPrevia(pedidoCom(null), 7, AGORA, ENV)).toBe(false);
  });

  it('o link vale 2 minutos, só para a barbearia dele — e adulterado, trocado de uso ou sem segredo, nada abre', () => {
    const link = previa.linkDaPrevia(SITE, 7, AGORA, ENV)!;
    const selo = seloDe(link);
    const trocar = (url: string, id = 7, quando = AGORA, env = ENV) =>
      cookieDe(previa.respostaDoLinkDaPrevia(new Request(url), id, quando, env));

    expect(trocar(link, 7, new Date(AGORA.getTime() + 2 * 60 * 1000 - 1))).not.toBeNull();
    expect(trocar(link, 7, new Date(AGORA.getTime() + 2 * 60 * 1000 + 1))).toBeNull(); // venceu
    expect(trocar(link, 8)).toBeNull();                                                 // de outra barbearia
    const adulterado = selo.slice(0, -1) + (selo.endsWith('A') ? 'B' : 'A');
    expect(trocar(`${SITE}/?previa=${adulterado}`)).toBeNull();
    const maisTarde = selo.replace(/^\d{13}/, String(AGORA.getTime() + 365 * DIA));
    expect(trocar(`${SITE}/?previa=${maisTarde}`)).toBeNull();                          // o prazo é assinado

    // Um uso não serve pelo outro: o selo do link não é cookie, e o do cookie não é link.
    expect(previa.emPrevia(pedidoCom(`previa_do_site=${selo}`), 7, AGORA, ENV)).toBe(false);
    const doCookie = trocar(link)!.split('=')[1];
    expect(trocar(`${SITE}/?previa=${doCookie}`)).toBeNull();

    // Sem o segredo, não há prévia; com outro segredo, a de antes não vale.
    expect(previa.linkDaPrevia(SITE, 7, AGORA, { SESSION_SECRET: 'curto' })).toBeNull();
    expect(trocar(link, 7, AGORA, { ...ENV, SESSION_SECRET: 'outro-segredo-de-teste-com-mais-de-32-caracteres' })).toBeNull();
    // Sem endereço do site, nem link.
    expect(previa.linkDaPrevia('', 7, AGORA, ENV)).toBeNull();
  });

  it('fora da produção, o cookie vai sem `Secure` — o servidor de desenvolvimento não tem TLS', () => {
    const env = { ...ENV, NODE_ENV: 'development' };
    const link = previa.linkDaPrevia('http://nova.localhost:4321', 7, AGORA, env)!;
    expect(previa.respostaDoLinkDaPrevia(new Request(link), 7, AGORA, env).headers.get('set-cookie')).not.toMatch(/Secure/);
  });

  it('o "em preparação": 503, fora da busca, e nada da barbearia — a função nem a recebe', async () => {
    const r = previa.respostaEmPreparacao('/');
    expect(r.status).toBe(503);
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(r.headers.get('retry-after')).toBe('3600');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const html = await r.text();
    expect(html).toContain('Este site está em preparação.');
    // Sem prazo de minutos: a conferência leva até um dia útil (10/11/2026).
    expect(html).toContain('Ele ainda não abriu ao público. Volte em breve.');
    expect(html).not.toMatch(/daqui a pouco|minutos?/i);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(previa.paginaEmPreparacao.length).toBe(0);
    expect(previa.respostaEmPreparacao.length).toBe(1);

    const api = previa.respostaEmPreparacao('/api/slots');
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: 'Em preparação.' });
  });

  it('a variável: sem ela, o site novo espera; com SITE_SEM_APROVACAO=1, nasce no ar', () => {
    expect(previa.aprovacaoDoSiteLigada({})).toBe(true);
    expect(previa.aprovacaoDoSiteLigada({ SITE_SEM_APROVACAO: '0' })).toBe(true);
    expect(previa.aprovacaoDoSiteLigada({ SITE_SEM_APROVACAO: '1' })).toBe(false);
    expect(previa.aprovacaoDoSiteLigada({ SITE_SEM_APROVACAO: ' 1 ' })).toBe(false);
  });

  it('só o provisionamento cria tenant no código — escrevendo a aprovação, porque o padrão da coluna é aprovado', () => {
    const arquivos = [
      ...globSync('src/**/*.ts'), ...globSync('src/**/*.astro'), ...globSync('scripts/**/*.mjs'), ...globSync('scripts/**/*.mts'),
    ].map(normal).sort();
    expect(arquivos.length).toBeGreaterThan(100); // o glob achou o código
    const criam = arquivos.filter((c) => /INSERT\s+INTO\s+tenants\b|\.insert\(\s*tenants\b/.test(readFileSync(c, 'utf8')));
    // O `seed-bayron` só IMPRIME o comando, para quem monta o banco à mão no desenvolvimento.
    expect(criam).toEqual(['scripts/seed-bayron.mjs', 'src/lib/provisionarBarbearia.ts']);
    expect(readFileSync('scripts/seed-bayron.mjs', 'utf8')).toMatch(/console\.error\([^\n]*INSERT INTO tenants/);
    const prov = readFileSync('src/lib/provisionarBarbearia.ts', 'utf8');
    expect(prov).toMatch(/INSERT INTO tenants \([^)]*\bsite_aprovado_em\b[^)]*\)/);
    expect(prov).toMatch(/\$\{dados\.esperaAprovacao \? null : agora\.toISOString\(\)\}/);
    expect(readFileSync('drizzle/0020_site_aprovado.sql', 'utf8'))
      .toMatch(/ADD COLUMN IF NOT EXISTS site_aprovado_em timestamptz DEFAULT now\(\)/);
  });

  it('o middleware: a prévia antes de servir, o "em preparação" antes do aviso de fora do ar, e a prévia fora da busca', () => {
    const mw = readFileSync('src/middleware.ts', 'utf8');
    const ramo = mw.slice(mw.indexOf('if (tenant === null) {'));
    expect(ramo.indexOf('tenantEmPreparacaoDoHost(host)')).toBeGreaterThan(-1);
    expect(ramo.indexOf('tenantEmPreparacaoDoHost(host)')).toBeLessThan(ramo.indexOf('tenantSuspensoDoHost(host)'));
    expect(mw).toMatch(/if \(tenantEmPreparacaoDoHost\(host\)\) return respostaEmPreparacao\(caminho\);/);
    expect(mw.indexOf('respostaDoLinkDaPrevia(contexto.request, esperando.id)')).toBeGreaterThan(-1);
    expect(mw.indexOf('respostaDoLinkDaPrevia(contexto.request, esperando.id)')).toBeLessThan(mw.indexOf('if (tenant === null) {'));
    expect(mw).toMatch(/return !daSessao && tenant\.emPreparacao \? foraDaBusca\(r\) : r;/);
    expect(mw).toMatch(/h\.set\('X-Robots-Tag', 'noindex, nofollow'\);/);
  });

  it('o painel do dono leva à prévia; o site, na prévia, diz que é prévia', () => {
    const layout = readFileSync('src/layouts/AdminLayout.astro', 'utf8');
    expect(layout).toMatch(/href=\{emPreparacao \? '\/admin\/previa' : enderecoDoSite\}/);
    expect(layout).toMatch(/id="aviso-em-preparacao"/);
    expect(layout).toMatch(/const aviso = emPreparacao \? null : avisoDoPainel\(/);
    const tela = readFileSync('src/pages/admin/previa.astro', 'utf8');
    expect(tela.indexOf('await getSession(Astro.request)')).toBeLessThan(tela.indexOf('linkDaPrevia('));
    expect(tela).toMatch(/if \(!session\) return Astro\.redirect\('\/admin\/login'\);/);
    const site = readFileSync('src/layouts/Layout.astro', 'utf8');
    expect(site).toMatch(/const naPrevia = tenantDoHost\(Astro\.request\)\?\.emPreparacao === true;/);
    expect(site).toMatch(/\{naPrevia && <meta name="robots" content="noindex, nofollow" \/>\}/);
    expect(site).toMatch(/<aside id="faixa-da-previa" aria-label="Prévia" hidden=\{!naPrevia\}/);
  });

  it('a tela de assinatura do site que espera: sem o cartão, e dizendo quando o teste começa (06/11/2026)', () => {
    // Quem recusa de verdade é a rota (`abrirCheckout`, no `tests/cobranca.test.ts`); a tela não
    // oferece o que a rota recusa, nem fala em "fora do ar" de um site que nunca abriu.
    const tela = readFileSync('src/pages/admin/assinatura.astro', 'utf8');
    expect(tela).toMatch(/const emPreparacao = tenant\.emPreparacao === true;/);
    expect(tela).toMatch(/const podeCartao = podeCadastrarCartao\(situacao\) && !emPreparacao;/);
    expect(tela).toMatch(/\{emPreparacao\s*\? `O seu site ainda não está no ar: [^`]*os 7 dias de teste começam nesse dia\./);
    expect(tela).toMatch(/const titulo = foraDoAr && !emPreparacao \? 'O site está fora do ar' : 'Assinatura';/);
    // Controle: o cartão continua oferecido por `podeCartao`, e a explicação de sempre continua lá.
    expect(tela).toMatch(/\{!manual && podeCartao && \(/);
    expect(tela).toMatch(/: explicacaoDaSituacao\(situacao, fuso, new Date\(\), cobrancaLigada\)\}/);
  });
});

describe.skipIf(!TEM_BANCO)('com banco: o endereço, a aprovação, o cadastro e os avisos', () => {
  let sql: ReturnType<typeof postgres>;
  let tenant: typeof import('../src/lib/tenant.js');
  let op: typeof import('../src/lib/operadorBarbearias.js');
  let situacao: typeof import('../src/lib/situacao.js');
  let email: typeof import('../src/lib/email.js');
  const dominioAntes = process.env.DOMINIO_BASE;
  const FORTALEZA = 'America/Fortaleza';

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const em = (dias: number) => new Date(AGORA.getTime() + dias * DIA).toISOString();
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, site_aprovado_em) VALUES
      (1, 'aprovada', 'Aprovada', 'trial', ${em(30)}::timestamptz, ${em(-40)}::timestamptz),
      (2, 'esperando', 'Esperando', 'trial', ${em(3)}::timestamptz, NULL),
      (3, 'esperou-demais', 'Esperou Demais', 'trial', ${em(-12)}::timestamptz, NULL),
      (4, 'saiu-esperando', 'Saiu Esperando', 'cancelled', NULL, NULL),
      (5, 'fora-aprovada', 'Fora Aprovada', 'suspended', NULL, ${em(-40)}::timestamptz),
      (6, 'estendida', 'Estendida', 'trial', ${em(20)}::timestamptz, NULL),
      (7, 'aviso-esperando', 'Aviso Esperando', 'trial', ${em(1)}::timestamptz, NULL),
      (8, 'aviso-aprovada', 'Aviso Aprovada', 'trial', ${em(1)}::timestamptz, ${em(-6)}::timestamptz)`;
    await sql`SELECT setval('tenants_id_seq', 20)`;
    await sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
      (2, 'Suporte Fadeline: regularize o Pix', 'Suporte', '5584999990002', 'Rua A, 1', 'Natal/RN'),
      (3, 'Suporte Fadeline: regularize o Pix', 'Suporte', '5584999990003', 'Rua A, 1', 'Natal/RN'),
      (5, 'Fora Aprovada', 'Fora', '5584999990005', 'Rua A, 1', 'Natal/RN')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email, email_confirmado_em) VALUES
      (7, 7, 'Dono Esperando', 'dono', 'admin', 'x', true, '84999990007', 'esperando@exemplo.com', ${em(-1)}::timestamptz),
      (8, 8, 'Dono Aprovado', 'dono', 'admin', 'x', true, '84999990008', 'aprovado@exemplo.com', ${em(-1)}::timestamptz)`;
    await sql`SELECT setval('barbers_id_seq', 20)`;

    process.env.DOMINIO_BASE = 'fadeline.com.br';
    tenant = await import('../src/lib/tenant.js');
    op = await import('../src/lib/operadorBarbearias.js');
    situacao = await import('../src/lib/situacao.js');
    email = await import('../src/lib/email.js');
    await tenant.carregarTenants(true);
  }, 60_000);

  afterAll(async () => {
    if (dominioAntes === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = dominioAntes;
    await sql?.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  const host = (slug: string) => `${slug}.fadeline.com.br`;
  const pedido = (slug: string, cookie: string | null = null) =>
    new Request(`https://${host(slug)}/agendar`, { headers: { host: host(slug), ...(cookie ? { cookie } : {}) } });
  const cookieDaPrevia = (slug: string, id: number) =>
    cookieDe(previa.respostaDoLinkDaPrevia(new Request(previa.linkDaPrevia(`https://${host(slug)}`, id)!), id));

  it('o endereço que espera: nada o serve, ele diz "em preparação" — e o painel funciona', () => {
    expect(tenant.resolverHost(host('esperando'))).toBeNull();
    expect(tenant.tenantDoHost(pedido('esperando'))).toBeNull();
    expect(tenant.tenantEmPreparacaoDoHost(host('esperando'))?.id).toBe(2);
    expect(tenant.tenantDaSessaoOuNulo({ tenantId: 2 })?.id).toBe(2); // o painel: pela sessão
    // A aprovada, como sempre.
    expect(tenant.resolverHost(host('aprovada'))?.id).toBe(1);
    expect(tenant.tenantEmPreparacaoDoHost(host('aprovada'))).toBeNull();
  });

  it('nunca aprovada e fora do ar: "em preparação" — nunca o aviso de fora do ar, com o nome e o WhatsApp', () => {
    expect(tenant.tenantEmPreparacaoDoHost(host('esperou-demais'))?.id).toBe(3);
    expect(tenant.tenantSuspensoDoHost(host('esperou-demais'))).toBeNull();
    // Controle: a aprovada fora do ar continua com o aviso dela.
    expect(tenant.tenantSuspensoDoHost(host('fora-aprovada'))?.id).toBe(5);
    // Encerrada: 404, como sempre.
    expect(tenant.tenantEmPreparacaoDoHost(host('saiu-esperando'))).toBeNull();
  });

  it('com a prévia aberta, o endereço serve o site — o dela, e só no ar', () => {
    const cookie = cookieDaPrevia('esperando', 2);
    expect(tenant.tenantDoHost(pedido('esperando', cookie))?.id).toBe(2);
    expect(tenant.tenantDoHost(pedido('estendida', cookie))).toBeNull(); // o cookie de uma não abre outra
    expect(tenant.tenantDoHost(pedido('estendida', cookieDaPrevia('estendida', 6)))?.id).toBe(6);
    // Fora do ar pelo teste, nem a prévia abre.
    expect(tenant.tenantDoHost(pedido('esperou-demais', cookieDaPrevia('esperou-demais', 3)))).toBeNull();
  });

  it('aprovar: o site abre, o teste conta de hoje, e fica no registro', async () => {
    const r = await op.aprovarSite(2, '1.1.1.1', AGORA);
    const fim = situacao.fimDoTeste(AGORA, FORTALEZA);
    expect(r.slug).toBe('esperando');
    expect(r.situacao).toEqual({ fase: 'teste', ate: fim });
    const [t] = await sql`SELECT site_aprovado_em, trial_ends_at FROM tenants WHERE id = 2`;
    expect(new Date(t.site_aprovado_em).toISOString()).toBe(AGORA.toISOString());
    expect(new Date(t.trial_ends_at).toISOString()).toBe(fim.toISOString());

    const [acao] = await sql`SELECT acao, detalhe, ip FROM acoes_do_operador WHERE tenant_id = 2 ORDER BY id DESC LIMIT 1`;
    expect(acao).toEqual({
      acao: 'aprovou-site', ip: '1.1.1.1',
      detalhe: { testeAntes: new Date(AGORA.getTime() + 3 * DIA).toISOString(), testeDepois: fim.toISOString() },
    });
    expect(op.descreverAcao({ acao: acao.acao, detalhe: acao.detalhe, ip: null, quando: null, slug: 'esperando', fuso: FORTALEZA }))
      .toBe(`Aprovou o site de esperando: foi ao ar — o teste passou a ir até ${situacao.ultimoDia(fim, FORTALEZA)}`);

    // O cache solta na hora: o endereço serve o site sem prévia nenhuma.
    await tenant.carregarTenants();
    expect(tenant.resolverHost(host('esperando'))?.id).toBe(2);
    expect(tenant.tenantEmPreparacaoDoHost(host('esperando'))).toBeNull();

    await expect(op.aprovarSite(2, '1.1.1.1', AGORA)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/já está aprovado/) });
  });

  it('a que esperou além do teste volta ao ar com 7 dias; a estendida mantém o prazo; a encerrada não se aprova', async () => {
    const r3 = await op.aprovarSite(3, '1.1.1.1', AGORA);
    expect(r3.situacao).toEqual({ fase: 'teste', ate: situacao.fimDoTeste(AGORA, FORTALEZA) });

    const r6 = await op.aprovarSite(6, '1.1.1.1', AGORA);
    expect(r6.situacao).toEqual({ fase: 'teste', ate: new Date(AGORA.getTime() + 20 * DIA) });
    const [acao6] = await sql`SELECT detalhe FROM acoes_do_operador WHERE tenant_id = 6 ORDER BY id DESC LIMIT 1`;
    expect(acao6.detalhe).toEqual({});
    expect(op.descreverAcao({ acao: 'aprovou-site', detalhe: {}, ip: null, quando: null, slug: 'estendida', fuso: FORTALEZA }))
      .toBe('Aprovou o site de estendida: foi ao ar');

    await expect(op.aprovarSite(4, '1.1.1.1', AGORA)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Encerrada/) });
    await expect(op.aprovarSite(999, '1.1.1.1', AGORA)).rejects.toMatchObject({ status: 404 });
  });

  it('os avisos do teste não vão para quem nunca teve o site no ar', async () => {
    const avisos = await import('../src/lib/avisos.js');
    email.caixaDeSaida.length = 0;
    email.zerarOrcamentoDeEmail();
    await avisos.enviarAvisosPendentes(AGORA);
    const para = email.caixaDeSaida.map((e) => e.para);
    expect(para).toContain('aprovado@exemplo.com');        // controle: o aviso existe, para a aprovada
    expect(para).not.toContain('esperando@exemplo.com');
  });

  it('o Início do operador: o site que espera vem primeiro', async () => {
    const { numerosDoNegocio } = await import('../src/lib/operadorNumeros.js');
    const n = await numerosDoNegocio(AGORA);
    expect(n.atencao[0]).toMatchObject({ tenantId: 7, tom: 'atencao', texto: expect.stringMatching(/^O site espera a sua aprovação/) });
    // A encerrada que esperava não pede nada.
    expect(n.atencao.some((i) => i.tenantId === 4)).toBe(false);
    const ficha = await op.fichaDaBarbearia(7, AGORA);
    expect(ficha?.emPreparacao).toBe(true);
  });

  it('o cadastro pela web nasce esperando — o corpo não escolhe —, e SITE_SEM_APROVACAO=1 desliga', async () => {
    const antes = { aberto: process.env.CADASTRO_ABERTO, sem: process.env.SITE_SEM_APROVACAO };
    process.env.CADASTRO_ABERTO = '1';
    const DADOS = {
      nome: 'Barbearia Nova', dono: 'José', endereco: 'R. A, 1', cidade: 'Mossoró/RN', estado: 'RN', senha: 'segredo123',
      email: 'ze@exemplo.com.br', servicos: [{ nome: 'Corte', precoCentavos: 3500, minutos: 30 }],
    };
    try {
      const { POST } = await import('../src/pages/api/cadastrar.js');
      const cadastrar = (corpo: Record<string, unknown>, ip: string) => POST({
        request: new Request('http://painel.test/api/cadastrar', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
        }),
        clientAddress: ip,
      } as never);

      delete process.env.SITE_SEM_APROVACAO;
      const r = await cadastrar({ ...DADOS, slug: 'web-esperando', telefone: '84988881001', esperaAprovacao: false }, '6.6.6.1');
      expect(r.status).toBe(201);
      expect(await r.json()).toMatchObject({ emPreparacao: true, ultimoDiaDoTeste: null, site: 'https://web-esperando.fadeline.com.br' });
      const [t] = await sql`SELECT site_aprovado_em, status, trial_ends_at FROM tenants WHERE slug = 'web-esperando'`;
      expect(t.site_aprovado_em).toBeNull();
      expect(t.status).toBe('trial');
      expect(t.trial_ends_at).not.toBeNull();

      process.env.SITE_SEM_APROVACAO = '1';
      const r2 = await cadastrar({ ...DADOS, slug: 'web-no-ar', telefone: '84988881002' }, '6.6.6.2');
      expect(r2.status).toBe(201);
      const corpo2 = await r2.json();
      expect(corpo2).toMatchObject({ emPreparacao: false, site: 'https://web-no-ar.fadeline.com.br' });
      expect(corpo2.ultimoDiaDoTeste).toMatch(/^\d{2}\/\d{2}$/);
      const [t2] = await sql`SELECT site_aprovado_em FROM tenants WHERE slug = 'web-no-ar'`;
      expect(t2.site_aprovado_em).not.toBeNull();
    } finally {
      if (antes.aberto === undefined) delete process.env.CADASTRO_ABERTO; else process.env.CADASTRO_ABERTO = antes.aberto;
      if (antes.sem === undefined) delete process.env.SITE_SEM_APROVACAO; else process.env.SITE_SEM_APROVACAO = antes.sem;
    }
  }, 30_000);
});
