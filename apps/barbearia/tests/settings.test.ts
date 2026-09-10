// Teste de INTEGRAÇÃO: PostgreSQL real.
//
// Portado do SQLite em memória em 06/09/2026 (passo 3.5).
//
// O QUE MUDOU NO PORTE, e é o principal:
//   A migration 0009 do SQLite CRIAVA a tabela `settings` e SEMEAVA a linha 1
//   com os dados do Bayron. O `0000_init_postgres.sql` cria a tabela e não
//   semeia nada — a carga dos dados está listada como pendente no §6 do
//   `migracao-postgres/LEIA-ME.md`. Por isso este teste agora INSERE a linha que
//   antes vinha pronta, em vez de afirmar que a migration a criou.
//
// Sem `DATABASE_URL` a suíte de integração é PULADA; os testes de função pura
// (waUrl, parseBusinessHours) rodam sempre.
//
// ⚠️ Recria o schema do zero. Aponte para um banco de TESTE.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';

/**
 * Acha o SQL da migration. O `0000_init_postgres.sql` vive em
 * `migracao-postgres/` até o passo 2 ser aplicado, quando é copiado para
 * `drizzle/` — ver o §2 do `migracao-postgres/LEIA-ME.md`. Procurar nos dois
 * lugares evita o ENOENT críptico de quem roda o teste antes dessa cópia.
 */
function migrationSql(nome: string): string {
  for (const p of [`drizzle/${nome}`, `../../migracao-postgres/${nome}`]) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error(
    `Migration ${nome} não encontrada. Aplique o passo 2 primeiro:\n` +
    `  cp migracao-postgres/0000_init_postgres.sql apps/barbearia/drizzle/\n` +
    `Ver migracao-postgres/LEIA-ME.md §2.`
  );
}

const TEM_BANCO = Boolean(process.env.DATABASE_URL);

// ⚠️ Esta suíte roda DROP SCHEMA. A guarda recusa qualquer banco cujo nome não
// termine em _test — apontar DATABASE_URL para produção apagaria a barbearia.
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

// `src/db/index.ts` cria a conexão no import e joga erro sem DATABASE_URL — o que
// torna qualquer módulo que dependa dele impossível de importar numa máquina sem
// banco, inclusive para testar função pura. O driver conecta de forma preguiçosa,
// então uma URL de fachada basta para o import passar; nenhuma consulta roda,
// porque as suítes de integração estão puladas.
//
// ⚠️ Isto é contorno, não solução. A solução é `db/index.ts` não abrir conexão no
// import — fica registrado para o passo 4.
if (!TEM_BANCO) process.env.DATABASE_URL = 'postgres://fachada@127.0.0.1:1/nao-conecta';

type SettingsMod = typeof import('../src/lib/settings');
let mod: SettingsMod;
let sqlConn: typeof import('../src/db/index')['sqlConn'];

const HORARIOS = JSON.stringify([
  { label: 'Segunda — Sexta', hours: '09:00 às 19:00' },
  { label: 'Sábado',          hours: '08:00 às 17:00' },
  { label: 'Domingo',         hours: 'Fechado', closed: true },
]);

beforeAll(async () => {
  if (!TEM_BANCO) return;

  const migrador = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await migrador.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of ['0000_init_postgres.sql', '0001_tenants.sql']) {
    await migrador.unsafe(migrationSql(f));
  }
  await migrador.end();

  ({ sqlConn } = await import('../src/db/index'));
  // Banco de teste nasce vazio e a 0001 não cria tenant sem dados para
  // backfillar (`PENDENCIAS-ABERTAS.md` §4.6) — então o teste cria o seu.
  await sqlConn`INSERT INTO tenants (slug, business_name)
                VALUES ('bayron','Barbearia Bayron') ON CONFLICT DO NOTHING`;
  const [{ id: tid }] = await sqlConn`SELECT id FROM tenants WHERE slug = 'bayron'`;

  // A linha que a migration 0009 semeava. Fica explícita aqui até a carga dos
  // dados existir — ver o §6 do LEIA-ME do porte.
  await sqlConn`
    INSERT INTO settings (id, tenant_id, business_name, short_name, address_city,
                          whatsapp_number, whatsapp_display, google_review_count,
                          products_section_title, business_hours,
                          address_street, accent_color)
    VALUES (1, ${tid}, 'Barbearia Bayron', 'Bayron', 'Mossoró/RN',
            '15551547238', '+1 (555) 154-7238', 227,
            'Produtos Boris', ${HORARIOS},
            'Rua Exemplo, 100', '#0f766e')`;

  mod = await import('../src/lib/settings');
});

