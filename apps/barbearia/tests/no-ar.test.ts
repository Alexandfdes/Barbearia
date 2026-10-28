// "O seu site está no ar" só depois de conferido (`src/lib/noAr.ts`).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// Até 10/10/2026 a tela de fim do cadastro afirmava "no ar" sempre que o app
// achava a barbearia pelo endereço — e o e-mail de boas-vindas também. Em
// produção, o subdomínio novo não tinha certificado (§7.4 da arquitetura da
// cobrança), e o dono era convidado a divulgar no WhatsApp um link que não abria.
//
// Três partes: a conferência (sem banco), o sinal que ela pede (com banco, duas
// barbearias e uma suspensa) e o lugar dela na tela, conferido no fonte. A prova
// num navegador — o endereço que abre, o que não abre, e a tela mudando sozinha
// quando passa a abrir — foi feita contra o build.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { CAMINHO_DO_SINAL, conferirNoAr, esperarNoAr, urlDoSinal, type Imagem } from '../src/lib/noAr';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

/** Uma imagem de mentira: devolve o que o navegador faria quando `src` é atribuído. */
function imagem(comportamento: 'carrega' | 'erro' | 'nunca'): { criar: () => Imagem; pedidos: string[] } {
  const pedidos: string[] = [];
  const criar = (): Imagem => {
    const img: Imagem = {
      onload: null,
      onerror: null,
      set src(v: string) {
        pedidos.push(v);
        if (comportamento === 'carrega') queueMicrotask(() => img.onload?.());
        if (comportamento === 'erro') queueMicrotask(() => img.onerror?.());
      },
      get src() { return pedidos.at(-1) ?? ''; },
    };
    return img;
  };
  return { criar, pedidos };
}

afterEach(() => { vi.useRealTimers(); });

describe('o endereço do sinal', () => {
  it('é o caminho fixo no próprio site, com um número que fura o cache', () => {
    expect(urlDoSinal('https://cortes-do-ze.fadeline.com.br', 123))
      .toBe(`https://cortes-do-ze.fadeline.com.br${CAMINHO_DO_SINAL}?t=123`);
  });

  it('ignora caminho, busca e âncora do endereço do site', () => {
    expect(urlDoSinal('http://ze.localhost:4321/agendar?x=1#topo', 7)).toBe(`http://ze.localhost:4321${CAMINHO_DO_SINAL}?t=7`);
  });
});

describe('uma conferência', () => {
  it('a imagem carregou: no ar', async () => {
    const { criar, pedidos } = imagem('carrega');
    expect(await conferirNoAr('https://ze.fadeline.com.br', { criarImagem: criar })).toBe(true);
    expect(pedidos[0]).toMatch(/^https:\/\/ze\.fadeline\.com\.br\/api\/no-ar\.svg\?t=\d+$/);
  });

  it('erro — certificado, DNS, ou a página de 404 do proxy, que não é imagem: não está no ar', async () => {
    expect(await conferirNoAr('https://ze.fadeline.com.br', { criarImagem: imagem('erro').criar })).toBe(false);
  });

  it('sem resposta dentro do limite: não está no ar', async () => {
    vi.useFakeTimers();
    const r = conferirNoAr('https://ze.fadeline.com.br', { criarImagem: imagem('nunca').criar, limiteMs: 8_000 });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await r).toBe(false);
  });

  it('endereço que nem é URL: não está no ar, e não estoura', async () => {
    expect(await conferirNoAr('isto não é endereço', { criarImagem: imagem('carrega').criar })).toBe(false);
  });
});

