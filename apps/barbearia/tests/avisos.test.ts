// Os avisos por e-mail do teste e da cobrança — `src/lib/avisos.ts`, a rota da
// tarefa e o token que o daemon usa para chamá-la.
//
// O que estes casos seguram: sai só o aviso da fase de agora; sai UMA vez por
// prazo, por mais que a tarefa rode; vai para os donos ativos com e-mail e para
// mais ninguém; e o envio que falha é tentado de novo na rodada seguinte.
//
// Os casos falam em hora LOCAL, como `tests/situacao.test.ts`.
// A parte de banco precisa de Postgres; sem DATABASE_URL ela é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { situacaoDe, fimDoTeste, fimDaCarencia } from '../src/lib/situacao';
import { explicacaoDaSituacao } from '../src/lib/assinatura';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const FORTALEZA = 'America/Fortaleza'; // o fuso padrão de lib/timezone.ts
const local = (quando: string) => fromZonedTime(quando, FORTALEZA);

let avisos: typeof import('../src/lib/avisos.ts');

beforeAll(async () => {
  avisos = await import('../src/lib/avisos.ts');
}, 30_000);

// Cadastro no dia 8: teste até o fim do dia 15, carência até o fim do dia 18,
// fora do ar a partir do dia 19 (`tests/situacao.test.ts`).
const CADASTRO = local('2026-10-08T10:00:00');
const FIM_DO_TESTE = fimDoTeste(CADASTRO, FORTALEZA);           // 16/10 00:00
const FIM_DA_CARENCIA = fimDaCarencia(FIM_DO_TESTE, FORTALEZA); // 19/10 00:00
const noTeste = (agora: Date) => situacaoDe({ status: 'trial', testeAte: FIM_DO_TESTE, fuso: FORTALEZA }, agora);

describe('qual aviso a fase de agora pede', () => {
  it('no teste, só a partir de 2 dias do fim', () => {
    const dia12 = local('2026-10-12T20:00:00');
    const dia13 = local('2026-10-13T00:30:00');
    expect(avisos.avisoDevido(noTeste(dia12), FORTALEZA, dia12)).toBeNull();
    expect(avisos.avisoDevido(noTeste(dia13), FORTALEZA, dia13)).toEqual({ tipo: 'teste-acabando', referencia: FIM_DO_TESTE });
    const dia15 = local('2026-10-15T23:00:00');
    expect(avisos.avisoDevido(noTeste(dia15), FORTALEZA, dia15)?.tipo).toBe('teste-acabando');
  });

  it('teste vencido: "o teste acabou", com o prazo da carência', () => {
    const dia16 = local('2026-10-16T00:10:00');
    expect(avisos.avisoDevido(noTeste(dia16), FORTALEZA, dia16)).toEqual({ tipo: 'teste-acabou', referencia: FIM_DA_CARENCIA });
  });

  it('cobrança que falhou: o aviso dela, não o do teste', () => {
    const falhou = local('2026-11-20T10:37:00');
    const agora = local('2026-11-20T11:00:00');
    const s = situacaoDe({ status: 'past_due', atrasadaDesde: falhou, fuso: FORTALEZA }, agora);
    expect(avisos.avisoDevido(s, FORTALEZA, agora)).toEqual({ tipo: 'cobranca-falhou', referencia: fimDaCarencia(falhou, FORTALEZA) });
  });

  it('fora do ar: o aviso sai na semana em que saiu do ar — depois, não mais', () => {
    const dia19 = local('2026-10-19T00:10:00');
    expect(avisos.avisoDevido(noTeste(dia19), FORTALEZA, dia19)).toEqual({ tipo: 'fora-do-ar', referencia: FIM_DA_CARENCIA });
    // Barbearia abandonada há um mês não recebe, no dia em que esta tarefa entrar
    // no ar, um "o site saiu do ar" de semanas atrás.
    const umMesDepois = local('2026-11-19T10:00:00');
    expect(avisos.avisoDevido(noTeste(umMesDepois), FORTALEZA, umMesDepois)).toBeNull();
  });

  it('pagando em dia, tirada do ar à mão e encerrada: nenhum aviso automático', () => {
    const agora = local('2026-10-13T10:00:00');
    expect(avisos.avisoDevido(situacaoDe({ status: 'active', fuso: FORTALEZA }, agora), FORTALEZA, agora)).toBeNull();
    expect(avisos.avisoDevido(situacaoDe({ status: 'suspended', fuso: FORTALEZA }, agora), FORTALEZA, agora)).toBeNull();
    expect(avisos.avisoDevido(situacaoDe({ status: 'cancelled', fuso: FORTALEZA }, agora), FORTALEZA, agora)).toBeNull();
    // Tirada do ar à mão não ganha aviso nem se um dia a fase trouxer a data:
    // quem tirou é quem conversa.
    expect(avisos.avisoDevido({ fase: 'suspensa', motivo: 'manual', desde: local('2026-10-12T00:00:00') }, FORTALEZA, agora)).toBeNull();
  });
});

