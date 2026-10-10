/** Fumaça das rotas portadas: chama cada handler contra o Postgres de verdade. */
import { makeSessionCookie, SESSION_COOKIE } from '../src/lib/session.js';
import { sqlConn, db, first } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

let falhas = 0;
async function t(nome: string, fn: () => Promise<void>) {
  try { await fn(); console.log('  ok   ', nome); }
  catch (e) { falhas++; console.log('  FALHA', nome, '→', e instanceof Error ? e.message : e); }
}

const cookieAdmin = await makeSessionCookie({ barberId: 1, role: 'admin' });
const req = (url: string, init: RequestInit = {}) =>
  new Request(url, { ...init, headers: { cookie: cookieAdmin, 'content-type': 'application/json', ...(init.headers ?? {}) } });

const ctx = (url: string, init: RequestInit = {}, params: Record<string,string> = {}) =>
  ({ request: req(url, init), url: new URL(url), params, clientAddress: '127.0.0.1' } as any);

const corpo = async (r: Response) => ({ status: r.status, json: await r.json() as any });
const exigeOk = async (r: Response, ctxo: string) => {
  const b = await corpo(r);
  if (b.status >= 400) throw new Error(`${ctxo}: ${b.status} ${JSON.stringify(b.json)}`);
  return b.json;
};

// ── contagem / calendário ───────────────────────────────────────────────────
const { GET: count } = await import('../src/pages/api/admin/appointments/count.js');
await t('count.ts agrega o dia', async () => {
  const j = await exigeOk(await count!(ctx('http://x/api?date=2026-10-15')), 'count');
  if (typeof j.count !== 'number') throw new Error(`count veio ${typeof j.count}: ${j.count}`);
  if (j.count < 1) throw new Error(`esperava >=1, veio ${j.count}`);
  if (typeof j.maxModified !== 'string') throw new Error('maxModified não é string');
});
await t('count.ts filtra por barbeiro', async () => {
  const j = await exigeOk(await count!(ctx('http://x/api?date=2026-10-15&barber=2')), 'count');
  if (j.count !== 1) throw new Error(`esperava 1 do barbeiro 2, veio ${j.count}`);
});

const { GET: calendar } = await import('../src/pages/api/admin/appointments/calendar.js');
await t('calendar.ts agrupa por dia local de Fortaleza', async () => {
  const j = await exigeOk(await calendar!(ctx('http://x/api?month=2026-10')), 'calendar');
  const dias = Object.keys(j.days);
  if (!dias.includes('2026-10-15')) throw new Error(`dias: ${JSON.stringify(j.days)}`);
  if (typeof j.days['2026-10-15'] !== 'number') throw new Error('qty não virou número');
});

// ── busca ───────────────────────────────────────────────────────────────────
const { GET: search } = await import('../src/pages/api/admin/appointments/search.js');
await t('search.ts acha por telefone', async () => {
  const j = await exigeOk(await search!(ctx('http://x/api?q=99999')), 'search');
  if (j.results.length === 0) throw new Error('não achou nada por telefone');
});
await t('search.ts acha nome ignorando maiúsculas (ILIKE)', async () => {
  const j = await exigeOk(await search!(ctx('http://x/api?q=cliente')), 'search');
  if (j.results.length === 0) throw new Error('ILIKE não pegou "cliente" vs "Cliente"');
});

// ── ficha do cliente ────────────────────────────────────────────────────────
const alvo = await first(db.execute<{id:number}>(sql`SELECT id FROM appointments WHERE customer_phone='85999990003'`));
const { GET: history } = await import('../src/pages/api/admin/appointments/[id]/history.js');
await t('history.ts monta a ficha com agregados numéricos', async () => {
  const j = await exigeOk(await history!(ctx('http://x/api', {}, { id: String(alvo!.id) })), 'history');
  for (const k of ['totalCount','completedCount','noShowCount','totalSpentCents']) {
    if (typeof j.stats[k] !== 'number') throw new Error(`stats.${k} é ${typeof j.stats[k]} (${j.stats[k]})`);
  }
  if (typeof j.total !== 'number') throw new Error('total não é número');
});

