// Quanto vale um atendimento — a linha da agenda do dia, o "Valor" do detalhe, a ficha do
// cliente — e a receita, que é a soma deles (`src/lib/valorDoAtendimento.ts`,
// `src/lib/receita.ts`).
//
// POR QUE ESTE TESTE EXISTE
//
// Em 15/10/2026, testando o painel, o dono concluiu um corte de R$ 50 e lançou mais R$ 30
// na comanda. A linha continuou "R$ 50"; a receita do dia, no topo, já somava os 30. E o
// "Receita prevista" do Início não somava extra nenhum, nem venda avulsa: R$ 100 no dia em
// que a agenda dizia R$ 130 (`docs/PENDENCIAS-ABERTAS.md` §2.43). Na área do cliente, a
// visita aparecia pelo preço do serviço, e a página do agendamento chamava a barba lançada
// na comanda de coisa "para retirar na barbearia".
//
// A regra e as telas não precisam de banco; a receita do Início, a comanda fechada de
// verdade, a ficha e a área do cliente, sim.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import {
  contaNaReceita, itensContam, receitaDe, somaDosItens, totalParaOCliente, valorDoAtendimento, type ParaOValor,
} from '../src/lib/valorDoAtendimento.js';
import { aparenciaDaSituacao, BORDAS_DA_SITUACAO, linhaApagada } from '../src/lib/situacaoNaAgenda.js';
import type { Tenant } from '../src/lib/tenant.js';
import type { VisitaDoHistorico, FichaDoCliente } from '../src/lib/agendaDoDia.js';

process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const at = (status: string, priceCents: number, itemsCents = 0): ParaOValor => ({ status, priceCents, itemsCents });

describe('a regra', () => {
  it('o concluído vale o serviço e os itens da comanda: o corte de R$ 50 com mais R$ 30 vale R$ 80', () => {
    expect(valorDoAtendimento(at('completed', 5000, 3000))).toBe(8000);
    expect(valorDoAtendimento(at('completed', 5000))).toBe(5000);
  });

  it('o confirmado vale o serviço: o produto do combo, que nasce no agendamento, espera a conclusão', () => {
    expect(valorDoAtendimento(at('confirmed', 5000, 3000))).toBe(5000);
    expect(itensContam('confirmed')).toBe(false);
  });

  it('cancelado e não compareceu: a linha mostra o preço do serviço, e a receita não os conta', () => {
    for (const situacao of ['cancelled', 'no_show']) {
      expect(valorDoAtendimento(at(situacao, 4000, 1000)), situacao).toBe(4000);
      expect(contaNaReceita(situacao), situacao).toBe(false);
    }
    expect(contaNaReceita('confirmed')).toBe(true);
    expect(contaNaReceita('completed')).toBe(true);
  });

  it('o dia de 15/10/2026: 50 + 30 concluído e 50 confirmado dão R$ 130, em dois agendamentos', () => {
    expect(receitaDe([at('completed', 5000, 3000), at('confirmed', 5000)], 0)).toEqual({ centavos: 13000, considerados: 2 });
  });

  it('a venda avulsa entra na receita, e não no contador de agendamentos', () => {
    expect(receitaDe([at('confirmed', 5000), at('cancelled', 5000), at('no_show', 5000)], 2500))
      .toEqual({ centavos: 7500, considerados: 1 });
    expect(receitaDe([], 2500)).toEqual({ centavos: 2500, considerados: 0 });
  });

  it('quinhentos dias sorteados: a receita é sempre a soma das linhas que contam, mais a venda avulsa', () => {
    let semente = 15102026;
    const sorteio = (n: number) => { semente = (semente * 1103515245 + 12345) % 2 ** 31; return semente % n; };
    const SITUACOES = ['confirmed', 'completed', 'cancelled', 'no_show'];
    for (let k = 0; k < 500; k++) {
      const dia = Array.from({ length: sorteio(12) }, () =>
        at(SITUACOES[sorteio(4)], 1000 * (1 + sorteio(9)), sorteio(3) === 0 ? 500 * (1 + sorteio(6)) : 0));
      const avulsa = sorteio(2) === 0 ? 100 * sorteio(50) : 0;
      const queContam = dia.filter((a) => contaNaReceita(a.status));
      expect(receitaDe(dia, avulsa), JSON.stringify({ dia, avulsa })).toEqual({
        centavos: queContam.reduce((soma, a) => soma + valorDoAtendimento(a), 0) + avulsa,
        considerados: queContam.length,
      });
    }
  });

  it('a soma dos itens', () => {
    expect(somaDosItens([])).toBe(0);
    expect(somaDosItens([{ priceCents: 3000 }, { priceCents: 1990 }])).toBe(4990);
  });
});