describe('o texto do aviso', () => {
  const d = { barbearia: 'Barbearia do Zé', nome: 'Zé', painel: 'https://painel.exemplo.com.br', fuso: FORTALEZA };

  it('o miolo é o mesmo parágrafo da tela de assinatura — e o link leva a ela', () => {
    for (const agora of [local('2026-10-13T09:00:00'), local('2026-10-17T09:00:00'), local('2026-10-19T09:00:00')]) {
      const s = noTeste(agora);
      const devido = avisos.avisoDevido(s, FORTALEZA, agora)!;
      const { assunto, texto } = avisos.textoDoAviso(devido.tipo, s, d, agora);
      expect(assunto.startsWith('Barbearia do Zé: '), assunto).toBe(true);
      expect(texto).toContain('Olá, Zé.');
      expect(texto).toContain(explicacaoDaSituacao(s, FORTALEZA, agora));
      expect(texto).toContain('https://painel.exemplo.com.br/admin/assinatura');
    }
  });

  it('o assunto diz quanto falta, como a faixa do painel', () => {
    const dia13 = local('2026-10-13T09:00:00');
    const dia14 = local('2026-10-14T09:00:00');
    const dia15 = local('2026-10-15T09:00:00');
    const assunto = (agora: Date) => avisos.textoDoAviso('teste-acabando', noTeste(agora), d, agora).assunto;
    expect(assunto(dia13)).toBe('Barbearia do Zé: o teste grátis termina em 2 dias');
    expect(assunto(dia14)).toBe('Barbearia do Zé: o teste grátis termina amanhã');
    expect(assunto(dia15)).toBe('Barbearia do Zé: o teste grátis termina hoje');
  });
});

describe('o token da tarefa', () => {
  it('o daemon e o app calculam o MESMO token — senão os avisos param sem erro nenhum', async () => {
    const app = await import('../src/lib/tarefas.ts');
    // O mesmo módulo que o daemon importa.
    const daemon = await import('../scripts/tarefas.mjs');
    const segredo = 'um-segredo-qualquer-com-mais-de-32-caracteres';
    expect(daemon.tokenDasTarefas(segredo)).toBe(app.tokenDasTarefas(segredo));
    expect(app.tokenDasTarefas(segredo)).toMatch(/^[0-9a-f]{64}$/);
    // Segredo curto não gera token: a rota fica fechada em vez de aberta.
    expect(app.tokenDasTarefas('curto')).toBeNull();
    expect(daemon.tokenDasTarefas('curto')).toBeNull();
  });

  it('o daemon é lançado pelo CMD do Dockerfile, como o de backup', async () => {
    const { readFileSync } = await import('node:fs');
    const cmd = readFileSync('Dockerfile', 'utf8').match(/CMD \[([^\]]+)\]/s)?.[1] ?? '';
    expect(cmd).toMatch(/\(node scripts\/avisos-daemon\.mjs &\)/);
  });
});

// ── A tarefa contra o banco ──────────────────────────────────────────────────

let sql: ReturnType<typeof postgres>;
let email: typeof import('../src/lib/email.ts');
let rota: typeof import('../src/pages/api/tarefas/avisos.ts');

/** Dia 13, 10h: a barbearia que entrou no dia 8 está a 2 dias do fim do teste. */
const AGORA = local('2026-10-13T10:00:00');
const DIA = 24 * 60 * 60 * 1000;

