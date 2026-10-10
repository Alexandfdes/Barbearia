// A rota de backup — e a trava que estava invertida.
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// `GET /api/admin/backup` roda `pg_dump` sem `--table` e sem `WHERE`, com a
// credencial de dono das tabelas — que ignora o RLS. O arquivo que sai é o
// banco INTEIRO.
//
// A trava anterior era:
//
//     if (tenant.id !== TENANT_UNICO.id) return 501;
//
// `TENANT_UNICO.id` é 1, e 1 é o tenant de backfill: a barbearia que já está em
// produção. A trava barrava todas as barbearias **menos a que existe**. No dia
// do segundo cliente, o dono do primeiro clicaria em "baixar backup" e receberia
// nome, telefone e data de nascimento dos clientes de todas as barbearias, mais
// o hash de senha dos donos delas.
//
// A condição certa não é sobre QUEM pede — é sobre o que o arquivo contém: uma
// linha em `tenants` e o dump é só desta barbearia; mais de uma e ele vaza.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
let baixarBackup: typeof import('../src/pages/api/admin/backup.ts').GET;
let cookieAdmin = '';
let cookieBarbeiro = '';

/** A rota só lê sessão e banco; o resto do contexto do Astro não é usado. */
function pedido(cookie: string) {
  return { request: new Request('http://painel.test/api/admin/backup', { headers: { cookie } }) };
}

beforeAll(async () => {
  if (!TEM_BANCO) return;

  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);
  await sql`INSERT INTO tenants (id, slug, business_name, status)
            VALUES (1, 'bayron', 'Barbearia Bayron', 'active')`;
  await sql`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active) VALUES
    (1, 'Dono', 'dono', 'admin', 'x', true),
    (1, 'Ajudante', 'ajudante', 'barber', 'x', true)`;

  const [{ id: idDono }]      = await sql<{ id: number }[]>`SELECT id FROM barbers WHERE slug = 'dono'`;
  const [{ id: idAjudante }]  = await sql<{ id: number }[]>`SELECT id FROM barbers WHERE slug = 'ajudante'`;

  const { makeSessionCookie } = await import('../src/lib/session.js');
  cookieAdmin    = await makeSessionCookie({ barberId: idDono,     role: 'admin',  tenantId: 1 } as never);
  cookieBarbeiro = await makeSessionCookie({ barberId: idAjudante, role: 'barber', tenantId: 1 } as never);

  ({ GET: baixarBackup } = await import('../src/pages/api/admin/backup.ts'));
});

afterAll(async () => {
  if (TEM_BANCO) await sql?.end();
});

describe.skipIf(!TEM_BANCO)('quem pode baixar o backup', () => {
  it('sem sessão: 401', async () => {
    const r = await baixarBackup(pedido('') as never);
    expect(r.status).toBe(401);
  });

  it('barbeiro comum: 403', async () => {
    const r = await baixarBackup(pedido(cookieBarbeiro) as never);
    expect(r.status).toBe(403);
  });
});

describe.skipIf(!TEM_BANCO)('a trava que protege os dados das outras barbearias', () => {
  it('com UMA barbearia no banco, o admin passa da trava', async () => {
    const [{ n }] = await sql<{ n: string }[]>`SELECT COUNT(*) AS n FROM tenants`;
    expect(Number(n)).toBe(1);

    const r = await baixarBackup(pedido(cookieAdmin) as never);
    // Pode dar 200 (dump gerado) ou 500 (pg_dump não instalado na máquina de
    // teste). O que importa é que NÃO foi barrado: com uma barbearia só, o
    // arquivo contém apenas os dados dela.
    expect(r.status).not.toBe(501);
  });

  it('com DUAS barbearias no banco, recusa — mesmo para a barbearia de id 1', async () => {
    await sql`INSERT INTO tenants (id, slug, business_name, status)
              VALUES (2, 'vintage', 'Barbearia Vintage', 'active')`;
    try {
      // ⚠️ O cookie é o da barbearia 1 de propósito: era exatamente ela que a
      // trava anterior deixava passar.
      const r = await baixarBackup(pedido(cookieAdmin) as never);
      expect(r.status).toBe(501);

      const corpo = await r.json() as { error?: string };
      expect(corpo.error).toMatch(/mais de uma barbearia/i);
    } finally {
      await sql`DELETE FROM tenants WHERE id = 2`;
    }
  });
});
