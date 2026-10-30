// A confirmação do e-mail — `src/lib/confirmacaoDeEmail.ts` (30/10/2026).
//
// O que estes casos seguram: nada sai para e-mail não confirmado — nem a senha nova, nem os
// avisos —, menos o próprio pedido de confirmação, que não leva texto digitado; abrir o link
// não confirma, o clique sim; o link confirma o endereço para onde foi, e morre se o e-mail
// mudar; trocar o e-mail volta a confirmação para nula; e os pedidos têm limite.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null, fuso: 'America/Fortaleza' };
const AGORA = new Date('2026-10-30T15:00:00Z');
const MINUTO = 60 * 1000;

let sql: ReturnType<typeof postgres>;
let conf: typeof import('../src/lib/confirmacaoDeEmail.ts');
let email: typeof import('../src/lib/email.ts');
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let cookieDono = '';
let cookieBarbeiro = '';

const dominioAntes = process.env.DOMINIO_BASE;
const painelAntes = process.env.PAINEL_URL;

function tokenDe(texto: string | undefined): string {
  const m = texto?.match(/confirmar-email\?token=([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error('nenhum link de confirmação no e-mail');
  return m[1];
}

async function confirmadoEm(id: number): Promise<Date | null> {
  const [b] = await sql`SELECT email_confirmado_em FROM barbers WHERE id = ${id}`;
  return b.email_confirmado_em;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
              (1, 'Barbearia Bayron', 'Bayron', '5584999990000', 'Rua A, 1', 'Natal/RN'),
              (2, 'Barbearia Vintage', 'Vintage', '5584999990009', 'Rua B, 2', 'Natal/RN')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true, '84999990001', 'dono@bayron.com'),
              (2, 1, 'Ana',             'ana',    'barber', 'x', true, '84999990002', 'ana@bayron.com'),
              (3, 1, 'Beto',            'beto',   'barber', 'x', true, '84999990003', 'beto@bayron.com'),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true, '84999990004', 'dona@vintage.com')`;
  await sql`SELECT setval('barbers_id_seq', 10)`;

  process.env.DOMINIO_BASE = 'fadeline.com.br';
  delete process.env.PAINEL_URL;

  conf = await import('../src/lib/confirmacaoDeEmail.ts');
  email = await import('../src/lib/email.ts');
  ({ comTenant } = await import('../src/db/index.js'));
  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDono     = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookieBarbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));
}, 30_000);

afterAll(async () => {
  if (dominioAntes === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = dominioAntes;
  if (painelAntes === undefined) delete process.env.PAINEL_URL; else process.env.PAINEL_URL = painelAntes;
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

beforeEach(() => {
  if (TEM_BANCO) email.caixaDeSaida.length = 0;
  vi.unstubAllEnvs();
});

describe('o e-mail que vai para endereço não confirmado', () => {
  it('não leva nada digitado — nem barbearia, nem pessoa', async () => {
    const { textoDoPedidoDeConfirmacao } = await import('../src/lib/confirmacaoDeEmail.ts');
    const { assunto, texto } = textoDoPedidoDeConfirmacao('https://painel.fadeline.com.br/admin/confirmar-email?token=x');
    expect(assunto).toBe('Confirme o seu e-mail — Fadeline');
    expect(texto).toContain('https://painel.fadeline.com.br/admin/confirmar-email?token=x');
    expect(texto).toContain('Ele vale por 3 dias');
    expect(texto).toContain('nada mais chega a este endereço');
    // A função nem recebe nome: o que entra é o link e o texto fixo.
    expect(textoDoPedidoDeConfirmacao.length).toBe(1);
  });

  it('o de boas-vindas do cadastro leva o link — e continua sem texto digitado', async () => {
    const { emailDeBoasVindas } = await import('../src/pages/api/cadastrar.ts');
    expect(emailDeBoasVindas.length).toBe(1);
    const { texto } = emailDeBoasVindas({
      site: 'https://x.fadeline.com.br', painel: 'https://painel.fadeline.com.br', whatsapp: '(84) 99999-0001',
      ultimoDiaDoTeste: '06/11', linkDeConfirmacao: 'https://painel.fadeline.com.br/admin/confirmar-email?token=abc',
    });
    expect(texto).toContain('https://painel.fadeline.com.br/admin/confirmar-email?token=abc');
    expect(texto).toContain('Até confirmar, nenhum desses e-mails chega aqui.');
  });

  it('a tela do link é pública, e abrir não confirma: só o botão', () => {
    expect(readFileSync('src/middleware.ts', 'utf8')).toMatch(/PAINEL_PUBLICO = new Set\(\[[^\]]*'\/admin\/confirmar-email'/);
    const tela = readFileSync('src/pages/admin/confirmar-email.astro', 'utf8');
    expect(tela).toMatch(/estadoDoLink\(token\)/);
    expect(tela).not.toMatch(/confirmarEmail\(/);
    expect(tela).toMatch(/fetch\('\/api\/auth\/confirmar-email'/);
  });
});

describe.skipIf(!TEM_BANCO)('o link de confirmação', () => {
  it('vai para o e-mail gravado, aponta para o painel, e o banco guarda só o hash', async () => {
    expect(await conf.pedirConfirmacao({ tenantId: 1, barberId: 3, agora: AGORA })).toBe('enviado');
    expect(email.caixaDeSaida).toHaveLength(1);
    const [e] = email.caixaDeSaida;
    expect(e.para).toBe('beto@bayron.com');
    expect(e.texto).toMatch(/https:\/\/painel\.fadeline\.com\.br\/admin\/confirmar-email\?token=/);
    expect(e.texto).not.toMatch(/Beto|Bayron/);
    const token = tokenDe(e.texto);
    const linhas = await sql`SELECT token_hash, email FROM confirmacoes_de_email WHERE barber_id = 3`;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].token_hash).toBe(conf.hashDoToken(token));
    expect(linhas[0].token_hash).not.toContain(token);
    expect(linhas[0].email).toBe('beto@bayron.com');
  });

  it('abrir não confirma; o clique confirma; o segundo clique diz que já está', async () => {
    await conf.pedirConfirmacao({ tenantId: 1, barberId: 2, agora: AGORA });
    const token = tokenDe(email.caixaDeSaida.at(-1)?.texto);

    expect(await conf.estadoDoLink(token, AGORA)).toMatchObject({ estado: 'valido', barberId: 2, emailMascarado: 'a***@bayron.com' });
    expect(await confirmadoEm(2)).toBeNull();

    expect(await conf.confirmarEmail(token, AGORA)).toBe(true);
    expect(await confirmadoEm(2)).not.toBeNull();
    expect(await conf.estadoDoLink(token, AGORA)).toEqual({ estado: 'ja-confirmado', emailMascarado: 'a***@bayron.com' });
    expect(await conf.confirmarEmail(token, AGORA)).toBe(false);
    expect(await conf.pedirConfirmacao({ tenantId: 1, barberId: 2, agora: new Date(AGORA.getTime() + 5 * MINUTO) })).toBe('ja-confirmado');
  });

  it('vale 3 dias, e só o mais novo abre', async () => {
    await sql`UPDATE barbers SET email = 'dono@bayron.com', email_confirmado_em = NULL WHERE id = 1`;
    await conf.pedirConfirmacao({ tenantId: 1, barberId: 1, agora: AGORA });
    const velho = tokenDe(email.caixaDeSaida.at(-1)?.texto);
    const depois = new Date(AGORA.getTime() + 2 * MINUTO);
    await conf.pedirConfirmacao({ tenantId: 1, barberId: 1, agora: depois });
    const novo = tokenDe(email.caixaDeSaida.at(-1)?.texto);

    expect((await conf.estadoDoLink(velho, depois)).estado).toBe('invalido');
    expect((await conf.estadoDoLink(novo, depois)).estado).toBe('valido');
    const vencido = new Date(depois.getTime() + conf.VALIDADE_DA_CONFIRMACAO_MS);
    expect((await conf.estadoDoLink(novo, vencido)).estado).toBe('invalido');
    expect(await conf.confirmarEmail(novo, vencido)).toBe(false);
    expect(await confirmadoEm(1)).toBeNull();
  });

  it('o e-mail trocado depois do pedido mata o link — ele confirmava o endereço de antes', async () => {
    await sql`UPDATE barbers SET email = 'dono@bayron.com', email_confirmado_em = NULL WHERE id = 1`;
    const quando = new Date(AGORA.getTime() + 10 * MINUTO);
    expect(await conf.pedirConfirmacao({ tenantId: 1, barberId: 1, agora: quando })).toBe('enviado');
    const token = tokenDe(email.caixaDeSaida.at(-1)?.texto);
    await sql`UPDATE barbers SET email = 'outro@bayron.com' WHERE id = 1`;
    expect((await conf.estadoDoLink(token, quando)).estado).toBe('invalido');
    expect(await conf.confirmarEmail(token, quando)).toBe(false);
    expect(await confirmadoEm(1)).toBeNull();
    // O link não foi gasto: só não confirma.
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM confirmacoes_de_email WHERE usada_em IS NOT NULL AND barber_id = 1`;
    expect(n).toBe(0);
  });

  it('o e-mail trocado ENTRE a tela e o clique: nada confirma, e o link não é gasto', async () => {
    // A mudança no meio, de forma determinística: um gatilho que troca o e-mail do barbeiro no
    // instante em que o link é gasto — dentro da mesma transação do clique.
    await sql`UPDATE barbers SET email = 'beto@bayron.com', email_confirmado_em = NULL WHERE id = 3`;
    await sql`DELETE FROM confirmacoes_de_email WHERE barber_id = 3`;
    const quando = new Date(AGORA.getTime() + 20 * MINUTO);
    await conf.pedirConfirmacao({ tenantId: 1, barberId: 3, agora: quando });
    const token = tokenDe(email.caixaDeSaida.at(-1)?.texto);
    await sql.unsafe(`
      CREATE FUNCTION teste_troca_no_meio() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN UPDATE barbers SET email = 'trocado@bayron.com' WHERE id = NEW.barber_id; RETURN NEW; END $$;
      CREATE TRIGGER teste_troca_no_meio BEFORE UPDATE OF usada_em ON confirmacoes_de_email
        FOR EACH ROW EXECUTE FUNCTION teste_troca_no_meio();`);
    try {
      expect((await conf.estadoDoLink(token, quando)).estado).toBe('valido');
      expect(await conf.confirmarEmail(token, quando)).toBe(false);
    } finally {
      await sql.unsafe('DROP TRIGGER teste_troca_no_meio ON confirmacoes_de_email; DROP FUNCTION teste_troca_no_meio();');
    }
    expect(await confirmadoEm(3)).toBeNull();
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM confirmacoes_de_email WHERE barber_id = 3 AND usada_em IS NOT NULL`;
    expect(n).toBe(0);
  });

  it('um pedido por minuto, cinco por dia — e com o envio desligado, nada é gravado', async () => {
    await sql`UPDATE barbers SET email = 'dona@vintage.com', email_confirmado_em = NULL WHERE id = 4`;
    const t = (min: number) => new Date(AGORA.getTime() + min * MINUTO);
    expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(0) })).toBe('enviado');
    expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(0.5) })).toBe('cedo-demais');
    for (const m of [2, 4, 6, 8]) expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(m) })).toBe('enviado');
    expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(10) })).toBe('limite-do-dia');
    expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(24 * 60 + 1) })).toBe('enviado');

    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('EMAIL_PASTA', '');
    const [{ n: antes }] = await sql`SELECT count(*)::int AS n FROM confirmacoes_de_email WHERE barber_id = 4`;
    expect(await conf.pedirConfirmacao({ tenantId: 2, barberId: 4, agora: t(26 * 60) })).toBe('sem-envio');
    const [{ n: depois }] = await sql`SELECT count(*)::int AS n FROM confirmacoes_de_email WHERE barber_id = 4`;
    expect(depois).toBe(antes);
  });

  it('o provedor que recusa: a função não lança e diz que falhou', async () => {
    await sql`UPDATE barbers SET email_confirmado_em = NULL WHERE id = 3`;
    const erro = console.error;
    console.error = () => {};
    try {
      expect(await conf.pedirConfirmacao({ tenantId: 1, barberId: 3, agora: new Date(AGORA.getTime() + 60 * MINUTO),
        enviar: async () => { throw new Error('SMTP fora'); } })).toBe('falhou');
    } finally {
      console.error = erro;
    }
  });
});

describe.skipIf(!TEM_BANCO)('nada sai para e-mail não confirmado', () => {
  it('a senha nova não vai — e passa a ir depois de confirmado', async () => {
    await sql`UPDATE barbers SET email = 'dono@bayron.com', email_confirmado_em = NULL WHERE id = 1`;
    const { pedirRedefinicao } = await import('../src/lib/redefinicaoDeSenha.ts');
    expect(await pedirRedefinicao('84999990001')).toBe('email-nao-confirmado');
    expect(email.caixaDeSaida).toHaveLength(0);
    await sql`UPDATE barbers SET email_confirmado_em = now() WHERE id = 1`;
    expect(await pedirRedefinicao('84999990001')).toBe('enviado');
  });

  it('o aviso de agenda e os avisos do teste e da cobrança só leem o confirmado', async () => {
    await sql`UPDATE barbers SET email_confirmado_em = NULL WHERE id = 3`;
    await sql`UPDATE barbers SET email_confirmado_em = now() WHERE id = 1`;
    const { destinatariosDoAviso } = await import('../src/lib/avisoDeAgenda.ts');
    const r = await comTenant(BAYRON as never, () => destinatariosDoAviso(BAYRON as never, 3));
    expect(r.map((d) => d.email)).toEqual(['dono@bayron.com']);
    // Os avisos do teste e da cobrança: a mesma condição na busca dos donos.
    expect(readFileSync('src/lib/avisos.ts', 'utf8')).toMatch(/isNotNull\(barbers\.emailConfirmadoEm\)/);
  });

  it('o aviso de e-mail trocado só vai para o antigo se ele estava confirmado', async () => {
    const { avisarEmailTrocado } = await import('../src/lib/avisoDeEmailTrocado.ts');
    const troca = {
      tenant: BAYRON as never,
      pessoa: { id: 2, nome: 'Ana', papel: 'barber' as const },
      antigo: 'ana@bayron.com', novo: 'nova@x.com',
      quemTrocou: { id: 1, nome: 'Dono do Bayron' },
    };
    const recebidos: unknown[] = [];
    const enviar = async (e: unknown) => { recebidos.push(e); };
    expect(await comTenant(BAYRON as never, () => avisarEmailTrocado({ ...troca, enviar }))).toBe(false);
    expect(await comTenant(BAYRON as never, () => avisarEmailTrocado({ ...troca, antigoConfirmado: false, enviar }))).toBe(false);
    expect(recebidos).toHaveLength(0);
    expect(await comTenant(BAYRON as never, () => avisarEmailTrocado({ ...troca, antigoConfirmado: true, enviar }))).toBe(true);
    expect(recebidos).toHaveLength(1);
  });
});

describe.skipIf(!TEM_BANCO)('pelas rotas', () => {
  const pela = async (rota: string, metodo: string, cookie: string, id: number, corpo?: unknown) => {
    const mod = await import(rota);
    return comTenant(BAYRON as never, () => mod[metodo]({
      request: new Request(`http://painel.test/api/admin/barbers/${id}`, {
        method: metodo, headers: { cookie, 'content-type': 'application/json' },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      }),
      params: { id: String(id) },
    }) as Promise<Response>);
  };
  const EDITAR = '../src/pages/api/admin/barbers/[id].ts';
  const REENVIAR = '../src/pages/api/admin/barbers/[id]/confirmar-email.ts';

  it('trocar o e-mail na Equipe desfaz a confirmação e manda o link para o novo', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = now() WHERE id = 2`;
    const r = await pela(EDITAR, 'PUT', cookieDono, 2, { email: 'Ana.Nova@Gmail.com' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, confirmacao: 'enviado' });
    expect(await confirmadoEm(2)).toBeNull();
    const paraNovo = email.caixaDeSaida.filter((e) => e.para === 'ana.nova@gmail.com');
    expect(paraNovo).toHaveLength(1);
    expect(paraNovo[0].assunto).toBe('Confirme o seu e-mail — Fadeline');
    // O antigo, confirmado, recebe o aviso da troca.
    expect(email.caixaDeSaida.filter((e) => e.para === 'ana@bayron.com')).toHaveLength(1);
  });

  it('o e-mail antigo NÃO confirmado não recebe o aviso da troca — só o novo recebe o link', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = NULL WHERE id = 2`;
    await sql`DELETE FROM confirmacoes_de_email WHERE barber_id = 2`;
    const r = await pela(EDITAR, 'PUT', cookieDono, 2, { email: 'ana.outra@gmail.com' });
    expect(r.status).toBe(200);
    expect(email.caixaDeSaida.map((e) => e.para)).toEqual(['ana.outra@gmail.com']);
  });

  it('salvar a ficha com o mesmo e-mail não desfaz a confirmação', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = now() WHERE id = 2`;
    const r = await pela(EDITAR, 'PUT', cookieDono, 2, { email: ' ANA@bayron.com ', name: 'Ana Maria' });
    expect(r.status).toBe(200);
    expect(await confirmadoEm(2)).not.toBeNull();
    expect(email.caixaDeSaida).toHaveLength(0);
  });

  it('mandar o link de novo: o dono para a equipe; o barbeiro só para si; de outra barbearia, 404', async () => {
    await sql`UPDATE barbers SET email_confirmado_em = NULL WHERE id IN (1, 3)`;
    await sql`DELETE FROM confirmacoes_de_email WHERE barber_id IN (1, 2, 3)`;
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = NULL WHERE id = 2`;

    const doDono = await pela(REENVIAR, 'POST', cookieDono, 3);
    expect(doDono.status).toBe(200);
    expect((await doDono.json()).mensagem).toContain('b***@bayron.com');

    expect((await pela(REENVIAR, 'POST', cookieBarbeiro, 3)).status).toBe(403);
    expect((await pela(REENVIAR, 'POST', cookieBarbeiro, 2)).status).toBe(200);
    expect((await pela(REENVIAR, 'POST', cookieDono, 4)).status).toBe(404);
    expect(email.caixaDeSaida.map((e) => e.para).sort()).toEqual(['ana@bayron.com', 'beto@bayron.com']);

    const cedo = await pela(REENVIAR, 'POST', cookieDono, 3);
    expect(cedo.status).toBe(429);
    expect((await cedo.json()).motivo).toBe('cedo-demais');
  });

  it('o clique: 410 no link que não vale, 200 no que vale', async () => {
    const { POST } = await import('../src/pages/api/auth/confirmar-email.ts');
    const clicar = (token: string) => POST({
      request: new Request('http://painel.test/api/auth/confirmar-email', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
      }),
      clientAddress: '10.9.0.1',
    } as never);
    expect((await clicar('a'.repeat(43))).status).toBe(410);

    await sql`UPDATE barbers SET email_confirmado_em = NULL WHERE id = 3`;
    await sql`DELETE FROM confirmacoes_de_email WHERE barber_id = 3`;
    await conf.pedirConfirmacao({ tenantId: 1, barberId: 3 });
    const r = await clicar(tokenDe(email.caixaDeSaida.at(-1)?.texto));
    expect(r.status).toBe(200);
    expect(await confirmadoEm(3)).not.toBeNull();
  });
});
