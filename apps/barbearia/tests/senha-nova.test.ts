// "Esqueci minha senha" — `src/lib/redefinicaoDeSenha.ts` e as duas rotas.
//
// O que estes casos seguram: o link vai para o e-mail GRAVADO e aponta para o
// painel do produto, nunca para o endereço de onde o pedido veio; o banco guarda
// o hash, não o token; o link vale uma hora e uma vez; a resposta não diz se o
// número existe; e trocar a senha — por aqui, pela tela da equipe ou pelo script
// de suporte — derruba as sessões abertas, que até 09/10/2026 valiam 30 dias
// com a senha trocada ou não.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { hash, compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { sealData } from 'iron-session';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const SENHA_ANTIGA = 'SenhaAntiga1';
const AGORA = new Date('2026-10-09T15:00:00Z');
const UMA_HORA = 60 * 60 * 1000;

let sql: ReturnType<typeof postgres>;
let senha: typeof import('../src/lib/redefinicaoDeSenha.ts');
let email: typeof import('../src/lib/email.ts');
let sessao: typeof import('../src/lib/session.ts');
let esqueci: typeof import('../src/pages/api/auth/esqueci.ts');
let novaSenha: typeof import('../src/pages/api/auth/nova-senha.ts');
let senhaPelaEquipe: typeof import('../src/pages/api/admin/barbers/[id]/password.ts');

const dominioAntes = process.env.DOMINIO_BASE;
const painelAntes = process.env.PAINEL_URL;

/** O token do último e-mail mandado. */
function tokenDoUltimoEmail(): string {
  const ultimo = email.caixaDeSaida.at(-1);
  const m = ultimo?.texto.match(/token=([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error('nenhum link de senha nova na caixa de saída');
  return m[1];
}

async function hashDaSenha(id: number): Promise<string> {
  const [b] = await sql`SELECT password_hash FROM barbers WHERE id = ${id}`;
  return b.password_hash;
}

/** A sessão vale? Passa por `getSession`, o caminho de toda rota do painel. */
async function vale(cookie: string): Promise<boolean> {
  const valor = cookie.split(';')[0];
  return (await sessao.getSession(new Request('http://painel.test/admin', { headers: { cookie: valor } }))) !== null;
}

function pedidoJson(url: string, corpo: unknown, ip: string, extra: Record<string, string> = {}) {
  return {
    request: new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...extra },
      body: JSON.stringify(corpo),
    }),
    clientAddress: ip,
  };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  const h = await hash(SENHA_ANTIGA, 4);
  // O teste grátis da Vintage tem de valer no relógio cravado (AGORA) E no de verdade: os casos
  // de "trocar a senha derruba as sessões" usam o relógio real. Cravado em AGORA + 5 dias, ele
  // venceu e a suíte ficou vermelha sozinha em 25/10/2026, sem ninguém mexer no código.
  const fimDoTeste = new Date(Math.max(AGORA.getTime(), Date.now()) + 5 * 24 * UMA_HORA).toISOString();
  await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at) VALUES
              (1, 'bayron',  'Barbearia Bayron',  'active',    NULL),
              (2, 'vintage', 'Barbearia Vintage', 'trial',     ${fimDoTeste}),
              (3, 'fechada', 'Barbearia Fechada', 'cancelled', NULL)`;
  await sql`SELECT setval('tenants_id_seq', 3)`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, phone, email, role, password_hash, active) VALUES
              (1, 1, 'Bayron',          'bayron',   '84999990001', 'dono@bayron.com',     'admin',  ${h}, true),
              (2, 1, 'Emanuel',         'emanuel',  '84999990002', NULL,                  'barber', ${h}, true),
              (3, 1, 'Demitido',        'demitido', '84999990003', 'demitido@bayron.com', 'barber', ${h}, false),
              (4, 2, 'Dona da Vintage', 'dona',     '84999990004', 'dona@vintage.com',    'admin',  ${h}, true),
              (5, 3, 'Dono da Fechada', 'dono',     '84999990005', 'dono@fechada.com',    'admin',  ${h}, true),
              (6, 1, 'Ana',             'ana',      '84999990006', 'ana@bayron.com',      'barber', ${h}, true)`;
  await sql`SELECT setval('barbers_id_seq', 6)`;

  process.env.DOMINIO_BASE = 'fadeline.com.br';
  delete process.env.PAINEL_URL;

  senha = await import('../src/lib/redefinicaoDeSenha.ts');
  email = await import('../src/lib/email.ts');
  sessao = await import('../src/lib/session.ts');
  esqueci = await import('../src/pages/api/auth/esqueci.ts');
  novaSenha = await import('../src/pages/api/auth/nova-senha.ts');
  senhaPelaEquipe = await import('../src/pages/api/admin/barbers/[id]/password.ts');
}, 30_000);

