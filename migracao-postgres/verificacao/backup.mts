import { makeSessionCookie } from '../src/lib/session.js';
import { sqlConn } from '../src/db/index.js';
const { GET } = await import('../src/pages/api/admin/backup.js');
const cookie = await makeSessionCookie({ barberId: 1, role: 'admin' });
const r = await GET!({ request: new Request('http://x/api/admin/backup', { headers: { cookie } }), url: new URL('http://x/api/admin/backup'), params: {} } as any);
console.log('status', r.status, r.headers.get('content-disposition'));
const txt = await r.text();
if (r.status !== 200) { console.log(txt); process.exit(1); }
console.log('bytes', txt.length);
for (const t of ['CREATE TABLE public.appointments', 'COPY public.barbers', 'Cliente Um']) {
  console.log(txt.includes(t) ? `  ok    contém: ${t}` : `  FALHA  falta: ${t}`);
}
console.log(txt.includes('OWNER TO') ? '  FALHA  dump tem OWNER (deveria vir sem)' : '  ok    sem OWNER, restaura em qualquer usuário');
// Barbeiro comum não pode baixar o banco inteiro.
const cookieBarbeiro = await makeSessionCookie({ barberId: 2, role: 'barber' });
const r2 = await GET!({ request: new Request('http://x/', { headers: { cookie: cookieBarbeiro } }), url: new URL('http://x/'), params: {} } as any);
console.log(r2.status === 403 ? '  ok    barbeiro comum recebe 403' : `  FALHA  barbeiro recebeu ${r2.status}`);
await sqlConn.end();