describe.skipIf(!TEM_BANCO)('leitura da tabela settings', () => {
  it('lê os valores gravados, não os TEMPLATE_DEFAULTS', async () => {
    const s = await mod.getSettings();
    expect(s.businessName).toBe('Barbearia Bayron');
    expect(s.shortName).toBe('Bayron');
    expect(s.addressCity).toBe('Mossoró/RN');
    expect(s.productsSectionTitle).toBe('Produtos Boris');
    expect(s.googleReviewCount).toBe(227);
  });

  it('o placeholder de WhatsApp continua sendo o de config.ts', async () => {
    const s = await mod.getSettings();
    expect(s.whatsappNumber).toBe('15551547238');
    expect(s.whatsappDisplay).toBe('+1 (555) 154-7238');
  });

  it('business_hours chega como JSON parseável, com os 3 blocos', async () => {
    const h = (await mod.getSettings()).businessHours;
    expect(h).toHaveLength(3);
    expect(h[0].label).toBe('Segunda — Sexta');
    expect(h[2].closed).toBe(true);
  });

  // ⚠️ Passo 4: `getSettings()` ainda faz `where(id = 1)`, que é exatamente o
  // "assume barbearia única" que a skill barbearia-multi-tenant proíbe. Com uma
  // linha por tenant, o id 1 é a linha do Bayron por ordem de inserção, não por
  // desenho. Este teste trava o comportamento ATUAL para a troca ser consciente.
  it('hoje a linha é encontrada por id = 1, não por tenant', async () => {
    const linhas = await sqlConn`SELECT id, tenant_id FROM settings`;
    expect(linhas).toHaveLength(1);
    expect(linhas[0].id).toBe(1);
    expect(linhas[0].tenant_id).toBeTypeOf('number');
  });
});

describe.skipIf(!TEM_BANCO)('cache de módulo (D3.1)', () => {
  it('NÃO reflete escrita direta no banco enquanto não invalidar', async () => {
    await mod.getSettings();                                    // aquece o cache
    await sqlConn`UPDATE settings SET business_name = 'Outra Barbearia' WHERE id = 1`;
    expect((await mod.getSettings()).businessName).toBe('Barbearia Bayron');
  });

  it('reflete depois de invalidateSettings()', async () => {
    mod.invalidateSettings();
    expect((await mod.getSettings()).businessName).toBe('Outra Barbearia');
    await sqlConn`UPDATE settings SET business_name = 'Barbearia Bayron' WHERE id = 1`;
    mod.invalidateSettings();
  });
});

describe.skipIf(!TEM_BANCO)('sanitização do acento (D5 — injeção de CSS)', () => {
  it('rejeita valor que não é hex e cai no default', async () => {
    await sqlConn`UPDATE settings SET accent_color = ${'red;} body{display:none}'} WHERE id = 1`;
    mod.invalidateSettings();
    expect((await mod.getSettings()).accentColor).toBe('#0f766e');

    await sqlConn`UPDATE settings SET accent_color = '#0f766e' WHERE id = 1`;
    mod.invalidateSettings();
  });

  it('aceita hex de 6 dígitos', async () => {
    await sqlConn`UPDATE settings SET accent_color = '#AA3311' WHERE id = 1`;
    mod.invalidateSettings();
    expect((await mod.getSettings()).accentColor).toBe('#AA3311');

    await sqlConn`UPDATE settings SET accent_color = '#0f766e' WHERE id = 1`;
    mod.invalidateSettings();
  });
});

// Sobre a MONTAGEM e o encoding da URL, não sobre qual número está configurado.
//
// ⚠️ O porte para Postgres tornou o 2º argumento OBRIGATÓRIO de propósito:
// `getSettings()` virou assíncrono e não serve mais como valor padrão. waUrl é
// formatador de string e não deve consultar o banco. Quem chama já tem as
// settings em mãos.
describe.skipIf(!TEM_BANCO)('waUrl', () => {
  it('monta o link com a mensagem url-encoded', async () => {
    const s = await mod.getSettings();
    expect(mod.waUrl('Olá, quero agendar', s)).toBe(
      `https://wa.me/${s.whatsappNumber}?text=Ol%C3%A1%2C%20quero%20agendar`
    );
  });

  it('monta o link sem mensagem', async () => {
    const s = await mod.getSettings();
    expect(mod.waUrl(undefined, s)).toBe(`https://wa.me/${s.whatsappNumber}`);
  });

  it('devolve string vazia quando não há número configurado (CTA some em vez de quebrar)', async () => {
    const s = { ...(await mod.getSettings()), whatsappNumber: '' };
    expect(mod.waUrl('oi', s)).toBe('');
  });
});

// Função pura: roda com ou sem banco.
describe('parseBusinessHours', () => {
  it('JSON inválido vira lista vazia em vez de derrubar a página', async () => {
    const m = await import('../src/lib/settings');
    expect(m.parseBusinessHours('{isso não é json')).toEqual([]);
    expect(m.parseBusinessHours(null)).toEqual([]);
    expect(m.parseBusinessHours('"uma string"')).toEqual([]);
  });

  it('descarta itens malformados e normaliza closed', async () => {
    const m = await import('../src/lib/settings');
    const r = m.parseBusinessHours('[{"label":"Seg","hours":"9h"},{"nada":1}]');
    expect(r).toEqual([{ label: 'Seg', hours: '9h', closed: false }]);
  });
});
