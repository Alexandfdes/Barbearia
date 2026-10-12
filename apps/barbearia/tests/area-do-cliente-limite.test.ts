// O limite de tentativas da área do cliente por TELEFONE, além do por IP
// (`PENDENCIAS-ABERTAS.md` §2.33, item 2 — sugerido em 11/10/2026 e feito no mesmo dia).
//
// ── O QUE ISTO ATACA ─────────────────────────────────────────────────────────
//
// A área do cliente entra com telefone e data de nascimento — a data é a senha. O
// limite era só por endereço de rede: quem troca de IP a cada tentativa chutava
// datas à vontade para o mesmo telefone. Agora o telefone tem cota própria: 5 a
// cada 15 minutos e 10 por dia, por barbearia.
//
// Cada tentativa daqui sai de um IP NOVO, de propósito: é o limite por telefone que
// está em teste, não o por IP.
//
// Precisa de Postgres. Sem DATABASE_URL, pulado.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const NASCIMENTO = '1990-05-20';
const ERRADA = (n: number) => `1991-01-${String(10 + (n % 18)).padStart(2, '0')}`;
const MINUTO = 60 * 1000;

let sql: ReturnType<typeof postgres>;
let entrar: typeof import('../src/pages/api/customer/login.ts').POST;
let ip = 0;

/** Uma tentativa, sempre de um IP que ainda não tentou nada. */
async function tentar(telefone: string, nascimento: string, host = 'limite-um.test') {
  ip += 1;
  const endereco = `10.77.${Math.floor(ip / 250)}.${ip % 250}`;
  const request = new Request(`http://${host}/api/customer/login`, {
    method: 'POST',
    headers: { host, 'content-type': 'application/json', 'x-forwarded-for': endereco },
    body: JSON.stringify({ phone: telefone, birthdate: nascimento }),
  });
  return (await entrar({ request, clientAddress: endereco } as never)).status;
}

describe.skipIf(!TEM_BANCO)('a área do cliente limita as tentativas por telefone', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
                (1, 'limite-um', 'Limite Um', 'active'), (2, 'limite-dois', 'Limite Dois', 'active')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active) VALUES
                (1, 1, 'Dono Um', 'dono', 'admin', 'x', true), (2, 2, 'Dono Dois', 'dono', 'admin', 'x', true)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents) VALUES
                (1, 1, 'Corte', 'corte', 4000), (2, 2, 'Corte', 'corte', 4000)`;
    // Cinco clientes na barbearia 1 — um telefone por caso, para um não gastar a cota
    // do outro —, e o primeiro também na barbearia 2.
    const tel = ['84988880001', '84988880002', '84988880003', '84988880004', '84988880005'];
    for (const [i, t] of tel.entries()) {
      await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                          customer_birthdate, starts_at, ends_at, duration_minutes, price_cents, manage_token)
                VALUES (1, 1, 1, ${'Cliente ' + i}, ${t}, ${NASCIMENTO},
                        '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z', 30, 4000, ${'tk-limite-' + i})`;
    }
    await sql`INSERT INTO appointments (tenant_id, barber_id, service_id, customer_name, customer_phone,
                                        customer_birthdate, starts_at, ends_at, duration_minutes, price_cents, manage_token)
              VALUES (2, 2, 2, 'Cliente na Dois', '84988880001', ${NASCIMENTO},
                      '2030-03-15T13:00:00.000Z', '2030-03-15T13:30:00.000Z', 30, 4000, 'tk-limite-dois')`;
    await (await import('../src/lib/tenant.js')).carregarTenants(true);
    ({ POST: entrar } = await import('../src/pages/api/customer/login.ts'));
  }, 60_000);

  afterEach(() => { vi.useRealTimers(); });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  it('5 datas erradas de 5 IPs diferentes: a 6ª é recusada, mesmo com a data certa', async () => {
    for (let i = 0; i < 5; i++) expect(await tentar('84988880001', ERRADA(i))).toBe(404);
    expect(await tentar('84988880001', NASCIMENTO)).toBe(429);
  });

  it('o bloqueio é do telefone: outro cliente, e o mesmo telefone na outra barbearia, entram', async () => {
    expect(await tentar('84988880002', NASCIMENTO)).toBe(200);
    expect(await tentar('84988880001', NASCIMENTO, 'limite-dois.test')).toBe(200);
  });

  it('o telefone escrito de outro jeito conta para a mesma cota', async () => {
    expect(await tentar('(84) 98888-0001', NASCIMENTO)).toBe(429);
    expect(await tentar('+55 84 98888-0001', NASCIMENTO)).toBe(429);
  });

  it('passados 15 minutos, volta — e acertar zera a cota', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    for (let i = 0; i < 4; i++) expect(await tentar('84988880003', ERRADA(i))).toBe(404);
    expect(await tentar('84988880003', NASCIMENTO)).toBe(200);
    // Zerada: mais 5 erradas cabem antes do bloqueio.
    for (let i = 0; i < 5; i++) expect(await tentar('84988880003', ERRADA(i))).toBe(404);
    expect(await tentar('84988880003', NASCIMENTO)).toBe(429);
    vi.setSystemTime(Date.now() + 16 * MINUTO);
    expect(await tentar('84988880003', NASCIMENTO)).toBe(200);
  });

  it('10 erradas no dia: bloqueado até o dia seguinte, mesmo passada a janela de 15 minutos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    for (let i = 0; i < 5; i++) expect(await tentar('84988880004', ERRADA(i))).toBe(404);
    vi.setSystemTime(Date.now() + 16 * MINUTO);
    for (let i = 5; i < 10; i++) expect(await tentar('84988880004', ERRADA(i))).toBe(404);
    vi.setSystemTime(Date.now() + 16 * MINUTO);
    expect(await tentar('84988880004', NASCIMENTO)).toBe(429);
    vi.setSystemTime(Date.now() + 2 * 60 * MINUTO);
    expect(await tentar('84988880004', NASCIMENTO)).toBe(429);
    vi.setSystemTime(Date.now() + 24 * 60 * MINUTO);
    expect(await tentar('84988880004', NASCIMENTO)).toBe(200);
  });

  it('o que a janela curta recusa não gasta a cota do dia', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now());
    for (let i = 0; i < 5; i++) expect(await tentar('84988880005', ERRADA(i))).toBe(404);
    // Bloqueado na janela curta: estas 20 não contam para as 10 do dia.
    for (let i = 0; i < 20; i++) expect(await tentar('84988880005', ERRADA(i))).toBe(429);
    vi.setSystemTime(Date.now() + 16 * MINUTO);
    for (let i = 5; i < 9; i++) expect(await tentar('84988880005', ERRADA(i))).toBe(404);
    expect(await tentar('84988880005', NASCIMENTO)).toBe(200); // a 10ª do dia, e certa
  });
});
