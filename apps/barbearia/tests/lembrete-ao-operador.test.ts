// O lembrete ao operador do site que espera a aprovação há mais de 20 horas — `lembrarSitesQueEsperam`
// em `src/lib/avisos.ts` (decisão do dono em 10/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.70).
//
// O dono ouve que o site abre em até `PRAZO_DA_CONFERENCIA`, e o aviso de cadastro novo sai uma vez,
// na hora do cadastro. Estes casos seguram: o lembrete sai depois de 20 horas, e não antes; uma vez
// por site, por mais que a tarefa rode; um e-mail por rodada, com todos os que passaram da hora; só
// para quem ainda espera; sem nada que a pessoa digitou; e o envio que falha tenta de novo.
//
// O texto não precisa de banco; a tarefa, sim.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import postgres from 'postgres';
import { fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';
import { PRAZO_DA_CONFERENCIA } from '../src/lib/produto';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const FORTALEZA = 'America/Fortaleza';
const local = (quando: string) => fromZonedTime(quando, FORTALEZA);
const HORA = 60 * 60 * 1000;
const ENV = { OPERADOR_EMAIL: 'operador@fadeline.com.br', PAINEL_URL: 'https://painel.fadeline.com.br' };

let avisos: typeof import('../src/lib/avisos.ts');
beforeAll(async () => { avisos = await import('../src/lib/avisos.ts'); }, 30_000);

describe('o texto do lembrete', () => {
  const agora = local('2026-11-11T14:00:00');
  const site = (slug: string, criadaEm: Date, id = 7) =>
    ({ slug, criadaEm, fuso: FORTALEZA, ficha: `https://painel.fadeline.com.br/operador/barbearias/${id}` });

  it('um site: o assunto fixo, o endereço, a hora do cadastro, as horas de espera, a ficha e o prazo do dono', () => {
    const { assunto, texto } = avisos.textoDoLembrete([site('regularize-pix', local('2026-11-10T17:44:00'))], agora);
    expect(assunto).toBe('Site esperando a sua aprovação há mais de 20 horas');
    expect(texto).toContain(`O dono ouviu que o site abre em até ${PRAZO_DA_CONFERENCIA}, e ele ainda espera a sua aprovação:`);
    expect(texto).toContain('- regularize-pix: cadastrou em 10/11 às 17:44, há 20 horas\n');
    expect(texto).toContain('  https://painel.fadeline.com.br/operador/barbearias/7\n');
    expect(texto).toContain('Este é o único lembrete de cada site: depois dele, ele continua no Início do operador');
    // O endereço vai sem o domínio: com ele, o leitor de e-mail o transforma em link.
    expect(texto).not.toMatch(/regularize-pix\./);
  });

  it('vários: o assunto diz quantos, e cada um vem com a sua ficha, na ordem recebida', () => {
    const { assunto, texto } = avisos.textoDoLembrete([
      site('primeira', local('2026-11-10T08:00:00'), 3),
      site('segunda', local('2026-11-10T12:30:00'), 4),
    ], agora);
    expect(assunto).toBe('2 sites esperando a sua aprovação há mais de 20 horas');
    expect(texto).toMatch(/Os donos ouviram .* e estes ainda esperam/);
    expect(texto.indexOf('- primeira: cadastrou em 10/11 às 08:00, há 30 horas')).toBeGreaterThan(-1);
    expect(texto.indexOf('- primeira')).toBeLessThan(texto.indexOf('- segunda'));
    expect(texto).toContain('barbearias/3');
    expect(texto).toContain('barbearias/4');
    expect(texto).toMatch(/eles continuam no Início do operador/);
  });

  it('o endereço fora do formato do cadastro não entra no e-mail', () => {
    const { texto } = avisos.textoDoLembrete([site('Regularize <b>já</b>', local('2026-11-10T08:00:00'))], agora);
    expect(texto).not.toContain('Regularize');
    expect(texto).toContain('(endereço fora do formato — veja na ficha)');
  });

  it('sem o endereço do painel, o caminho por extenso', () => {
    const { texto } = avisos.textoDoLembrete([{ ...site('cortes', local('2026-11-10T08:00:00')), ficha: '' }], agora);
    expect(texto).toContain('  abra o painel do operador, em Barbearias');
  });
});

describe.skipIf(!TEM_BANCO)('a tarefa, contra o banco', () => {
  let sql: postgres.Sql;
  let email: typeof import('../src/lib/email.ts');
  const CADASTRO = local('2026-11-10T17:44:00');
  const iso = (d: Date) => d.toISOString();

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    const teste = iso(new Date(CADASTRO.getTime() + 10 * 24 * HORA));
    // 1: espera desde CADASTRO. 2: espera há pouco (5 horas depois do 1). 3: aprovado.
    // 4: encerrado sem aprovação. 5: tirado do ar à mão sem aprovação. 6: espera desde antes do 1.
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, created_at, site_aprovado_em) VALUES
      (1, 'regularize-pix', 'Barbearia Golpe Ltda', 'trial',     ${teste}, ${iso(CADASTRO)}, NULL),
      (2, 'recente',        'Barbearia Recente',    'trial',     ${teste}, ${iso(new Date(CADASTRO.getTime() + 5 * HORA))}, NULL),
      (3, 'aprovada',       'Barbearia Aprovada',   'trial',     ${teste}, ${iso(new Date(CADASTRO.getTime() - 48 * HORA))}, ${iso(CADASTRO)}),
      (4, 'encerrada',      'Barbearia Encerrada',  'cancelled', ${teste}, ${iso(new Date(CADASTRO.getTime() - 48 * HORA))}, NULL),
      (5, 'tirada',         'Barbearia Tirada',     'suspended', ${teste}, ${iso(new Date(CADASTRO.getTime() - 48 * HORA))}, NULL),
      (6, 'antiga',         'Barbearia Antiga',     'trial',     ${teste}, ${iso(new Date(CADASTRO.getTime() - 3 * HORA))}, NULL)`;
    await sql`SELECT setval('tenants_id_seq', 6)`;
    await sql`INSERT INTO barbers (tenant_id, name, slug, role, password_hash, active, email, phone) VALUES
      (1, 'Fulano Golpista', 'dono', 'admin', 'x', true, 'golpe@exemplo.com', '84999990001')`;
    email = await import('../src/lib/email.ts');
  }, 30_000);

  afterAll(async () => {
    await sql.end();
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  beforeEach(() => { email.caixaDeSaida.length = 0; });

  it('antes de 20 horas, nada', async () => {
    // 19h59 depois do mais antigo que espera (o 6).
    const quase = new Date(CADASTRO.getTime() - 3 * HORA + 20 * HORA - 60_000);
    expect(await avisos.lembrarSitesQueEsperam(quase, { env: ENV })).toBe(0);
    expect(email.caixaDeSaida).toHaveLength(0);
    expect((await sql`SELECT count(*)::int AS n FROM avisos_enviados`)[0].n).toBe(0);
  });

  it('sem o OPERADOR_EMAIL, nada sai e nada fica reservado — o lembrete espera a variável', async () => {
    const depois = new Date(CADASTRO.getTime() + 21 * HORA);
    expect(await avisos.lembrarSitesQueEsperam(depois, { env: { ...ENV, OPERADOR_EMAIL: '' } })).toBe(0);
    expect(await avisos.lembrarSitesQueEsperam(depois, { env: { ...ENV, OPERADOR_EMAIL: 'sem-arroba' } })).toBe(0);
    expect(email.caixaDeSaida).toHaveLength(0);
    expect((await sql`SELECT count(*)::int AS n FROM avisos_enviados`)[0].n).toBe(0);
  });

  it('o envio que falha não fica travado: a reserva é desfeita', async () => {
    const depois = new Date(CADASTRO.getTime() + 21 * HORA);
    const recusa = async () => { throw new Error('o provedor recusou'); };
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await avisos.lembrarSitesQueEsperam(depois, { env: ENV, enviar: recusa })).toBe(0);
    } finally {
      erro.mockRestore();
    }
    expect((await sql`SELECT count(*)::int AS n FROM avisos_enviados`)[0].n).toBe(0);
  });

  it('depois de 20 horas: um e-mail só, com os que passaram da hora, o mais antigo primeiro — para o operador', async () => {
    const depois = new Date(CADASTRO.getTime() + 21 * HORA);
    expect(await avisos.lembrarSitesQueEsperam(depois, { env: ENV })).toBe(2);
    expect(email.caixaDeSaida).toHaveLength(1);
    const [e] = email.caixaDeSaida;
    expect(e.para).toBe('operador@fadeline.com.br');
    expect(e.assunto).toBe('2 sites esperando a sua aprovação há mais de 20 horas');
    // A parte do operador no orçamento, sem barbearia: é um e-mail de vários sites.
    expect(e.tipo).toBe('operador');
    expect(e.barbearia).toBeNull();
    expect(e.texto.indexOf('- antiga:')).toBeGreaterThan(-1);
    expect(e.texto.indexOf('- antiga:')).toBeLessThan(e.texto.indexOf('- regularize-pix:'));
    expect(e.texto).toContain('https://painel.fadeline.com.br/operador/barbearias/1');
    expect(e.texto).toContain('https://painel.fadeline.com.br/operador/barbearias/6');
    // Quem espera há pouco, o aprovado, o encerrado e o tirado do ar à mão ficam de fora.
    for (const fora of ['recente', 'aprovada', 'encerrada', 'tirada']) expect(e.texto, fora).not.toContain(`- ${fora}:`);
    // Nada que a pessoa digitou: nem o nome da barbearia, nem o do dono, nem o telefone, nem o e-mail.
    for (const digitado of ['Golpe Ltda', 'Fulano', '84999990001', 'golpe@exemplo.com']) {
      expect(e.assunto + e.texto, digitado).not.toContain(digitado);
    }
    const travas = await sql`SELECT tenant_id, tipo, referencia FROM avisos_enviados ORDER BY tenant_id`;
    expect(travas.map((t) => [t.tenant_id, t.tipo])).toEqual([[1, 'operador-site-esperando'], [6, 'operador-site-esperando']]);
    expect(new Date(travas[0].referencia).getTime()).toBe(CADASTRO.getTime());
  });

  it('rodar de novo não repete — e o que passa da hora depois ganha o seu, sozinho', async () => {
    expect(await avisos.lembrarSitesQueEsperam(new Date(CADASTRO.getTime() + 22 * HORA), { env: ENV })).toBe(0);
    expect(email.caixaDeSaida).toHaveLength(0);
    // O 2 se cadastrou 5 horas depois do 1: passa das 20 horas às 26.
    expect(await avisos.lembrarSitesQueEsperam(new Date(CADASTRO.getTime() + 26 * HORA), { env: ENV })).toBe(1);
    expect(email.caixaDeSaida.map((e) => e.assunto)).toEqual(['Site esperando a sua aprovação há mais de 20 horas']);
    expect(email.caixaDeSaida[0].texto).toContain('- recente: cadastrou em 10/11 às 22:44, há 21 horas');
  });

  it('a tarefa de hora em hora roda o lembrete, e o resumo conta os lembrados', async () => {
    await sql`INSERT INTO tenants (id, slug, business_name, status, trial_ends_at, created_at, site_aprovado_em) VALUES
      (7, 'mais-uma', 'Barbearia Mais Uma', 'trial', ${iso(new Date(CADASTRO.getTime() + 10 * 24 * HORA))}, ${iso(CADASTRO)}, NULL)`;
    vi.stubEnv('OPERADOR_EMAIL', ENV.OPERADOR_EMAIL);
    vi.stubEnv('DOMINIO_BASE', 'fadeline.com.br');
    try {
      const resumo = await avisos.enviarAvisosPendentes(new Date(CADASTRO.getTime() + 27 * HORA));
      expect(resumo.lembradosAoOperador).toBe(1);
      expect(email.caixaDeSaida.filter((e) => e.tipo === 'operador').map((e) => e.para)).toEqual([ENV.OPERADOR_EMAIL]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
