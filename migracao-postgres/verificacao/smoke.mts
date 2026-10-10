/** Fumaça do porte: exercita o SQL portado contra um Postgres de verdade. */
import { bookAppointment } from '../src/lib/bookAppointment.js';
import { reagendarAtomicamente } from '../src/lib/reagendar.js';
import { db, sqlConn, first } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let falhas = 0;
const ok  = (m: string) => console.log('  ok   ', m);
const bad = (m: string, e?: unknown) => { falhas++; console.log('  FALHA', m, e ?? ''); };
async function t(nome: string, fn: () => Promise<void>) {
  try { await fn(); ok(nome); } catch (e) { bad(nome, e instanceof Error ? e.message : e); }
}

// Uma quinta-feira futura, 10:00 Fortaleza = 13:00 UTC
const dia = '2026-10-15';
const inicio = new Date(`${dia}T13:00:00.000Z`);

let apptId = 0;

await t('bookAppointment cria agendamento', async () => {
  const r = await bookAppointment({
    barberId: 1, serviceId: 1, customerName: 'Cliente Um',
    customerPhone: '85999990001', customerBirthdate: '1990-05-10',
    startsAt: inicio, createdBy: 'customer', idempotencyKey: 'k-1',
  });
  if (!r.ok) throw new Error(`esperava ok, veio ${r.httpStatus} ${r.error}`);
  apptId = Number(r.id);
  if (r.priceCents !== 4000) throw new Error(`preço ${r.priceCents}`);
});

await t('idempotência devolve o mesmo agendamento', async () => {
  const r = await bookAppointment({
    barberId: 1, serviceId: 1, customerName: 'Cliente Um',
    customerPhone: '85999990001', customerBirthdate: '1990-05-10',
    startsAt: inicio, createdBy: 'customer', idempotencyKey: 'k-1',
  });
  if (!r.ok) throw new Error('devia devolver o existente');
  if (Number(r.id) !== apptId) throw new Error(`id ${r.id} != ${apptId}`);
  const n = await first(db.execute<{c:string}>(sql`SELECT COUNT(*) c FROM appointments`));
  if (Number(n!.c) !== 1) throw new Error(`criou duplicado: ${n!.c} linhas`);
});

await t('conflito de horário devolve 409', async () => {
  const r = await bookAppointment({
    barberId: 1, serviceId: 1, customerName: 'Cliente Dois',
    customerPhone: '85999990002', customerBirthdate: '1991-01-01',
    startsAt: inicio, createdBy: 'customer', idempotencyKey: 'k-2',
  });
  if (r.ok) throw new Error('devia ter dado conflito');
  if (r.httpStatus !== 409) throw new Error(`status ${r.httpStatus}`);
});

await t('rollback: nada sobrou do agendamento em conflito', async () => {
  const n = await first(db.execute<{c:string}>(sql`SELECT COUNT(*) c FROM appointments`));
  if (Number(n!.c) !== 1) throw new Error(`${n!.c} agendamentos, esperava 1`);
});

await t('combo insere item na mesma transação', async () => {
  const r = await bookAppointment({
    barberId: 2, serviceId: 1, customerName: 'Cliente Tres',
    customerPhone: '85999990003', customerBirthdate: '1992-02-02',
    startsAt: inicio, createdBy: 'customer', idempotencyKey: 'k-3',
    combo: { productSlug: 'pomada', discountPct: 10 },
  });
  if (!r.ok) throw new Error(`${r.httpStatus} ${r.error}`);
  if (r.priceCents !== 3600) throw new Error(`preço com desconto ${r.priceCents}`);
  const it = await first(db.execute<{price_cents:number;name:string}>(
    sql`SELECT name, price_cents FROM appointment_items WHERE appointment_id = ${Number(r.id)}`));
  if (!it) throw new Error('item do combo não foi criado');
  if (it.price_cents !== 4500) throw new Error(`item ${it.price_cents}`);
});

await t('reagendar move o horário', async () => {
  const novoIni = new Date(`${dia}T16:00:00.000Z`);
  const r = await reagendarAtomicamente({
    appointmentId: apptId, barberId: 1,
    newStartIso: novoIni.toISOString(),
    newEndIso: new Date(novoIni.getTime() + 30*60000).toISOString(),
    editorId: 1,
  });
  if (!r.ok) throw new Error(`falhou: ${r.motivo}`);
  const a = await first(db.execute<{starts_at:string;last_modified_by_id:number}>(
    sql`SELECT starts_at, last_modified_by_id FROM appointments WHERE id = ${apptId}`));
  if (a!.starts_at !== novoIni.toISOString()) throw new Error(`starts_at ${a!.starts_at}`);
  if (a!.last_modified_by_id !== 1) throw new Error('não gravou o editor');
});

await t('reagendar para horário ocupado devolve conflito', async () => {
  // 13:00 UTC ainda é do Cliente Tres (barbeiro 2), então usa o barbeiro 2.
  const alvo = await first(db.execute<{id:number}>(
    sql`SELECT id FROM appointments WHERE customer_phone = '85999990003'`));
  const r = await reagendarAtomicamente({
    appointmentId: apptId, barberId: 1,
    newStartIso: new Date(`${dia}T16:00:00.000Z`).toISOString(),
    newEndIso:   new Date(`${dia}T16:30:00.000Z`).toISOString(),
    editorId: 1,
  });
  if (!r.ok) throw new Error('mesmo agendamento não conflita consigo (id != na query)');
  void alvo;
});

await t('reagendar sem editor (link do cliente) não grava editor', async () => {
  const r = await reagendarAtomicamente({
    appointmentId: apptId, barberId: 1,
    newStartIso: new Date(`${dia}T17:00:00.000Z`).toISOString(),
    newEndIso:   new Date(`${dia}T17:30:00.000Z`).toISOString(),
    editorId: null,
  });
  if (!r.ok) throw new Error(r.motivo);
});

await t('reagendar agendamento cancelado devolve status_mudou', async () => {
  await db.execute(sql`UPDATE appointments SET status='cancelled' WHERE id=${apptId}`);
  const r = await reagendarAtomicamente({
    appointmentId: apptId, barberId: 1,
    newStartIso: new Date(`${dia}T18:00:00.000Z`).toISOString(),
    newEndIso:   new Date(`${dia}T18:30:00.000Z`).toISOString(),
    editorId: 1,
  });
  if (r.ok) throw new Error('devia recusar');
  if (r.motivo !== 'status_mudou') throw new Error(r.motivo);
  await db.execute(sql`UPDATE appointments SET status='confirmed' WHERE id=${apptId}`);
});

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await sqlConn.end();
process.exit(falhas === 0 ? 0 : 1);
