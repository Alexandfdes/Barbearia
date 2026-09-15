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
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { provisionarBarbearia, curtoPadrao, soDigitos } from '../src/lib/provisionarBarbearia.js';

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
};

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

    const [s] = await conn`SELECT short_name, whatsapp_number FROM settings WHERE tenant_id = ${r.tenantId}`;
    // "Barbearia Cortes do Zé" no topo estoura a barra: o prefixo genérico sai.
    expect(s.short_name).toBe('Cortes do Zé');
    expect(s.whatsapp_number).toBe('84999990000');

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

describe('a porta nasce fechada', () => {
  it('sem CADASTRO_ABERTO a rota responde 404, não 403', async () => {
    // 403 anunciaria que a rota existe. 404 é o que uma rota inexistente diria.
    const anterior = process.env.CADASTRO_ABERTO;
    delete process.env.CADASTRO_ABERTO;
    try {
      const mod = await import('../src/pages/api/cadastrar.js');
      const r = await mod.POST({
        request: new Request('http://x/api/cadastrar', { method: 'POST', body: '{}' }),
        clientAddress: '1.2.3.4',
      } as never);
      expect(r.status).toBe(404);
    } finally {
      if (anterior !== undefined) process.env.CADASTRO_ABERTO = anterior;
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
