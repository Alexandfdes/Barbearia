export const prerender = false;

import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/index.js';
import { settings } from '../../../../db/schema.js';
import { json } from '../../../../lib/api.js';
import { getSession } from '../../../../lib/session.js';
import { invalidateSettings } from '../../../../lib/settings.js';
import { salvarMidiaMarca, TIPOS_MIDIA, type TipoMidia } from '../../../../lib/uploads.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';

/** Cada tipo alimenta uma coluna. `galeria` fica de fora: é a Fase 3. */
const COLUNA: Partial<Record<TipoMidia, 'logoPath' | 'heroPath' | 'ogPath' | 'faviconPath'>> = {
  logo: 'logoPath',
  hero: 'heroPath',
  og: 'ogPath',
  favicon: 'faviconPath',
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: 'Não consegui ler o envio' }, 400); }

  const tipo = String(form.get('tipo') ?? '') as TipoMidia;
  if (!TIPOS_MIDIA.includes(tipo) || !COLUNA[tipo]) {
    return json({ error: 'Tipo de imagem inválido' }, 400);
  }

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return json({ error: 'Nenhum arquivo enviado' }, 400);
  }

  const r = await salvarMidiaMarca(arquivo, tipo);
  if ('error' in r) return json({ error: r.error }, 400);

  try {
    await db.update(settings).set({ [COLUNA[tipo]!]: r.path }).where(eq(settings.tenantId, tenant.id));
  } catch (err) {
    console.error('[api/admin/settings/media]', err);
    return json({ error: 'Imagem salva, mas falhou ao gravar a configuração' }, 500);
  }

  invalidateSettings();
  return json({ ok: true, path: r.path, larguras: r.larguras });
};

/** Remove a imagem da configuração e faz o site voltar ao asset padrão. */
export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: { tipo?: string };
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const tipo = String(body.tipo ?? '') as TipoMidia;
  if (!COLUNA[tipo]) return json({ error: 'Tipo de imagem inválido' }, 400);

  // O arquivo continua no volume de propósito: apagar é irreversível e o espaço
  // que uma imagem ocupa não justifica o risco de perder o que o cliente mandou.
  await db.update(settings).set({ [COLUNA[tipo]!]: null }).where(eq(settings.tenantId, tenant.id));
  invalidateSettings();
  return json({ ok: true });
};
