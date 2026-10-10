// O cadastro de barbearia pela web — e a porta que ele abre.
//
// Duas coisas são testadas aqui, e a segunda importa mais que a primeira:
//
// 1. A REGRA de criar barbearia, que virou função compartilhada em 14/09/2026.
//    O script de linha de comando e a rota web usam a MESMA. Se alguém
//    reescrever uma delas, estes casos seguram.
//
// 2. Que a rota NASCE FECHADA. Sem `CADASTRO_ABERTO=1` ela responde 404. Um
//    cadastro aberto cria tenant de verdade — ocupa endereço no domínio do
//    produto e publica um site sob o nosso nome — e não existe cobrança
//    (`PENDENCIAS-ABERTAS.md` §3.5) nem contrato (§1.2). O interruptor é o que
//    impede a porta de subir aberta por esquecimento.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { provisionarBarbearia, curtoPadrao, soDigitos } from '../src/lib/provisionarBarbearia.js';

// A rota abre a sessão do dono novo: sem segredo não há cookie para selar.
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

let conn: ReturnType<typeof postgres>;

const BASE = {
  slug: 'cortes-do-ze',
  nome: 'Barbearia Cortes do Zé',
  dono: 'José da Silva',
  telefone: '84 99999-0000',
  endereco: 'R. das Flores, 42',
  cidade: 'Mossoró/RN',
  senha: 'segredo123',
  email: 'ze@exemplo.com.br',
};

/**
 * Uma "conexão" que estoura se for usada: prova que a recusa aconteceu ANTES de
 * tocar o banco — e deixa o caso rodar sem banco nenhum.
 */
const semBanco = (() => { throw new Error('tocou o banco'); }) as unknown as ReturnType<typeof postgres>;

beforeAll(async () => {
  if (!TEM_BANCO) return;
  conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);
});

