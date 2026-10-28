// O app não pode travar por falta de conexão — 26/10/2026.
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// Havia um pool só. `comTenant` reservava uma conexão dele para a requisição e,
// no meio dela, `sqlConn`/`dbDono` pediam outra ao MESMO pool (trocar o fuso, a
// tela de assinatura, o cancelar). Com `max` requisições assim ao mesmo tempo,
// cada uma segurava a sua e esperava uma que só as outras liberariam — sem prazo.
// Reproduzido na varredura de 26/10: 12 trocas de fuso simultâneas deixaram todas
// as barbearias sem resposta até reiniciar o container; com pool de 1, bastava uma.
//
// Os casos rodam com pools mínimos de propósito: é onde a trava aparecia primeiro.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { exigirBancoDeTeste } from './guardaBanco.js';
import { recriarSchema } from './migrations.js';

const TEM_BANCO = Boolean(process.env.DATABASE_URL);
if (TEM_BANCO) exigirBancoDeTeste(process.env.DATABASE_URL);

const ANTES = {
  max: process.env.DATABASE_POOL_MAX,
  dono: process.env.DATABASE_POOL_DONO_MAX,
  espera: process.env.DATABASE_ESPERA_MS,
};
process.env.DATABASE_POOL_MAX = '2';
process.env.DATABASE_POOL_DONO_MAX = '1';
process.env.DATABASE_ESPERA_MS = '1500';

const ALFA = { id: 1, slug: 'alfa', status: 'active', domain: null };

let mod: typeof import('../src/db/index.js');

/** Resolve com o valor, ou com 'TRAVOU' se passar do prazo. */
function comPrazo<T>(p: Promise<T>, ms: number): Promise<T | 'TRAVOU'> {
  return Promise.race([p, new Promise<'TRAVOU'>((r) => setTimeout(() => r('TRAVOU'), ms))]);
}

beforeAll(async () => {
  if (!TEM_BANCO) return;
  const conn = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  await recriarSchema(conn);
  await conn`INSERT INTO tenants (id, slug, business_name, status) VALUES (1, 'alfa', 'Barbearia Alfa', 'active')`;
  await conn.end({ timeout: 5 });
  mod = await import('../src/db/index.js');
}, 30_000);

afterAll(async () => {
  for (const [k, v] of [['DATABASE_POOL_MAX', ANTES.max], ['DATABASE_POOL_DONO_MAX', ANTES.dono], ['DATABASE_ESPERA_MS', ANTES.espera]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  if (TEM_BANCO) await mod.sqlConn.end({ timeout: 5 });
});

describe.skipIf(!TEM_BANCO)('o pool não trava', () => {
  it('a requisição que consulta pelo dono, com o pool das requisições cheio, termina', async () => {
    const { comTenant, sqlConn } = mod;
    // Mais requisições do que conexões reservadas, todas pedindo ao dono no meio —
    // o padrão de `definirFusoDaBarbearia` e de `linhaDaBarbearia`.
    const pedidos = Array.from({ length: 8 }, () => comTenant(ALFA, async () => {
      await new Promise((r) => setTimeout(r, 20));
      const [l] = await sqlConn<{ n: number }[]>`SELECT 1::int AS n`;
      await sqlConn`UPDATE tenants SET timezone = 'America/Fortaleza' WHERE id = 1`;
      return l.n;
    }).catch((e: Error) => e.message));
    const r = await comPrazo(Promise.all(pedidos), 10_000);
    expect(r).not.toBe('TRAVOU');
    // Nenhuma desistiu por prazo: com dois pools não há fila sem fim.
    expect(r).toEqual(Array(8).fill(1));
  }, 20_000);

  it('depois disso o app continua respondendo', async () => {
    const r = await comPrazo(mod.comTenant(ALFA, () => mod.sqlConn`SELECT 1`), 5_000);
    expect(r).not.toBe('TRAVOU');
  });

  it('pool das requisições cheio: quem passa do prazo recebe erro, e a conexão não fica presa', async () => {
    const { comTenant, sqlConn } = mod;
    let soltar!: () => void;
    const presas = new Promise<void>((r) => { soltar = r; });
    // As duas conexões reservadas, seguradas.
    const segurando = [comTenant(ALFA, () => presas), comTenant(ALFA, () => presas)];
    await new Promise((r) => setTimeout(r, 100));

    const atrasada = await comTenant(ALFA, () => sqlConn`SELECT 1`).then(() => 'ok', (e: Error) => e.message);
    expect(atrasada).toMatch(/Nenhuma conexão com o banco livre/);

    soltar();
    await Promise.all(segurando);
    // O pedido que desistiu não levou uma conexão embora: as DUAS servem ao mesmo
    // tempo — cada requisição só termina quando a outra também conseguiu a sua.
    await new Promise((r) => setTimeout(r, 200));
    let chegaram = 0;
    let liberar!: () => void;
    const todas = new Promise<void>((r) => { liberar = r; });
    const juntas = () => comTenant(ALFA, async () => {
      if (++chegaram === 2) liberar();
      await todas;
    });
    const r = await comPrazo(Promise.all([juntas(), juntas()]).then(() => 'ok', (e: Error) => e.message), 5_000);
    expect(r).toBe('ok');
  }, 20_000);
});