describe('a espera', () => {
  /** Uma conferência que responde em sequência: a primeira resposta, a segunda… */
  function respostas(...r: boolean[]) {
    const chamadas: string[] = [];
    const conferir = async (site: string) => { chamadas.push(site); return r[Math.min(chamadas.length - 1, r.length - 1)]; };
    return { conferir, chamadas };
  }

  it('abriu de primeira: avisa que abriu, e nunca que falhou', async () => {
    const { conferir } = respostas(true);
    const aoAbrir = vi.fn(), aoFalhar = vi.fn();
    esperarNoAr('https://ze.x', { aoAbrir, aoFalhar, conferir });
    await vi.waitFor(() => expect(aoAbrir).toHaveBeenCalledTimes(1));
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  it('não abriu: avisa UMA vez, confere de novo a cada intervalo, e para quando abre', async () => {
    vi.useFakeTimers();
    const { conferir, chamadas } = respostas(false, false, true);
    const aoAbrir = vi.fn(), aoFalhar = vi.fn();
    esperarNoAr('https://ze.x', { aoAbrir, aoFalhar, conferir, intervaloMs: 20_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoAbrir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(aoAbrir).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(chamadas).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(200_000); // depois de abrir, ninguém confere mais
    expect(chamadas).toHaveLength(3);
  });

  it('desiste depois das tentativas, e o "conferir agora" recomeça', async () => {
    vi.useFakeTimers();
    const { conferir, chamadas } = respostas(false, false, false, true);
    const aoAbrir = vi.fn(), aoDesistir = vi.fn();
    const espera = esperarNoAr('https://ze.x', { aoAbrir, aoDesistir, conferir, intervaloMs: 1_000, tentativas: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(aoDesistir).toHaveBeenCalledTimes(1);
    expect(chamadas).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chamadas).toHaveLength(3);
    espera.conferirAgora();
    await vi.advanceTimersByTimeAsync(0);
    expect(aoAbrir).toHaveBeenCalledTimes(1);
  });

  it('parar para', async () => {
    vi.useFakeTimers();
    const { conferir, chamadas } = respostas(false);
    const espera = esperarNoAr('https://ze.x', { aoAbrir: () => {}, conferir, intervaloMs: 1_000 });
    await vi.advanceTimersByTimeAsync(0);
    espera.parar();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(chamadas).toHaveLength(1);
  });
});

describe.skipIf(!TEM_BANCO)('o sinal que a tela pede', () => {
  let GET: typeof import('../src/pages/api/no-ar.svg.js').GET;
  let sqlConn: { end: (o?: { timeout?: number }) => Promise<void> };

  beforeAll(async () => {
    const conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(conn);
    await conn`INSERT INTO tenants (id, slug, business_name, status, domain, trial_ends_at) VALUES
      (1, 'cortes-do-ze', 'Cortes do Zé',      'trial',     NULL,                   now() + interval '7 days'),
      (2, 'vintage',      'Barbearia Vintage', 'active',    'vintagebarber.com.br', NULL),
      (3, 'sumida',       'Barbearia Sumida',  'suspended', NULL,                   NULL)`;
    await conn.end({ timeout: 5 });
    ({ GET } = await import('../src/pages/api/no-ar.svg.js'));
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    ({ sqlConn } = await import('../src/db/index.js'));
  }, 30_000);

  afterAll(async () => { await sqlConn?.end({ timeout: 5 }); });

  const pedir = (host: string) =>
    GET({ request: new Request(`https://${host}${CAMINHO_DO_SINAL}?t=1`, { headers: { host } }) } as never) as Promise<Response>;

  it('no endereço de uma barbearia no ar — no teste ou pagando —, é uma imagem, sem cache', async () => {
    for (const host of ['cortes-do-ze.fadeline.com.br', 'vintage.fadeline.com.br', 'vintagebarber.com.br']) {
      const r = await pedir(host);
      expect(r.status, host).toBe(200);
      expect(r.headers.get('content-type'), host).toBe('image/svg+xml');
      expect(r.headers.get('cache-control'), host).toBe('no-store');
    }
  });

  it('em qualquer outro endereço, 404 — que não é imagem, e a tela não diz "no ar"', async () => {
    for (const host of ['sumida.fadeline.com.br', 'naoexiste.fadeline.com.br', 'painel.fadeline.com.br']) {
      const r = await pedir(host);
      expect(r.status, host).toBe(404);
      expect(r.headers.get('content-type'), host).not.toMatch(/^image\//);
    }
  });
});

describe('a tela de fim do cadastro', () => {
  const fonte = readFileSync('src/pages/cadastrar.astro', 'utf8');
  const script = fonte.slice(fonte.indexOf('<script>'));
  const trecho = (de: string, ate: string) => script.slice(script.indexOf(de), script.indexOf(ate, script.indexOf(de)));

  it('confere o endereço antes de dizer qualquer coisa sobre ele', () => {
    expect(script).toMatch(/import \{ esperarNoAr \} from '\.\.\/lib\/noAr\.js';/);
    expect(script).toMatch(/const espera = esperarNoAr\(site, \{/);
  });

  it('"O seu site está no ar." só sai de dentro do aoAbrir — uma vez no arquivo inteiro', () => {
    expect(fonte.split('O seu site está no ar.').length - 1).toBe(1);
    expect(trecho('aoAbrir:', 'aoFalhar:')).toContain("'O seu site está no ar.'");
  });

  it('fora do script, nada promete "no ar" — nem a frase do começo do cadastro', () => {
    const marcacao = fonte.slice(0, fonte.indexOf('<script>'));
    expect(marcacao).toContain('Criar a sua barbearia'); // o corte pegou a página, não um pedaço vazio
    expect(marcacao).not.toMatch(/est[aá] no ar/i);
  });

  it('os botões de divulgar só existem no bloco do endereço que abre, e ele só é montado no aoAbrir', () => {
    expect(script.split('wa.me').length - 1).toBe(1);
    expect(trecho('function blocoNoAr', 'form.addEventListener')).toContain('wa.me');
    expect(script.split('blocoNoAr(').length - 1).toBe(2); // a declaração e a chamada
    expect(trecho('aoAbrir:', 'aoFalhar:')).toContain('blocoNoAr(site)');
  });
});
