// O `www` do domínio do produto vai para a raiz (05/11/2026, `src/lib/enderecoWww.ts`).
//
// Com o certificado curinga, o `www` também casa com `*.<DOMINIO_BASE>` e pode chegar a este app
// em vez do site de vendas. Sem o desvio, o resolvedor leria `www` como o endereço de uma barbearia
// — reservado, nenhuma o tem — e a landing viraria "barbearia não encontrada".
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { desvioDoWww } from '../src/lib/enderecoWww';

const ENV = { DOMINIO_BASE: 'fadeline.com.br' };
const pedido = (url: string, host: string, method = 'GET') => new Request(url, { method, headers: { host } });

describe('o desvio do www', () => {
  it('www vai para a raiz, com o caminho e a busca, em 301', () => {
    const r = desvioDoWww(pedido('https://www.fadeline.com.br/demo?x=1', 'www.fadeline.com.br'), ENV);
    expect(r?.status).toBe(301);
    expect(r?.headers.get('location')).toBe('https://fadeline.com.br/demo?x=1');
  });

  it('maiúscula, ponto no fim — e POST leva 308, que mantém o método', () => {
    expect(desvioDoWww(pedido('https://WWW.Fadeline.com.br/', 'WWW.Fadeline.com.br.'), ENV)?.headers.get('location'))
      .toBe('https://fadeline.com.br/');
    expect(desvioDoWww(pedido('https://www.fadeline.com.br/x', 'www.fadeline.com.br', 'POST'), ENV)?.status).toBe(308);
  });

  it('o resto não é desviado: o painel, as barbearias, a raiz, e sem DOMINIO_BASE', () => {
    for (const host of ['painel.fadeline.com.br', 'barbearia-teste.fadeline.com.br', 'fadeline.com.br', 'www.outro.com.br', 'wwwx.fadeline.com.br']) {
      expect(desvioDoWww(pedido(`https://${host}/`, host), ENV), host).toBeNull();
    }
    expect(desvioDoWww(pedido('https://www.fadeline.com.br/', 'www.fadeline.com.br'), {})).toBeNull();
  });

  it('no desenvolvimento, com porta, o endereço sai em http', () => {
    const r = desvioDoWww(pedido('http://www.localhost:4321/a', 'www.localhost:4321'), { DOMINIO_BASE: 'localhost:4321' });
    expect(r?.headers.get('location')).toBe('http://localhost:4321/a');
  });

  it('o middleware chama o desvio — depois da conferência de origem, antes do resto', () => {
    const fonte = readFileSync('src/middleware.ts', 'utf8');
    const origem = fonte.indexOf('const recusa = motivoDaRecusa(contexto.request);');
    const desvio = fonte.indexOf('const www = desvioDoWww(contexto.request);');
    const tarefas = fonte.indexOf("if (caminho.startsWith('/api/tarefas/')) return next();");
    expect(origem).toBeGreaterThan(0);
    expect(desvio).toBeGreaterThan(origem);
    expect(tarefas).toBeGreaterThan(desvio);
    expect(fonte).toMatch(/const www = desvioDoWww\(contexto\.request\);\n\s+if \(www\) return www;/);
  });
});
