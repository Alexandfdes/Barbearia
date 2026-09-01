// Teste de INTEGRAÇÃO: SQLite real em memória, migrations reais.
// Mesma convenção de bookAppointment.test.ts — DATABASE_PATH é setado ANTES de
// importar o módulo de banco (que abre a conexão no import), daí o import dinâmico.
//
// Cobre duas coisas que quebram em silêncio:
//   1. a migration 0009 semear a linha 1 (se falhar, o site sobe com defaults vazios);
//   2. o cache de módulo (D3.1) — se invalidateSettings() não for chamado, o painel
//      salva e o site continua mostrando o valor velho.
import { describe, it, expect, beforeAll } from 'vitest';
import type Database from 'better-sqlite3';

type SettingsMod = typeof import('../src/lib/settings');
let mod: SettingsMod;
let sqlite: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_PATH = ':memory:';

  const dbMod = await import('../src/db/index');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  migrate(dbMod.db, { migrationsFolder: 'drizzle' });
  sqlite = dbMod.sqlite;

  mod = await import('../src/lib/settings');
});

describe('migration 0009 — semente da linha 1', () => {
  it('cria exatamente uma linha, com id = 1', () => {
    const rows = sqlite.prepare('SELECT id FROM settings').all() as { id: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('semeia os valores atuais em vez de deixar vazio', () => {
    const s = mod.getSettings();
    expect(s.businessName).toBe('Barbearia Bayron');
    expect(s.shortName).toBe('Bayron');
    expect(s.addressCity).toBe('Mossoró/RN');
    expect(s.productsSectionTitle).toBe('Produtos Boris');
    expect(s.googleReviewCount).toBe(227);
  });

  // O seed carrega o MESMO placeholder de src/config.ts, de propósito: ainda não
  // foi decidido qual número o site/demo usa. O teste trava o valor para que a
  // troca seja uma decisão consciente, e não uma surpresa em produção.
  it('semeia o placeholder de WhatsApp que está em config.ts', () => {
    expect(mod.getSettings().whatsappNumber).toBe('15551547238');
    expect(mod.getSettings().whatsappDisplay).toBe('+1 (555) 154-7238');
  });

  it('business_hours chega como JSON parseável, com os 3 blocos', () => {
    const h = mod.getSettings().businessHours;
    expect(h).toHaveLength(3);
    expect(h[0].label).toBe('Segunda — Sexta');
    expect(h[2].closed).toBe(true);
  });
});

describe('cache de módulo (D3.1)', () => {
  it('NÃO reflete escrita direta no banco enquanto não invalidar', () => {
    sqlite.prepare(`UPDATE settings SET business_name = 'Outra Barbearia' WHERE id = 1`).run();
    expect(mod.getSettings().businessName).toBe('Barbearia Bayron');
  });

  it('reflete depois de invalidateSettings()', () => {
    mod.invalidateSettings();
    expect(mod.getSettings().businessName).toBe('Outra Barbearia');
    // volta ao estado original para não vazar entre os describes
    sqlite.prepare(`UPDATE settings SET business_name = 'Barbearia Bayron' WHERE id = 1`).run();
    mod.invalidateSettings();
  });
});

// Estes testes são sobre a MONTAGEM e o encoding da URL, não sobre qual número
// está configurado — por isso derivam o número das settings em vez de fixá-lo.
// Assim, trocar o número da barbearia não quebra teste que não tem a ver com isso.
describe('waUrl', () => {
  it('monta o link com a mensagem url-encoded', () => {
    const n = mod.getSettings().whatsappNumber;
    expect(mod.waUrl('Olá, quero agendar')).toBe(
      `https://wa.me/${n}?text=Ol%C3%A1%2C%20quero%20agendar`
    );
  });

  it('monta o link sem mensagem', () => {
    expect(mod.waUrl()).toBe(`https://wa.me/${mod.getSettings().whatsappNumber}`);
  });

  it('devolve string vazia quando não há número configurado (CTA some em vez de quebrar)', () => {
    const s = { ...mod.getSettings(), whatsappNumber: '' };
    expect(mod.waUrl('oi', s)).toBe('');
  });
});

describe('sanitização do acento (D5 — injeção de CSS)', () => {
  it('rejeita valor que não é hex e cai no default', () => {
    sqlite.prepare(`UPDATE settings SET accent_color = ? WHERE id = 1`)
      .run('red;} body{display:none}');
    mod.invalidateSettings();
    expect(mod.getSettings().accentColor).toBe('#0f766e');

    sqlite.prepare(`UPDATE settings SET accent_color = '#0f766e' WHERE id = 1`).run();
    mod.invalidateSettings();
  });

  it('aceita hex de 6 dígitos', () => {
    sqlite.prepare(`UPDATE settings SET accent_color = '#AA3311' WHERE id = 1`).run();
    mod.invalidateSettings();
    expect(mod.getSettings().accentColor).toBe('#AA3311');

    sqlite.prepare(`UPDATE settings SET accent_color = '#0f766e' WHERE id = 1`).run();
    mod.invalidateSettings();
  });
});

describe('parseBusinessHours', () => {
  it('JSON inválido vira lista vazia em vez de derrubar a página', () => {
    expect(mod.parseBusinessHours('{isso não é json')).toEqual([]);
    expect(mod.parseBusinessHours(null)).toEqual([]);
    expect(mod.parseBusinessHours('"uma string"')).toEqual([]);
  });

  it('descarta itens malformados e normaliza closed', () => {
    const r = mod.parseBusinessHours('[{"label":"Seg","hours":"9h"},{"nada":1}]');
    expect(r).toEqual([{ label: 'Seg', hours: '9h', closed: false }]);
  });
});