describe('as telas fazem a conta pela regra', () => {
  const pagina = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');
  const servidor = pagina.slice(0, pagina.indexOf('\n---', 4));
  const script = pagina.slice(pagina.lastIndexOf('<script>'));
  const trecho = (de: string, ate: string) => {
    const i = script.indexOf(de);
    const j = script.indexOf(ate, i + 1);
    expect(i, de).toBeGreaterThan(-1);
    expect(j, ate).toBeGreaterThan(i);
    return script.slice(i, j);
  };
  const lista = readFileSync('src/components/admin/AgendaLista.astro', 'utf8');
  const inicio = readFileSync('src/pages/admin/index.astro', 'utf8');
  const historico = readFileSync('src/pages/api/admin/appointments/[id]/history.ts', 'utf8');

  it('a linha da agenda mostra o valor do atendimento, e não o preço do serviço', () => {
    expect(lista).toMatch(/<p data-list-valor [^>]*>\{a\.valor\}<\/p>/);
    expect(lista).not.toMatch(/\{a\.price\}/);
    expect(servidor).toMatch(/valor:\s*reais\(valorDoAtendimento\(paraOValor\(a\)\)\)/);
  });

  it('a receita do dia é a mesma conta no servidor e no navegador — e nenhuma à mão sobrou', () => {
    expect(servidor).toMatch(/receitaDe\(apptRows\.map\(paraOValor\), salesCents\)/);
    expect(trecho('function recalculateRevenue', 'function '))
      .toMatch(/receitaDe\(clientData\.appts, clientData\.salesCents \|\| 0\)/);
    expect(pagina).not.toMatch(/status === 'confirmed' \|\| \w+\.status === 'completed'/);
  });

  it('fechada a comanda, a linha muda na hora: os extras entram nos itens, e o valor é reescrito', () => {
    const fechar = trecho("getElementById('cm-confirm')?.addEventListener", 'Venda de produto avulsa');
    expect(fechar).toMatch(/appt\.items = \[\.\.\.appt\.items, \.\.\.comandaExtras\.map/);
    expect(fechar).toMatch(/appt\.itemsCents = somaDosItens\(appt\.items\)/);
    expect(fechar.indexOf('appt.items =')).toBeLessThan(fechar.indexOf("updateApptCardStatus(id, 'completed')"));
    const atualizar = trecho('function updateApptCardStatus', 'function recalculateRevenue');
    expect(atualizar).toMatch(/querySelector\('\[data-list-valor\]'\)/);
    expect(atualizar).toMatch(/textContent = reais\(valorDoAtendimento\(appt\)\)/);
  });

  it('o total da comanda conta o que o agendamento já trouxe — o produto do combo', () => {
    const comanda = trecho('function renderComanda', 'async function openComanda');
    expect(comanda).toMatch(/const jaNoAgendamento = appt \? appt\.items : \[\]/);
    expect(comanda).toMatch(/const total = mainCents \+ somaDosItens\(jaNoAgendamento\) \+ somaDosItens\(comandaExtras\)/);
    // Os nomes vêm do catálogo que a barbearia escreve: nada de innerHTML com eles.
    expect(comanda).not.toMatch(/innerHTML/);
    expect(pagina).toMatch(/<div id="cm-itens"><\/div>/);
  });

  it('o detalhe mostra o valor, e o que ele soma', () => {
    const detalhe = trecho('function openDetailModal', 'function closeDetail');
    expect(detalhe).toMatch(/const valor = reais\(valorDoAtendimento\(appt\)\)/);
    expect(detalhe).toMatch(/itensContam\(appt\.status\) \? appt\.items : \[\]/);
    expect(detalhe).toMatch(/dmPrice\.textContent\s*=\s*valor;/);
  });

  it('a ficha do cliente: cada visita pelo valor dela', () => {
    expect(historico).toMatch(/itemsCents:\s*num\(r\.itens_cents\)/);
    expect(script).toMatch(/const price = reais\(valorDoAtendimento\(h\)\)/);
  });

  it('o Início faz a conta da agenda, e não um SUM do preço do serviço', () => {
    expect(inicio).toMatch(/receitaDoPeriodo\(tenant\.id, startIso, endIso, barberFilter\)/);
    expect(inicio).not.toMatch(/SUM\(\s*price_cents\s*\)/i);
  });

  it('controle: as regras pegam o que a agenda e o Início faziam até 15/10/2026', () => {
    expect("<p class:list={['text-sm']}>{a.price}</p>").toMatch(/\{a\.price\}/);
    expect('SELECT COALESCE(SUM(price_cents),0) AS s FROM appointments').toMatch(/SUM\(\s*price_cents\s*\)/i);
    expect(".filter(a => a.status === 'confirmed' || a.status === 'completed')")
      .toMatch(/status === 'confirmed' \|\| \w+\.status === 'completed'/);
    expect("row.innerHTML = `<span class=\"text-slate-700\">${ex.name}</span>`").toMatch(/innerHTML/);
  });
});

describe('o que o cliente vê: o total — o serviço e todos os itens', () => {
  const area = readFileSync('src/pages/cliente/index.astro', 'utf8');
  const agendamento = readFileSync('src/pages/a/[token].astro', 'utf8');

  it('o combo ainda não concluído: o cliente vê o produto que vai pagar, e a receita espera', () => {
    const combo = at('confirmed', 5000, 3000);
    expect(totalParaOCliente(combo)).toBe(8000);
    expect(valorDoAtendimento(combo)).toBe(5000);
  });

  it('a visita concluída: o mesmo número para o cliente e para a receita', () => {
    for (const visita of [at('completed', 5000, 3000), at('completed', 5000)]) {
      expect(totalParaOCliente(visita)).toBe(valorDoAtendimento(visita));
    }
  });

  it('a área do cliente e a página do agendamento fazem a conta pela regra', () => {
    expect(area).toMatch(/agendamentosDoCliente\(tenant\.id, session\.phone, session\.birthdate\)/);
    expect(area).toMatch(/priceLabel:\s*reais\(totalParaOCliente\(\{ priceCents: r\.price_cents, itemsCents: r\.itens_cents \}\)\)/);
    expect(area).not.toMatch(/reais\(r\.price_cents\)/);
    expect(agendamento).toMatch(/const totalCents = totalParaOCliente\(\{ priceCents: appt\.priceCents, itemsCents: somaDosItens\(items\) \}\)/);
  });

  it('"para retirar na barbearia" só no agendamento ainda não concluído — uma barba não se retira', () => {
    expect(agendamento).toMatch(/const tituloDosItens = appt\.status === 'confirmed' \? 'Para retirar na barbearia' : 'Além do serviço'/);
    expect(agendamento).toMatch(/>\{tituloDosItens\}<\/p>/);
    expect(agendamento).not.toMatch(/>\s*Para retirar na barbearia\s*</);
  });
});

describe('a linha que muda na hora é a da página recarregada (`src/lib/situacaoNaAgenda.ts`)', () => {
  const SITUACOES = ['confirmed', 'completed', 'cancelled', 'no_show'];
  const pagina = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');
  const script = pagina.slice(pagina.lastIndexOf('<script>'));
  const lista = readFileSync('src/components/admin/AgendaLista.astro', 'utf8');

  it('cada situação com a sua borda, rótulo e cor — e "Atrasado" só para o confirmado', () => {
    expect(aparenciaDaSituacao('completed')).toEqual({ borda: 'border-l-teal-light', rotulo: '✓ Concluído', classe: 'text-teal/80' });
    expect(aparenciaDaSituacao('confirmed', true).rotulo).toBe('Atrasado');
    expect(aparenciaDaSituacao('completed', true)).toEqual(aparenciaDaSituacao('completed'));
    expect(SITUACOES.filter(linhaApagada)).toEqual(['completed', 'cancelled', 'no_show']);
  });

  it('o navegador conhece toda borda que a regra dá — senão a antiga ficaria junto da nova', () => {
    for (const s of SITUACOES) {
      for (const atrasado of [false, true]) {
        expect(BORDAS_DA_SITUACAO, `${s}${atrasado ? ', atrasado' : ''}`).toContain(aparenciaDaSituacao(s, atrasado).borda);
      }
    }
  });

  it('a lista e o script usam a mesma regra; nenhum dos dois tem a sua cópia', () => {
    expect(lista).toMatch(/const st = aparenciaDaSituacao\(a\.status, a\.isLate\)/);
    expect(lista).toMatch(/const muted = linhaApagada\(a\.status\)/);
    const atualizar = script.slice(script.indexOf('function updateApptCardStatus'), script.indexOf('function recalculateRevenue'));
    expect(atualizar).toMatch(/const st = aparenciaDaSituacao\(newStatus\)/);
    expect(atualizar).toMatch(/row\.classList\.remove\(\.\.\.BORDAS_DA_SITUACAO\);\s*row\.classList\.add\(st\.borda\)/);
    for (const parte of ['data-list-hora', 'data-list-nome', 'data-list-valor', 'data-list-status']) {
      expect(lista, parte).toContain(`<p ${parte} `);
      expect(atualizar, parte).toContain(`[${parte}]`);
    }
    for (const rotulo of ['✓ Concluído', '✕ Cancelado', '✗ No-show']) {
      expect(lista + atualizar, rotulo).not.toContain(rotulo);
    }
  });
});

describe.skipIf(!TEM_BANCO)('no banco: a receita do Início, a comanda fechada e a ficha do cliente', () => {
  let sql: ReturnType<typeof postgres>;
  let dbmod: typeof import('../src/db/index.js');
  let receitaDoPeriodo: typeof import('../src/lib/receita.js')['receitaDoPeriodo'];
  let agendamentosDoCliente: typeof import('../src/lib/agendamentosDoCliente.js')['agendamentosDoCliente'];
  let concluir: typeof import('../src/pages/api/admin/appointments/[id]/complete.ts')['POST'];
  let ficha: typeof import('../src/pages/api/admin/appointments/[id]/history.ts')['GET'];
  let A: Tenant;
  let cookieDoDono = '';

  const FUSO = 'America/Fortaleza';
  // Um dia que já passou: concluir só vale a partir de uma hora antes do horário
  // (`lib/fecharAtendimento.ts`, 26/10/2026) — num dia de 2030 a comanda seria recusada.
  const DIA = '2025-03-20';
  const VESPERA = '2025-03-19';
  const DIA_SEGUINTE = '2025-03-21';
  const hora = (dia: string, hhmm: string) => fromZonedTime(`${dia}T${hhmm}:00`, FUSO).toISOString();
  // A janela da agenda do dia e do "hoje" do Início.
  const INICIO = hora(DIA, '00:00');
  const FIM = fromZonedTime(`${DIA}T23:59:59`, FUSO).toISOString();

  const doPainel = async (
    rota: (contexto: never) => Promise<Response>, metodo: string, caminho: string,
    params: Record<string, string>, corpo?: unknown,
  ) => {
    const url = `http://painel.test${caminho}`;
    const request = new Request(url, {
      method: metodo,
      headers: { host: 'painel.test', cookie: cookieDoDono, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return dbmod.comTenant(A, () => rota({ request, params, url: new URL(url) } as never));
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'barbearia-a', 'A', 'active'), (2, 'barbearia-b', 'B', 'active')`;
    await sql`SELECT setval('tenants_id_seq', 2)`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone) VALUES
      (1, 1, 'Dono de A', 'dono-a', 'admin', 'x', true, '84990000001'),
      (2, 1, 'Barbeiro de A', 'barbeiro-a', 'barber', 'x', true, '84990000002'),
      (3, 2, 'Dono de B', 'dono-b', 'admin', 'x', true, '84990000003')`;
    await sql`SELECT setval('barbers_id_seq', 3)`;
    await sql`INSERT INTO services (id, tenant_id, name, slug, price_cents, active) VALUES
      (1, 1, 'Corte', 'corte', 5000, true), (2, 1, 'Barba', 'barba', 3000, true), (3, 2, 'Corte de B', 'corte', 7000, true)`;
    await sql`SELECT setval('services_id_seq', 3)`;

    const agendar = (id: number, tenant: number, barbeiro: number, servico: number, dia: string, hhmm: string,
      preco: number, status: string, telefone: string) => sql`
      INSERT INTO appointments (id, tenant_id, barber_id, service_id, customer_name, customer_phone,
                                starts_at, ends_at, duration_minutes, price_cents, status, manage_token)
      VALUES (${id}, ${tenant}, ${barbeiro}, ${servico}, ${'Cliente ' + id}, ${telefone},
              ${hora(dia, hhmm)}, ${new Date(Date.parse(hora(dia, hhmm)) + 30 * 60_000).toISOString()},
              30, ${preco}, ${status}, ${'tk-valor-' + id})`;
    // Na barbearia A, no dia:
    await agendar(1, 1, 2, 1, DIA, '09:00', 5000, 'completed', '84988880001'); // + R$ 30 de barba na comanda → R$ 80
    await agendar(2, 1, 1, 1, DIA, '16:00', 5000, 'confirmed', '84988880002'); // combo: + R$ 30 de produto, que espera → R$ 50
    await agendar(3, 1, 2, 1, DIA, '10:00', 4000, 'cancelled', '84988880003'); // fora da receita
    await agendar(4, 1, 1, 1, DIA, '11:00', 4000, 'no_show', '84988880004');   // fora da receita
    // Na véspera — fora do período —, o mesmo cliente do 1, para a ficha:
    await agendar(5, 1, 2, 1, VESPERA, '09:00', 5000, 'completed', '84988880001'); // + R$ 20 → R$ 70
    // Na barbearia B, no mesmo dia e com o mesmo telefone:
    await agendar(6, 2, 3, 3, DIA, '09:00', 7000, 'completed', '84988880001');
    await sql`SELECT setval('appointments_id_seq', 6)`;
    await sql`INSERT INTO appointment_items (tenant_id, appointment_id, service_id, name, price_cents) VALUES
      (1, 1, 2, 'Barba', 3000), (1, 2, NULL, 'Óleo do combo', 3000), (1, 3, NULL, 'Pomada do combo', 1000),
      (1, 5, 2, 'Barba', 2000), (2, 6, 3, 'Corte de B', 3000)`;
    await sql`INSERT INTO product_sales (tenant_id, barber_id, name, quantity, price_cents, sold_at, created_by_id) VALUES
      (1, 1, 'Pomada', 1, 2500, ${hora(DIA, '12:00')}, 1),
      (1, 2, 'Óleo', 1, 1500, ${hora(DIA, '17:00')}, 2),
      (1, 1, 'Pomada', 1, 9900, ${hora(DIA_SEGUINTE, '10:00')}, 1),
      (2, 3, 'Pomada de B', 1, 4000, ${hora(DIA, '12:00')}, 3)`;

    dbmod = await import('../src/db/index.js');
    const tenant = await import('../src/lib/tenant.js');
    await tenant.carregarTenants(true);
    A = tenant.tenantPorIdMesmoForaDoAr(1)!;
    ({ receitaDoPeriodo } = await import('../src/lib/receita.js'));
    ({ agendamentosDoCliente } = await import('../src/lib/agendamentosDoCliente.js'));
    ({ POST: concluir } = await import('../src/pages/api/admin/appointments/[id]/complete.ts'));
    ({ GET: ficha } = await import('../src/pages/api/admin/appointments/[id]/history.ts'));
    const { makeSessionCookie } = await import('../src/lib/session.js');
    cookieDoDono = (await makeSessionCookie({ barberId: 1, role: 'admin', tenantId: 1 })).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
    await dbmod?.sqlConn.end({ timeout: 5 });
  });

  it('o dia inteiro: R$ 80 + R$ 50 dos atendimentos e R$ 40 de venda avulsa — R$ 170, em dois agendamentos', async () => {
    const esperado = { centavos: 8000 + 5000 + 2500 + 1500, considerados: 2 };
    // Como na requisição, com o RLS ligado...
    expect(await dbmod.comTenant(A, () => receitaDoPeriodo(A.id, INICIO, FIM, null))).toEqual(esperado);
    // ...e sem ele, como dono: o filtro da consulta, sozinho, deixa a barbearia B de fora.
    expect(await receitaDoPeriodo(A.id, INICIO, FIM, null)).toEqual(esperado);
  });

  it('o barbeiro que não é dono: só os atendimentos e as vendas dele', async () => {
    expect(await receitaDoPeriodo(A.id, INICIO, FIM, 2)).toEqual({ centavos: 8000 + 1500, considerados: 1 });
    expect(await receitaDoPeriodo(A.id, INICIO, FIM, 1)).toEqual({ centavos: 5000 + 2500, considerados: 1 });
  });

  it('a outra barbearia, no mesmo dia, tem a conta dela', async () => {
    expect(await receitaDoPeriodo(2, INICIO, FIM, null)).toEqual({ centavos: 7000 + 3000 + 4000, considerados: 1 });
  });

  it('a semana: a véspera e o dia seguinte entram, cada um com o seu', async () => {
    const semana = await receitaDoPeriodo(A.id, hora(VESPERA, '00:00'), hora('2025-03-22', '00:00'), null);
    expect(semana).toEqual({ centavos: 17000 + 7000 + 9900, considerados: 3 });
  });

  it('a ficha do cliente: a visita concluída vem com os itens, e o gasto bate com as visitas', async () => {
    const r = await doPainel(ficha as never, 'GET', '/api/admin/appointments/1/history', { id: '1' });
    expect(r.status).toBe(200);
    const corpo = await r.json() as { history: VisitaDoHistorico[]; stats: FichaDoCliente };
    expect(corpo.history.map((h) => [h.id, h.priceCents, h.itemsCents])).toEqual([[5, 5000, 2000]]);
    expect(valorDoAtendimento(corpo.history[0])).toBe(7000);
    // O gasto da ficha é o do atendimento aberto (R$ 80) mais o das outras visitas (R$ 70).
    expect(corpo.stats.totalSpentCents).toBe(8000 + corpo.history.reduce((s, h) => s + valorDoAtendimento(h), 0));
  });

  it('a área do cliente: cada visita pelo total, e só as desta barbearia', async () => {
    await sql`UPDATE appointments SET customer_birthdate = '1990-05-20' WHERE customer_phone IN ('84988880001', '84988880002')`;
    const total = (v: { price_cents: number; itens_cents: number }) => totalParaOCliente({ priceCents: v.price_cents, itemsCents: v.itens_cents });
    // As duas visitas dele em A, da mais nova para a mais velha. A de B, com o mesmo telefone e
    // a mesma data de nascimento, não — nem como dono, sem o RLS: o filtro da consulta basta.
    const doCorte = await agendamentosDoCliente(A.id, '84988880001', '1990-05-20');
    expect(doCorte.map((v) => [v.id, v.itens_cents, total(v)])).toEqual([[1, 3000, 8000], [5, 2000, 7000]]);
    // O combo ainda não concluído, com o RLS ligado: o cliente vê os R$ 80 que vai pagar.
    const doCombo = await dbmod.comTenant(A, () => agendamentosDoCliente(A.id, '84988880002', '1990-05-20'));
    expect(doCombo.map((v) => [v.id, v.status, total(v)])).toEqual([[2, 'confirmed', 8000]]);
    // Outra data de nascimento: nenhuma.
    expect(await agendamentosDoCliente(A.id, '84988880001', '1991-01-01')).toEqual([]);
  });

  it('fechando a comanda do combo com mais R$ 30: o atendimento passa a valer R$ 110, e a receita sobe R$ 60', async () => {
    const r = await doPainel(concluir as never, 'POST', '/api/admin/appointments/2/complete', { id: '2' },
      { extras: [{ serviceId: 2, priceCents: 3000 }] });
    expect(r.status).toBe(200);
    // O serviço (R$ 50), o produto do combo (R$ 30), que agora conta, e o extra (R$ 30).
    expect(await receitaDoPeriodo(A.id, INICIO, FIM, 1)).toEqual({ centavos: 11000 + 2500, considerados: 1 });
    expect(await receitaDoPeriodo(A.id, INICIO, FIM, null)).toEqual({ centavos: 17000 + 6000, considerados: 2 });
  });
});
