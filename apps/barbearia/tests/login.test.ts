// Login do painel por telefone — passo 7 de `ARQUITETURA-MULTI-TENANT-V1.md` §9.
//
// O caso que justifica a mudança inteira é o `mesmo slug em duas barbearias`:
// antes ele era impossível de resolver, agora ele nem aparece.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
//   DATABASE_URL='postgres://.../barbearia_test' npx vitest run
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

// `lib/session.ts` exige SESSION_SECRET e não tem valor padrão — de propósito:
// segredo de sessão com fallback é segredo que vai para produção sem ninguém
// perceber. Aqui definimos um só para o teste, ANTES de a rota ser importada.
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const SENHA = 'SenhaBoa123';
let sql: ReturnType<typeof postgres>;
let POST: typeof import('../src/pages/api/auth/login.ts').POST;

/** Chama a rota como o navegador chamaria. */
async function entrar(identificador: string, password: string, ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`) {
  const req = new Request('http://painel.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ identificador, password }),
  });
  const res = await POST({ request: req, clientAddress: ip } as any);
  return { status: res.status, body: await res.clone().json(), cookie: res.headers.get('Set-Cookie') };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  const h = await hash(SENHA, 4); // custo baixo: é teste, não produção

  await sql`INSERT INTO tenants (slug, business_name) VALUES
              ('bayron','Barbearia Bayron'), ('cortes-do-ze','Cortes do Zé')`;

  // Os DOIS se chamam "bayron" dentro da própria barbearia. É legítimo desde a
  // 0001, e é exatamente o que quebrava o login por slug.
  await sql`INSERT INTO barbers (tenant_id, name, slug, phone, role, password_hash) VALUES
              (1,'Bayron Patrezio','bayron','84999990001','admin',  ${h}),
              (1,'Emanuel',        'emanuel','84999990002','barber', ${h}),
              (2,'Bayron do Zé',   'bayron','84999990003','admin',  ${h})`;

  ({ POST } = await import('../src/pages/api/auth/login.ts'));
});

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

describe.skipIf(!TEM_BANCO)('login do painel por telefone', () => {
  it('entra com telefone e senha certos', async () => {
    const r = await entrar('84999990001', SENHA);
    expect(r.status).toBe(200);
    expect(r.cookie).toContain('__bayron_session=');
  });

  it('aceita o telefone como a pessoa digita, com máscara', async () => {
    const r = await entrar('(84) 99999-0001', SENHA);
    expect(r.status).toBe(200);
  });

  it('aceita com DDI 55 na frente', async () => {
    const r = await entrar('+55 84 99999-0001', SENHA);
    expect(r.status).toBe(200);
  });

  it('MESMO SLUG em duas barbearias: cada telefone entra na sua', async () => {
    // O caso que o login por slug não sabia resolver. Os dois são "bayron".
    const a = await entrar('84999990001', SENHA);
    const b = await entrar('84999990003', SENHA);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.cookie).not.toEqual(b.cookie); // sessões de barbearias diferentes
  });

  it('senha errada não entra', async () => {
    const r = await entrar('84999990001', 'errada');
    expect(r.status).toBe(401);
  });

  it('telefone que não existe não entra', async () => {
    const r = await entrar('84900000000', SENHA);
    expect(r.status).toBe(401);
  });

  it('a mensagem de erro não diz se o telefone existe', async () => {
    // Distinguir "não existe" de "senha errada" entrega a lista de telefones
    // cadastrados a quem estiver testando.
    const inexistente = await entrar('84900000000', SENHA);
    const senhaErrada = await entrar('84999990001', 'errada');
    expect(inexistente.body.error).toEqual(senhaErrada.body.error);
  });

  it('barbeiro inativo não entra, mesmo com a senha certa', async () => {
    await sql`UPDATE barbers SET active = false WHERE phone = '84999990002'`;
    const r = await entrar('84999990002', SENHA);
    await sql`UPDATE barbers SET active = true WHERE phone = '84999990002'`;
    expect(r.status).toBe(401);
  });

  // ⚠️ MUDOU EM 08/10/2026. Até então a barbearia suspensa não entrava — e o dono
  // que deixou o teste vencer não tinha como ver o motivo nem como pagar. Agora
  // ENTRA, mas a sessão só abre a tela de assinatura: para o resto do painel,
  // `getSession()` continua devolvendo `null` (`tests/teste-gratis.test.ts`).
  it('barbearia fora do ar entra — e é mandada para a tela de assinatura', async () => {
    await sql`UPDATE tenants SET status = 'suspended' WHERE slug = 'cortes-do-ze'`;
    const r = await entrar('84999990003', SENHA);
    await sql`UPDATE tenants SET status = 'active' WHERE slug = 'cortes-do-ze'`;
    expect(r.status).toBe(200);
    expect(r.body.destino).toBe('/admin/assinatura');
  });

  it('barbearia no ar vai para o painel', async () => {
    const r = await entrar('84999990003', SENHA);
    expect(r.body.destino).toBe('/admin');
  });

  it('barbearia encerrada não entra', async () => {
    await sql`UPDATE tenants SET status = 'cancelled' WHERE slug = 'cortes-do-ze'`;
    const r = await entrar('84999990003', SENHA);
    await sql`UPDATE tenants SET status = 'active' WHERE slug = 'cortes-do-ze'`;
    expect(r.status).toBe(403);
    expect(r.cookie).toBeNull();
  });

  it('com DUAS barbearias, o slug para de valer e a rota recusa em vez de chutar', async () => {
    const r = await entrar('bayron', SENHA);
    expect(r.status).toBe(400);
    // ⚠️ "whatsapp" e não "telefone" desde 14/09/2026: a chave continua sendo o
    // telefone, mas a TELA passou a chamá-lo de WhatsApp, e a recusa tem que
    // mandar a pessoa para o mesmo campo que ela está vendo. Mandar procurar
    // "telefone" numa tela que diz "Seu WhatsApp" é o tipo de incoerência que
    // faz o barbeiro ligar para o suporte.
    expect(r.body.error).toMatch(/whatsapp/i);
  });

  it('com UMA barbearia só, o slug ainda vale (a transição)', async () => {
    // Enquanto os barbeiros antigos não tiverem telefone, este é o caminho que
    // mantém o Bayron entrando no painel.
    await sql`DELETE FROM barbers WHERE tenant_id = 2`;
    await sql`DELETE FROM tenants WHERE slug = 'cortes-do-ze'`;
    const r = await entrar('bayron', SENHA);
    expect(r.status).toBe(200);
  });

  it('rate limit: a sexta tentativa errada seguida é barrada', async () => {
    const ip = '10.9.9.9';
    for (let i = 0; i < 5; i++) await entrar('84999990001', 'errada', ip);
    const r = await entrar('84999990001', 'errada', ip);
    expect(r.status).toBe(429);
  });

  it('rate limit conta o telefone normalizado, não o texto digitado', async () => {
    // Sem normalizar a chave, "84999990001", "(84) 99999-0001" e "+5584999990001"
    // seriam três contadores para a mesma conta e o limite de 5 viraria 15.
    const ip = '10.9.9.10';
    const formas = ['84999990001', '(84) 99999-0001', '+55 84 99999-0001'];
    for (let i = 0; i < 5; i++) await entrar(formas[i % 3], 'errada', ip);
    const r = await entrar('(84) 99999-0001', 'errada', ip);
    expect(r.status).toBe(429);
  });
});
