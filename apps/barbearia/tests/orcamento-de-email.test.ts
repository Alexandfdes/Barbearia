// O orçamento do dia de e-mail (`src/lib/email.ts`, 05/11/2026).
//
// O provedor dá um tanto por dia para TODAS as barbearias juntas — o Brevo grátis, 300 —, e até
// aqui nada contava: remarcar pelo link do cliente, sem conta, mandava dois e-mails por remarcação,
// sem limite, e gastava o dia de todo mundo, a senha nova junto (`docs/PENDENCIAS-ABERTAS.md` §2.66).
// Estes casos seguram as regras: o total; a parte dos avisos de agenda, que deixa sobrar para a
// senha e a confirmação; o teto de cada barbearia; e que o e-mail que não saiu não gasta.
//
// Não precisa de banco.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

let email: typeof import('../src/lib/email.ts');

beforeAll(async () => {
  email = await import('../src/lib/email.ts');
}, 30_000);

const LIMITE_ANTES = process.env.EMAIL_LIMITE_DIARIO;
beforeEach(() => {
  email.zerarOrcamentoDeEmail();
  email.caixaDeSaida.length = 0;
  // 10 por dia: a agenda fica com 6, cada barbearia com 2 de agenda e 1 de senha e confirmação.
  process.env.EMAIL_LIMITE_DIARIO = '10';
});
afterEach(() => {
  vi.useRealTimers();
  if (LIMITE_ANTES === undefined) delete process.env.EMAIL_LIMITE_DIARIO;
  else process.env.EMAIL_LIMITE_DIARIO = LIMITE_ANTES;
});

const mandar = (tipo: 'seguranca' | 'conta' | 'agenda' | 'operador', barbearia: number | null, para = 'dono@barbearia.com') =>
  email.enviarEmail({ para, assunto: 'x', texto: 'x', tipo, barbearia });

/** O motivo da recusa — ou `null`, se saiu. */
async function recusa(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null; } catch (erro) {
    expect(erro).toBeInstanceOf(email.EmailNaoEnviado);
    return (erro as Error).message;
  }
}

describe('o limite e as partes dele', () => {
  it('sem a variável, 280 — os 300 do Brevo grátis, com folga; fora da forma, também', () => {
    expect(email.limiteDiario({})).toBe(280);
    for (const v of ['', '0', '-3', 'abc', '2.5', ' ']) expect(email.limiteDiario({ EMAIL_LIMITE_DIARIO: v })).toBe(280);
    expect(email.limiteDiario({ EMAIL_LIMITE_DIARIO: '1000' })).toBe(1000);
  });

  it('a agenda fica com 60%, cada barbearia com 20% de agenda e 10% de senha e confirmação, e o operador com 5%', () => {
    expect(email.partesDoOrcamento(280)).toEqual({ total: 280, agenda: 168, agendaPorBarbearia: 56, segurancaPorBarbearia: 28, operador: 14 });
    // Com um limite pequeno, cada parte ainda deixa passar um.
    expect(email.partesDoOrcamento(1)).toEqual({ total: 1, agenda: 1, agendaPorBarbearia: 1, segurancaPorBarbearia: 1, operador: 1 });
  });
});