describe.skipIf(!TEM_BANCO)('a tarefa, contra o banco', () => {
  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);

    const iso = (d: Date) => d.toISOString();
    // O teste que acabou no dia 11 está na carência; o que acabou no dia 6, fora
    // do ar desde o dia 9; o que acabou em setembro, abandonado.
    const acabouDia11 = local('2026-10-11T00:00:00');
    const acabouDia6 = local('2026-10-06T00:00:00');
    const acabouEmSetembro = local('2026-09-01T00:00:00');
    const cobrancaFalhou = new Date(AGORA.getTime() - DIA);

    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, past_due_since) VALUES
      (1,  'ativa',      'Barbearia Ativa',      'active',    NULL, NULL),
      (2,  'acabando',   'Barbearia Acabando',   'trial',     ${iso(FIM_DO_TESTE)}, NULL),
      (3,  'carencia',   'Barbearia Carência',   'trial',     ${iso(acabouDia11)}, NULL),
      (4,  'atrasada',   'Barbearia Atrasada',   'past_due',  NULL, ${iso(cobrancaFalhou)}),
      (5,  'fora',       'Barbearia Fora',       'trial',     ${iso(acabouDia6)}, NULL),
      (6,  'abandonada', 'Barbearia Abandonada', 'trial',     ${iso(acabouEmSetembro)}, NULL),
      (7,  'sem-email',  'Barbearia Sem E-mail', 'trial',     ${iso(FIM_DO_TESTE)}, NULL),
      (8,  'manual',     'Barbearia Manual',     'suspended', NULL, NULL),
      (9,  'encerrada',  'Barbearia Encerrada',  'cancelled', NULL, NULL),
      (10, 'quebrada',   'Barbearia Quebrada',   'trial',     ${iso(FIM_DO_TESTE)}, NULL)`;
    await sql`SELECT setval('tenants_id_seq', 10)`;

    // 'a b@c.de' passa na trava da migration 0006 e não tem forma de e-mail para o
    // envio: é o jeito de fazer UM envio falhar sem mexer no resto.
    await sql`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active, email) VALUES
      (1,  'Dono Ativa',      'dono', 'admin',  'x', true,  'dono@ativa.com'),
      (2,  'Dono Acabando',   'dono', 'admin',  'x', true,  'dono@acabando.com'),
      (2,  'Barbeiro',        'bar',  'barber', 'x', true,  'barbeiro@acabando.com'),
      (2,  'Ex-sócio',        'ex',   'admin',  'x', false, 'ex@acabando.com'),
      (3,  'Dono Carência',   'dono', 'admin',  'x', true,  'dono@carencia.com'),
      (3,  'Sócia Carência',  'socia','admin',  'x', true,  'socia@carencia.com'),
      (4,  'Dono Atrasada',   'dono', 'admin',  'x', true,  'dono@atrasada.com'),
      (5,  'Dono Fora',       'dono', 'admin',  'x', true,  'dono@fora.com'),
      (6,  'Dono Abandonada', 'dono', 'admin',  'x', true,  'dono@abandonada.com'),
      (7,  'Dono Sem E-mail', 'dono', 'admin',  'x', true,  NULL),
      (8,  'Dono Manual',     'dono', 'admin',  'x', true,  'dono@manual.com'),
      (9,  'Dono Encerrada',  'dono', 'admin',  'x', true,  'dono@encerrada.com'),
      (10, 'Dono Quebrada',   'dono', 'admin',  'x', true,  'a b@c.de')`;

    process.env.DOMINIO_BASE = 'fadeline.com.br';
    email = await import('../src/lib/email.ts');
    rota = await import('../src/pages/api/tarefas/avisos.ts');
  }, 30_000);

  afterAll(async () => {
    await sql.end();
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  beforeEach(() => { email.caixaDeSaida.length = 0; });

  it('a primeira rodada manda o aviso de cada fase — para os donos ativos com e-mail, e só para eles', async () => {
    const resumo = await avisos.enviarAvisosPendentes(AGORA);
    // 2, 3, 4, 5, 6, 7 e 10 têm prazo correndo; a ativa, a manual e a encerrada nem entram.
    expect(resumo).toEqual({ avaliadas: 7, enviados: 4, falhas: 1, semDestinatario: 1 });

    const recebidos = email.caixaDeSaida.map((e) => `${e.para} | ${e.assunto}`).sort();
    expect(recebidos).toEqual([
      'dono@acabando.com | Barbearia Acabando: o teste grátis termina em 2 dias',
      'dono@atrasada.com | Barbearia Atrasada: a cobrança do cartão não passou',
      'dono@carencia.com | Barbearia Carência: o teste grátis acabou',
      'dono@fora.com | Barbearia Fora: o site saiu do ar',
      'socia@carencia.com | Barbearia Carência: o teste grátis acabou',
    ]);
    // O link do aviso aponta para a tela de assinatura do painel.
    expect(email.caixaDeSaida[0].texto).toContain('https://painel.fadeline.com.br/admin/assinatura');
  });

  it('rodar de novo não repete nada — a trava está no banco', async () => {
    const resumo = await avisos.enviarAvisosPendentes(new Date(AGORA.getTime() + 60 * 60 * 1000));
    expect(resumo.enviados).toBe(0);
    expect(email.caixaDeSaida).toHaveLength(0);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM avisos_enviados`;
    expect(n).toBe(4);
  });

  it('o envio que falhou não fica travado: a rodada seguinte tenta de novo', async () => {
    // A barbearia 10 falhou na primeira rodada e na segunda; a reserva foi desfeita
    // as duas vezes. Corrigido o e-mail, o aviso sai.
    const [{ n: reservas }] = await sql`SELECT count(*)::int AS n FROM avisos_enviados WHERE tenant_id = 10`;
    expect(reservas).toBe(0);
    await sql`UPDATE barbers SET email = 'dono@quebrada.com' WHERE tenant_id = 10`;
    const resumo = await avisos.enviarAvisosPendentes(AGORA);
    expect(resumo.enviados).toBe(1);
    expect(email.caixaDeSaida.map((e) => e.para)).toEqual(['dono@quebrada.com']);
  });

  it('a fase muda, o aviso muda: o teste que acabava agora acabou', async () => {
    const dia16 = local('2026-10-16T08:00:00');
    await avisos.enviarAvisosPendentes(dia16);
    const daAcabando = email.caixaDeSaida.filter((e) => e.para === 'dono@acabando.com');
    expect(daAcabando.map((e) => e.assunto)).toEqual(['Barbearia Acabando: o teste grátis acabou']);
  });

  it('a carência estendida pelo operador: no lugar de "saiu do ar", o prazo novo — e, no fim dele, aí sim', async () => {
    // A 4 saiu do ar no dia 16 (a rodada acima mandou "o site saiu do ar"). O
    // operador deu prazo até o fim do dia 19 (migration 0016): o site volta, e o
    // dono recebe a data nova — o mesmo e-mail da carência.
    await sql`UPDATE tenants SET carencia_ate = ${local('2026-10-20T00:00:00').toISOString()} WHERE id = 4`;
    await avisos.enviarAvisosPendentes(local('2026-10-17T08:00:00'));
    const doAtraso = () => email.caixaDeSaida.filter((e) => e.para === 'dono@atrasada.com');
    expect(doAtraso().map((e) => e.assunto)).toEqual(['Barbearia Atrasada: a cobrança do cartão não passou']);
    expect(doAtraso()[0].texto).toContain('O site continua no ar até 19/10.');

    email.caixaDeSaida.length = 0;
    await avisos.enviarAvisosPendentes(local('2026-10-20T08:00:00'));
    expect(doAtraso().map((e) => e.assunto)).toEqual(['Barbearia Atrasada: o site saiu do ar']);
    expect(doAtraso()[0].texto).toContain('desde 20/10');
  });

  it('sem envio de e-mail, a tarefa recusa com o motivo — em vez de um resumo de zeros', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_URL', '');
    vi.stubEnv('EMAIL_PASTA', '');
    try {
      await expect(avisos.enviarAvisosPendentes(AGORA)).rejects.toThrow(/SMTP_URL/);
      vi.stubEnv('SMTP_URL', 'smtp://127.0.0.1:1');
      vi.stubEnv('DOMINIO_BASE', '');
      vi.stubEnv('PAINEL_URL', '');
      await expect(avisos.enviarAvisosPendentes(AGORA)).rejects.toThrow(/PAINEL_URL/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('a rota: sem o token certo, não existe; com ele, roda e devolve o resumo', async () => {
    const chamar = (authorization?: string) => rota.POST({
      request: new Request('http://127.0.0.1:4321/api/tarefas/avisos', {
        method: 'POST',
        headers: authorization ? { authorization } : {},
      }),
    } as never);

    expect((await chamar()).status).toBe(404);
    expect((await chamar('Bearer errado')).status).toBe(404);
    expect((await chamar(`Bearer ${'0'.repeat(64)}`)).status).toBe(404);

    const { tokenDasTarefas } = await import('../src/lib/tarefas.ts');
    const res = await chamar(`Bearer ${tokenDasTarefas()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, avaliadas: expect.any(Number), enviados: expect.any(Number) });
  });
});
