// O teste de 7 dias, a carência e a barbearia fora do ar, no banco de verdade —
// migration 0007, `lib/situacao.ts`, o resolvedor e a sessão. Decisões do dono em
// 08/10/2026 (`docs/PLANO-PRODUTIZACAO.md` §13).
//
// As fases saem do RELÓGIO, não de um status gravado: as barbearias abaixo têm os
// prazos postos em relação a `now()`, e ninguém muda nada no banco para elas
// passarem de uma fase à outra.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

let sql: ReturnType<typeof postgres>;
let tenant: typeof import('../src/lib/tenant.js');
let sessao: typeof import('../src/lib/session.js');

/**
 * Uma barbearia por fase. `prazo` é SQL relativo a agora: "now() + 5 dias" está
 * no teste; "now() - 1 dia" já venceu o teste, mas está na carência; "now() - 10
 * dias" passou da carência.
 */
const BARBEARIAS = [
  { id: 1, slug: 'no-teste',  status: 'trial',     prazo: '5 days',   fase: 'teste'    },
  { id: 2, slug: 'carencia',  status: 'trial',     prazo: '-1 day',   fase: 'carencia' },
  { id: 3, slug: 'vencida',   status: 'trial',     prazo: '-10 days', fase: 'suspensa' },
  { id: 4, slug: 'atrasada',  status: 'past_due',  prazo: '-1 day',   fase: 'carencia' },
  { id: 5, slug: 'cortada',   status: 'past_due',  prazo: '-10 days', fase: 'suspensa' },
  { id: 6, slug: 'manual',    status: 'suspended', prazo: null,       fase: 'suspensa' },
  { id: 7, slug: 'encerrada', status: 'cancelled', prazo: null,       fase: 'cancelada' },
  { id: 8, slug: 'pagando',   status: 'active',    prazo: null,       fase: 'ativa'    },
] as const;

const NO_AR = ['no-teste', 'carencia', 'atrasada', 'pagando'];
const FORA_DO_AR = ['vencida', 'cortada', 'manual'];

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(sql);

  for (const b of BARBEARIAS) {
    const prazo = b.prazo ? sql`now() + ${b.prazo}::interval` : sql`NULL`;
    await sql`
      INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, past_due_since)
      VALUES (${b.id}, ${b.slug}, ${'Barbearia ' + b.slug}, ${b.status},
              ${b.status === 'trial' ? prazo : sql`NULL`},
              ${b.status === 'past_due' ? prazo : sql`NULL`})`;
    await sql`
      INSERT INTO barbers (tenant_id, name, slug, phone, role, password_hash)
      VALUES (${b.id}, 'Dono', 'dono', ${'8499990000' + b.id}, 'admin', 'x')`;
  }
  await sql`SELECT setval('tenants_id_seq', 100)`;

  tenant = await import('../src/lib/tenant.js');
  sessao = await import('../src/lib/session.js');
  await tenant.carregarTenants(true);
}, 30_000);

afterAll(async () => {
  if (!TEM_BANCO) return;
  await sql.end({ timeout: 5 });
  const db = await import('../src/db/index.js');
  await db.sqlConn.end({ timeout: 5 });
});

/** O cookie do dono da barbearia `id`, como o login o emitiria. */
async function pedidoDoDono(id: number, caminho = '/admin'): Promise<Request> {
  const [dono] = await sql`SELECT id FROM barbers WHERE tenant_id = ${id}`;
  const cookie = await sessao.makeSessionCookie({ barberId: Number(dono.id), role: 'admin', tenantId: id });
  return new Request(`http://painel.test${caminho}`, { headers: { cookie: cookie.split(';')[0] } });
}

describe.skipIf(!TEM_BANCO)('o banco não aceita prazo faltando', () => {
  it('teste sem data de fim é recusado — seria teste para sempre', async () => {
    await expect(sql`INSERT INTO tenants (slug, business_name, status) VALUES ('sem-fim', 'X', 'trial')`)
      .rejects.toThrow(/tenants_teste_tem_fim/);
  });

  it('cobrança atrasada sem a data da falha é recusada', async () => {
    await expect(sql`INSERT INTO tenants (slug, business_name, status) VALUES ('sem-data', 'X', 'past_due')`)
      .rejects.toThrow(/tenants_atraso_tem_inicio/);
  });

  it('status que não existe é recusado', async () => {
    await expect(sql`INSERT INTO tenants (slug, business_name, status) VALUES ('nada', 'X', 'pending')`)
      .rejects.toThrow(/tenants_status_valido/);
  });
});

describe.skipIf(!TEM_BANCO)('a fase sai do relógio', () => {
  it('cada barbearia está na fase do seu prazo', async () => {
    const { situacaoDe } = await import('../src/lib/situacao.js');
    for (const b of BARBEARIAS) {
      const t = tenant.tenantPorIdMesmoForaDoAr(b.id);
      expect(t, b.slug).not.toBeNull();
      expect(situacaoDe(t!).fase, b.slug).toBe(b.fase);
    }
  });
});

