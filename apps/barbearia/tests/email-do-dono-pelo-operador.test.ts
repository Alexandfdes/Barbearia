// O operador troca o e-mail do dono (05/11/2026, `trocarEmailDoDono` em `src/lib/operadorBarbearias.ts`).
//
// POR QUE ESTE TESTE EXISTE
//
// O "esqueci" só manda para e-mail confirmado (migration 0019). Quem esqueceu a senha com o e-mail
// errado, ou sem nunca confirmar, não tinha saída — só SQL no console do servidor (revisão de
// 05/11/2026, 🟠 5). A ação nova é a saída, e é também a porta de um golpe: quem pede pelo WhatsApp
// pode não ser o dono. Estes casos seguram o que a fecha e o que ela tem de fazer:
//
//  - a troca volta a confirmação para nula, mata os links de senha nova e manda o link de
//    confirmação ao endereço NOVO — sem o limite de pedidos por pessoa, que não é para o operador;
//  - o endereço antigo, se confirmado, recebe o aviso — e o aviso diz que foi o suporte, e o que
//    fazer se não foi ele que pediu;
//  - o mesmo e-mail, sem confirmar, só manda o link de novo; confirmado, recusa;
//  - a ficha manda o dono que mostrou: se ele não é mais o dono, recusa;
//  - a rota recusa sem a caixa "conferi pelo WhatsApp do login";
//  - o registro guarda os dois e-mails mascarados, nunca inteiros.
//
// Precisa de Postgres. Sem DATABASE_URL a suíte é pulada.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);
process.env.SESSION_SECRET ??= 'segredo-de-teste-com-mais-de-32-caracteres-ok';

const AGORA = new Date('2026-11-06T15:00:00Z');
const dominioAntes = process.env.DOMINIO_BASE;

