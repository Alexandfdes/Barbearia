export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { settings } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { invalidateSettings } from '../../../lib/settings.js';
import { derivarAccent, isHex } from '../../../lib/accent.js';

/** URL opcional: ou vazia, ou começando com http(s). Evita salvar "instagram.com/x"
 *  sem protocolo, que vira link relativo e quebra dentro do próprio site. */
const urlOuVazio = (max: number) =>
  z.string().max(max).refine(
    (v) => v === '' || /^https?:\/\//.test(v),
    { message: 'O endereço precisa começar com http:// ou https://' }
  );

const horarioSchema = z.object({
  label:  z.string().min(1, 'O rótulo do horário não pode ficar vazio').max(60),
  hours:  z.string().min(1, 'O horário não pode ficar vazio').max(60),
  closed: z.boolean(),
});

const updateSchema = z.object({
  businessName:    z.string().min(2, 'O nome da barbearia precisa ter ao menos 2 caracteres').max(100),
  shortName:       z.string().min(1, 'O nome curto não pode ficar vazio').max(40),
  tagline:         z.string().max(200),
  heroSubtitle:    z.string().max(400),
  aboutText:       z.string().max(600),
  // Só dígitos, no formato do wa.me: DDI + DDD + número.
  whatsappNumber:  z.string().regex(/^\d{10,15}$/, 'O WhatsApp deve ter só dígitos, com DDI e DDD (ex: 5584999051196)'),
  whatsappDisplay: z.string().max(40),
  instagramUrl:    urlOuVazio(300),
  instagramHandle: z.string().max(60),
  addressStreet:   z.string().min(2, 'Informe a rua e o número').max(150),
  addressCity:     z.string().min(2, 'Informe a cidade e o estado').max(80),
  mapsUrl:         urlOuVazio(600),
  mapsEmbedQuery:  z.string().max(200),
  businessHours:   z.array(horarioSchema).max(10, 'No máximo 10 linhas de horário'),
  seoTitle:        z.string().max(200),
  seoDescription:  z.string().max(300),
  googleReviewsUrl: urlOuVazio(600),
  googleRating:    z.string().regex(/^$|^[0-5](\.\d)?$/, 'A nota deve ser um número de 0 a 5 (ex: 4.8)'),
  googleReviewCount: z.number().int().min(0).max(1_000_000),
  productsSectionTitle: z.string().min(1, 'O título da seção de produtos não pode ficar vazio').max(60),
  // Cor de marca escolhida no painel. Só ela é aceita: `accentHover` e
  // `accentLight` NÃO vêm do cliente — são derivadas aqui (ver D5.2). Assim o
  // banco nunca guarda um trio inconsistente ou que reprove em contraste.
  accentColor:     z.string().refine(isHex, { message: 'Escolha uma cor no formato #rrggbb' }),
}).partial();

// GET — devolve a linha 1 crua, para o formulário preencher.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) return json({ error: 'Configuração não encontrada (migration 0009 aplicada?)' }, 404);
  return json(row);
};

// PATCH — atualiza os campos enviados e invalida o cache do processo.
export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  // A marca da loja é do dono, não do barbeiro que só atende.
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const campo = issue.path.join('.') || 'campo';
    return json({ error: `${campo}: ${issue.message}` }, 400);
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  for (const chave of Object.keys(d) as (keyof typeof d)[]) {
    if (d[chave] === undefined) continue;
    // accentColor é tratado à parte logo abaixo: ele gera três colunas, não uma.
    if (chave === 'accentColor') continue;
    // businessHours é array na API e TEXT (JSON) no banco.
    updates[chave] = chave === 'businessHours' ? JSON.stringify(d[chave]) : d[chave];
  }

  // Derivação na ESCRITA (D5.2): a cor escolhida vira os três tokens do tema,
  // com contraste garantido. Derivar na leitura seria custo por requisição.
  // A cor gravada pode diferir da escolhida — dourado e laranja precisam
  // escurecer para segurar texto branco. O painel avisa quando isso acontece.
  if (d.accentColor !== undefined) {
    const a = derivarAccent(d.accentColor);
    updates.accentColor = a.color;
    updates.accentHover = a.hover;
    updates.accentLight = a.light;
  }

  if (Object.keys(updates).length === 0) return json({ error: 'Nenhum campo para atualizar' }, 400);

  const existe = db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).get();
  if (!existe) return json({ error: 'Configuração não encontrada (migration 0009 aplicada?)' }, 404);

  updates.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    db.update(settings).set(updates).where(eq(settings.id, 1)).run();
  } catch (err) {
    console.error('[api/admin/settings PATCH]', err);
    return json({ error: 'Falha ao salvar a configuração' }, 500);
  }

  // ⚠️ Sem isto o painel salva e o site continua mostrando o valor velho até o
  // container reiniciar. Ver ARQUITETURA-PRODUTO-V1 D3.1.
  invalidateSettings();

  return json({ ok: true });
};
