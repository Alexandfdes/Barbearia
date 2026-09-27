// O endereço e a prévia de link de cada barbearia.
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// O canonical, o og:url, a imagem de prévia e o `@id` do schema.org saíam de
// `SITE_URL`, uma constante com o domínio do Bayron — herança de quando cada
// cliente tinha a própria instância. Em todo site do produto:
//
// - o canonical dizia ao Google que a página "de verdade" era a do Bayron, e o
//   site do cliente novo se declarava cópia de outro;
// - sem prévia própria, o link mandado no WhatsApp mostrava `public/og.jpg`: a
//   foto do Bayron, com o nome e o arroba dele.
//
// Achado em 27/09/2026, lendo o código durante o primeiro teste de ponta a ponta.
// Ninguém tinha olhado o `<head>` de um site que não fosse o do Bayron.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { enderecoPublicoDe, type Tenant } from '../src/lib/tenant.js';

const vintage: Tenant = { id: 7, slug: 'vintage', status: 'active', domain: null };
const comDominio: Tenant = { id: 8, slug: 'ze', status: 'active', domain: 'barbeariadoze.com.br' };

const baseAntes = process.env.DOMINIO_BASE;
afterEach(() => {
  if (baseAntes === undefined) delete process.env.DOMINIO_BASE;
  else process.env.DOMINIO_BASE = baseAntes;
});

describe('o endereço é o da barbearia servida', () => {
  it('subdomínio do produto', () => {
    process.env.DOMINIO_BASE = 'barbearianoar.com.br';
    expect(enderecoPublicoDe(vintage, 'http://interno:4321')).toBe('https://vintage.barbearianoar.com.br');
  });

  it('domínio próprio vence o subdomínio', () => {
    process.env.DOMINIO_BASE = 'barbearianoar.com.br';
    expect(enderecoPublicoDe(comDominio, 'http://interno:4321')).toBe('https://barbeariadoze.com.br');
  });

  it('sem domínio base, como em desenvolvimento, vale o da própria requisição', () => {
    delete process.env.DOMINIO_BASE;
    expect(enderecoPublicoDe(vintage, 'http://vintage.localhost:4321')).toBe('http://vintage.localhost:4321');
  });

  it('sem barbearia no endereço, o da própria requisição — nunca o de outra', () => {
    process.env.DOMINIO_BASE = 'barbearianoar.com.br';
    expect(enderecoPublicoDe(null, 'http://localhost:4321')).toBe('http://localhost:4321');
  });
});

describe('nenhum site usa o endereço ou a imagem de outra barbearia', () => {
  const fontes = [...globSync('src/**/*.astro'), ...globSync('src/**/*.ts')].sort();
  const layout = readFileSync('src/layouts/Layout.astro', 'utf8');

  it('encontra os arquivos — controle contra o glob quebrar em silêncio', () => {
    expect(fontes.length).toBeGreaterThan(50);
  });

  it('ninguém importa uma constante de endereço', () => {
    const comConstante = fontes.filter((f) => /import\s*\{[^}]*\bSITE_URL\b/.test(readFileSync(f, 'utf8')));
    expect(comConstante).toEqual([]);
  });

  it('o domínio do Bayron não está cravado em arquivo nenhum', () => {
    const cravados = fontes.filter((f) => readFileSync(f, 'utf8').includes('bayron.alexandrefdev.tech'));
    expect(cravados).toEqual([]);
  });

  it('o layout monta o endereço pela barbearia servida', () => {
    expect(layout).toMatch(/enderecoPublico\(Astro\.request, Astro\.url\)/);
  });

  it('a foto do Bayron não é a prévia padrão de ninguém — só a do próprio Bayron', () => {
    // Só o código conta: o comentário que explica o defeito cita o arquivo.
    const linhas = layout.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    const comOg = linhas.filter((l) => /og\.jpg/.test(l));
    expect(comOg.length).toBeLessThanOrEqual(1);
    for (const l of comOg) expect(l).toMatch(/shortName === 'Bayron'/);
  });

  it('nenhuma tela traz "Barbearia Bayron" escrito no código', () => {
    // O portal, a área do cliente, o lembrete de WhatsApp e o relatório impresso
    // diziam "Barbearia Bayron" para qualquer barbearia até 27/09/2026. O nome
    // tem que vir de `settings`. Comentário não conta.
    const soCodigo = (f: string) => readFileSync(f, 'utf8').split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const comNomeFixo = fontes.filter((f) => /Barbearia Bayron/.test(soCodigo(f)));
    expect(comNomeFixo).toEqual([]);
  });

  it('o convite de calendário leva ao site da barbearia do agendamento', () => {
    const ics = readFileSync('src/pages/api/appointments/by-token/[token]/ics.ts', 'utf8');
    expect(ics).toMatch(/enderecoPublicoDe\(tenant,/);
    expect(ics).not.toMatch(/bayron-\$\{/);
  });
});
