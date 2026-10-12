// A carência da cobrança estendida pelo operador — migration 0016, `lib/situacao.ts`
// e `estenderCarencia` em `lib/operadorBarbearias.ts` (decisão de 12/10/2026).
//
// ── O QUE ISTO SEGURA ────────────────────────────────────────────────────────
//
//  - a fase usa o fim novo — e só se ele for DEPOIS dos 3 dias: estender não encurta;
//  - quem lê o começo do atraso para decidir a fase lê também a extensão: um leitor
//    esquecido tiraria do ar, ou mandaria "o site saiu do ar", quem ganhou prazo;
//  - a extensão vale para UM atraso: pagou, ou atrasou de novo, o banco a apaga —
//    sem depender de cada um dos cinco lugares do código que mexem no atraso.
//
// As rotas do operador estão em `tests/operador.test.ts`; o webhook e o cancelar,
// em `tests/cobranca.test.ts`; o e-mail, em `tests/avisos.test.ts`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { fromZonedTime } from 'date-fns-tz';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { migrationSql, recriarSchema } from './migrations.js';
import {
  situacaoDe, fimDaCarencia, fimDaCarenciaDoAtraso, fimDoPrazoEstendido, fimDoTesteEstendido, ultimoDia, noAr,
} from '../src/lib/situacao';
import { avisoDevido } from '../src/lib/avisos';
import { avisoDoPainel, explicacaoDaSituacao } from '../src/lib/assinatura';
import { descreverAcao, faseNaTela } from '../src/lib/operadorBarbearias';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const FORTALEZA = 'America/Fortaleza';
const local = (quando: string) => fromZonedTime(quando, FORTALEZA);

// A cobrança falhou no dia 10, às 10:37: os 3 dias são 11, 12 e 13 — fora do ar no 14.
const FALHOU = local('2026-10-10T10:37:00');
const FIM_DOS_3_DIAS = local('2026-10-14T00:00:00');
// No dia 12, o operador dá 5 dias depois do último dia (13): até o fim do 18.
const NO_DIA_12 = local('2026-10-12T12:00:00');
const ESTENDIDA = fimDoPrazoEstendido(FIM_DOS_3_DIAS, 5, FORTALEZA, NO_DIA_12);

const atrasada = (carenciaAte: Date | null, agora: Date) =>
  situacaoDe({ status: 'past_due', atrasadaDesde: FALHOU, carenciaAte, fuso: FORTALEZA }, agora);

