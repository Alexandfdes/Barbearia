// Rota que abre sessão com a credencial do corpo só aceita JSON
// (`PENDENCIAS-ABERTAS.md` §2.23).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// O login do painel lia `request.json()` sem olhar o tipo do corpo, e abria
// sessão. Com o `checkOrigin` do Astro desligado (`astro.config.mjs`), um
// formulário de OUTRO site manda `text/plain` com o corpo em forma de JSON — sem
// pré-voo de CORS, porque `text/plain` é envio "simples" — e o navegador guarda o
// cookie que volta. A página maliciosa deixava o visitante logado numa conta
// DELA ("login CSRF"), e o que ele cadastrasse depois ia para lá.
//
// `application/json` vindo de outro site exige o pré-voo, que este servidor não
// autoriza. O `/api/cadastrar` já recusava (415) desde 25/09/2026; o login do
// painel e o do cliente, não. O mecanismo foi conferido no código e nos casos
// abaixo — não num navegador com outro site de verdade.
//
// O guarda de baixo vale para a próxima rota: toda rota que abre sessão SEM
// sessão anterior — a credencial vem do corpo — tem que recusar o que não é JSON.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

// ── O guarda: toda rota que abre sessão pela credencial do corpo ─────────────

/** O código sem os comentários: é neles que a linha antiga fica registrada. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const CONFERE_JSON = /request\.headers\.get\('content-type'\)[^\n]*startsWith\('application\/json'\)/;

function rotasQueAbremSessao(): { arquivo: string; fonte: string }[] {
  return globSync('src/pages/api/**/*.ts')
    .map((c) => ({ arquivo: c.split(sep).join('/'), fonte: semComentarios(readFileSync(c, 'utf8')) }))
    // Quem chama `getSession` só renova a sessão de quem já está dentro.
    .filter(({ fonte }) => /make(Customer)?SessionCookie\(/.test(fonte) && !/getSession\(/.test(fonte));
}

/** Recusa antes de ler o corpo — a conferência depois do `request.json()` não protege nada. */
function recusaAntesDeLer(fonte: string): boolean {
  const conferencia = fonte.search(CONFERE_JSON);
  const leitura = fonte.search(/request\.json\(\)/);
  return conferencia !== -1 && leitura !== -1 && conferencia < leitura;
}

describe('toda rota que abre sessão pela credencial do corpo só aceita JSON', () => {
  it('controle: o recorte acha as três, e o critério reprova a rota sem a linha', () => {
    const achadas = rotasQueAbremSessao().map((r) => r.arquivo).sort();
    expect(achadas).toEqual([
      'src/pages/api/auth/login.ts',
      'src/pages/api/cadastrar.ts',
      'src/pages/api/customer/login.ts',
    ]);
    expect(recusaAntesDeLer("let b = await request.json();")).toBe(false);
    expect(recusaAntesDeLer(
      "let b = await request.json();\nif (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {}",
    )).toBe(false);
  });

  it('todas recusam antes de ler o corpo', () => {
    const sem = rotasQueAbremSessao().filter((r) => !recusaAntesDeLer(r.fonte)).map((r) => r.arquivo);
    expect(sem).toEqual([]);
  });
});

// ── As duas rotas de login, contra o banco ──────────────────────────────────

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const SENHA = 'SenhaBoa123';
const HOST = 'login-json.test';
let sql: ReturnType<typeof postgres>;
let loginPainel: typeof import('../src/pages/api/auth/login.ts').POST;
let loginCliente: typeof import('../src/pages/api/customer/login.ts').POST;
let ip = 0;

async function chamar(rota: typeof loginPainel, url: string, tipo: string, corpo: object) {
  ip += 1;
  const endereco = `10.23.0.${ip}`;
  const request = new Request(url, {
    method: 'POST',
    headers: { host: new URL(url).host, 'content-type': tipo, 'x-forwarded-for': endereco },
    body: JSON.stringify(corpo),
  });
  const r = await rota({ request, clientAddress: endereco } as never);
  return { status: r.status, cookie: r.headers.get('set-cookie') };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'login-json', 'Login JSON', 'active')`;
  await sql`INSERT INTO barbers (id, tenant_id, name, slug, phone, role, password_hash, active)
            VALUES (1, 1, 'Dono', 'dono', '84999990071', 'admin', ${await hash(SENHA, 4)}, true)`;
  await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES (1, 1, 'Corte', 'corte', 4000)`;
  // O cliente "existe" para o portal quando tem agendamento com telefone e nascimento.
  await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                      customer_birthdate, starts_at, ends_at, duration_minutes, price_cents, manage_token)
            VALUES (1, 1, 1, 'Cliente', '84988887777', '1990-05-20',
                    '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z', 30, 4000, 'token-login-json')`;
  await sql`SELECT setval('barbers_id_seq', 10)`;
  await sql`SELECT setval('services_id_seq', 10)`;

  const tenant = await import('../src/lib/tenant.js');
  await tenant.carregarTenants(true);
  ({ POST: loginPainel } = await import('../src/pages/api/auth/login.ts'));
  ({ POST: loginCliente } = await import('../src/pages/api/customer/login.ts'));
}, 60_000);

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

describe.skipIf(!TEM_BANCO)('o login do painel', () => {
  const credencial = { identificador: '84999990071', password: SENHA };
  const url = 'http://painel.test/api/auth/login';

  it('recusa text/plain com corpo de JSON — o formulário de outro site — e não abre sessão', async () => {
    const r = await chamar(loginPainel, url, 'text/plain', credencial);
    expect(r.status).toBe(415);
    expect(r.cookie).toBeNull();
  });

  it('recusa o formulário comum também', async () => {
    const r = await chamar(loginPainel, url, 'application/x-www-form-urlencoded', credencial);
    expect(r.status).toBe(415);
  });

  it('controle: a mesma credencial, como JSON, entra', async () => {
    const r = await chamar(loginPainel, url, 'application/json', credencial);
    expect(r.status).toBe(200);
    expect(r.cookie).toContain('__bayron_session=');
  });
});

describe.skipIf(!TEM_BANCO)('o login do cliente, no site da barbearia', () => {
  const credencial = { phone: '84988887777', birthdate: '1990-05-20' };
  const url = `http://${HOST}/api/customer/login`;

  it('recusa text/plain e não abre sessão', async () => {
    const r = await chamar(loginCliente, url, 'text/plain;charset=UTF-8', credencial);
    expect(r.status).toBe(415);
    expect(r.cookie).toBeNull();
  });

  it('controle: como JSON, entra', async () => {
    const r = await chamar(loginCliente, url, 'application/json', credencial);
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();
  });
});