beforeEach(async () => {
  if (!TEM_BANCO) return;
  await conn`TRUNCATE working_hours, barber_services, services, settings, barbers, tenants RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  if (!TEM_BANCO) return;
  await conn?.end({ timeout: 5 });
});

describe('a regra de nascer uma barbearia', () => {
  it.skipIf(!TEM_BANCO)('cria tenant, configuração, dono e horário numa transação só', async () => {
    const r = await provisionarBarbearia(conn, BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [t] = await conn`SELECT slug, business_name FROM tenants WHERE id = ${r.tenantId}`;
    expect(t.slug).toBe('cortes-do-ze');

    const [s] = await conn`SELECT short_name, whatsapp_number, whatsapp_display FROM settings WHERE tenant_id = ${r.tenantId}`;
    // "Barbearia Cortes do Zé" no topo estoura a barra: o prefixo genérico sai.
    expect(s.short_name).toBe('Cortes do Zé');
    // ⚠️ COM o 55. Até 27/09/2026 este caso exigia '84999990000' — e com isso a
    // suíte garantia o defeito: o site monta `wa.me/<número>`, e sem o 55 o botão
    // de WhatsApp abria uma conversa com +84, o Vietnã (`tests/whatsapp-da-loja.test.ts`).
    expect(s.whatsapp_number).toBe('5584999990000');
    // O que aparece escrito no rodapé: formatado, não do jeito que foi digitado.
    expect(s.whatsapp_display).toBe('(84) 99999-0000');

    const [b] = await conn`SELECT phone, role FROM barbers WHERE tenant_id = ${r.tenantId}`;
    expect(b.phone).toBe('84999990000');
    expect(b.role).toBe('admin');

    const [{ n }] = await conn`SELECT COUNT(*)::int AS n FROM working_hours WHERE tenant_id = ${r.tenantId}`;
    expect(n).toBe(6);   // seg–sex + sábado
  });

  it.skipIf(!TEM_BANCO)('RECUSA o mesmo endereço duas vezes — e não deixa nada pela metade', async () => {
    expect((await provisionarBarbearia(conn, BASE)).ok).toBe(true);

    const r = await provisionarBarbearia(conn, { ...BASE, telefone: '84 98888-7777' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campo).toBe('slug');
    expect(r.conflito).toBe(true);

    const [{ n }] = await conn`SELECT COUNT(*)::int AS n FROM tenants`;
    expect(n).toBe(1);
  });

  it.skipIf(!TEM_BANCO)('RECUSA telefone que já é login de outro barbeiro', async () => {
    expect((await provisionarBarbearia(conn, BASE)).ok).toBe(true);

    const r = await provisionarBarbearia(conn, { ...BASE, slug: 'outra' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.campo).toBe('telefone-dono');
    expect(r.conflito).toBe(true);

    // ⚠️ O que o teste protege não é a mensagem: é o tenant não ter ficado no
    // banco depois da recusa. Slug ocupado por barbearia que não existe é o
    // estado do qual não se sai rodando o cadastro de novo.
    const [{ n }] = await conn`SELECT COUNT(*)::int AS n FROM tenants`;
    expect(n).toBe(1);
  });

  it.skipIf(!TEM_BANCO)('RECUSA senha curta antes de tocar o banco', async () => {
    const r = await provisionarBarbearia(conn, { ...BASE, senha: 'curta' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.campo).toBe('senha');
    const [{ n }] = await conn`SELECT COUNT(*)::int AS n FROM tenants`;
    expect(n).toBe(0);
  });

  it.skipIf(!TEM_BANCO)('RECUSA endereço que não serve como subdomínio', async () => {
    for (const ruim of ['Cortes do Zé', 'com espaço', '-comeca-com-hifen', 'acentuação']) {
      const r = await provisionarBarbearia(conn, { ...BASE, slug: ruim });
      expect(r.ok, ruim).toBe(false);
      if (!r.ok) expect(r.campo).toBe('slug');
    }
  });
});

describe('os serviços que o dono digita no cadastro', () => {
  it.skipIf(!TEM_BANCO)('com preço entram NO AR; em branco entram desligados', async () => {
    const r = await provisionarBarbearia(conn, {
      ...BASE,
      servicos: [
        { nome: 'Corte masculino', precoCentavos: 4000, minutos: 30 },
        { nome: 'Barba',           precoCentavos: 3000, minutos: 30 },
        { nome: 'Sobrancelha',     precoCentavos: 0,    minutos: 10 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.servicosCriados).toBe(3);
    expect(r.servicosAtivos).toBe(2);

    const linhas = await conn`
      SELECT name, price_cents, active FROM services WHERE tenant_id = ${r.tenantId} ORDER BY name`;
    expect(linhas.map((l) => [l.name, l.price_cents, l.active])).toEqual([
      ['Barba', 3000, true],
      ['Corte masculino', 4000, true],
      ['Sobrancelha', 0, false],
    ]);

    // ⚠️ O que o §4.5 existe para impedir: "R$ 0,00" publicado. Serviço sem
    // preço tem que estar fora do ar, não apenas com número feio na tela.
    const noAr = await conn`
      SELECT COUNT(*)::int AS n FROM services WHERE tenant_id = ${r.tenantId} AND active = true AND price_cents = 0`;
    expect(noAr[0].n).toBe(0);
  });

  it.skipIf(!TEM_BANCO)('cada serviço já sai ligado ao dono, com a duração dele', async () => {
    const r = await provisionarBarbearia(conn, {
      ...BASE,
      servicos: [{ nome: 'Corte + barba', precoCentavos: 6000, minutos: 60 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Sem esta linha o serviço existe e NÃO tem vaga: `getAvailableSlots` sai
    // de `barber_services`, e o cliente veria o serviço no site sem nenhum
    // horário disponível.
    const [bs] = await conn`
      SELECT duration_minutes, barber_id FROM barber_services WHERE tenant_id = ${r.tenantId}`;
    expect(bs.duration_minutes).toBe(60);
    expect(Number(bs.barber_id)).toBe(r.barbeiroId);
  });

  it.skipIf(!TEM_BANCO)('RECUSA o mesmo serviço duas vezes e preço fora da faixa', async () => {
    const repetido = await provisionarBarbearia(conn, {
      ...BASE,
      servicos: [
        { nome: 'Corte masculino', precoCentavos: 4000, minutos: 30 },
        { nome: 'corte  masculino', precoCentavos: 5000, minutos: 30 },
      ],
    });
    expect(repetido.ok).toBe(false);

    const caro = await provisionarBarbearia(conn, {
      ...BASE,
      servicos: [{ nome: 'Corte', precoCentavos: 99_999_999, minutos: 30 }],
    });
    expect(caro.ok).toBe(false);
    if (!caro.ok) expect(caro.campo).toBe('servicos');
  });
});

describe('a semana que o dono preenche', () => {
  it.skipIf(!TEM_BANCO)('só os dias abertos viram vaga — e o texto do site acompanha', async () => {
    const r = await provisionarBarbearia(conn, {
      ...BASE,
      horarios: [
        { weekday: 0, fechado: true },
        { weekday: 1, abre: '12:00', fecha: '20:00' },
        { weekday: 2, abre: '12:00', fecha: '20:00' },
        { weekday: 3, abre: '12:00', fecha: '20:00' },
        { weekday: 4, abre: '12:00', fecha: '20:00' },
        { weekday: 5, abre: '12:00', fecha: '20:00' },
        { weekday: 6, abre: '08:00', fecha: '14:00' },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // ⚠️ Dia fechado é a AUSÊNCIA de linha. Linha com horário vazio geraria
    // vaga em dia de folga — o cliente marcaria e chegaria na porta fechada.
    const linhas = await conn`
      SELECT weekday, start_time FROM working_hours WHERE tenant_id = ${r.tenantId} ORDER BY weekday`;
    expect(linhas.map((l) => Number(l.weekday))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(String(linhas[0].start_time).slice(0, 5)).toBe('12:00');

    const [cfg] = await conn`SELECT business_hours FROM settings WHERE tenant_id = ${r.tenantId}`;
    const vitrine = JSON.parse(cfg.business_hours);
    // Dias seguidos com o mesmo horário viram uma linha só.
    expect(vitrine).toEqual([
      { label: 'Segunda — Sexta', hours: '12:00 — 20:00', closed: false },
      { label: 'Sábado',          hours: '08:00 — 14:00', closed: false },
      { label: 'Domingo',         hours: 'Fechado',       closed: true },
    ]);
  });

  it.skipIf(!TEM_BANCO)('RECUSA a semana inteira fechada e horário invertido', async () => {
    const tudoFechado = await provisionarBarbearia(conn, {
      ...BASE,
      horarios: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, fechado: true })),
    });
    expect(tudoFechado.ok).toBe(false);
    if (!tudoFechado.ok) expect(tudoFechado.campo).toBe('horarios');

    const invertido = await provisionarBarbearia(conn, {
      ...BASE,
      horarios: [{ weekday: 1, abre: '19:00', fecha: '09:00' }],
    });
    expect(invertido.ok).toBe(false);
  });

  it.skipIf(!TEM_BANCO)('o Instagram entra nas duas formas que o site usa', async () => {
    for (const digitado of ['@vintage', 'vintage', 'https://instagram.com/vintage', 'instagram.com/vintage/']) {
      await conn`TRUNCATE working_hours, barber_services, services, settings, barbers, tenants RESTART IDENTITY CASCADE`;
      const r = await provisionarBarbearia(conn, { ...BASE, instagram: digitado, sobre: '  Corte clássico.  ' });
      expect(r.ok, digitado).toBe(true);
      if (!r.ok) continue;
      const [cfg] = await conn`
        SELECT instagram_handle, instagram_url, about_text FROM settings WHERE tenant_id = ${r.tenantId}`;
      expect(cfg.instagram_handle, digitado).toBe('@vintage');
      expect(cfg.instagram_url, digitado).toBe('https://instagram.com/vintage');
      expect(cfg.about_text).toBe('Corte clássico.');
    }
  });
});

describe('o que o cadastro passou a pedir em 08/10/2026', () => {
  // A cor e a frase do topo no cadastro, para o site nascer com a cara do dono
  // (um layout só no lançamento), e o e-mail, que é o canal da senha e dos avisos
  // do teste — `docs/PLANO-PRODUTIZACAO.md` §13.
  it.skipIf(!TEM_BANCO)('a frase vai para o topo do site, a cor para o site e o e-mail para o dono', async () => {
    const r = await provisionarBarbearia(conn, {
      ...BASE, email: '  Ze.Silva@Exemplo.com.BR ', frase: '  Corte na régua, sem fila.  ', cor: '#b91c1c',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [cfg] = await conn`SELECT tagline, accent_color FROM settings WHERE tenant_id = ${r.tenantId}`;
    expect(cfg.tagline).toBe('Corte na régua, sem fila.');
    expect(cfg.accent_color).toBe(r.accent.color);
    expect(r.corVeioDoCliente).toBe(true);

    const [dono] = await conn`SELECT email FROM barbers WHERE id = ${r.barbeiroId}`;
    expect(dono.email).toBe('ze.silva@exemplo.com.br');
  });

  it.skipIf(!TEM_BANCO)('sem frase e sem e-mail (o script de linha de comando) também nasce — os dois ficam vazios', async () => {
    const { email: _e, ...semEmail } = BASE;
    const r = await provisionarBarbearia(conn, semEmail);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [cfg] = await conn`SELECT tagline FROM settings WHERE tenant_id = ${r.tenantId}`;
    const [dono] = await conn`SELECT email FROM barbers WHERE id = ${r.barbeiroId}`;
    expect(cfg.tagline).toBeNull();
    expect(dono.email).toBeNull();
  });

  it('RECUSA e-mail sem forma de e-mail, antes de tocar o banco', async () => {
    for (const ruim of ['ze', 'ze@', 'ze@exemplo', '@exemplo.com', 'ze silva@exemplo.com']) {
      const r = await provisionarBarbearia(semBanco, { ...BASE, email: ruim });
      expect(r.ok, ruim).toBe(false);
      if (!r.ok) expect(r.campo).toBe('email');
    }
  });

  it('RECUSA frase do topo com mais de 200 caracteres, antes de tocar o banco', async () => {
    const r = await provisionarBarbearia(semBanco, { ...BASE, frase: 'x'.repeat(201) });
    expect(r).toMatchObject({ ok: false, campo: 'frase' });
  });

  it('a rota EXIGE o e-mail — sem ele, nem chega ao banco', async () => {
    const anterior = process.env.CADASTRO_ABERTO;
    process.env.CADASTRO_ABERTO = '1';
    try {
      const { POST } = await import('../src/pages/api/cadastrar.js');
      const { email: _e, ...semEmail } = BASE;
      const r = await POST({
        request: new Request('http://x/api/cadastrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...semEmail, slug: 'sem-email' }),
        }),
        clientAddress: '7.7.7.7',
      } as never);
      expect(r.status).toBe(400);
      expect((await r.json()).campo).toBe('email');
    } finally {
      if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
      else process.env.CADASTRO_ABERTO = anterior;
    }
  }, 30_000);
});

describe('a porta nasce fechada', () => {
  // ⚠️ O IMPORT MORA NO GANCHO, NÃO NO CASO — E ISSO CONSERTA UM VERMELHO REAL.
  //
  // Em 24/09/2026 este caso estourou o limite de 5 s num `npm test` sem banco,
  // no Windows. O 404 é a primeira linha do handler — instantâneo. O tempo todo
  // era o `await import()` da rota, que ficava dentro do `it` e por isso era
  // cobrado do orçamento do caso. A rota puxa zod, iron-session, o catálogo e o
  // resto do cadastro.
  //
  // Medido no Linux: ~700 ms com o import no caso; 5 ms com ele aqui no gancho.
  // No Windows passou de 5 s. Por que antes passava lá, não sei — não é
  // aquecimento por outro arquivo ter carregado a rota antes: isso foi testado
  // e não muda nada.
  //
  // É a classe que o `vitest.config.ts` já registra para o paralelismo: caso que
  // passa ou falha conforme a máquina. O gancho tem orçamento próprio, e o caso
  // volta a medir só o que diz medir.
  let POST: typeof import('../src/pages/api/cadastrar.js').POST;
  beforeAll(async () => {
    ({ POST } = await import('../src/pages/api/cadastrar.js'));
  }, 30_000);

  it('sem CADASTRO_ABERTO a rota responde 404, não 403', async () => {
    // 403 anunciaria que a rota existe. 404 é o que uma rota inexistente diria.
    const anterior = process.env.CADASTRO_ABERTO;
    delete process.env.CADASTRO_ABERTO;
    try {
      const r = await POST({
        request: new Request('http://x/api/cadastrar', { method: 'POST', body: '{}' }),
        clientAddress: '1.2.3.4',
      } as never);
      expect(r.status).toBe(404);
    } finally {
      if (anterior !== undefined) process.env.CADASTRO_ABERTO = anterior;
    }
  });
});

describe('a rota, de ponta a ponta', () => {
  it.skipIf(!TEM_BANCO)('cria pela web e deixa o dono logado NA BARBEARIA NOVA — nunca na que estivesse aberta', async () => {
    // ⚠️ O caso que este teste existe para travar foi encontrado usando o
    // produto, não lendo o código: criar a segunda barbearia no mesmo navegador
    // e cair no painel da PRIMEIRA. `admin/login.astro` manda para `/admin`
    // quando já há sessão, e `/admin` lê a barbearia da SESSÃO, não do
    // endereço. Até 25/09/2026 a rota apagava o cookie; desde então ela o
    // SUBSTITUI pela sessão do dono novo (decisão de 24/09: cadastrou, já
    // recebe o painel). O que não pode é sobrar a sessão antiga.
    const anterior = process.env.CADASTRO_ABERTO;
    const baseAntes = process.env.DOMINIO_BASE;
    process.env.CADASTRO_ABERTO = '1';
    // Com domínio configurado, a resposta traz o endereço do site — é o que a
    // tela de fim mostra e manda no WhatsApp.
    process.env.DOMINIO_BASE = 'fadeline.com.br';
    const { caixaDeSaida } = await import('../src/lib/email.js');
    caixaDeSaida.length = 0;
    try {
      const mod = await import('../src/pages/api/cadastrar.js');
      const r = await mod.POST({
        request: new Request('http://x/api/cadastrar', {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: '__bayron_session=qualquercoisa' },
          body: JSON.stringify({
            ...BASE, slug: 'salao-jovem', telefone: '84 96658-951'.replace(/\D/g, '') + '1',
            servicos: [{ nome: 'Corte', precoCentavos: 3500, minutos: 30 }],
          }),
        }),
        clientAddress: '9.9.9.9',
      } as never);

      expect(r.status).toBe(201);
      const setCookie = r.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/^__bayron_session=[^;]{20,};/);
      expect(setCookie).not.toMatch(/Max-Age=0/);

      const corpo = await r.json();
      expect(corpo.slug).toBe('salao-jovem');
      expect(corpo.site).toBe('https://salao-jovem.fadeline.com.br');
      expect(corpo.servicosAtivos).toBe(1);
      expect(corpo.avisos).toEqual([]);

      const [t] = await conn`SELECT id FROM tenants WHERE slug = 'salao-jovem'`;
      expect(t).toBeTruthy();

      // A sessão que voltou é a do DONO NOVO, na barbearia nova, como admin.
      const [dono] = await conn`SELECT id FROM barbers WHERE tenant_id = ${t.id} AND role = 'admin'`;
      const { getSession } = await import('../src/lib/session.js');
      const s = await getSession(new Request('http://x/admin', { headers: { cookie: setCookie.split(';')[0] } }));
      expect(s).toMatchObject({ barberId: Number(dono.id), tenantId: Number(t.id), role: 'admin' });

      // O e-mail de boas-vindas sai DEPOIS da resposta, sem segurar a tela — e é o
      // primeiro sinal de que o endereço digitado existe.
      await vi.waitFor(() => expect(caixaDeSaida).toHaveLength(1));
      const [boasVindas] = caixaDeSaida;
      expect(boasVindas.para).toBe('ze@exemplo.com.br');
      expect(boasVindas.assunto).toMatch(/^Barbearia Cortes do Zé está no ar — /);
      expect(boasVindas.texto).toContain('Olá, José da Silva.');
      expect(boasVindas.texto).toContain('https://salao-jovem.fadeline.com.br');
      expect(boasVindas.texto).toContain('https://painel.fadeline.com.br/admin');
      expect(boasVindas.texto).toMatch(/\(84\) 96658-9511/);
      expect(boasVindas.texto).toMatch(/O teste grátis vai até \d{2}\/\d{2}\./);
    } finally {
      if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
      else process.env.CADASTRO_ABERTO = anterior;
      if (baseAntes === undefined) delete process.env.DOMINIO_BASE;
      else process.env.DOMINIO_BASE = baseAntes;
    }
  });
});

describe('a rota só aceita JSON — ela abre sessão', () => {
  it('formulário de outro site (text/plain com cara de JSON) é recusado antes de tudo', async () => {
    // Login CSRF: sem esta porta, uma página qualquer criaria uma barbearia e
    // deixaria o visitante logado nela. Ver o comentário em `api/cadastrar.ts`.
    const anterior = process.env.CADASTRO_ABERTO;
    process.env.CADASTRO_ABERTO = '1';
    try {
      const mod = await import('../src/pages/api/cadastrar.js');
      const r = await mod.POST({
        request: new Request('http://x/api/cadastrar', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: JSON.stringify({ ...BASE, slug: 'csrf-teste' }),
        }),
        clientAddress: '7.7.7.7',
      } as never);
      expect(r.status).toBe(415);
      expect(r.headers.get('set-cookie')).toBeNull();
    } finally {
      if (anterior === undefined) delete process.env.CADASTRO_ABERTO;
      else process.env.CADASTRO_ABERTO = anterior;
    }
  });
});

describe('os ajudantes que o cadastro e o script compartilham', () => {
  it('o nome curto perde o prefixo genérico', () => {
    expect(curtoPadrao('Barbearia Cortes do Zé')).toBe('Cortes do Zé');
    expect(curtoPadrao('Salão do João')).toBe('João');
    expect(curtoPadrao('Vintage')).toBe('Vintage');
  });

  it('o telefone guarda só dígitos, sem o 55 do país', () => {
    expect(soDigitos('(84) 99999-0000')).toBe('84999990000');
    expect(soDigitos('+55 84 99999-0000')).toBe('84999990000');
    expect(soDigitos('8433334444')).toBe('8433334444');
  });
});