describe('enviarEmail, com o orçamento', () => {
  it('o total do dia: o 11º não sai, e diz por quê', async () => {
    for (let i = 0; i < 10; i++) expect(await recusa(mandar('conta', i + 1))).toBeNull();
    expect(await recusa(mandar('conta', 99))).toMatch(/limite do dia acabou: 10 e-mails em 24 horas/);
    expect(email.caixaDeSaida).toHaveLength(10);
    expect(email.usoDoOrcamento()).toMatchObject({ limite: 10, usados: 10, recusados: 1 });
  });

  it('uma barbearia não passa da parte dela em avisos de agenda — as outras continuam', async () => {
    expect(await recusa(mandar('agenda', 1))).toBeNull();
    expect(await recusa(mandar('agenda', 1))).toBeNull();
    expect(await recusa(mandar('agenda', 1))).toMatch(/barbearia 1 chegou a 2 avisos de agenda/);
    expect(await recusa(mandar('agenda', 2))).toBeNull();
  });

  it('a agenda acabou, e a senha nova ainda sai — é para isso que a parte dela existe', async () => {
    for (const b of [1, 1, 2, 2, 3, 3]) expect(await recusa(mandar('agenda', b))).toBeNull();
    expect(await recusa(mandar('agenda', 4))).toMatch(/parte dos avisos de agenda acabou: 6 em 24 horas, de 10/);
    expect(await recusa(mandar('seguranca', 1))).toBeNull();
    expect(await recusa(mandar('conta', 4))).toBeNull();
  });

  it('a barbearia que gastou a agenda dela ainda recebe a senha nova', async () => {
    await mandar('agenda', 1);
    await mandar('agenda', 1);
    expect(await recusa(mandar('agenda', 1))).not.toBeNull();
    expect(await recusa(mandar('seguranca', 1))).toBeNull();
  });

  it('senha e confirmação: uma barbearia não leva a parte das outras', async () => {
    expect(await recusa(mandar('seguranca', 1))).toBeNull();
    expect(await recusa(mandar('seguranca', 1))).toMatch(/barbearia 1 chegou a 1 e-mails de senha e confirmação/);
    expect(await recusa(mandar('seguranca', 2))).toBeNull();
  });

  it('os avisos do teste e da cobrança não têm teto por barbearia — só o total', async () => {
    for (let i = 0; i < 10; i++) expect(await recusa(mandar('conta', 1))).toBeNull();
    expect(await recusa(mandar('conta', 1))).toMatch(/limite do dia/);
  });

  it('o aviso ao operador de cadastro novo (10/11/2026): parte própria — o cadastro é público, e uma enxurrada não leva o dia', async () => {
    // Com 10 por dia, a parte do operador é 1, o mínimo.
    expect(await recusa(mandar('operador', 1, 'operador@exemplo.com.br'))).toBeNull();
    expect(await recusa(mandar('operador', 2, 'operador@exemplo.com.br'))).toMatch(/a parte dos avisos ao operador acabou: 1 em 24 horas, de 10/);
    // O resto do dia continua: a senha nova de outra barbearia sai, e o aviso do teste também.
    expect(await recusa(mandar('seguranca', 3))).toBeNull();
    expect(await recusa(mandar('conta', 3))).toBeNull();
    expect(email.usoDoOrcamento()).toMatchObject({ usados: 3, recusados: 1, porTipo: { seguranca: 1, conta: 1, agenda: 0, operador: 1 } });
  });

  it('o e-mail sem forma não gasta nada', async () => {
    expect(await recusa(email.enviarEmail({ para: 'ze@gmail', assunto: 'x', texto: 'x', tipo: 'agenda', barbearia: 1 })))
      .toMatch(/sem forma de e-mail/);
    expect(email.usoDoOrcamento()).toMatchObject({ usados: 0, recusados: 0 });
  });

  it('cada e-mail que saiu leva a barbearia e o tipo', async () => {
    await mandar('agenda', 7);
    expect(email.caixaDeSaida[0]).toMatchObject({ barbearia: 7, tipo: 'agenda' });
    expect(email.usoDoOrcamento().porTipo).toEqual({ seguranca: 0, conta: 0, agenda: 1, operador: 0 });
  });

  it('24 horas depois, o dia volta', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    for (let i = 0; i < 10; i++) await mandar('conta', 1);
    expect(await recusa(mandar('conta', 1))).toMatch(/limite do dia/);
    vi.setSystemTime(new Date('2026-11-06T11:59:59Z'));
    expect(await recusa(mandar('conta', 1))).toMatch(/limite do dia/);
    vi.setSystemTime(new Date('2026-11-06T12:00:01Z'));
    expect(await recusa(mandar('conta', 1))).toBeNull();
    expect(email.usoDoOrcamento()).toMatchObject({ usados: 1 });
  });
});

// O que não sai não pode gastar — senão o provedor fora do ar, ou o envio desligado, comeria o
// dia sem mandar nada. Aqui o transporte deixa de ser o da memória: sem VITEST nem NODE_ENV=test,
// `transporteDeEmail` escolhe pelo resto do ambiente.
describe('o que não saiu não gasta', () => {
  const ANTES = { VITEST: process.env.VITEST, NODE_ENV: process.env.NODE_ENV, SMTP_URL: process.env.SMTP_URL, EMAIL_PASTA: process.env.EMAIL_PASTA };
  afterEach(() => {
    for (const [k, v] of Object.entries(ANTES)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('o envio desligado (produção sem SMTP_URL) recusa sem contar', async () => {
    delete process.env.VITEST; delete process.env.SMTP_URL; delete process.env.EMAIL_PASTA;
    process.env.NODE_ENV = 'production';
    expect(await recusa(mandar('seguranca', 1))).toMatch(/não está configurado/);
    expect(email.usoDoOrcamento()).toMatchObject({ usados: 0, recusados: 0 });
  });

  it('o transporte que falha devolve a vaga', async () => {
    delete process.env.VITEST; delete process.env.SMTP_URL;
    process.env.NODE_ENV = 'development';
    // Uma pasta dentro de um arquivo: o `mkdirSync` do transporte de arquivo falha.
    process.env.EMAIL_PASTA = `${new URL(import.meta.url).pathname}/dentro-de-um-arquivo`;
    await expect(mandar('seguranca', 1)).rejects.toThrow();
    expect(email.usoDoOrcamento()).toMatchObject({ usados: 0 });
    // A vaga voltou: com o transporte da memória de novo, a única da barbearia 1 sai.
    process.env.VITEST = ANTES.VITEST ?? 'true';
    expect(await recusa(mandar('seguranca', 1))).toBeNull();
  });
});
