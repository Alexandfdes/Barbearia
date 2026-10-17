// A fila do webhook da Asaas, vista do painel do operador (17/10/2026).
//
// Com 15 falhas de entrega seguidas, a Asaas interrompe a fila do webhook: os avisos de
// pagamento param até alguém reativá-la, e os parados há mais de 14 dias são apagados
// (documentação da Asaas, conferida em 17/10/2026). Quem pagou continua com o prazo
// correndo e sai do ar. O Início e o Sistema do operador passam a perguntar à Asaas
// como está a fila (`filaDoWebhook`, em `src/lib/operadorSistema.ts`).
//
// Sem rede: a Asaas aqui é de mentira — a `fetch` trocada, como em `tests/cobranca.test.ts`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { filaDoWebhook, alertasDaFila, comAFila, type FilaDoWebhook } from '../src/lib/operadorSistema';
import { configDaAsaas, webhooksDaConta, ErroDaAsaas, type WebhookAsaas } from '../src/lib/asaas';

const CHAVE = '$aact_SEGREDO-chave-que-nunca-aparece';
const ENV = {
  ASAAS_API_KEY: CHAVE,
  ASAAS_URL: 'http://asaas.de.mentira/v3',
  PAINEL_URL: 'https://painel.exemplo.test',
  NODE_ENV: 'production',
};
const NOSSO = 'https://painel.exemplo.test/api/asaas/webhook';

const webhook = (o: Partial<WebhookAsaas> = {}): WebhookAsaas => ({
  id: 'wh_1', name: 'Fadeline', url: NOSSO, enabled: true, interrupted: false,
  hasAuthToken: true, sendType: 'SEQUENTIALLY', penalizedRequestsCount: 0, events: ['PAYMENT_CONFIRMED'], ...o,
});
const com = (...lista: WebhookAsaas[]) => async () => lista;

afterEach(() => { vi.unstubAllGlobals(); });

describe('como a fila está', () => {
  it('sem a chave da Asaas, nem pergunta', async () => {
    const consultar = vi.fn(com(webhook()));
    const f = await filaDoWebhook({ PAINEL_URL: ENV.PAINEL_URL }, consultar);
    expect(f.estado).toBe('nao-consultada');
    expect(consultar).not.toHaveBeenCalled();
    expect(alertasDaFila(f)).toEqual([]);
  });

  it('ativa, sequencial, com token e sem falha: nada a dizer', async () => {
    const f = await filaDoWebhook(ENV, com(webhook()));
    expect(f).toEqual({ estado: 'ativa', endereco: NOSSO, penalizados: 0, sequencial: true, comToken: true });
    expect(alertasDaFila(f)).toEqual([]);
  });

  it('interrompida: é problema, e diz o que fazer — consertar, reativar, e o prazo de 14 dias', async () => {
    const f = await filaDoWebhook(ENV, com(webhook({ interrupted: true, penalizedRequestsCount: 15 })));
    expect(f.estado).toBe('interrompida');
    const a = alertasDaFila(f);
    expect(a[0]).toEqual({
      estado: 'problema',
      texto: 'A fila do webhook está interrompida na Asaas: os avisos de pagamento estão parados. Conserte o motivo e reative em Integrações → Webhooks — a Asaas guarda os avisos por 14 dias.',
    });
    expect(a.map((x) => x.texto).join(' ')).toMatch(/15 envios do webhook como falha/);
  });

  it('desligado na Asaas: problema', async () => {
    const f = await filaDoWebhook(ENV, com(webhook({ enabled: false })));
    expect(f.estado).toBe('desligada');
    expect(alertasDaFila(f)[0].estado).toBe('problema');
  });

  it('nenhum webhook aponta para este app — só para outro endereço: problema, com o endereço que falta', async () => {
    const f = await filaDoWebhook(ENV, com(webhook({ url: 'https://outro.exemplo.test/api/asaas/webhook' })));
    expect(f.estado).toBe('sem-webhook');
    expect(alertasDaFila(f)[0].texto).toContain(NOSSO);
  });

  it('o mesmo endereço escrito de outro jeito é o mesmo webhook — maiúsculas no nome, barra no fim', async () => {
    const f = await filaDoWebhook(ENV, com(webhook({ url: 'https://PAINEL.exemplo.test/api/asaas/webhook/' })));
    expect(f.estado).toBe('ativa');
    // Mas outro caminho, não.
    const g = await filaDoWebhook(ENV, com(webhook({ url: 'https://painel.exemplo.test/api/asaas/outro' })));
    expect(g.estado).toBe('sem-webhook');
  });

  it('sem token na Asaas, fora de ordem e com falhas: cada um vira um aviso', async () => {
    const f = await filaDoWebhook(ENV, com(webhook({ hasAuthToken: false, sendType: 'NON_SEQUENTIALLY', penalizedRequestsCount: 1 })));
    expect(f.estado).toBe('ativa');
    expect(alertasDaFila(f).map((x) => `${x.estado}: ${x.texto}`)).toEqual([
      'problema: O webhook na Asaas está sem o token: o app recusa todo aviso de pagamento.',
      'atencao: O webhook na Asaas não está em envio sequencial: os avisos podem chegar fora de ordem.',
      'atencao: A Asaas marcou 1 envio do webhook como falha: com 15 seguidas, a fila para.',
    ]);
  });

  it('a Asaas não responde: atenção — e o motivo não leva a chave', async () => {
    const f = await filaDoWebhook(ENV, async () => { throw new ErroDaAsaas('A Asaas respondeu 401 a GET /webhooks?limit=100: chave inválida', 401); });
    expect(f.estado).toBe('sem-resposta');
    expect(f.motivo).toMatch(/401/);
    expect(JSON.stringify(f)).not.toContain('SEGREDO');
    expect(alertasDaFila(f)).toEqual([{ estado: 'atencao', texto: 'A Asaas não respondeu quando a tela perguntou pela fila do webhook.' }]);
  });

  it('os da fila entram com os outros, do mais grave para o menos', () => {
    const f: FilaDoWebhook = { estado: 'interrompida', endereco: NOSSO, penalizados: 0, sequencial: true, comToken: true };
    const juntos = comAFila([{ estado: 'atencao', texto: 'O backup não sai deste servidor: perdido o disco, vai tudo.' }], f);
    expect(juntos.map((a) => a.estado)).toEqual(['problema', 'atencao']);
  });
});