describe('a regra (`lib/situacao.ts`)', () => {
  it('a conta: 5 dias depois do último dia da carência — o mesmo jeito de estender o teste', () => {
    expect(fimDaCarencia(FALHOU, FORTALEZA).toISOString()).toBe(FIM_DOS_3_DIAS.toISOString());
    expect(ESTENDIDA.toISOString()).toBe(local('2026-10-19T00:00:00').toISOString());
    expect(ultimoDia(ESTENDIDA, FORTALEZA)).toBe('18/10');
    // Vencida no dia 16: conta de hoje, como o teste vencido.
    expect(ultimoDia(fimDoPrazoEstendido(FIM_DOS_3_DIAS, 2, FORTALEZA, local('2026-10-16T09:00:00')), FORTALEZA)).toBe('18/10');
    expect(fimDoTesteEstendido(FIM_DOS_3_DIAS, 5, FORTALEZA, NO_DIA_12).getTime()).toBe(ESTENDIDA.getTime());
  });

  it('estendida: no ar até o fim novo — e a tela diz que foi estendida', () => {
    const s = atrasada(ESTENDIDA, local('2026-10-16T10:00:00'));
    expect(s).toEqual({ fase: 'carencia', motivo: 'cobranca', ate: ESTENDIDA, estendida: true });
    expect(noAr(s)).toBe(true);
    expect(faseNaTela(s, FORTALEZA).detalhe).toBe('a cobrança falhou · no ar até 18/10 (estendida)');
  });

  it('acabou a estendida: fora do ar desde o fim NOVO', () => {
    expect(atrasada(ESTENDIDA, local('2026-10-19T00:30:00'))).toEqual({ fase: 'suspensa', motivo: 'cobranca', desde: ESTENDIDA });
  });

  it('um fim ANTES dos 3 dias não encurta nada — e sem extensão, nada muda', () => {
    const cedo = local('2026-10-12T00:00:00');
    expect(fimDaCarenciaDoAtraso({ atrasadaDesde: FALHOU, carenciaAte: cedo, fuso: FORTALEZA })).toEqual(FIM_DOS_3_DIAS);
    expect(atrasada(cedo, local('2026-10-13T10:00:00'))).toEqual({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DOS_3_DIAS });
    expect(atrasada(null, local('2026-10-13T10:00:00'))).toEqual({ fase: 'carencia', motivo: 'cobranca', ate: FIM_DOS_3_DIAS });
    expect(atrasada(null, local('2026-10-14T00:00:01'))).toMatchObject({ fase: 'suspensa', desde: FIM_DOS_3_DIAS });
  });

  it('o teste não lê a extensão da cobrança — o teste se estende pelo teste', () => {
    const fimDoTeste = local('2026-10-10T00:00:00');
    const s = situacaoDe({ status: 'trial', testeAte: fimDoTeste, carenciaAte: ESTENDIDA, fuso: FORTALEZA }, local('2026-10-16T10:00:00'));
    expect(s).toMatchObject({ fase: 'suspensa', motivo: 'teste' });
  });

  it('o dono lê a data nova — na faixa do painel, na tela de assinatura e no e-mail', () => {
    const agora = local('2026-10-16T10:00:00');
    const s = atrasada(ESTENDIDA, agora);
    expect(avisoDoPainel(s, FORTALEZA, agora)?.texto).toBe('A cobrança não passou. Atualize o cartão até 18/10 para o site continuar no ar.');
    expect(explicacaoDaSituacao(s, FORTALEZA, agora)).toContain('O site continua no ar até 18/10.');
    // O aviso por e-mail é o da carência, com o prazo novo — não "o site saiu do ar".
    expect(avisoDevido(s, FORTALEZA, agora)).toEqual({ tipo: 'cobranca-falhou', referencia: ESTENDIDA });
    expect(avisoDevido(atrasada(ESTENDIDA, local('2026-10-19T08:00:00')), FORTALEZA, local('2026-10-19T08:00:00')))
      .toEqual({ tipo: 'fora-do-ar', referencia: ESTENDIDA });
  });

  it('o registro em português', () => {
    expect(descreverAcao({
      acao: 'estendeu-carencia', slug: 'ze', ip: null, quando: null, fuso: FORTALEZA,
      detalhe: { dias: 5, antes: FIM_DOS_3_DIAS.toISOString(), depois: ESTENDIDA.toISOString() },
    })).toBe('Estendeu a carência de ze em 5 dias (até 18/10)');
  });
});

// ── Quem decide a fase lê a extensão ────────────────────────────────────────

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(astro|ts|mts|mjs)$/.test(nome) ? [caminho] : [];
  });
}

/**
 * Os pedaços que montam a fase a partir da linha da barbearia sem ler a extensão:
 * um `atrasadaDesde: <tabela>.pastDueSince` do Drizzle, ou um
 * `atrasadaDesde: comoData(<linha>.past_due_since)` de SQL cru, sem o `carenciaAte`
 * ao lado — ou um arquivo que chama `situacaoDe` e lê `past_due_since` sem ler
 * `carencia_ate`.
 */
function leitoresSemExtensao(nome: string, texto: string): string[] {
  const achados: string[] = [];
  const perto = (i: number) => texto.slice(Math.max(0, i - 300), i + 300);
  for (const m of texto.matchAll(/atrasadaDesde:\s*(\w+)\.pastDueSince/g)) {
    if (!new RegExp(`carenciaAte:\\s*${m[1]}\\.carenciaAte`).test(perto(m.index!))) achados.push(`${nome}: ${m[0]}`);
  }
  for (const m of texto.matchAll(/atrasadaDesde:\s*comoData\((\w+)\.past_due_since\)/g)) {
    if (!new RegExp(`carenciaAte:\\s*comoData\\(${m[1]}\\.carencia_ate\\)`).test(perto(m.index!))) achados.push(`${nome}: ${m[0]}`);
  }
  if (texto.includes('situacaoDe(') && /past_due_since/.test(texto) && !/carencia_ate/.test(texto)) {
    achados.push(`${nome}: lê past_due_since e não carencia_ate`);
  }
  return achados;
}

