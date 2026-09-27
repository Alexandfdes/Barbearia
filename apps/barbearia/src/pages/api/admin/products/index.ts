export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage } from '../../../../lib/uploads.js';
import { tenantDaSessao, type Tenant } from '../../../../lib/tenant.js';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'produto';
}

async function uniqueSlug(base: string, tenant: Tenant): Promise<string> {
  let slug = base, n = 2;
  while ((await db.select({ id: products.id }).from(products).where(and(eq(products.slug, slug), eq(products.tenantId, tenant.id)))).length > 0) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// GET — lista TODOS os produtos (inclui inativos) para o admin.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);

  const rows = await db.select().from(products)
    .where(eq(products.tenantId, tenant.id))
    .orderBy(products.sortOrder, products.id);
  return json(rows);
};

// POST — cria produto (multipart/form-data, com upload opcional de imagem).
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);

  const shortDesc = String(form.get('shortDesc') ?? '').trim().slice(0, 300) || null;

  const priceReais = parseFloat(String(form.get('price') ?? '').replace(',', '.'));
  if (!isFinite(priceReais) || priceReais < 0 || priceReais > 100000) {
    return json({ error: 'Preço inválido' }, 400);
  }
  const priceCents = Math.round(priceReais * 100);

  const active = String(form.get('active') ?? 'true') !== 'false';

  try {
    let image: string | null = null;
    const file = form.get('image');
    if (file && file instanceof File && file.size > 0) {
      const res = await saveProductImage(file, tenant);
      if ('error' in res) return json({ error: res.error }, 400);
      image = res.path;
    }

    const sorts = await db.select({ s: products.sortOrder }).from(products).where(eq(products.tenantId, tenant.id));
    const nextSort = (sorts.length ? Math.max(...sorts.map(r => r.s)) : 0) + 1;

    const slug = await uniqueSlug(slugify(name), tenant);

    const result = await db.insert(products).values({ tenantId: tenant.id,
      slug, name, shortDesc, priceCents, image, active, sortOrder: nextSort,
    }).returning({ id: products.id });

    return json({ ok: true, id: result[0].id, slug }, 201);
  } catch (err) {
    console.error('[api/admin/products POST]', err);
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    return json({ error: `Falha ao salvar produto: ${msg}` }, 500);
  }
};
