// O CEP que preenche o endereço — no cadastro e em Configurações (`src/lib/cep.ts`, 12/11/2026).
//
// Pedido do dono: o barbeiro digita o CEP e a rua, a cidade e o estado vêm sozinhos. O CEP não fica
// guardado ("só preencher"). A busca sai do navegador direto para o ViaCEP, com a BrasilAPI de
// reserva — nada passa pelo servidor (o porquê está no topo da lib).
//
// Os serviços são simulados aqui, no formato que eles documentam: daqui da nuvem eles não
// respondem. O que roda no navegador — o foco, o cursor, a prévia do mapa — foi visto no
// navegador, com os dois serviços interceptados; o que dá para provar sem ele está aqui.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import {
  BRASILAPI, VIACEP, avisoDoCep, buscarCep, digitosDoCep, ligarBuscaDoCep, mascaraDoCep, ruaNoCampo,
  type Buscador, type ResultadoDoCep,
} from '../src/lib/cep.js';

// ── Os dois serviços, de mentira ─────────────────────────────────────────────

type Resposta = { status: number; corpo?: unknown } | 'erro' | 'calado' | 'nao-json';

const VIACEP_ACHOU = {
  cep: '59600-123', logradouro: 'Rua das Flores', complemento: '', unidade: '', bairro: 'Centro',
  localidade: 'Mossoró', uf: 'RN', estado: 'Rio Grande do Norte', regiao: 'Nordeste', ibge: '0000000', gia: '', ddd: '84', siafi: '0000',
};
const BRASILAPI_ACHOU = {
  cep: '59600123', state: 'RN', city: 'Mossoró', neighborhood: 'Alto da Conceição', street: 'Avenida Rio Branco',
  service: 'open-cep', location: { type: 'Point', coordinates: {} },
};
const BRASILAPI_NAO_EXISTE = {
  name: 'CepPromiseError', message: 'Todos os serviços de CEP retornaram erro.', type: 'service_error', errors: [],
};

function servicos(viacep: Resposta, brasilapi: Resposta) {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const fetch: Buscador = (url, init) => {
    pedidos.push({ url, init });
    const r = url.startsWith(VIACEP) ? viacep : brasilapi;
    if (r === 'erro') return Promise.reject(new TypeError('Failed to fetch'));
    if (r === 'calado') {
      return new Promise((_, rejeitar) => {
        init.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError')));
      });
    }
    if (r === 'nao-json') return Promise.resolve({ status: 200, json: () => Promise.reject(new SyntaxError('<html>')) });
    return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.corpo) });
  };
  return { fetch, pedidos, servicosChamados: () => pedidos.map((p) => (p.url.startsWith(VIACEP) ? 'viacep' : 'brasilapi')) };
}

describe('os 8 números e a máscara', () => {
  it('lê o CEP de qualquer jeito que ele venha escrito, e só com 8 números', () => {
    for (const escrito of ['59600-123', '59600123', ' 59.600-123 ', 'CEP 59600 123']) {
      expect(digitosDoCep(escrito), escrito).toBe('59600123');
    }
    for (const errado of ['5960012', '596001234', '', 'cep']) expect(digitosDoCep(errado), errado).toBeNull();
  });

  it('escreve 00000-000 enquanto a pessoa digita ou cola, e para no oitavo número', () => {
    expect(mascaraDoCep('5')).toBe('5');
    expect(mascaraDoCep('59600')).toBe('59600');
    expect(mascaraDoCep('596001')).toBe('59600-1');
    expect(mascaraDoCep('59600123')).toBe('59600-123');
    expect(mascaraDoCep('59600-1234')).toBe('59600-123');
    expect(mascaraDoCep('ab59.600x123')).toBe('59600-123');
  });
});