describe('quem decide a fase lê a extensão', () => {
  it('controle: o critério pega o leitor esquecido — e deixa passar o completo', () => {
    const drizzleSem = 'db.select({ status: tenants.status, atrasadaDesde: tenants.pastDueSince, fuso: tenants.timezone })';
    const drizzleCom = 'db.select({ atrasadaDesde: tenants.pastDueSince, carenciaAte: tenants.carenciaAte })';
    const sqlSem = 'situacaoDe(t); SELECT past_due_since FROM tenants';
    const cruSem = 'carencia_ate; situacaoDe({ atrasadaDesde: comoData(l.past_due_since), encerraEm: comoData(l.subscription_ends_at) })';
    const cruCom = 'situacaoDe({ atrasadaDesde: comoData(l.past_due_since), carenciaAte: comoData(l.carencia_ate) })';
    expect(leitoresSemExtensao('a', drizzleSem)).toHaveLength(1);
    expect(leitoresSemExtensao('b', drizzleCom)).toEqual([]);
    expect(leitoresSemExtensao('e', cruSem)).toHaveLength(1);
    expect(leitoresSemExtensao('f', cruCom)).toEqual([]);
    expect(leitoresSemExtensao('c', sqlSem)).toHaveLength(1);
    expect(leitoresSemExtensao('d', `${sqlSem}, carencia_ate`)).toEqual([]);
  });

  it('nenhum arquivo do app monta a fase sem a carência estendida', () => {
    const lidos = arquivos('src').filter((f) => /pastDueSince|past_due_since/.test(readFileSync(f, 'utf8')));
    expect(lidos.length).toBeGreaterThanOrEqual(6); // achou os leitores
    expect(lidos.flatMap((f) => leitoresSemExtensao(f, readFileSync(f, 'utf8')))).toEqual([]);
  });
});

// ── O banco: a extensão vale para um atraso só ──────────────────────────────

describe.skipIf(!TEM_BANCO)('o banco (migration 0016)', () => {
  let sql: ReturnType<typeof postgres>;
  const linha = async () => (await sql`SELECT status, past_due_since, carencia_ate FROM tenants WHERE id = 1`)[0];

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    await recriarSchema(sql);
    await sql`INSERT INTO tenants (id, slug, business_name, status, past_due_since)
              VALUES (1, 'atrasada', 'Atrasada', 'past_due', ${FALHOU.toISOString()})`;
  }, 60_000);

  afterAll(async () => { await sql?.end({ timeout: 5 }); });

  it('carência estendida só existe com atraso — o banco recusa a solta', async () => {
    await sql`INSERT INTO tenants (id, slug, business_name, status) VALUES (2, 'em-dia', 'Em Dia', 'active')`;
    const erro = await sql`UPDATE tenants SET carencia_ate = ${ESTENDIDA.toISOString()} WHERE id = 2`.catch((e) => e);
    expect(erro).toMatchObject({ code: '23514', constraint_name: 'tenants_carencia_so_com_atraso' });
  });

  it('no mesmo atraso a extensão fica — tirar do ar, reativar, a cobrança que falha de novo', async () => {
    await sql`UPDATE tenants SET carencia_ate = ${ESTENDIDA.toISOString()} WHERE id = 1`;
    await sql`UPDATE tenants SET status = 'suspended' WHERE id = 1`;
    // O reativar regrava o mesmo começo do atraso (`lib/operadorBarbearias.ts`).
    await sql`UPDATE tenants SET status = 'past_due', past_due_since = ${FALHOU.toISOString()} WHERE id = 1`;
    expect((await linha()).carencia_ate?.toISOString()).toBe(ESTENDIDA.toISOString());
  });

  it('pagou: o banco apaga a extensão — e o atraso seguinte começa com os 3 dias, não com a de antes', async () => {
    await sql`UPDATE tenants SET status = 'active', past_due_since = NULL WHERE id = 1`;
    expect(await linha()).toMatchObject({ status: 'active', past_due_since: null, carencia_ate: null });

    await sql`UPDATE tenants SET status = 'past_due', past_due_since = ${local('2026-10-15T09:00:00').toISOString()} WHERE id = 1`;
    expect((await linha()).carencia_ate).toBeNull();
  });

  it('atrasou de novo sem pagar no meio — o começo mudou: a extensão do atraso velho também cai', async () => {
    await sql`UPDATE tenants SET carencia_ate = ${local('2026-10-25T00:00:00').toISOString()} WHERE id = 1`;
    await sql`UPDATE tenants SET past_due_since = ${local('2026-10-20T09:00:00').toISOString()} WHERE id = 1`;
    expect((await linha()).carencia_ate).toBeNull();
  });

  it('rodar a 0016 de novo não estraga nada — nem apaga a extensão em vigor', async () => {
    await sql`UPDATE tenants SET carencia_ate = ${local('2026-10-30T00:00:00').toISOString()} WHERE id = 1`;
    await sql.unsafe(migrationSql('0016_carencia_estendida.sql'));
    expect((await linha()).carencia_ate?.toISOString()).toBe(local('2026-10-30T00:00:00').toISOString());
    // E o registro do operador aceita a ação nova.
    await sql`INSERT INTO acoes_do_operador (tenant_id, acao, detalhe) VALUES (1, 'estendeu-carencia', '{}'::jsonb)`;
  });
});