// ── edição de cliente ───────────────────────────────────────────────────────
const { PATCH: patchCustomer } = await import('../src/pages/api/admin/appointments/[id]/customer.js');
await t('customer.ts propaga e devolve contagem', async () => {
  const j = await exigeOk(await patchCustomer!(ctx('http://x/api', {
    method: 'PATCH',
    body: JSON.stringify({ customerName: 'Cliente Tres Editado', customerPhone: '85999990003', customerBirthdate: '1992-02-02' }),
  }, { id: String(alvo!.id) })), 'customer');
  if (j.updated !== 1) throw new Error(`updated=${j.updated}`);
  if (j.propagated !== true) throw new Error('devia propagar');
  const r = await first(db.execute<{customer_name:string}>(sql`SELECT customer_name FROM appointments WHERE id=${alvo!.id}`));
  if (r!.customer_name !== 'Cliente Tres Editado') throw new Error('não gravou o nome');
});

// ── login do cliente ────────────────────────────────────────────────────────
const { POST: loginCliente } = await import('../src/pages/api/customer/login.js');
await t('customer/login.ts aceita telefone + nascimento certos', async () => {
  const r = await loginCliente!(ctx('http://x/api', { method: 'POST', body: JSON.stringify({ phone: '85999990003', birthdate: '1992-02-02' }) }));
  if (r.status !== 200) throw new Error(`${r.status} ${await r.text()}`);
});
await t('customer/login.ts recusa nascimento errado', async () => {
  const r = await loginCliente!(ctx('http://x/api', { method: 'POST', body: JSON.stringify({ phone: '85999990003', birthdate: '1980-01-01' }) }));
  if (r.status !== 404) throw new Error(`esperava 404, veio ${r.status}`);
});

// ── horários (transação replace) ────────────────────────────────────────────
const { PUT: putHoras } = await import('../src/pages/api/admin/working-hours/index.js');
await t('working-hours.ts troca as janelas numa transação', async () => {
  const j = await exigeOk(await putHoras!(ctx('http://x/api', {
    method: 'PUT',
    body: JSON.stringify({ barberId: 2, hours: [
      { weekday: 1, startTime: '08:00', endTime: '12:00' },
      { weekday: 1, startTime: '14:00', endTime: '18:00' },
    ] }),
  })), 'working-hours');
  if (j.saved !== 2) throw new Error(`saved=${j.saved}`);
  const n = await first(db.execute<{c:string}>(sql`SELECT COUNT(*) c FROM working_hours WHERE barber_id=2`));
  if (Number(n!.c) !== 2) throw new Error(`ficaram ${n!.c} janelas, esperava 2`);
});
await t('working-hours.ts com lista vazia apaga tudo', async () => {
  await exigeOk(await putHoras!(ctx('http://x/api', { method: 'PUT', body: JSON.stringify({ barberId: 2, hours: [] }) })), 'working-hours');
  const n = await first(db.execute<{c:string}>(sql`SELECT COUNT(*) c FROM working_hours WHERE barber_id=2`));
  if (Number(n!.c) !== 0) throw new Error(`sobraram ${n!.c}`);
});

// ── upsert barber_services (ON CONFLICT precisa do unique) ──────────────────
const { PUT: putBS } = await import('../src/pages/api/admin/barber-services/[serviceId].js');
await t('barber-services upsert usa o unique de verdade', async () => {
  await exigeOk(await putBS!(ctx('http://x/api', { method: 'PUT', body: JSON.stringify({ active: true, durationMinutes: 45, barberId: 1 }) }, { serviceId: '1' })), 'bs');
  const r = await first(db.execute<{duration_minutes:number}>(sql`SELECT duration_minutes FROM barber_services WHERE barber_id=1 AND service_id=1`));
  if (r!.duration_minutes !== 45) throw new Error(`duração ${r!.duration_minutes}`);
});

// ── produtos (uniqueSlug em loop) ───────────────────────────────────────────
const { POST: postProduto } = await import('../src/pages/api/admin/products/index.js');
await t('products.ts gera slug único sem laço infinito', async () => {
  const fd = () => { const f = new FormData(); f.set('name','Pomada'); f.set('shortDesc','d'); f.set('price','10,00'); f.set('active','true'); return f; };
  for (let i = 0; i < 2; i++) {
    const r = await postProduto!({ request: new Request('http://x/api', { method:'POST', headers:{cookie:cookieAdmin}, body: fd() }), url: new URL('http://x/api'), params:{} } as any);
    if (r.status >= 400) throw new Error(`${r.status} ${await r.text()}`);
  }
  const rows = await db.execute<{slug:string}>(sql`SELECT slug FROM products ORDER BY id`);
  const slugs = rows.map(r => r.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error(`slugs repetidos: ${slugs}`);
  if (!slugs.includes('pomada-2')) throw new Error(`esperava pomada-2, veio ${slugs}`);
});

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`);
await sqlConn.end();
process.exit(falhas === 0 ? 0 : 1);