describe('a busca: o ViaCEP, e a BrasilAPI de reserva', () => {
  it('o ViaCEP achou: devolve a rua, o bairro, a cidade e o estado — e a reserva nem é chamada', async () => {
    const s = servicos({ status: 200, corpo: VIACEP_ACHOU }, { status: 500 });
    expect(await buscarCep('59600-123', { fetch: s.fetch })).toEqual({
      tipo: 'achou', endereco: { cep: '59600123', rua: 'Rua das Flores', bairro: 'Centro', cidade: 'Mossoró', uf: 'RN' },
    });
    expect(s.pedidos.map((p) => p.url)).toEqual(['https://viacep.com.br/ws/59600123/json/']);
  });

  it('pede sem cookie, sem dizer de que tela veio, e com prazo', async () => {
    const s = servicos({ status: 200, corpo: VIACEP_ACHOU }, { status: 500 });
    await buscarCep('59600123', { fetch: s.fetch });
    const { init } = s.pedidos[0];
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('o ViaCEP diz que não conhece — em booleano ou em texto: pergunta à BrasilAPI, que às vezes conhece', async () => {
    for (const erro of [true, 'true']) {
      const s = servicos({ status: 200, corpo: { erro } }, { status: 200, corpo: BRASILAPI_ACHOU });
      expect(await buscarCep('59600123', { fetch: s.fetch }), String(erro)).toEqual({
        tipo: 'achou', endereco: { cep: '59600123', rua: 'Avenida Rio Branco', bairro: 'Alto da Conceição', cidade: 'Mossoró', uf: 'RN' },
      });
      expect(s.servicosChamados()).toEqual(['viacep', 'brasilapi']);
      expect(s.pedidos[1].url).toBe('https://brasilapi.com.br/api/cep/v2/59600123');
    }
  });

  it('"não achei" quando um deles disse que o CEP não existe — mesmo com o outro fora', async () => {
    const casos: [Resposta, Resposta][] = [
      [{ status: 200, corpo: { erro: true } }, { status: 404, corpo: BRASILAPI_NAO_EXISTE }],
      [{ status: 200, corpo: { erro: true } }, 'erro'],
      [{ status: 200, corpo: { erro: 'true' } }, 'erro'],
      [{ status: 500 }, { status: 404, corpo: BRASILAPI_NAO_EXISTE }],
      ['erro', { status: 404, corpo: BRASILAPI_NAO_EXISTE }],
    ];
    for (const [viacep, brasilapi] of casos) {
      const s = servicos(viacep, brasilapi);
      expect(await buscarCep('59600123', { fetch: s.fetch }), JSON.stringify([viacep, brasilapi])).toEqual({ tipo: 'nao-achou' });
    }
  });

  it('os dois fora, ou respondendo o que não se entende: "fora", nunca "não achei" nem exceção', async () => {
    const casos: [Resposta, Resposta][] = [
      ['erro', 'erro'],
      [{ status: 500 }, { status: 503 }],
      ['nao-json', 'nao-json'],
      // A cidade sem estado, e o estado por extenso: não é a forma de endereço que eles documentam.
      [{ status: 200, corpo: { ...VIACEP_ACHOU, uf: undefined } }, { status: 200, corpo: { ...BRASILAPI_ACHOU, state: 'Rio Grande do Norte' } }],
      [{ status: 200, corpo: { ...VIACEP_ACHOU, localidade: '' } }, { status: 200, corpo: 'texto' }],
      // O 404 que não é o "CEP não existe" da BrasilAPI é o endereço da API que mudou.
      ['erro', { status: 404, corpo: { message: 'Not Found' } }],
      ['erro', { status: 404 }],
    ];
    for (const [viacep, brasilapi] of casos) {
      const s = servicos(viacep, brasilapi);
      expect(await buscarCep('59600123', { fetch: s.fetch }), JSON.stringify([viacep, brasilapi])).toEqual({ tipo: 'fora' });
      expect(s.servicosChamados()).toEqual(['viacep', 'brasilapi']);
    }
  });

  it('a resposta torta do ViaCEP — texto comprido demais, campo que não é texto — vai para a reserva', async () => {
    for (const torto of [{ logradouro: 'R'.repeat(101) }, { bairro: 42 }, { localidade: 'M'.repeat(73) }]) {
      const s = servicos({ status: 200, corpo: { ...VIACEP_ACHOU, ...torto } }, { status: 200, corpo: BRASILAPI_ACHOU });
      const r = await buscarCep('59600123', { fetch: s.fetch });
      expect(r.tipo === 'achou' && r.endereco.rua, JSON.stringify(torto)).toBe('Avenida Rio Branco');
    }
  });

  it('o CEP de cidade inteira vem sem rua e sem bairro — e espaços a mais saem', async () => {
    const cidadeInteira = { ...VIACEP_ACHOU, cep: '59600-000', logradouro: '', bairro: '', localidade: '  Mossoró ', uf: 'rn' };
    const s = servicos({ status: 200, corpo: cidadeInteira }, { status: 500 });
    expect(await buscarCep('59600000', { fetch: s.fetch })).toEqual({
      tipo: 'achou', endereco: { cep: '59600000', rua: '', bairro: '', cidade: 'Mossoró', uf: 'RN' },
    });
  });

  it('o ViaCEP calado: o prazo dele acaba, e a BrasilAPI responde', async () => {
    const s = servicos('calado', { status: 200, corpo: BRASILAPI_ACHOU });
    const inicio = Date.now();
    const r = await buscarCep('59600123', { fetch: s.fetch, prazoMs: 40 });
    expect(r.tipo).toBe('achou');
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it('os dois calados: "fora" em dois prazos, não para sempre', async () => {
    const s = servicos('calado', 'calado');
    const inicio = Date.now();
    expect(await buscarCep('59600123', { fetch: s.fetch, prazoMs: 40 })).toEqual({ tipo: 'fora' });
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it('outro CEP digitado no meio: a busca para ali — e não incomoda a reserva', async () => {
    const s = servicos('calado', { status: 200, corpo: BRASILAPI_ACHOU });
    const controle = new AbortController();
    const busca = buscarCep('59600123', { fetch: s.fetch, prazoMs: 5000, sinal: controle.signal });
    controle.abort();
    expect(await busca).toEqual({ tipo: 'cancelado' });
    expect(s.servicosChamados()).toEqual(['viacep']);
  });

  it('cancelado enquanto a reserva pensa: "cancelado", não "fora"', async () => {
    const s = servicos('erro', 'calado');
    const controle = new AbortController();
    const busca = buscarCep('59600123', { fetch: s.fetch, prazoMs: 5000, sinal: controle.signal });
    await new Promise((r) => setTimeout(r, 10));
    expect(s.servicosChamados()).toEqual(['viacep', 'brasilapi']);
    controle.abort();
    expect(await busca).toEqual({ tipo: 'cancelado' });
  });

  it('já cancelado antes de começar: não pergunta a ninguém', async () => {
    const s = servicos({ status: 200, corpo: VIACEP_ACHOU }, { status: 200, corpo: BRASILAPI_ACHOU });
    const controle = new AbortController();
    controle.abort();
    expect(await buscarCep('59600123', { fetch: s.fetch, sinal: controle.signal })).toEqual({ tipo: 'cancelado' });
    expect(s.pedidos).toEqual([]);
  });

  it('sem 8 números, não pergunta a ninguém', async () => {
    const s = servicos({ status: 200, corpo: VIACEP_ACHOU }, { status: 200, corpo: BRASILAPI_ACHOU });
    expect(await buscarCep('5960012', { fetch: s.fetch })).toEqual({ tipo: 'invalido' });
    expect(s.pedidos).toEqual([]);
  });
});

describe('a rua no campo "Rua e número"', () => {
  it('campo vazio: a rua do CEP e a vírgula, para o número vir logo depois', () => {
    expect(ruaNoCampo('', 'Rua das Flores')).toBe('Rua das Flores, ');
    expect(ruaNoCampo('   ', ' Rua das Flores ')).toBe('Rua das Flores, ');
  });

  it('o campo já começa por esta rua, com o número: fica como está — sem diferença de acento, maiúscula ou espaço', () => {
    for (const atual of ['Rua das Flores, 42', 'rua das flores 42', 'RUA DAS FLÔRES,42', 'Rua  das Flores - Centro', 'Rua das Flores, ']) {
      expect(ruaNoCampo(atual, 'Rua das Flores'), atual).toBeNull();
    }
  });

  it('outra rua — inclusive a que só começa igual — sai, e a do CEP entra', () => {
    expect(ruaNoCampo('Rua das Flores Altas, 10', 'Rua das Flores')).toBe('Rua das Flores, ');
    expect(ruaNoCampo('Av. Brasil, 900', 'Rua das Flores')).toBe('Rua das Flores, ');
    // O nome só, sem o número: ganha a vírgula.
    expect(ruaNoCampo('Rua das Flores', 'Rua das Flores')).toBe('Rua das Flores, ');
  });

  it('CEP de cidade inteira: a rua é de quem digita', () => {
    expect(ruaNoCampo('Rua que ele escreveu, 5', '')).toBeNull();
    expect(ruaNoCampo('', '')).toBeNull();
  });
});

describe('o que a tela diz', () => {
  const achou = (rua: string, bairro = 'Centro'): ResultadoDoCep =>
    ({ tipo: 'achou', endereco: { cep: '59600123', rua, bairro, cidade: 'Mossoró', uf: 'RN' } });

  it('o que achou, e o que falta fazer', () => {
    expect(avisoDoCep(achou('Rua das Flores'), true)).toBe('Rua das Flores, Centro — Mossoró/RN. Escreva o número depois da vírgula.');
    expect(avisoDoCep(achou('Rua das Flores', ''), true)).toBe('Rua das Flores — Mossoró/RN. Escreva o número depois da vírgula.');
    expect(avisoDoCep(achou('Rua das Flores'), false)).toBe('Rua das Flores, Centro — Mossoró/RN. A rua já estava escrita: confira o número.');
    expect(avisoDoCep(achou('', ''), false)).toBe('Esse CEP vale para toda a cidade de Mossoró/RN: escreva a rua e o número.');
  });

  it('não achou e fora dizem que dá para seguir à mão', () => {
    expect(avisoDoCep({ tipo: 'nao-achou' }, false)).toMatch(/Não achei esse CEP\..*à mão\.$/);
    expect(avisoDoCep({ tipo: 'fora' }, false)).toMatch(/não respondeu agora\. Escreva o endereço à mão\.$/);
  });
});

// ── A ligação com a tela, com campos de mentira ──────────────────────────────

type Evento = { key?: string; preventDefault?: () => void };

function campo(valor = '') {
  const ouvintes = new Map<string, ((e: Evento) => void)[]>();
  const c = {
    value: valor,
    focado: false,
    selecao: null as [number, number] | null,
    disparados: [] as { tipo: string; borbulha: boolean }[],
    addEventListener(tipo: string, ouvinte: (e: Evento) => void) {
      ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), ouvinte]);
    },
    dispatchEvent(e: Event) { c.disparados.push({ tipo: e.type, borbulha: e.bubbles }); return true; },
    focus() { c.focado = true; },
    setSelectionRange(inicio: number, fim: number) { c.selecao = [inicio, fim]; },
    emitir(tipo: string, e: Evento = {}) { for (const o of ouvintes.get(tipo) ?? []) o(e); },
    digitar(texto: string) { c.value = texto; c.emitir('input'); },
  };
  return c;
}

/** A busca que a ligação chama, respondida à mão no teste. */
function buscaNaMao() {
  const pedidos: { cep: string; sinal: AbortSignal; responder: (r: ResultadoDoCep) => void }[] = [];
  const buscar = (cep: string, sinal: AbortSignal) =>
    new Promise<ResultadoDoCep>((responder) => { pedidos.push({ cep, sinal, responder }); });
  return { buscar, pedidos };
}

const depois = () => new Promise((r) => setTimeout(r, 0));
const ACHOU: ResultadoDoCep = { tipo: 'achou', endereco: { cep: '59600123', rua: 'Rua das Flores', bairro: 'Centro', cidade: 'Mossoró', uf: 'RN' } };

function tela(ruaAntes = '') {
  const cep = campo(), rua = campo(ruaAntes), aviso = { textContent: '' as string | null };
  const cidades: string[] = [];
  const b = buscaNaMao();
  ligarBuscaDoCep({ cep, aviso, rua, cidade: (e) => cidades.push(`${e.cidade}/${e.uf}`), buscar: b.buscar });
  return { cep, rua, aviso, cidades, ...b };
}

describe('a ligação com a tela', () => {
  it('máscara enquanto digita; no oitavo número, busca — e diz que está buscando', () => {
    const t = tela();
    t.cep.digitar('5960');
    expect(t.cep.value).toBe('5960');
    expect(t.pedidos).toHaveLength(0);
    t.cep.digitar('5960012');
    expect(t.cep.value).toBe('59600-12');
    t.cep.digitar('59600-123');
    expect(t.pedidos.map((p) => p.cep)).toEqual(['59600123']);
    expect(t.aviso.textContent).toBe('Buscando o endereço…');
  });

  it('achou: a rua, avisando a tela com um input que borbulha; a cidade; e o que falta', async () => {
    const t = tela();
    t.cep.digitar('59600123');
    t.pedidos[0].responder(ACHOU);
    await depois();
    expect(t.rua.value).toBe('Rua das Flores, ');
    expect(t.rua.disparados).toEqual([{ tipo: 'input', borbulha: true }]);
    expect(t.cidades).toEqual(['Mossoró/RN']);
    expect(t.aviso.textContent).toBe('Rua das Flores, Centro — Mossoró/RN. Escreva o número depois da vírgula.');
  });

  it('o cursor vai para o fim da rua só se a pessoa ainda está no CEP', async () => {
    const noCep = tela();
    noCep.cep.emitir('focus');
    noCep.cep.digitar('59600123');
    noCep.pedidos[0].responder(ACHOU);
    await depois();
    expect(noCep.rua.focado).toBe(true);
    expect(noCep.rua.selecao).toEqual([16, 16]);

    const saiu = tela();
    saiu.cep.emitir('focus');
    saiu.cep.digitar('59600123');
    saiu.cep.emitir('blur');           // foi para outro campo antes da resposta
    saiu.pedidos[0].responder(ACHOU);
    await depois();
    expect(saiu.rua.value).toBe('Rua das Flores, ');
    expect(saiu.rua.focado).toBe(false);
    expect(saiu.rua.selecao).toBeNull();
  });

  it('a rua já escrita, com o número, fica — sem input falso e sem roubar o foco', async () => {
    const t = tela('Rua das Flores, 42');
    t.cep.emitir('focus');
    t.cep.digitar('59600123');
    t.pedidos[0].responder(ACHOU);
    await depois();
    expect(t.rua.value).toBe('Rua das Flores, 42');
    expect(t.rua.disparados).toEqual([]);
    expect(t.rua.focado).toBe(false);
    expect(t.cidades).toEqual(['Mossoró/RN']);
    expect(t.aviso.textContent).toMatch(/A rua já estava escrita: confira o número\.$/);
  });

  it('CEP de cidade inteira: só a cidade', async () => {
    const t = tela('Rua que ele escreveu, 5');
    t.cep.digitar('59600000');
    t.pedidos[0].responder({ tipo: 'achou', endereco: { cep: '59600000', rua: '', bairro: '', cidade: 'Mossoró', uf: 'RN' } });
    await depois();
    expect(t.rua.value).toBe('Rua que ele escreveu, 5');
    expect(t.cidades).toEqual(['Mossoró/RN']);
    expect(t.aviso.textContent).toMatch(/toda a cidade de Mossoró\/RN/);
  });

  it('não achou, ou fora — inclusive a busca que lança: nada muda nos campos, e a tela diz', async () => {
    for (const desfecho of [{ tipo: 'nao-achou' }, { tipo: 'fora' }, 'lança'] as const) {
      const cep = campo(), rua = campo('o que estava'), aviso = { textContent: '' as string | null };
      const cidades: string[] = [];
      const buscar = () => (desfecho === 'lança' ? Promise.reject(new Error('x')) : Promise.resolve(desfecho as ResultadoDoCep));
      ligarBuscaDoCep({ cep, aviso, rua, cidade: (e) => cidades.push(e.cidade), buscar });
      cep.digitar('59600123');
      await depois();
      expect(rua.value, String(desfecho)).toBe('o que estava');
      expect(cidades, String(desfecho)).toEqual([]);
      expect(aviso.textContent, String(desfecho)).toBe(avisoDoCep(desfecho === 'lança' ? { tipo: 'fora' } : desfecho, false));
    }
  });

  it('outro CEP no meio: a busca anterior é cancelada, e a resposta atrasada dela não vale', async () => {
    const t = tela();
    t.cep.digitar('59600123');
    t.cep.digitar('59600-12');
    expect(t.pedidos[0].sinal.aborted).toBe(true);
    expect(t.aviso.textContent).toBe('');
    t.cep.digitar('59600-124');
    t.pedidos[0].responder(ACHOU);       // a antiga chega depois
    await depois();
    expect(t.cidades).toEqual([]);
    expect(t.aviso.textContent).toBe('Buscando o endereço…');
    t.pedidos[1].responder({ tipo: 'achou', endereco: { ...ACHOU.endereco, cep: '59600124', cidade: 'Natal' } });
    await depois();
    expect(t.cidades).toEqual(['Natal/RN']);
  });

  it('saiu do CEP pela metade: diz que são 8 números; vazio, não diz nada', () => {
    const t = tela();
    t.cep.digitar('5960');
    t.cep.emitir('blur');
    expect(t.aviso.textContent).toBe('O CEP tem 8 números.');
    const vazio = tela();
    vazio.cep.emitir('blur');
    expect(vazio.aviso.textContent).toBe('');
  });

  it('Enter no CEP não envia o formulário', () => {
    const t = tela();
    let evitado = 0;
    t.cep.emitir('keydown', { key: 'Enter', preventDefault: () => { evitado++; } });
    t.cep.emitir('keydown', { key: '5', preventDefault: () => { evitado++; } });
    expect(evitado).toBe(1);
  });
});

// ── As duas telas ────────────────────────────────────────────────────────────

describe('o CEP no cadastro', () => {
  const pagina = readFileSync('src/pages/cadastrar.astro', 'utf8');
  const formulario = pagina.slice(pagina.indexOf('<form id="form">'), pagina.indexOf('</form>'));
  const script = pagina.slice(pagina.indexOf('<script>'));

  it('vem antes da rua, com o teclado de números e o preenchimento de CEP do navegador', () => {
    const entrada = /<input id="cep"[^>]*\/>/.exec(formulario)?.[0] ?? '';
    for (const atributo of ['inputmode="numeric"', 'autocomplete="postal-code"', 'maxlength="9"']) {
      expect(entrada, atributo).toContain(atributo);
    }
    expect(entrada).not.toContain('required');
    expect(formulario.indexOf('<input id="cep"')).toBeGreaterThan(-1);
    expect(formulario.indexOf('<input id="cep"')).toBeLessThan(formulario.indexOf('<input id="endereco"'));
    expect(formulario).toMatch(/<label for="cep">CEP<\/label>/);
    expect(formulario).toMatch(/<p id="cep-aviso"[^>]*aria-live="polite"/);
  });

  it('o CEP não vai no envio — só ajuda a preencher', () => {
    const envio = script.slice(script.indexOf("form.addEventListener('submit'"));
    // Controle: o envio monta o corpo campo a campo — é isso que deixa o CEP de fora.
    expect(envio).toMatch(/endereco: \$\('endereco'\)\.value\.trim\(\), cidade: \$\('cidade'\)\.value\.trim\(\)/);
    expect(envio).not.toMatch(/cep/i);
    expect(envio).not.toMatch(/new FormData/);
  });

  it('a tela liga a busca ao CEP, à rua, à cidade e ao estado', () => {
    expect(script).toMatch(/import \{ ligarBuscaDoCep \} from '\.\.\/lib\/cep\.js';/);
    expect(script).toMatch(/ligarBuscaDoCep\(\{\s*cep: \$<HTMLInputElement>\('cep'\), aviso: \$<HTMLElement>\('cep-aviso'\), rua: \$<HTMLInputElement>\('endereco'\),/);
    expect(script).toMatch(/\$\('cidade'\)\.value = cidade;/);
    expect(script).toMatch(/estado\.value = uf;/);
  });
});

describe('o CEP em Configurações', () => {
  const pagina = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');
  const secao = readFileSync('src/components/admin/SecaoDeCampos.astro', 'utf8');

  it('o bloco Endereço começa pelo CEP, logo antes da rua', () => {
    expect(pagina).toMatch(/\{ id: 'cep', label: 'CEP', tipo: 'cep',[^\n]*\},\n\s*\{ id: 'addressStreet',/);
  });

  it('o campo do CEP não tem data-campo: não vai no Salvar, não conta como mudança e não entra no rascunho', () => {
    const ramo = secao.slice(secao.indexOf("campo.tipo === 'cep' ?"), secao.indexOf(": campo.tipo === 'textarea'"));
    expect(ramo).toContain('autocomplete="postal-code"');
    expect(ramo).toContain('inputmode="numeric"');
    expect(ramo).toMatch(/<p id=\{`\$\{campo\.id\}-aviso`\}[^>]*aria-live="polite"/);
    expect(ramo).not.toContain('data-campo');
    // Controle: os outros três ramos têm — e é por `data-campo` que o Salvar, o "não salvo" e o rascunho leem.
    expect(secao.match(/data-campo=\{campo\.id\}/g)).toHaveLength(3);
    expect(pagina).toMatch(/document\.querySelectorAll\('\[data-campo\]'\)\.forEach\(\(el\) => \{\n\s*const chave = el\.dataset\.campo;/);
  });

  it('a busca preenche a rua e a cidade no formato Cidade/UF, e avisa a tela', () => {
    expect(pagina).toMatch(/import \{ ligarBuscaDoCep \} from '\.\.\/\.\.\/lib\/cep\.js';/);
    expect(pagina).toMatch(/const \[ruaDoSite, cidadeDoSite\] = camposDoMapa;/);
    expect(pagina).toMatch(/const camposDoMapa = \['addressStreet', 'addressCity', 'mapsEmbedQuery'\]/);
    expect(pagina).toMatch(/cidadeDoSite\.value = `\$\{cidade\}\/\$\{uf\}`;\n\s*cidadeDoSite\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\);/);
  });
});

describe('a CSP que um dia vier', () => {
  it('se limitar o connect-src, aceita os dois serviços — senão a busca falha sempre', () => {
    const arquivos = ['src/**/*.ts', 'src/**/*.astro', 'src/**/*.mjs', 'astro.config.*'].flatMap((p) => globSync(p));
    const comConnect = arquivos.filter((a) => readFileSync(a, 'utf8').includes('connect-src'));
    // Controle: a lib fala do `connect-src` e chama os dois — a guarda não está olhando para o vazio.
    expect(comConnect.map((a) => a.replace(/\\/g, '/'))).toContain('src/lib/cep.ts');
    expect([VIACEP, BRASILAPI]).toEqual(['https://viacep.com.br/ws/', 'https://brasilapi.com.br/api/cep/v2/']);
    for (const a of comConnect) {
      const texto = readFileSync(a, 'utf8');
      expect(texto, a).toContain('viacep.com.br');
      expect(texto, a).toContain('brasilapi.com.br');
    }
  });
});