describe.skipIf(!TEM_BANCO)('o site', () => {
  it('no ar: pagando, no teste e na carência', () => {
    for (const slug of NO_AR) {
      expect(tenant.resolverHost(`${slug}.fadeline.com.br`)?.slug, slug).toBe(slug);
    }
  });

  it('fora do ar: as rotas não enxergam — e o middleware sabe de quem é o endereço', () => {
    for (const slug of FORA_DO_AR) {
      expect(tenant.resolverHost(`${slug}.fadeline.com.br`), slug).toBeNull();
      expect(tenant.tenantSuspensoDoHost(`${slug}.fadeline.com.br`)?.slug, slug).toBe(slug);
    }
  });

  it('encerrada e no ar não são "suspensas do endereço"', () => {
    expect(tenant.resolverHost('encerrada.fadeline.com.br')).toBeNull();
    expect(tenant.tenantSuspensoDoHost('encerrada.fadeline.com.br')).toBeNull();
    for (const slug of NO_AR) expect(tenant.tenantSuspensoDoHost(`${slug}.fadeline.com.br`), slug).toBeNull();
  });
});

describe.skipIf(!TEM_BANCO)('o painel', () => {
  it('no ar, a sessão vale — no teste e na carência também', async () => {
    for (const b of BARBEARIAS.filter((x) => NO_AR.includes(x.slug))) {
      expect(await sessao.getSession(await pedidoDoDono(b.id)), b.slug).toMatchObject({ tenantId: b.id });
    }
  });

  it('fora do ar, getSession() não enxerga — as 53 rotas continuam fechadas sozinhas', async () => {
    for (const b of BARBEARIAS.filter((x) => FORA_DO_AR.includes(x.slug) || x.slug === 'encerrada')) {
      expect(await sessao.getSession(await pedidoDoDono(b.id)), b.slug).toBeNull();
    }
  });

  it('fora do ar, só a sessão da tela de assinatura enxerga', async () => {
    for (const b of BARBEARIAS.filter((x) => FORA_DO_AR.includes(x.slug))) {
      const fora = await sessao.sessaoForaDoAr(await pedidoDoDono(b.id));
      expect(fora?.tenant.id, b.slug).toBe(b.id);
      expect(fora?.situacao.fase, b.slug).toBe('suspensa');
    }
  });

  it('a sessão de fora do ar não serve para quem está no ar, nem para encerrada', async () => {
    for (const b of BARBEARIAS.filter((x) => NO_AR.includes(x.slug) || x.slug === 'encerrada')) {
      expect(await sessao.sessaoForaDoAr(await pedidoDoDono(b.id)), b.slug).toBeNull();
    }
  });

  it('barbeiro demitido não entra nem na tela de assinatura', async () => {
    await sql`UPDATE barbers SET active = false WHERE tenant_id = 3`;
    try {
      expect(await sessao.sessaoForaDoAr(await pedidoDoDono(3))).toBeNull();
    } finally {
      await sql`UPDATE barbers SET active = true WHERE tenant_id = 3`;
    }
  });
});

describe.skipIf(!TEM_BANCO)('o cadastro nasce no teste', () => {
  const DADOS = {
    nome: 'Barbearia Nova', dono: 'José', endereco: 'R. A, 1', cidade: 'Mossoró/RN', estado: 'RN',
    senha: 'segredo123', email: 'ze@exemplo.com.br',
  };
  const local = (quando: string) => fromZonedTime(quando, 'America/Fortaleza');

  it('com o fim do teste no fim do 7º dia, no fuso da barbearia', async () => {
    const { provisionarBarbearia } = await import('../src/lib/provisionarBarbearia.js');
    const r = await provisionarBarbearia(sql, { ...DADOS, slug: 'nova-no-teste', telefone: '84988880001' },
      local('2026-10-08T21:28:00'));
    expect(r.ok).toBe(true);
    const [t] = await sql`SELECT status, trial_ends_at FROM tenants WHERE slug = 'nova-no-teste'`;
    expect(t.status).toBe('trial');
    expect(new Date(t.trial_ends_at).toISOString()).toBe(local('2026-10-16T00:00:00').toISOString());
    if (r.ok) expect(r.testeAte?.toISOString()).toBe(local('2026-10-16T00:00:00').toISOString());
  });

  it('o script pode criar sem teste; a rota da web, nunca', async () => {
    const { provisionarBarbearia } = await import('../src/lib/provisionarBarbearia.js');
    await provisionarBarbearia(sql, { ...DADOS, slug: 'nova-paga', telefone: '84988880002', semTeste: true });
    const [paga] = await sql`SELECT status, trial_ends_at FROM tenants WHERE slug = 'nova-paga'`;
    expect(paga).toMatchObject({ status: 'active', trial_ends_at: null });

    // Pela web, `semTeste` no corpo é descartado pelo esquema da rota.
    const anterior = process.env.CADASTRO_ABERTO;
    process.env.CADASTRO_ABERTO = '1';
    try {
      const { POST } = await import('../src/pages/api/cadastrar.js');
      const r = await POST({
        request: new Request('http://x/api/cadastrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...DADOS, slug: 'nova-pela-web', telefone: '84988880003', semTeste: true }),
        }),
        clientAddress: '8.8.4.4',
      } as never);
      expect(r.status).toBe(201);
      expect((await r.json()).ultimoDiaDoTeste).toMatch(/^\d{2}\/\d{2}$/);
      const [web] = await sql`SELECT status, trial_ends_at FROM tenants WHERE slug = 'nova-pela-web'`;
      expect(web.status).toBe('trial');
      expect(web.trial_ends_at).not.toBeNull();
    } finally {
      if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
      else process.env.CADASTRO_ABERTO = anterior;
    }
  }, 30_000);
});
