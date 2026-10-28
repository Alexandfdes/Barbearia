// Ninguém de fora tranca o dono fora do painel (revisão de 27/10/2026).
//
// O limite do login por CONTA (de qualquer IP) contava antes de conferir a senha, inclusive a
// certa — e o login é o WhatsApp que está no site do dono. Com dois IPs, qualquer pessoa o
// trancava de forma contínua (reproduzido: 10 senhas erradas de fora, e a certa, do dono, levava
// 429). E os logins certos também contavam: 13 certos e 2 errados do Wi-Fi da barbearia
// trancavam o dono por 10 minutos.
//
// Agora: o aparelho onde o número já entrou tem um cookie lacrado (`lib/aparelhoConhecido.ts`) e
// o limite por conta não vale para ele; e a tentativa certa é devolvida aos limites.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const SENHA = 'SenhaCerta123';
const DONO = '84955550001';
let sql: ReturnType<typeof postgres>;
let login: typeof import('../src/pages/api/auth/login.ts');
let rl: typeof import('../src/lib/rateLimit.ts');
let db: typeof import('../src/db/index.ts');

function entrar(ip: string, senha: string, cookie = '') {
  return login.POST({
    request: new Request('http://painel.test/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ identificador: DONO, password: senha }),
    }),
    clientAddress: ip,
  } as never) as Promise<Response>;
}

/** O cookie do aparelho que a resposta mandou guardar. */
function cookieDoAparelho(r: Response): string {
  const linha = (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('__fadeline_aparelho='));
  expect(linha, 'o login certo manda guardar o cookie do aparelho').toBeTruthy();
  return linha!.split(';')[0];
}

describe.skipIf(!TEM_BANCO)('o login não deixa trancar o dono', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'ze', 'Barbearia do Zé', 'active')`;
    await sql`INSERT INTO barbers (tenant_id, name, slug, phone, role, password_hash, active)
              VALUES (1, 'Zé', 'ze', ${DONO}, 'admin', ${await hash(SENHA, 4)}, true)`;
    process.env.SESSION_SECRET ??= 'x'.repeat(40);
    login = await import('../src/pages/api/auth/login.ts');
    rl = await import('../src/lib/rateLimit.ts');
    db = await import('../src/db/index.ts');
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await db?.sqlConn.end({ timeout: 5 });
  });

  it('logins certos não gastam o limite: o Wi-Fi da barbearia entra 20 vezes seguidas', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await entrar('10.1.0.1', SENHA);
      expect(r.status, `login ${i + 1}`).toBe(200);
    }
  });

  it('trancado por quem tentou de fora, o dono entra do aparelho onde já tinha entrado', async () => {
    for (const k of rl.chavesDaConta(DONO)) rl.resetRateLimit(k);
    const certo = await entrar('10.2.0.1', SENHA);
    expect(certo.status).toBe(200);
    const aparelho = cookieDoAparelho(certo);

    // De fora, de vários IPs, até trancar a conta.
    for (let i = 0; i < 12; i++) await entrar(`10.3.0.${i}`, 'chute-errado');
    expect((await entrar('10.3.1.1', SENHA)).status, 'de um aparelho novo, a conta está trancada').toBe(429);

    // O dono, do aparelho de sempre: entra.
    expect((await entrar('10.2.0.1', SENHA, aparelho)).status).toBe(200);
  });

  it('o cookie de outro número, ou adulterado, não abre a exceção', async () => {
    for (const k of rl.chavesDaConta(DONO)) rl.resetRateLimit(k);
    for (let i = 0; i < 12; i++) await entrar(`10.4.0.${i}`, 'chute-errado');
    const falso = '__fadeline_aparelho=Fe26.2**adulterado';
    expect((await entrar('10.4.1.1', SENHA, falso)).status).toBe(429);
  });
});
