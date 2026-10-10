// Requisição que muda dado só passa vinda do próprio endereço
// (`PENDENCIAS-ABERTAS.md` §2.30).
//
// ── O DEFEITO QUE ISTO IMPEDE DE VOLTAR ──────────────────────────────────────
//
// A sessão do painel é `SameSite=Lax`, e o `checkOrigin` do Astro está desligado.
// Para o navegador, `painel.fadeline.com.br` e `qualquer.fadeline.com.br` são o
// mesmo site — e os sites das barbearias são esses subdomínios. Em 09/10/2026, com
// o dono de uma barbearia logado no painel, um `fetch` simples rodando no site de
// OUTRA barbearia cancelou um agendamento dele. Bastava um XSS em qualquer site de
// barbearia, e o do `/agendar` executou num navegador (§2.24).
//
// A regra mora em `lib/origem.ts`, testada aqui como função; o middleware não
// carrega no vitest (`astro:middleware` é módulo do Astro), então o lugar dela lá
// é conferido no fonte. A prova de ponta a ponta — o mesmo ataque, agora recusado,
// e o uso normal do painel e do site passando — foi feita contra o build.
//
// Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motivoDaRecusa, respostaDaRecusa } from '../src/lib/origem';

const PAINEL = 'painel.fadeline.com.br';

function pedido(metodo: string, cabecalhos: Record<string, string>, host = PAINEL): Request {
  return new Request(`http://${host}/api/admin/appointments/7/cancel`, {
    method: metodo,
    headers: { host, ...cabecalhos },
  });
}

describe('o que passa', () => {
  it('leitura passa de qualquer lugar — GET, HEAD e OPTIONS não mudam nada', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(motivoDaRecusa(pedido(m, { origin: 'https://outra.fadeline.com.br' })), m).toBeNull();
    }
  });

  it('o painel chamando o próprio painel', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: `https://${PAINEL}`, 'sec-fetch-site': 'same-origin' }))).toBeNull();
  });

  it('o esquema e a porta não contam — atrás do proxy é https lá fora e http aqui dentro', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: `https://${PAINEL}` }, `${PAINEL}:3000`))).toBeNull();
    expect(motivoDaRecusa(pedido('POST', { origin: 'http://painel.localhost:4321' }, 'painel.localhost:4321'))).toBeNull();
  });

  it('maiúscula e ponto final no endereço não contam', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'https://Painel.Fadeline.com.br' }, `${PAINEL}.`))).toBeNull();
  });

  it('o site da barbearia chamando a própria API — e no domínio próprio dela', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'https://cortes-do-ze.fadeline.com.br' }, 'cortes-do-ze.fadeline.com.br'))).toBeNull();
    expect(motivoDaRecusa(pedido('POST', { origin: 'https://www.cortesdoze.com.br' }, 'www.cortesdoze.com.br'))).toBeNull();
  });

  it('sem Origin, com Sec-Fetch-Site do próprio endereço, ou do que a pessoa fez direto', () => {
    expect(motivoDaRecusa(pedido('POST', { 'sec-fetch-site': 'same-origin' }))).toBeNull();
    expect(motivoDaRecusa(pedido('POST', { 'sec-fetch-site': 'none' }))).toBeNull();
  });

  it('sem nenhum dos dois não é navegador — o daemon dos avisos, o curl — e passa', () => {
    expect(motivoDaRecusa(new Request('http://127.0.0.1:4321/api/tarefas/avisos', {
      method: 'POST', headers: { host: '127.0.0.1:4321', authorization: 'Bearer x' },
    }))).toBeNull();
  });

  it('IPv6 entre colchetes', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'http://[::1]:4321' }, '[::1]:4321'))).toBeNull();
  });
});

describe('o que não passa', () => {
  it('o site de OUTRA barbearia — o ataque reproduzido', () => {
    const motivo = motivoDaRecusa(pedido('POST', { origin: 'https://vinho.fadeline.com.br', 'sec-fetch-site': 'same-site' }));
    expect(motivo).toMatch(/vinho\.fadeline\.com\.br/);
  });

  it('o domínio de cima — o site de vendas — também é outro endereço', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'https://fadeline.com.br' }))).not.toBeNull();
  });

  it('um site de fora', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'https://atacante.example' }))).not.toBeNull();
  });

  it('todo método que muda dado', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(motivoDaRecusa(pedido(m, { origin: 'https://vinho.fadeline.com.br' })), m).not.toBeNull();
    }
  });

  it('Origin: null — iframe isolado, página data: — não é endereço nenhum', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: 'null' }))).toMatch(/opaca/);
  });

  it('Origin que não é endereço', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: '::lixo::' }))).not.toBeNull();
  });

  it('sem Origin, Sec-Fetch-Site de outro site ou de outro subdomínio', () => {
    expect(motivoDaRecusa(pedido('POST', { 'sec-fetch-site': 'same-site' }))).not.toBeNull();
    expect(motivoDaRecusa(pedido('POST', { 'sec-fetch-site': 'cross-site' }))).not.toBeNull();
  });

  it('o mesmo nome no começo não engana: painel.fadeline.com.br.atacante.example', () => {
    expect(motivoDaRecusa(pedido('POST', { origin: `https://${PAINEL}.atacante.example` }))).not.toBeNull();
  });
});

describe('a resposta da recusa', () => {
  it('403 em JSON para a API, sem dizer o motivo', async () => {
    const r = respostaDaRecusa('/api/admin/appointments/7/cancel');
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect((await r.json()).error).toMatch(/não veio deste endereço/);
  });

  it('403 em texto para o resto', async () => {
    const r = respostaDaRecusa('/admin/configuracoes');
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toMatch(/text\/plain/);
  });
});

describe('o middleware confere antes de tudo', () => {
  const fonte = readFileSync('src/middleware.ts', 'utf8');
  const corpo = fonte.slice(fonte.indexOf('export const onRequest'));
  const posicao = (trecho: string) => corpo.indexOf(trecho);

  it('a conferência existe e devolve a recusa', () => {
    expect(corpo).toMatch(/const recusa = motivoDaRecusa\(contexto\.request\);/);
    expect(corpo).toMatch(/if \(recusa\) \{[\s\S]{0,200}?return respostaDaRecusa\(caminho\);/);
  });

  it('vem antes do desvio das tarefas e antes de decidir a barbearia', () => {
    // Depois de qualquer um dos dois, uma rota escaparia sem ninguém notar.
    expect(posicao('motivoDaRecusa(')).toBeGreaterThan(-1);
    expect(posicao('motivoDaRecusa(')).toBeLessThan(posicao("caminho.startsWith('/api/tarefas/')"));
    expect(posicao('motivoDaRecusa(')).toBeLessThan(posicao('tenantDaRequisicao('));
    expect(posicao('motivoDaRecusa(')).toBeLessThan(posicao('return next()'));
  });
});