describe.skipIf(!TEM_BANCO)('o operador troca o e-mail do dono', () => {
  let sql: ReturnType<typeof postgres>;
  let op: typeof import('../src/lib/operadorBarbearias.js');
  let email: typeof import('../src/lib/email.js');
  let conf: typeof import('../src/lib/confirmacaoDeEmail.js');

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES
                (1, 'digitou-errado', 'Digitou Errado', 'active'),
                (2, 'confirmada', 'Confirmada', 'active'),
                (3, 'esqueceu', 'Esqueceu', 'active'),
                (4, 'saiu', 'Saiu', 'cancelled'),
                (5, 'dois-donos', 'Dois Donos', 'active')`;
    await sql`INSERT INTO settings (tenant_id, business_name, short_name, whatsapp_number, address_street, address_city) VALUES
                (1, 'Digitou Errado', 'Errado', '5584999990001', 'Rua A, 1', 'Natal/RN'),
                (2, 'Confirmada', 'Confirmada', '5584999990002', 'Rua B, 2', 'Natal/RN'),
                (3, 'Esqueceu', 'Esqueceu', '5584999990003', 'Rua C, 3', 'Natal/RN')`;
    await sql`INSERT INTO barbers (id, tenant_id, name, slug, role, password_hash, active, phone, email, email_confirmado_em) VALUES
                (1, 1, 'Dono Errado', 'dono', 'admin', 'x', true, '84999990001', 'dono@gmial.com', NULL),
                (2, 2, 'Dona Confirmada', 'dona', 'admin', 'x', true, '84999990002', 'dona@antigo.com', ${AGORA.toISOString()}::timestamptz),
                (3, 3, 'Dono Esquecido', 'dono', 'admin', 'x', true, '84999990003', 'certo@exemplo.com', NULL),
                (4, 4, 'Dono que Saiu', 'dono', 'admin', 'x', true, '84999990004', 'saiu@exemplo.com', NULL),
                (5, 5, 'Primeiro Dono', 'dono', 'admin', 'x', true, '84999990005', 'primeiro@exemplo.com', NULL),
                (6, 5, 'Segundo Admin', 'segundo', 'admin', 'x', true, '84999990006', 'segundo@exemplo.com', NULL)`;
    await sql`SELECT setval('barbers_id_seq', 10)`;
    // Um link de senha nova pedido antes, ainda valendo, para a dona confirmada.
    await sql`INSERT INTO redefinicoes_de_senha (tenant_id, barber_id, token_hash, expira_em)
              VALUES (2, 2, 'hash-de-um-pedido-antigo', ${new Date(AGORA.getTime() + 30 * 60 * 1000).toISOString()}::timestamptz)`;
    // O dono que esqueceu já gastou os 5 pedidos de confirmação do dia, no endereço certo.
    for (let i = 1; i <= 5; i++) {
      await sql`INSERT INTO confirmacoes_de_email (tenant_id, barber_id, email, token_hash, expira_em, criada_em)
                VALUES (3, 3, 'certo@exemplo.com', ${`hash-gasto-${i}`}, ${new Date(AGORA.getTime() - i * 60 * 1000).toISOString()}::timestamptz,
                        ${new Date(AGORA.getTime() - i * 2 * 60 * 1000).toISOString()}::timestamptz)`;
    }

    process.env.DOMINIO_BASE = 'fadeline.com.br';
    op = await import('../src/lib/operadorBarbearias.js');
    email = await import('../src/lib/email.js');
    conf = await import('../src/lib/confirmacaoDeEmail.js');
  }, 60_000);

  afterAll(async () => {
    if (dominioAntes === undefined) delete process.env.DOMINIO_BASE; else process.env.DOMINIO_BASE = dominioAntes;
    await sql?.end({ timeout: 5 });
    const { sqlConn } = await import('../src/db/index.js');
    await sqlConn.end({ timeout: 5 });
  });

  beforeEach(() => {
    email.caixaDeSaida.length = 0;
    email.zerarOrcamentoDeEmail();
  });

  const ultimaAcao = async (tenantId: number) =>
    (await sql`SELECT acao, detalhe, ip FROM acoes_do_operador WHERE tenant_id = ${tenantId} ORDER BY id DESC LIMIT 1`)[0];
  const esperarCaixa = async (n: number) => {
    for (let i = 0; i < 50 && email.caixaDeSaida.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  };

  it('o e-mail digitado errado: troca, nasce não confirmado, e o link vai para o endereço novo', async () => {
    const r = await op.trocarEmailDoDono({
      tenantId: 1, barbeiroId: 1, email: '  Dono@Gmail.com ', motivo: 'digitou gmial no cadastro', ip: '1.1.1.1', agora: AGORA,
    });
    expect(r).toEqual({ slug: 'digitou-errado', confirmacao: 'enviado', avisouAntigo: false, reenvio: false });

    const [b] = await sql`SELECT email, email_confirmado_em FROM barbers WHERE id = 1`;
    expect(b).toEqual({ email: 'dono@gmail.com', email_confirmado_em: null });

    // Só o link de confirmação sai — o antigo nunca foi confirmado, e não recebe nada.
    expect(email.caixaDeSaida.map((e) => e.para)).toEqual(['dono@gmail.com']);
    expect(email.caixaDeSaida[0].texto).toMatch(/confirmar-email\?token=[A-Za-z0-9_-]{43}/);
    expect(email.caixaDeSaida[0]).toMatchObject({ tipo: 'seguranca', barbearia: 1 });

    const acao = await ultimaAcao(1);
    expect(acao.acao).toBe('trocou-email-do-dono');
    expect(acao.detalhe).toEqual({
      barbeiro: 1, nome: 'Dono Errado', antes: 'd***@gmial.com', depois: 'd***@gmail.com',
      antigoConfirmado: false, motivo: 'digitou gmial no cadastro',
    });
    // Mascarados: o registro nunca guarda o endereço inteiro.
    expect(JSON.stringify(acao.detalhe)).not.toMatch(/dono@/);
    expect(op.descreverAcao({ acao: acao.acao, detalhe: acao.detalhe, ip: null, quando: null, slug: 'digitou-errado', fuso: null }))
      .toBe('Trocou o e-mail do dono de digitou-errado: d***@gmial.com → d***@gmail.com. Motivo: digitou gmial no cadastro');

    // O link confirma o endereço novo — o caminho inteiro, até o "esqueci" voltar a funcionar.
    const token = /token=([A-Za-z0-9_-]{43})/.exec(email.caixaDeSaida[0].texto)![1];
    expect(await conf.confirmarEmail(token, AGORA)).toBe(true);
    const [depois] = await sql`SELECT email_confirmado_em FROM barbers WHERE id = 1`;
    expect(depois.email_confirmado_em).not.toBeNull();
  });

  it('o e-mail antigo confirmado: recebe o aviso, que diz que foi o suporte — e os links de senha nova morrem', async () => {
    const r = await op.trocarEmailDoDono({ tenantId: 2, barbeiroId: 2, email: 'dona@novo.com', ip: '1.1.1.1', agora: AGORA });
    expect(r).toMatchObject({ confirmacao: 'enviado', avisouAntigo: true, reenvio: false });
    await esperarCaixa(2);

    const [b] = await sql`SELECT email, email_confirmado_em FROM barbers WHERE id = 2`;
    expect(b).toEqual({ email: 'dona@novo.com', email_confirmado_em: null });
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM redefinicoes_de_senha WHERE barber_id = 2 AND usada_em IS NULL`;
    expect(n).toBe(0);

    const aviso = email.caixaDeSaida.find((e) => e.para === 'dona@antigo.com');
    expect(aviso).toBeDefined();
    expect(aviso!.texto).toMatch(/pelo suporte do Fadeline, a pedido feito pelo WhatsApp/);
    expect(aviso!.texto).toMatch(/Alguém pode ter se passado por você/);
    expect(aviso!.texto).toMatch(/Em Equipe, na sua linha, ponha uma senha nova/);
    expect(aviso!.texto).toMatch(/d\*\*\*@novo\.com/);   // o novo vai mascarado
    expect(aviso!.texto).not.toMatch(/dona@novo\.com/);
    expect(email.caixaDeSaida.find((e) => e.para === 'dona@novo.com')?.texto).toMatch(/confirmar-email\?token=/);
    expect((await ultimaAcao(2)).detalhe).toMatchObject({ antigoConfirmado: true });
  });

  it('o mesmo e-mail, sem confirmar, só manda o link de novo — mesmo com os 5 pedidos do dia gastos', async () => {
    const r = await op.trocarEmailDoDono({ tenantId: 3, barbeiroId: 3, email: 'certo@exemplo.com', ip: '1.1.1.1', agora: AGORA });
    expect(r).toEqual({ slug: 'esqueceu', confirmacao: 'enviado', avisouAntigo: false, reenvio: true });
    expect(email.caixaDeSaida.map((e) => e.para)).toEqual(['certo@exemplo.com']);
    const acao = await ultimaAcao(3);
    expect(acao.detalhe).toMatchObject({ reenvio: true, antes: 'c***@exemplo.com', depois: 'c***@exemplo.com' });
    expect(op.descreverAcao({ acao: acao.acao, detalhe: acao.detalhe, ip: null, quando: null, slug: 'esqueceu', fuso: null }))
      .toBe('Mandou de novo o link de confirmação ao e-mail do dono de esqueceu (c***@exemplo.com)');
    // O mesmo pedido, pelo dono, esbarra no limite do dia — é o operador que passa por cima.
    expect(await conf.pedirConfirmacao({ tenantId: 3, barberId: 3, agora: new Date(AGORA.getTime() + 2 * 60 * 1000) })).toBe('limite-do-dia');
  });

  it('recusa: o mesmo e-mail já confirmado, o e-mail inválido, a encerrada, e o dono que a ficha não mostrava', async () => {
    await sql`UPDATE barbers SET email_confirmado_em = ${AGORA.toISOString()}::timestamptz WHERE id = 3`;
    await expect(op.trocarEmailDoDono({ tenantId: 3, barbeiroId: 3, email: 'certo@exemplo.com', ip: '1.1.1.1', agora: AGORA }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/já é o e-mail do dono, e está confirmado/) });
    await expect(op.trocarEmailDoDono({ tenantId: 3, barbeiroId: 3, email: 'sem-arroba', ip: '1.1.1.1', agora: AGORA }))
      .rejects.toMatchObject({ status: 400 });
    await expect(op.trocarEmailDoDono({ tenantId: 4, barbeiroId: 4, email: 'novo@exemplo.com', ip: '1.1.1.1', agora: AGORA }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Encerrada/) });
    // O segundo admin não é "o dono": a ficha mostra o primeiro, e é ele que a troca confere.
    await expect(op.trocarEmailDoDono({ tenantId: 5, barbeiroId: 6, email: 'novo@exemplo.com', ip: '1.1.1.1', agora: AGORA }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/não é mais quem a ficha mostrava/) });
    const [b6] = await sql`SELECT email FROM barbers WHERE id = 6`;
    expect(b6.email).toBe('segundo@exemplo.com');
    // Nada recusado chegou ao registro, nem à caixa de saída.
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM acoes_do_operador WHERE tenant_id IN (4, 5)`;
    expect(n).toBe(0);
    expect(email.caixaDeSaida).toEqual([]);
  });

  it('a rota: sem a caixa "conferi pelo WhatsApp do login", recusa — e leva à função', () => {
    const rota = readFileSync('src/pages/api/operador/acao.ts', 'utf8');
    expect(rota).toMatch(/acao: z\.literal\('trocar-email-do-dono'\)[\s\S]*?conferido: z\.literal\(true\)/);
    expect(rota).toMatch(/'Antes de trocar, confira pelo WhatsApp do login que é o dono — e marque a caixa\.'/);
    expect(rota).toMatch(/await trocarEmailDoDono\(\{ tenantId: d\.barbearia, barbeiroId: d\.barbeiro, email: d\.email, motivo: d\.motivo, ip \}\)/);
    const acoes = readFileSync('src/components/operador/AcoesDaBarbearia.astro', 'utf8');
    expect(acoes).toContain('data-acao="trocar-email-do-dono"');
    expect(acoes).toMatch(/<input type="checkbox" name="conferido" required/);
    expect(acoes).toMatch(/escreva você para o WhatsApp do login/);
    const ficha = readFileSync('src/pages/operador/barbearias/[id].astro', 'utf8');
    expect(ficha).toMatch(/corpo\.conferido = form\.querySelector<HTMLInputElement>\('\[name="conferido"\]'\)\?\.checked === true;/);
  });
});
