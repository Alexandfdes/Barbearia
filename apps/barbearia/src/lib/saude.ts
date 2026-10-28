/**
 * A pergunta do monitor externo: o app está de pé e alcança o banco?
 * (`PENDENCIAS-ABERTAS.md` §3.4 — feito em 11/10/2026.)
 *
 * Até aqui, se o produto caísse num sábado de manhã, o dono do produto ficava
 * sabendo quando um barbeiro ligasse. O monitor — UptimeRobot, Better Stack ou
 * outro, escolha dele — chama `GET /api/saude` a cada poucos minutos e avisa no
 * celular quando a resposta deixa de ser 200.
 *
 * ── O QUE ELA CONFERE, E O QUE NÃO ───────────────────────────────────────────
 *
 * Responder já prova o processo de pé (o `startup.mjs` não deixa o servidor subir
 * com migration falhando). O `SELECT 1` prova o banco alcançável, com prazo: um
 * banco que trava em vez de recusar deixaria o monitor esperando — e esperar não é
 * resposta. Com 3 segundos sem resposta, é 503.
 *
 * NÃO confere o certificado nem o endereço de cada barbearia — para isso, o
 * monitor chama também o site de uma delas. E não diz nada além de "ok" ou "o
 * banco": a rota é pública, e o motivo detalhado vai para o log, não para quem
 * pergunta.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export type Saude = { ok: true } | { ok: false; falha: 'banco' };

/** Quanto o monitor espera o banco antes de dar o app por doente. */
export const PRAZO_DO_BANCO_MS = 3000;

export async function saudeDoApp(
  consultar: () => Promise<unknown> = () => db.execute(sql`SELECT 1`),
  prazoMs: number = PRAZO_DO_BANCO_MS,
): Promise<Saude> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      consultar(),
      new Promise((_, falha) => {
        relogio = setTimeout(() => falha(new Error(`sem resposta em ${prazoMs} ms`)), prazoMs);
      }),
    ]);
    return { ok: true };
  } catch (erro) {
    console.error(`[saude] o banco não respondeu: ${erro instanceof Error ? erro.message : String(erro)}`);
    return { ok: false, falha: 'banco' };
  } finally {
    clearTimeout(relogio);
  }
}
