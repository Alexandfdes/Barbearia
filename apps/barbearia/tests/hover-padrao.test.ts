// O hover do par padrão de cores escurece (`PENDENCIAS-ABERTAS.md` §4.12).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// O botão do site e do painel é preenchimento escuro com texto BRANCO; o hover
// tem que escurecer (`lib/accent.ts`). O par padrão — o de toda barbearia que não
// escolheu cor, o Bayron inclusive, e o do painel inteiro — tinha o hover MAIS
// CLARO que o botão: #0d9488, 3,74:1 com branco, abaixo do piso de 4,5:1. O botão
// era legível parado e piorava com o mouse em cima.
//
// O hover morava em quatro lugares, e só um estava certo: o `ACCENT_PADRAO` de
// `lib/accent.ts` (#0b5f58), que o provisionamento usa. Os outros três — o token
// do `global.css`, o padrão de `lib/settings.ts` e o padrão da coluna no banco —
// tinham o antigo, e a seção do combo na página inicial cravava os dois hex na
// classe. Agora os quatro são o mesmo, e a `0009` conserta as linhas gravadas.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';
import postgres from 'postgres';
import { ACCENT_PADRAO, contraste, luminancia } from '../src/lib/accent';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { listarMigrations, migrationSql } from './migrations.js';

describe('o par padrão', () => {
  it('o hover passa com o texto branco', () => {
    expect(contraste('#ffffff', ACCENT_PADRAO.color)).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', ACCENT_PADRAO.hover)).toBeGreaterThanOrEqual(4.5);
  });

  it('e é MAIS ESCURO que o botão — a regra deste site', () => {
    expect(luminancia(ACCENT_PADRAO.hover)).toBeLessThan(luminancia(ACCENT_PADRAO.color));
  });

  it('controle: o hover antigo reprova nas duas', () => {
    expect(contraste('#ffffff', '#0d9488')).toBeLessThan(4.5);
    expect(luminancia('#0d9488')).toBeGreaterThan(luminancia(ACCENT_PADRAO.color));
  });
});

