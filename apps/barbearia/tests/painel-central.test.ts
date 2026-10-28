// O painel só no endereço do painel, e nenhuma página emoldurável (17/10/2026).
//
// Até aqui o rodapé do site levava a `<barbearia>/admin`, e o painel funcionava ali: a
// conferência de origem do §2.30 comparava o site com ele mesmo, o login de outra barbearia
// entrava pelo endereço errado, e a barbearia fora do ar trancava o próprio dono fora do
// login (`src/lib/painelCentral.ts`; `docs/PENDENCIAS-ABERTAS.md` §2.49).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { desvioParaOPainel, ehCaminhoDoPainel, semMoldura } from '../src/lib/painelCentral';

const ENV = { PAINEL_URL: 'https://painel.fadeline.com.br', DOMINIO_BASE: 'fadeline.com.br' };
const pedido = (url: string, metodo = 'GET') => new Request(url, { method: metodo, headers: { host: new URL(url).host } });

describe('o desvio para o painel', () => {
  it('tela do painel no endereço de uma barbearia: 302 para o painel, com o mesmo caminho', () => {
    const r = desvioParaOPainel(pedido('https://ze.fadeline.com.br/admin/dia/2026-10-17?ver=1'), ENV)!;
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://painel.fadeline.com.br/admin/dia/2026-10-17?ver=1');
    expect(desvioParaOPainel(pedido('https://ze.fadeline.com.br/admin'), ENV)?.headers.get('location')).toBe('https://painel.fadeline.com.br/admin');
    expect(desvioParaOPainel(pedido('https://ze.fadeline.com.br/admin/login'), ENV)?.status).toBe(302);
  });

  it('API do painel — e o login — no endereço de uma barbearia: 404, nada roda', () => {
    expect(desvioParaOPainel(pedido('https://ze.fadeline.com.br/api/admin/exportar/clientes.csv'), ENV)?.status).toBe(404);
    expect(desvioParaOPainel(pedido('https://ze.fadeline.com.br/api/auth/login', 'POST'), ENV)?.status).toBe(404);
    expect(desvioParaOPainel(pedido('https://www.barbeariadoze.com.br/api/admin/settings', 'PUT'), ENV)?.status).toBe(404);
  });

  it('o cadastro também é do painel: feito no endereço de uma barbearia, o cookie nascia lá (26/10/2026)', () => {
    const r = desvioParaOPainel(pedido('https://ze.fadeline.com.br/cadastrar'), ENV)!;
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://painel.fadeline.com.br/cadastrar');
    expect(desvioParaOPainel(pedido('https://ze.fadeline.com.br/api/cadastrar', 'POST'), ENV)?.status).toBe(404);
    expect(desvioParaOPainel(pedido('https://painel.fadeline.com.br/cadastrar'), ENV)).toBeNull();
    expect(desvioParaOPainel(pedido('https://painel.fadeline.com.br/api/cadastrar', 'POST'), ENV)).toBeNull();
    expect(ehCaminhoDoPainel('/cadastrarx')).toBe(false);
  });

  it('no endereço do painel, e fora dos caminhos do painel, segue', () => {
    expect(desvioParaOPainel(pedido('https://painel.fadeline.com.br/admin'), ENV)).toBeNull();
    expect(desvioParaOPainel(pedido('https://painel.fadeline.com.br/api/auth/login', 'POST'), ENV)).toBeNull();
    for (const c of ['/', '/agendar', '/cliente', '/api/customer/login', '/api/slots', '/administracao', '/api/administracao']) {
      expect(desvioParaOPainel(pedido(`https://ze.fadeline.com.br${c}`), ENV), c).toBeNull();
    }
    expect(ehCaminhoDoPainel('/adminx')).toBe(false);
  });

  it('sem endereçamento configurado — o desenvolvimento numa porta só —, segue', () => {
    expect(desvioParaOPainel(pedido('http://localhost:4321/admin'), {})).toBeNull();
    expect(desvioParaOPainel(pedido('http://127.0.0.1:4322/admin'), { NODE_ENV: 'development' })).toBeNull();
  });
});

describe('sem moldura', () => {
  it('toda resposta ganha os dois cabeçalhos — e o que a tela já disse fica', () => {
    const r = semMoldura(new Response('ok'));
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    expect(r.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    const propria = semMoldura(new Response('ok', { headers: { 'Content-Security-Policy': "frame-ancestors 'self'" } }));
    expect(propria.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'self'");
  });

  it('a resposta de cabeçalhos imutáveis (redirect) também', () => {
    const r = semMoldura(Response.redirect('https://painel.fadeline.com.br/admin', 302));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('https://painel.fadeline.com.br/admin');
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

describe('no middleware e nas telas', () => {
  const mw = readFileSync('src/middleware.ts', 'utf8');
  it('toda resposta passa pelo semMoldura', () => {
    expect(mw).toMatch(/export const onRequest = defineMiddleware\(async \(contexto, next\) => semMoldura\(await atender\(contexto, next\)\)\);/);
  });
  it('o desvio vem antes de resolver barbearia e antes do aviso de fora do ar', () => {
    const i = mw.indexOf('desvioParaOPainel(contexto.request)');
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(mw.indexOf('await tenantDaRequisicao(contexto.request)'));
    expect(i).toBeLessThan(mw.indexOf('tenantSuspensoDoHost('));
  });
  it('o "copiar link" da busca usa o endereço do site, não o do painel', () => {
    const b = readFileSync('src/pages/admin/buscar.astro', 'utf8');
    expect(b).toMatch(/data-site=\{enderecoDoSite \|\| undefined\}/);
    expect(b).toMatch(/\$\{resultsEl!\.dataset\.site \|\| window\.location\.origin\}\/a\//);
  });
});
