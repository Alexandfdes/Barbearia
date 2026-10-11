export const prerender = false;

/**
 * O dono confirma que o ponto do mapa do site está certo (decisão de 11/10/2026,
 * `docs/PENDENCIAS-ABERTAS.md` §2.33). O painel mostra o mapa e pergunta; esta
 * rota guarda a resposta.
 *
 * Guarda a BUSCA, não um "sim" (`lib/mapa.ts`, `mapaPrecisaConferir`): mudou o
 * endereço, o painel pergunta de novo sozinho.
 *
 * ⚠️ O navegador manda a busca que o dono VIU, e ela tem de ser a de agora. Com o
 * endereço trocado noutra aba depois de a tela abrir, ele estaria confirmando um
 * ponto que já não é o do site — 409, e a tela pede para recarregar.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { settings } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { tenantDaSessao } from '../../../lib/tenant.js';
import { buscaDoMapa } from '../../../lib/mapa.js';

const corpoSchema = z.object({ busca: z.string().max(400) });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  // O endereço e o mapa são da loja: quem mexe é o dono, como em Configurações.
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let corpo: unknown;
  try { corpo = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }
  const parsed = corpoSchema.safeParse(corpo);
  if (!parsed.success) return json({ error: 'Dados inválidos' }, 400);

  const cfg = await first(db
    .select({ addressStreet: settings.addressStreet, addressCity: settings.addressCity, mapsEmbedQuery: settings.mapsEmbedQuery })
    .from(settings)
    .where(eq(settings.tenantId, tenant.id)));
  if (!cfg) return json({ error: 'Configuração não encontrada' }, 404);

  const atual = buscaDoMapa(cfg);
  if (!atual) return json({ error: 'Sem endereço, não há mapa para conferir.' }, 400);
  if (parsed.data.busca.trim() !== atual) {
    return json({ error: 'O endereço mudou depois que esta tela abriu. Recarregue a página para conferir o ponto novo.' }, 409);
  }

  await db.update(settings).set({ mapaConferido: atual }).where(eq(settings.tenantId, tenant.id));
  return json({ ok: true, busca: atual });
};