describe('os lugares que guardam o par padrão concordam com o ACCENT_PADRAO', () => {
  it('os tokens do global.css — os do painel, e os do site antes do tema dela', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const token = (nome: string) => css.match(new RegExp(`--color-${nome}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
    expect(token('teal')).toBe(ACCENT_PADRAO.color);
    expect(token('teal-hover')).toBe(ACCENT_PADRAO.hover);
    expect(token('teal-light')).toBe(ACCENT_PADRAO.light);
  });

  it('o padrão das colunas, em db/schema.ts', () => {
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    const padrao = (coluna: string) => schema.match(new RegExp(`text\\('${coluna}'\\)\\.notNull\\(\\)\\.default\\('(#[0-9a-fA-F]{6})'\\)`))?.[1];
    expect(padrao('accent_color')).toBe(ACCENT_PADRAO.color);
    expect(padrao('accent_hover')).toBe(ACCENT_PADRAO.hover);
    expect(padrao('accent_light')).toBe(ACCENT_PADRAO.light);
  });

  it('o padrão de lib/settings.ts', async () => {
    // Importar não conecta: a conexão só abre na primeira consulta.
    const { TEMPLATE_DEFAULTS } = await import('../src/lib/settings');
    expect([TEMPLATE_DEFAULTS.accentColor, TEMPLATE_DEFAULTS.accentHover, TEMPLATE_DEFAULTS.accentLight])
      .toEqual([ACCENT_PADRAO.color, ACCENT_PADRAO.hover, ACCENT_PADRAO.light]);
  }, 30_000);
});

describe('nenhuma cor cravada em classe', () => {
  // `bg-[#0f766e]` não muda com a cor da barbearia: no site de quem escolheu
  // vinho, o botão do combo continuava verde (skill `barbearia-paleta`).
  const CRAVADA = /\b(?:hover:|focus:|active:)?(?:bg|text|border|from|via|to|ring|fill|stroke|outline|decoration|shadow)-\[#[0-9a-fA-F]{3,8}\]/g;

  it('controle: o padrão pega a classe que existia', () => {
    expect('bg-[#0f766e] hover:bg-[#0d9488] text-white'.match(CRAVADA)).toEqual(['bg-[#0f766e]', 'hover:bg-[#0d9488]']);
    expect('bg-teal hover:bg-teal-hover text-white'.match(CRAVADA)).toBeNull();
  });

  it('nenhum .astro de src/ tem uma', () => {
    const achados = globSync('src/**/*.astro').flatMap((c) =>
      (readFileSync(c, 'utf8').match(CRAVADA) ?? []).map((m) => `${c.split(sep).join('/')}: ${m}`));
    expect(achados).toEqual([]);
  });
});

// ── A migration 0009, contra o banco ─────────────────────────────────────────

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let sql: ReturnType<typeof postgres>;
const NOVA = '0009_hover_padrao.sql';

beforeAll(async () => {
  if (!TEM_BANCO) return;
  sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  // Tudo ATÉ a 0008, e as linhas gravadas antes da 0009 — o estado do banco do
  // Bayron depois da carga do SQLite (`ROTEIRO-MIGRACAO-PRODUCAO.md`).
  await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const todas = listarMigrations();
  expect(todas).toContain(NOVA);
  for (const f of todas.slice(0, todas.indexOf(NOVA))) await sql.unsafe(migrationSql(f));

  await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
              (1, 'padrao-antigo', 'Par padrão antigo', 'active'),
              (2, 'vinho',         'Escolheu vinho',     'active'),
              (3, 'verde-proprio', 'Verde, hover dele',  'active'),
              (4, 'maiusculas',    'Par antigo em CAIXA ALTA', 'active'),
              (5, 'sem-cor',       'Gravou sem cor',     'active')`;
  const linha = (t: number, cor: string | null, hover: string | null) => cor === null
    ? sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city)
          VALUES (${t}, 'X', 'X', '', '', '')`
    : sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city,
                                accent_color, accent_hover)
          VALUES (${t}, 'X', 'X', '', '', '', ${cor}, ${hover})`;
  await linha(1, '#0f766e', '#0d9488');
  await linha(2, '#6b1f2a', '#4f171f');
  await linha(3, '#0f766e', '#0a4f49');
  await linha(4, '#0F766E', '#0D9488');
  await linha(5, null, null); // o padrão da coluna ANTES da 0009

  await sql.unsafe(migrationSql(NOVA));
}, 60_000);

afterAll(async () => { if (TEM_BANCO) await sql.end(); });

describe.skipIf(!TEM_BANCO)('a migration 0009', () => {
  const hoverDe = async (t: number) =>
    (await sql`SELECT accent_hover FROM settings WHERE tenant_id = ${t}`)[0].accent_hover as string;

  it('conserta a linha com o par padrão antigo — o caso do Bayron', async () => {
    expect(await hoverDe(1)).toBe(ACCENT_PADRAO.hover);
    expect(await hoverDe(4)).toBe(ACCENT_PADRAO.hover);
  });

  it('a linha gravada sem cor, com o padrão antigo da coluna, também', async () => {
    expect(await hoverDe(5)).toBe(ACCENT_PADRAO.hover);
  });

  it('não toca em quem escolheu cor, nem no hover que o dono já tinha', async () => {
    expect(await hoverDe(2)).toBe('#4f171f');
    expect(await hoverDe(3)).toBe('#0a4f49');
  });

  it('o padrão da coluna passa a ser o novo', async () => {
    const [{ padrao }] = await sql`
      SELECT column_default AS padrao FROM information_schema.columns
       WHERE table_name = 'settings' AND column_name = 'accent_hover'`;
    expect(padrao).toContain(ACCENT_PADRAO.hover);
  });

  it('roda duas vezes sem erro e sem mudar nada', async () => {
    const antes = await sql`SELECT tenant_id, accent_color, accent_hover FROM settings ORDER BY tenant_id`;
    await sql.unsafe(migrationSql(NOVA));
    const depois = await sql`SELECT tenant_id, accent_color, accent_hover FROM settings ORDER BY tenant_id`;
    expect(depois).toEqual(antes);
  });
});