afterAll(async () => {
  if (dominioAntes === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = dominioAntes;
  if (painelAntes === undefined) delete process.env.PAINEL_URL; else process.env.PAINEL_URL = painelAntes;
  if (!TEM_BANCO) return;
  await sql.end();
  const { sqlConn } = await import('../src/db/index.js');
  await sqlConn.end({ timeout: 5 });
});

beforeEach(() => {
  if (TEM_BANCO) email.caixaDeSaida.length = 0;
});

describe.skipIf(!TEM_BANCO)('pedir a senha nova', () => {
  it('número sem cadastro: nada sai', async () => {
    expect(await senha.pedirRedefinicao('84 90000-0000', AGORA)).toBe('sem-cadastro');
    expect(email.caixaDeSaida).toHaveLength(0);
  });

  it('barbeiro desativado e barbearia encerrada: nada sai', async () => {
    expect(await senha.pedirRedefinicao('84999990003', AGORA)).toBe('sem-cadastro');
    expect(await senha.pedirRedefinicao('84999990005', AGORA)).toBe('sem-cadastro');
    expect(email.caixaDeSaida).toHaveLength(0);
  });

  it('cadastrado sem e-mail: nada sai, e o resultado diz por quê', async () => {
    expect(await senha.pedirRedefinicao('84999990002', AGORA)).toBe('sem-email');
    expect(email.caixaDeSaida).toHaveLength(0);
  });

  it('o link vai para o e-mail GRAVADO e aponta para o painel do produto', async () => {
    expect(await senha.pedirRedefinicao('(84) 99999-0001', AGORA)).toBe('enviado');
    expect(email.caixaDeSaida).toHaveLength(1);
    const [e] = email.caixaDeSaida;
    expect(e.para).toBe('dono@bayron.com');
    expect(e.texto).toContain('Olá, Bayron.');
    expect(e.texto).toContain('Barbearia Bayron');
    // ⚠️ O endereço do painel sai da configuração, nunca do `Host` de quem pediu —
    // senão o atacante pede a senha do dono com o `Host` dele, e o e-mail legítimo
    // leva o dono a entregar o token no site do atacante.
    expect(e.texto).toMatch(/https:\/\/painel\.fadeline\.com\.br\/admin\/nova-senha\?token=[A-Za-z0-9_-]{43}\b/);
  });

  it('PAINEL_URL, quando existe, manda no endereço do link', async () => {
    process.env.PAINEL_URL = 'https://painel.outro.com.br/';
    try {
      expect(await senha.pedirRedefinicao('84999990001', AGORA)).toBe('enviado');
      expect(email.caixaDeSaida[0].texto).toContain('https://painel.outro.com.br/admin/nova-senha?token=');
    } finally {
      delete process.env.PAINEL_URL;
    }
  });

  it('o banco guarda o hash do token, nunca o token', async () => {
    await senha.pedirRedefinicao('84999990001', AGORA);
    const token = tokenDoUltimoEmail();
    const linhas = await sql`SELECT token_hash FROM redefinicoes_de_senha WHERE barber_id = 1 AND usada_em IS NULL`;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    const comToken = await sql`SELECT count(*)::int AS n FROM redefinicoes_de_senha WHERE token_hash LIKE ${'%' + token + '%'}`;
    expect(comToken[0].n).toBe(0);
  });

  it('pedir de novo invalida o link anterior — só o mais novo abre', async () => {
    await senha.pedirRedefinicao('84999990001', AGORA);
    const primeiro = tokenDoUltimoEmail();
    await senha.pedirRedefinicao('84999990001', AGORA);
    const segundo = tokenDoUltimoEmail();
    expect(segundo).not.toBe(primeiro);
    expect(await senha.pedidoValido(primeiro, AGORA)).toBeNull();
    expect(await senha.pedidoValido(segundo, AGORA)).toMatchObject({ barberId: 1, tenantId: 1, nome: 'Bayron' });
  });
});

describe.skipIf(!TEM_BANCO)('o link', () => {
  it('vale por uma hora', async () => {
    await senha.pedirRedefinicao('84999990004', AGORA);
    const token = tokenDoUltimoEmail();
    expect(await senha.pedidoValido(token, new Date(AGORA.getTime() + UMA_HORA - 1000))).not.toBeNull();
    expect(await senha.pedidoValido(token, new Date(AGORA.getTime() + UMA_HORA))).toBeNull();
    expect((await senha.redefinirSenha(token, 'SenhaNova123', new Date(AGORA.getTime() + UMA_HORA))).ok).toBe(false);
  });

  it('token com forma errada nem chega ao banco', async () => {
    expect(await senha.pedidoValido('abc', AGORA)).toBeNull();
    expect(await senha.pedidoValido("' OR 1=1 --", AGORA)).toBeNull();
  });

  it('senha curta não gasta o link', async () => {
    await senha.pedirRedefinicao('84999990004', AGORA);
    const token = tokenDoUltimoEmail();
    expect(await senha.redefinirSenha(token, 'curta', AGORA)).toEqual({ ok: false, motivo: 'senha-curta' });
    expect(await senha.pedidoValido(token, AGORA)).not.toBeNull();
  });

  it('troca a senha — a nova entra, a antiga não — e funciona uma vez só', async () => {
    const vintageAntes = await hashDaSenha(4);
    await senha.pedirRedefinicao('84999990001', AGORA);
    const token = tokenDoUltimoEmail();

    expect(await senha.redefinirSenha(token, 'SenhaNova123', AGORA)).toEqual({ ok: true, tenantId: 1, barberId: 1 });
    expect(await compare('SenhaNova123', await hashDaSenha(1))).toBe(true);
    expect(await compare(SENHA_ANTIGA, await hashDaSenha(1))).toBe(false);

    expect(await senha.redefinirSenha(token, 'OutraSenha456', AGORA)).toEqual({ ok: false, motivo: 'link-invalido' });
    expect(await compare('SenhaNova123', await hashDaSenha(1))).toBe(true);

    // A outra barbearia não foi tocada.
    expect(await hashDaSenha(4)).toBe(vintageAntes);
  });

  it('dois cliques ao mesmo tempo no mesmo link: a senha troca uma vez', async () => {
    await senha.pedirRedefinicao('84999990001', AGORA);
    const token = tokenDoUltimoEmail();
    const [a, b] = await Promise.all([
      senha.redefinirSenha(token, 'PrimeiraSenha1', AGORA),
      senha.redefinirSenha(token, 'SegundaSenha2', AGORA),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const venceu = a.ok ? 'PrimeiraSenha1' : 'SegundaSenha2';
    expect(await compare(venceu, await hashDaSenha(1))).toBe(true);
  });

  it('barbeiro desativado depois do pedido: o link morre junto', async () => {
    await senha.pedirRedefinicao('84999990006', AGORA);
    const token = tokenDoUltimoEmail();
    await sql`UPDATE barbers SET active = false WHERE id = 6`;
    try {
      expect(await senha.pedidoValido(token, AGORA)).toBeNull();
      expect((await senha.redefinirSenha(token, 'SenhaNova123', AGORA)).ok).toBe(false);
    } finally {
      await sql`UPDATE barbers SET active = true WHERE id = 6`;
    }
  });
});

describe.skipIf(!TEM_BANCO)('trocar a senha derruba as sessões abertas', () => {
  // Estes casos usam o relógio de verdade: a sessão é carimbada com ele.
  it('a sessão de ANTES da troca cai; a de depois vale', async () => {
    const antes = await sessao.makeSessionCookie({ barberId: 4, role: 'admin', tenantId: 2 });
    expect(await vale(antes)).toBe(true);

    await senha.pedirRedefinicao('84999990004');
    expect((await senha.redefinirSenha(tokenDoUltimoEmail(), 'SenhaDaVintage1')).ok).toBe(true);

    expect(await vale(antes)).toBe(false);
    const depois = await sessao.makeSessionCookie({ barberId: 4, role: 'admin', tenantId: 2 });
    expect(await vale(depois)).toBe(true);
  });

  it('cookie sem carimbo — de antes desta versão — vale até a primeira troca de senha', async () => {
    const semCarimbo = async (barberId: number, tenantId: number) =>
      `__bayron_session=${await sealData({ barberId, role: 'barber', tenantId }, { password: process.env.SESSION_SECRET!, ttl: 3600 })}`;

    // Ana nunca trocou a senha: ninguém é derrubado no dia em que isto sobe.
    expect(await vale(await semCarimbo(6, 1))).toBe(true);

    await senha.pedirRedefinicao('84999990006');
    expect((await senha.redefinirSenha(tokenDoUltimoEmail(), 'SenhaDaAna123')).ok).toBe(true);
    expect(await vale(await semCarimbo(6, 1))).toBe(false);
  });

  it('o script de suporte também derruba as sessões', async () => {
    const { spawnSync } = await import('node:child_process');
    const aberta = await sessao.makeSessionCookie({ barberId: 2, role: 'barber', tenantId: 1 });
    expect(await vale(aberta)).toBe(true);

    const r = spawnSync(process.execPath, ['scripts/set-admin-password.mjs', 'emanuel', 'SenhaDoSuporte1', '--tenant=bayron'], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(await compare('SenhaDoSuporte1', await hashDaSenha(2))).toBe(true);
    expect(await vale(aberta)).toBe(false);
  }, 30_000);

  it('quem chama não escolhe o carimbo da sessão', async () => {
    // Um `emitidaEm` vindo de fora não pode fazer sessão nova parecer velha — nem
    // sessão velha parecer nova.
    const cookie = await sessao.makeSessionCookie({ barberId: 6, role: 'barber', tenantId: 1, emitidaEm: 0 });
    expect(await vale(cookie)).toBe(true);
  });
});

describe.skipIf(!TEM_BANCO)('as rotas', () => {
  it('esqueci: só JSON', async () => {
    const res = await esqueci.POST({
      request: new Request('http://painel.test/api/auth/esqueci', {
        method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"whatsapp":"84999990001"}',
      }),
      clientAddress: '10.9.0.1',
    } as never);
    expect(res.status).toBe(415);
  });

  it('esqueci: a resposta é a MESMA, exista o número ou não — e o e-mail sai depois dela', async () => {
    const existe = await esqueci.POST(pedidoJson('http://painel.test/api/auth/esqueci', { whatsapp: '84999990004' }, '10.9.0.2') as never);
    const naoExiste = await esqueci.POST(pedidoJson('http://painel.test/api/auth/esqueci', { whatsapp: '84988887777' }, '10.9.0.3') as never);
    expect(existe.status).toBe(200);
    expect(naoExiste.status).toBe(200);
    expect(await existe.json()).toEqual(await naoExiste.json());

    // A resposta saiu ANTES do e-mail: esperar o envio faria o número cadastrado
    // demorar mais para responder — e o relógio entregaria quem é cliente.
    expect(email.caixaDeSaida).toHaveLength(0);
    await vi.waitFor(() => expect(email.caixaDeSaida).toHaveLength(1));
    expect(email.caixaDeSaida[0].para).toBe('dona@vintage.com');
  });

  it('esqueci: o link aponta para o painel mesmo com outro Host na requisição', async () => {
    await esqueci.POST(pedidoJson('http://site-do-atacante.com/api/auth/esqueci', { whatsapp: '84999990001' }, '10.9.0.4',
      { host: 'site-do-atacante.com', 'x-forwarded-host': 'site-do-atacante.com' }) as never);
    await vi.waitFor(() => expect(email.caixaDeSaida).toHaveLength(1));
    expect(email.caixaDeSaida[0].texto).not.toContain('site-do-atacante');
    expect(email.caixaDeSaida[0].texto).toContain('https://painel.fadeline.com.br/admin/nova-senha?token=');
  });

  it('esqueci: o quarto pedido para o mesmo número na mesma hora é recusado', async () => {
    const pedir = (ip: string) => esqueci.POST(pedidoJson('http://painel.test/api/auth/esqueci', { whatsapp: '84977776666' }, ip) as never);
    expect((await pedir('10.9.1.1')).status).toBe(200);
    expect((await pedir('10.9.1.2')).status).toBe(200);
    expect((await pedir('10.9.1.3')).status).toBe(200);
    expect((await pedir('10.9.1.4')).status).toBe(429);
  });

  it('esqueci: com o envio de e-mail desligado, a tela diz — em vez de prometer um e-mail que não sai', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('EMAIL_PASTA', '');
    try {
      const res = await esqueci.POST(pedidoJson('http://painel.test/api/auth/esqueci', { whatsapp: '84999990001' }, '10.9.2.1') as never);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/suporte/i);

      // Com o SMTP configurado e sem endereço do painel, o link não teria para
      // onde apontar: a mesma resposta.
      vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:1');
      vi.stubEnv('DOMINIO_BASE', '');
      vi.stubEnv('PAINEL_URL', '');
      const semPainel = await esqueci.POST(pedidoJson('http://painel.test/api/auth/esqueci', { whatsapp: '84999990001' }, '10.9.2.2') as never);
      expect(semPainel.status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(email.caixaDeSaida).toHaveLength(0);
  });

  it('nova-senha: link inválido, senha curta e a troca que apaga a sessão deste navegador', async () => {
    const url = 'http://painel.test/api/auth/nova-senha';
    const invalido = await novaSenha.POST(pedidoJson(url, { token: 'x'.repeat(43), senha: 'SenhaBoa123' }, '10.9.3.1') as never);
    expect(invalido.status).toBe(410);

    await senha.pedirRedefinicao('84999990004');
    const token = tokenDoUltimoEmail();
    const curta = await novaSenha.POST(pedidoJson(url, { token, senha: '1234567' }, '10.9.3.1') as never);
    expect(curta.status).toBe(400);

    const ok = await novaSenha.POST(pedidoJson(url, { token, senha: 'SenhaBoa123' }, '10.9.3.1') as never);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/__bayron_session=;.*Max-Age=0/);
    expect(await compare('SenhaBoa123', await hashDaSenha(4))).toBe(true);
  });
});

describe.skipIf(!TEM_BANCO)('a troca pela tela da equipe', () => {
  const trocar = (cookie: string, id: number, nova: string) => senhaPelaEquipe.POST({
    request: new Request(`http://painel.test/api/admin/barbers/${id}/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie.split(';')[0] },
      body: JSON.stringify({ password: nova }),
    }),
    params: { id: String(id) },
  } as never);

  it('o dono troca a senha de alguém da equipe: a sessão dessa pessoa cai, a dele não', async () => {
    const dono = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const ana = await sessao.makeSessionCookie({ barberId: 6, role: 'barber', tenantId: 1 });
    expect(await vale(ana)).toBe(true);

    const res = await trocar(dono, 6, 'SenhaDaAna456');
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await vale(ana)).toBe(false);
    expect(await vale(dono)).toBe(true);
  });

  it('senha de menos de 8 caracteres não entra pela Equipe — a mesma regra do link (17/10/2026)', async () => {
    const dono = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const res = await trocar(dono, 6, '1234567');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/ao menos 8 caracteres/);
  });

  it('o dono troca a PRÓPRIA senha: este navegador ganha sessão nova, os outros aparelhos caem', async () => {
    const esteNavegador = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const outroAparelho = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });

    const res = await trocar(esteNavegador, 1, 'SenhaDoDono789');
    expect(res.status).toBe(200);
    const nova = res.headers.get('set-cookie');
    expect(nova).toMatch(/^__bayron_session=.+/);

    expect(await vale(outroAparelho)).toBe(false);
    expect(await vale(esteNavegador)).toBe(false);
    expect(await vale(nova!)).toBe(true);
  });
});

// ── O link pedido antes de outra troca (17/10/2026) ──────────────────────────
//
// O roteiro do ataque: quem pega o painel aberto troca o e-mail do dono pelo dele e pede a
// senha nova; o dono recebe o aviso no e-mail antigo, põe senha nova pela Equipe e volta o
// e-mail. Até 17/10/2026 o link continuava valendo, e usado dentro da hora tomava a conta.
describe.skipIf(!TEM_BANCO)('o link pedido antes de outra troca de senha ou de e-mail morre', () => {
  const pela = (cookie: string, metodo: 'PUT' | 'POST', url: string, corpo: unknown, id: number, rota: { PUT?: unknown; POST?: unknown }) =>
    (rota[metodo] as (c: unknown) => Promise<Response>)({
      request: new Request(url, { method: metodo, headers: { 'content-type': 'application/json', cookie: cookie.split(';')[0] }, body: JSON.stringify(corpo) }),
      params: { id: String(id) },
    });
  const pedirParaAna = async () => {
    await senha.pedirRedefinicao('84999990006');
    const token = tokenDoUltimoEmail();
    expect(await senha.pedidoValido(token)).toMatchObject({ barberId: 6 });
    return token;
  };

  it('a senha trocada pela Equipe', async () => {
    const token = await pedirParaAna();
    const dono = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const r = await pela(dono, 'POST', 'http://painel.test/api/admin/barbers/6/password', { password: 'SenhaNovaDaAna1' }, 6, senhaPelaEquipe);
    expect(r.status).toBe(200);
    // O pedido some do banco — não só deixa de valer pela segunda parede.
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM redefinicoes_de_senha WHERE barber_id = 6 AND usada_em IS NULL`;
    expect(n).toBe(0);
    expect(await senha.pedidoValido(token)).toBeNull();
    expect((await senha.redefinirSenha(token, 'SenhaDoIntruso1')).ok).toBe(false);
  });

  it('o e-mail trocado pela Equipe — o link foi para o endereço de antes', async () => {
    const token = await pedirParaAna();
    const dono = await sessao.makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 });
    const equipe = await import('../src/pages/api/admin/barbers/[id].ts');
    const r = await pela(dono, 'PUT', 'http://painel.test/api/admin/barbers/6', { email: 'ana.nova@bayron.com' }, 6, equipe);
    expect(r.status).toBe(200);
    expect(await senha.pedidoValido(token)).toBeNull();
  });

  it('a senha trocada pelo script de suporte', async () => {
    const token = await pedirParaAna();
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['scripts/set-admin-password.mjs', 'ana', 'SenhaDoSuporte2', '--tenant=bayron'], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM redefinicoes_de_senha WHERE barber_id = 6 AND usada_em IS NULL`;
    expect(n).toBe(0);
    expect(await senha.pedidoValido(token)).toBeNull();
  }, 30_000);

  it('a segunda parede: senha trocada por um caminho que esqueceu de matar o link', async () => {
    const token = await pedirParaAna();
    await sql`UPDATE barbers SET senha_trocada_em = now() + interval '1 second' WHERE id = 6`;
    expect(await senha.pedidoValido(token)).toBeNull();
  });
});

describe.skipIf(!TEM_BANCO)('a senha trocada pelo link zera o limite do login por conta (17/10/2026)', () => {
  it('quem trancou o dono de propósito não o tranca depois do "esqueci a senha"', async () => {
    const { chavesDaConta, checkRateLimit, LIMITE_DA_CONTA } = await import('../src/lib/rateLimit.ts');
    const [curta] = chavesDaConta('84999990004');
    for (let i = 0; i < LIMITE_DA_CONTA.curto.maxTries; i++) checkRateLimit(curta, LIMITE_DA_CONTA.curto);
    expect(checkRateLimit(curta, LIMITE_DA_CONTA.curto).ok).toBe(false);
    await senha.pedirRedefinicao('84999990004');
    const r = await senha.redefinirSenha(tokenDoUltimoEmail(), 'SenhaDaDona123');
    expect(r.ok).toBe(true);
    expect(checkRateLimit(curta, LIMITE_DA_CONTA.curto).ok).toBe(true);
  });
});
