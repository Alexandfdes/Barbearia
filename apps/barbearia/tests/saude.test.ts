// `GET /api/saude`, a pergunta do monitor externo (`PENDENCIAS-ABERTAS.md` §3.4):
// 200 quando o app e o banco respondem, 503 quando o banco falha ou TRAVA.
//
// O caso que importa é o do banco travado: um monitor esperando para sempre não
// avisa ninguém. Por isso o prazo é testado com uma consulta que nunca volta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { saudeDoApp } from '../src/lib/saude';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

describe('a regra (`lib/saude.ts`)', () => {
  it('o banco respondeu: ok', async () => {
    expect(await saudeDoApp(async () => [{ '?column?': 1 }])).toEqual({ ok: true });
  });

  it('o banco recusou: 503 — e a resposta não diz o porquê (vai para o log)', async () => {
    const r = await saudeDoApp(async () => { throw new Error('password authentication failed for user "x"'); });
    expect(r).toEqual({ ok: false, falha: 'banco' });
    expect(JSON.stringify(r)).not.toMatch(/password|user/);
  });

  it('o banco TRAVOU: não espera para sempre — dá doente no prazo', async () => {
    const inicio = Date.now();
    const r = await saudeDoApp(() => new Promise(() => { /* nunca volta */ }), 100);
    expect(r).toEqual({ ok: false, falha: 'banco' });
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it('o middleware deixa a rota passar antes de resolver endereço e sessão', () => {
    const fonte = readFileSync('src/middleware.ts', 'utf8');
    const desvio = fonte.indexOf("if (caminho === '/api/saude') return next();");
    expect(desvio).toBeGreaterThan(fonte.indexOf('motivoDaRecusa(contexto.request)'));
    expect(desvio).toBeLessThan(fonte.indexOf('await tenantDaRequisicao(contexto.request)'));
  });
});

describe.skipIf(!TEM_BANCO)('a rota, com o banco de verdade', () => {
  let GET: typeof import('../src/pages/api/saude.ts').GET;
  let HEAD: typeof import('../src/pages/api/saude.ts').HEAD;

  beforeAll(async () => {
    ({ GET, HEAD } = await import('../src/pages/api/saude.ts'));
  }, 30_000);

  afterAll(async () => {
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
  });

  it('200 com {"ok":true}, sem cache', async () => {
    const r = await GET({ request: new Request('http://painel.test/api/saude') } as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('HEAD responde o mesmo — há monitor que só pergunta assim', async () => {
    const r = await HEAD({ request: new Request('http://painel.test/api/saude', { method: 'HEAD' }) } as never);
    expect(r.status).toBe(200);
  });

  // Por último: fecha o pool do app, e o banco passa a não existir para a rota.
  it('o banco fora: 503 com {"ok":false} — o código que o monitor transforma em aviso', async () => {
    await (await import('../src/db/index.js')).sqlConn.end({ timeout: 5 });
    const r = await GET({ request: new Request('http://painel.test/api/saude') } as never);
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ ok: false, falha: 'banco' });
  });
});
