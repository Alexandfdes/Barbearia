export const prerender = false;

import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, first } from '../../../../db/index.js';
import { products } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { saveProductImage, apagarFotoProduto } from '../../../../lib/uploads.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

// PATCH — edita campos do produto (multipart/form-data). slug é estável (não muda).
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = await first(db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenant.id))));
  if (!current) return json({ error: 'Produto não encontrado' }, 404);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Formulário inválido' }, 400); }

  const updates: Partial<typeof products.$inferInsert> = {};

  if (form.has('name')) {
    const name = String(form.get('name') ?? '').trim();
    if (name.length < 2 || name.length > 100) return json({ error: 'Nome inválido' }, 400);
    updates.name = name;
  }
  if (form.has('shortDesc')) {
    updates.shortDesc = String(form.get('shortDesc') ?? '').trim().slice(0, 300) || null;
  }
  if (form.has('price')) {
    const priceReais = parseFloat(String(form.get('price') ?? '').replace(',', '.'));
    if (!isFinite(priceReais) || priceReais < 0 || priceReais > 100000) {
      return json({ error: 'Preço inválido' }, 400);
    }
    updates.priceCents = Math.round(priceReais * 100);
  }
  if (form.has('active')) {
    updates.active = String(form.get('active')) !== 'false';
  }

  const file = form.get('image');
  let oldImageToRemove: string | null = null;
  if (file && file instanceof File && file.size > 0) {
    const res = await saveProductImage(file, tenant);
    if ('error' in res) return json({ error: res.error }, 400);
    updates.image = res.path;
    oldImageToRemove = current.image;
  }

  if (Object.keys(updates).length === 0) return json({ error: 'Nada para atualizar' }, 400);

  await db.update(products).set(updates).where(and(eq(products.id, id), eq(products.tenantId, tenant.id)));
  if (oldImageToRemove) await apagarFotoProduto(oldImageToRemove, tenant);

  return json({ ok: true });
};

// DELETE — remove o produto (e a imagem enviada, se houver). Vendas/combos
// passados guardam snapshot do nome/preço, então o histórico não quebra.
export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const id = parseInt(params.id ?? '', 10);
  if (isNaN(id)) return json({ error: 'ID inválido' }, 400);

  const current = await first(db.select().from(products).where(and(eq(products.id, id), eq(products.tenantId, tenant.id))));
  if (!current) return json({ error: 'Produto não encontrado' }, 404);

  await db.delete(products).where(and(eq(products.id, id), eq(products.tenantId, tenant.id)));
  await apagarFotoProduto(current.image, tenant);

  return json({ ok: true });
};
