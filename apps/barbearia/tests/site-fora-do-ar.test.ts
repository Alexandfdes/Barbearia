// O site de barbearia fora do ar — `src/lib/siteForaDoAr.ts`. Decisão de
// 08/10/2026: o cliente dela vê "temporariamente indisponível" com o WhatsApp
// da barbearia, e nenhuma palavra sobre dívida.
import { describe, it, expect } from 'vitest';
import { paginaForaDoAr, respostaForaDoAr } from '../src/lib/siteForaDoAr';

const BARBEARIA = { businessName: 'Cortes do Zé', whatsappNumber: '5584999990000', accentColor: '#1d4ed8' };

describe('a página do site fora do ar', () => {
  it('diz que está indisponível, com o nome e o WhatsApp da barbearia', () => {
    const html = paginaForaDoAr(BARBEARIA);
    expect(html).toContain('Cortes do Zé');
    expect(html).toContain('temporariamente indisponível');
    expect(html).toContain('href="https://wa.me/5584999990000"');
  });

  it('não expõe a dívida ao cliente da barbearia', () => {
    expect(paginaForaDoAr(BARBEARIA)).not.toMatch(/pag(o|ar|amento)|d[ií]vida|cobran|suspens|cart[aã]o|assinatura/i);
  });

  it('completa o 55 de número gravado sem ele — senão o wa.me abre outro país', () => {
    expect(paginaForaDoAr({ ...BARBEARIA, whatsappNumber: '84999990000' })).toContain('https://wa.me/5584999990000');
  });

  it('sem WhatsApp, sem botão — e sem link quebrado', () => {
    const html = paginaForaDoAr({ ...BARBEARIA, whatsappNumber: '' });
    expect(html).not.toContain('wa.me');
    expect(html).toContain('Volte daqui a pouco');
  });

  it('escapa o nome: ele vem do painel, e o cadastro só limita o tamanho', () => {
    const html = paginaForaDoAr({ ...BARBEARIA, businessName: 'Zé</title><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('cor que não é cor não vira CSS', () => {
    const html = paginaForaDoAr({ ...BARBEARIA, accentColor: 'red;}</style><script>x()</script>' });
    expect(html).not.toContain('<script>x()</script>');
    expect(html).toContain('background: #0f766e');
  });
});

describe('a resposta', () => {
  it('503 com Retry-After — "fora agora, volte depois", e o Google não tira da busca', async () => {
    const r = respostaForaDoAr('/', BARBEARIA);
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('86400');
    expect(r.headers.get('content-type')).toMatch(/text\/html/);
    expect(await r.text()).toContain('temporariamente indisponível');
  });

  it('para quem chama a API, JSON', async () => {
    const r = respostaForaDoAr('/api/slots', BARBEARIA);
    expect(r.status).toBe(503);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect((await r.json()).error).toMatch(/indisponível/);
  });
});
