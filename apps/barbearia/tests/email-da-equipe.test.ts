// O e-mail de cada um, na tela da equipe (`/admin/barbeiros`).
//
// Até 09/10/2026 o painel não tinha onde ver nem corrigir o e-mail: digitado
// errado no cadastro, o erro só aparecia no dia em que a senha nova não chegasse
// (`docs/JORNADA-DO-BARBEIRO.md` §2.2). Agora ele aparece na lista e se troca em
// "Editar" — com a mesma regra do cadastro (`src/lib/email.ts`).
//
// As chamadas rodam DENTRO de `comTenant`, com o papel restrito, como em
// produção — o mesmo cuidado de `tests/telefone-unico.test.ts`.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const BAYRON = { id: 1, slug: 'bayron', status: 'active', domain: null, fuso: 'America/Fortaleza' };

let sql: ReturnType<typeof postgres>;
let editar: typeof import('../src/pages/api/admin/barbers/[id].ts').PUT;
let rotaDaLista: typeof import('../src/pages/api/admin/barbers/index.ts');
let comTenant: typeof import('../src/db/index.js')['comTenant'];
let cookieDono = '';
let cookieBarbeiro = '';

function pedido(url: string, metodo: string, cookie: string, corpo?: unknown): Request {
  return new Request(url, {
    method: metodo,
    headers: { cookie, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

const trocarEmail = (id: number, email: unknown, cookie = cookieDono) =>
  comTenant(BAYRON, async () => editar({
    request: pedido(`http://painel.test/api/admin/barbers/${id}`, 'PUT', cookie, { email }),
    params: { id: String(id) },
  } as never));

async function emailDe(id: number): Promise<string | null> {
  const [b] = await sql`SELECT email FROM barbers WHERE id = ${id}`;
  return b.email;
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active'),
              (2, 'vintage', 'Barbearia Vintage', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email) VALUES
              (1, 1, 'Dono do Bayron',  'dono',   'admin',  'x', true, '84999990001', NULL),
              (2, 1, 'Ana',             'ana',    'barber', 'x', true, '84999990002', NULL),
              (4, 2, 'Dona da Vintage', 'dona-v', 'admin',  'x', true, '84999990004', 'dona@vintage.com')`;
  // O e-mail confirmado: só ele recebe (lib/confirmacaoDeEmail.ts). O não confirmado está em
  // tests/confirmacao-de-email.test.ts.
  await sql`UPDATE barbers SET email_confirmado_em = now() WHERE email IS NOT NULL`;
  await sql`SELECT setval('barbers_id_seq', 10)`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  const valor = (c: string) => c.split(';')[0];
  cookieDono     = valor(await makeSessionCookie({ barberId: 1, role: 'admin',  tenantId: 1 }));
  cookieBarbeiro = valor(await makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 }));

  ({ PUT: editar } = await import('../src/pages/api/admin/barbers/[id].ts'));
  rotaDaLista = await import('../src/pages/api/admin/barbers/index.ts');
  ({ comTenant } = await import('../src/db/index.js'));
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const mod = await import('../src/db/index.js');
  await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o e-mail na tela da equipe', () => {
  it('o dono grava o e-mail de alguém — sem espaço e em minúsculas, como o cadastro', async () => {
    const r = await trocarEmail(2, '  Ana@Bayron.COM ');
    expect(r.status).toBe(200);
    expect(await emailDe(2)).toBe('ana@bayron.com');
  });

  it('vazio apaga', async () => {
    expect((await trocarEmail(2, '')).status).toBe(200);
    expect(await emailDe(2)).toBeNull();
  });

  it('sem forma de e-mail: 400 com o motivo, e nada muda', async () => {
    await trocarEmail(1, 'dono@bayron.com');
    const r = await trocarEmail(1, 'dono@bayron');
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/não parece um e-mail/);
    expect(await emailDe(1)).toBe('dono@bayron.com');
  });

  it('não alcança o barbeiro de outra barbearia', async () => {
    const r = await trocarEmail(4, 'invasor@x.com');
    expect(r.status).toBe(404);
    expect(await emailDe(4)).toBe('dona@vintage.com');
  });

  it('só o dono troca', async () => {
    const r = await trocarEmail(2, 'ana@bayron.com', cookieBarbeiro);
    expect(r.status).toBe(403);
  });

  it('a lista devolve o e-mail; o barbeiro novo pode nascer com um', async () => {
    const criado = await comTenant(BAYRON, async () => rotaDaLista.POST({
      request: pedido('http://painel.test/api/admin/barbers', 'POST', cookieDono, {
        name: 'Carlos', phone: '84999990077', role: 'barber', password: 'senha-de-teste', email: 'Carlos@Bayron.com',
      }),
    } as never));
    expect(criado.status).toBe(201);

    const ruim = await comTenant(BAYRON, async () => rotaDaLista.POST({
      request: pedido('http://painel.test/api/admin/barbers', 'POST', cookieDono, {
        name: 'Paulo', phone: '84999990078', role: 'barber', password: 'senha-de-teste', email: 'paulo@',
      }),
    } as never));
    expect(ruim.status).toBe(400);

    const lista = await comTenant(BAYRON, async () => rotaDaLista.GET({
      request: pedido('http://painel.test/api/admin/barbers', 'GET', cookieDono),
    } as never));
    const corpo = (await lista.json()) as { name: string; email: string | null }[];
    expect(corpo.find((b) => b.name === 'Carlos')?.email).toBe('carlos@bayron.com');
    expect(corpo.some((b) => b.name === 'Paulo')).toBe(false);
  });
});

// ── O aviso ao e-mail antigo (`src/lib/avisoDeEmailTrocado.ts`, 13/10/2026) ──────────
//
// Quem pega o painel de um dono aberto troca o e-mail da conta e pede a senha nova: o
// link vai para o e-mail novo, e o dono perdia a conta em silêncio
// (`docs/PENDENCIAS-ABERTAS.md` §4.17). Agora o endereço antigo fica sabendo.

describe('trocaQueAvisa() e o texto do aviso — sem banco', () => {
  let mod: typeof import('../src/lib/avisoDeEmailTrocado.js');
  beforeAll(async () => { mod = await import('../src/lib/avisoDeEmailTrocado.js'); });

  it('avisa só quando havia e-mail antes e o de agora é outro', () => {
    expect(mod.trocaQueAvisa('ana@x.com', 'nova@x.com')).toBe(true);
    expect(mod.trocaQueAvisa('ana@x.com', null)).toBe(true);
    expect(mod.trocaQueAvisa('ana@x.com', '  ANA@x.com ')).toBe(false);
    expect(mod.trocaQueAvisa(null, 'nova@x.com')).toBe(false);
    expect(mod.trocaQueAvisa('', 'nova@x.com')).toBe(false);
  });

  it('sem o endereço do painel, o passo 1 continua — sem o link quebrado', () => {
    const { texto } = mod.textoDoAvisoDeEmailTrocado(
      { pessoa: { id: 1, nome: 'Zé', papel: 'admin' }, antigo: 'ze@x.com', novo: 'novo@y.com', quemTrocou: { id: 1, nome: 'Zé' } },
      { barbearia: 'Barbearia do Zé', painel: '', quando: '13/10/2026 às 14:32' },
    );
    expect(texto).toContain('1. Entre no painel com o seu WhatsApp e a sua senha.');
    expect(texto).not.toMatch(/undefined|\/admin\/login/);
    expect(texto).toContain('foi trocado em 13/10/2026 às 14:32, pelo seu próprio acesso.');
  });
});

describe.skipIf(!TEM_BANCO)('o aviso ao e-mail antigo', () => {
  let caixa: typeof import('../src/lib/email.js')['caixaDeSaida'];
  beforeAll(async () => {
    ({ caixaDeSaida: caixa } = await import('../src/lib/email.js'));
  });
  const para = (endereco: string) => caixa.filter((e) => e.para === endereco);

  it('o dono troca o e-mail de alguém: o antigo recebe o aviso, com o novo mascarado', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = now() WHERE id = 2`;
    caixa.length = 0;
    expect((await trocarEmail(2, 'Ana.Nova@Gmail.com')).status).toBe(200);
    expect(caixa).toHaveLength(1);
    const [aviso] = caixa;
    expect(aviso.para).toBe('ana@bayron.com');
    expect(aviso.assunto).toMatch(/^O e-mail do seu acesso foi trocado — /);
    expect(aviso.texto).toContain('Olá, Ana.');
    expect(aviso.texto).toMatch(/foi trocado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}, por Dono do Bayron\./);
    expect(aviso.texto).toContain('Agora é a***@gmail.com');
    expect(aviso.texto).not.toContain('ana.nova@gmail.com');
    // O barbeiro não tem a tela da Equipe: o caminho dele é o dono.
    expect(aviso.texto).toContain('Fale com o dono da barbearia');
    expect(aviso.texto).not.toContain('Em Equipe, na sua linha');
  });

  it('o dono troca o próprio: o aviso diz que foi pelo acesso dele, e o que fazer se não foi', async () => {
    await sql`UPDATE barbers SET email = 'dono@bayron.com', email_confirmado_em = now() WHERE id = 1`;
    caixa.length = 0;
    expect((await trocarEmail(1, 'outro@invasor.com')).status).toBe(200);
    expect(para('dono@bayron.com')).toHaveLength(1);
    const { texto } = para('dono@bayron.com')[0];
    expect(texto).toContain('pelo seu próprio acesso.');
    expect(texto).toContain('2. Em Equipe, na sua linha, ponha uma senha nova');
    expect(texto).toContain('3. Na mesma tela, volte o e-mail para este.');
    expect(texto).toMatch(/1\. Entre no painel com o seu WhatsApp e a sua senha: http\S+\/admin\/login/);
    expect(texto).not.toContain('outro@invasor.com');
  });

  it('apagar o e-mail também avisa — é o mesmo golpe, sem o link chegar a ninguém', async () => {
    await sql`UPDATE barbers SET email = 'dono@bayron.com', email_confirmado_em = now() WHERE id = 1`;
    caixa.length = 0;
    expect((await trocarEmail(1, '')).status).toBe(200);
    expect(await emailDe(1)).toBeNull();
    expect(para('dono@bayron.com')).toHaveLength(1);
    expect(para('dono@bayron.com')[0].assunto).toMatch(/^O e-mail do seu acesso foi apagado — /);
    expect(para('dono@bayron.com')[0].texto).toContain('foi apagado em');
  });

  it('salvar o mesmo e-mail — com espaço ou maiúscula — não avisa ninguém', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = now() WHERE id = 2`;
    caixa.length = 0;
    expect((await trocarEmail(2, '  ANA@bayron.com ')).status).toBe(200);
    expect(caixa).toHaveLength(0);
  });

  it('quem não tinha e-mail ganha um: não há a quem avisar', async () => {
    await sql`UPDATE barbers SET email = NULL WHERE id = 2`;
    caixa.length = 0;
    expect((await trocarEmail(2, 'ana@bayron.com')).status).toBe(200);
    expect(caixa).toHaveLength(0);
  });

  it('o e-mail recusado, o de outra barbearia e o barbeiro sem permissão não avisam', async () => {
    await sql`UPDATE barbers SET email = 'ana@bayron.com', email_confirmado_em = now() WHERE id = 2`;
    caixa.length = 0;
    expect((await trocarEmail(2, 'ana@')).status).toBe(400);
    expect((await trocarEmail(4, 'invasor@x.com')).status).toBe(404);
    expect((await trocarEmail(2, 'outra@x.com', cookieBarbeiro)).status).toBe(403);
    expect(caixa).toHaveLength(0);
    expect(await emailDe(4)).toBe('dona@vintage.com');
  });

  it('o provedor que recusa não derruba nada: a função não lança', async () => {
    const { avisarEmailTrocado } = await import('../src/lib/avisoDeEmailTrocado.js');
    const troca = {
      tenant: BAYRON as never,
      pessoa: { id: 2, nome: 'Ana', papel: 'barber' as const },
      antigo: 'ana@bayron.com', antigoConfirmado: true, novo: 'nova@x.com',
      quemTrocou: { id: 1, nome: 'Dono do Bayron' },
    };
    const avisos: unknown[] = [];
    const aviso = console.warn;
    console.warn = (...a: unknown[]) => { avisos.push(a); };
    try {
      // Recusa na hora, antes de devolver a promessa…
      expect(await comTenant(BAYRON, () => avisarEmailTrocado({ ...troca, enviar: () => { throw new Error('SMTP fora'); } }))).toBe(false);
      // …e recusa depois, com a promessa já devolvida.
      expect(await comTenant(BAYRON, () => avisarEmailTrocado({ ...troca, enviar: async () => { throw new Error('SMTP fora'); } }))).toBe(true);
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      console.warn = aviso;
    }
    expect(avisos).toHaveLength(2);
    expect(String((avisos[0] as unknown[])[0])).toContain('a***@bayron.com');
  });

  it('a hora do aviso é a da barbearia, não a do servidor', async () => {
    const { avisarEmailTrocado } = await import('../src/lib/avisoDeEmailTrocado.js');
    const recebidos: { texto: string }[] = [];
    await comTenant(BAYRON, () => avisarEmailTrocado({
      tenant: { ...BAYRON, fuso: 'America/Manaus' } as never,
      pessoa: { id: 2, nome: 'Ana', papel: 'barber' }, antigo: 'ana@bayron.com', antigoConfirmado: true, novo: 'nova@x.com',
      quemTrocou: { id: 1, nome: 'Dono do Bayron' },
      agora: new Date('2026-10-13T03:30:00.000Z'),
      enviar: async (e) => { recebidos.push(e); },
    }));
    // 03:30 UTC é 23:30 do dia 12 em Manaus (UTC−4).
    expect(recebidos[0].texto).toContain('foi trocado em 12/10/2026 às 23:30');
  });
});