describe('a pergunta à Asaas', () => {
  it('GET /webhooks?limit=100, com a chave no cabeçalho — e devolve a lista', async () => {
    const chamadas: { url: string; metodo: string; chave: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      chamadas.push({ url: String(url), metodo: init?.method ?? 'GET', chave: new Headers(init?.headers).get('access_token') });
      return new Response(JSON.stringify({ object: 'list', hasMore: false, totalCount: 1, limit: 100, offset: 0, data: [webhook()] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }));
    const lista = await webhooksDaConta(configDaAsaas(ENV)!);
    expect(lista).toEqual([webhook()]);
    expect(chamadas).toEqual([{ url: 'http://asaas.de.mentira/v3/webhooks?limit=100', metodo: 'GET', chave: CHAVE }]);
    // E, pelo caminho inteiro, a fila sai ativa.
    expect((await filaDoWebhook(ENV)).estado).toBe('ativa');
  });

  it('a recusa da Asaas vira ErroDaAsaas, com o status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ description: 'Chave de API inválida' }] }), { status: 401 })));
    await expect(webhooksDaConta(configDaAsaas(ENV)!)).rejects.toMatchObject({ name: 'ErroDaAsaas', status: 401 });
  });
});

describe('as telas', () => {
  it('o Início e o Sistema do operador perguntam pela fila — depois da porta — e juntam os avisos', () => {
    const inicio = readFileSync('src/pages/operador/index.astro', 'utf8');
    expect(inicio).toMatch(/const alertasDoSistema = n \? comAFila\(n\.alertasDoSistema, await filaDoWebhook\(process\.env\)\) : \[\];/);
    expect(inicio.indexOf('await abrirPorta(')).toBeLessThan(inicio.indexOf('filaDoWebhook(process.env)'));
    const sistema = readFileSync('src/pages/operador/sistema.astro', 'utf8');
    expect(sistema).toMatch(/filaDoWebhook\(process\.env\)/);
    expect(sistema.indexOf('await exigirOperador(')).toBeLessThan(sistema.indexOf('filaDoWebhook(process.env)'));
    expect(sistema).toMatch(/rotulo: 'Fila do webhook na Asaas'/);
  });

  it('quem monta os números não sai da máquina: a fila fica fora de sistemaNoPainel', () => {
    const lib = readFileSync('src/lib/operadorSistema.ts', 'utf8');
    const corpo = lib.slice(lib.indexOf('export async function sistemaNoPainel'));
    expect(corpo.slice(0, corpo.indexOf('\n}\n'))).not.toMatch(/filaDoWebhook|webhooksDaConta/);
  });
});
