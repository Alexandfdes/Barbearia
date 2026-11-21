export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, first } from '../../../db/index.js';
import { settings } from '../../../db/schema.js';
import { json } from '../../../lib/api.js';
import { getSession } from '../../../lib/session.js';
import { invalidateSettings } from '../../../lib/settings.js';
import { derivarAccent, isHex } from '../../../lib/accent.js';
import { tenantDaSessao } from '../../../lib/tenant.js';
import { ehFusoDoBrasil, fusoDe } from '../../../lib/timezone.js';
import { definirFusoDaBarbearia } from '../../../lib/fusoDaBarbearia.js';
import { FORMA_DA_NOTA } from '../../../lib/avaliacao.js';
import { CLIENTES_NOVOS } from '../../../lib/promocoes.js';
import { desativarPromocoesAfetadas } from '../../../lib/promocoesDaBarbearia.js';

/**
 * O teto de um campo de texto, dito em português. Sem a mensagem, o zod responde "Too big:
 * expected string to have <=40 characters" — e é isso que o dono lia ao lado do Salvar
 * (achado em 12/11/2026, `docs/PENDENCIAS-ABERTAS.md` §2.71). `o` é o campo como a tela o chama,
 * com o artigo: "O nome curto passa de 40 caracteres".
 */
const ate = (max: number, o: string) => z.string().max(max, `${o} passa de ${max} caracteres`);

/** URL opcional: ou vazia, ou começando com http(s). Evita salvar "instagram.com/x"
 *  sem protocolo, que vira link relativo e quebra dentro do próprio site. */
const urlOuVazio = (max: number, o: string) =>
  ate(max, o).refine(
    (v) => v === '' || /^https?:\/\//.test(v),
    { message: 'O endereço precisa começar com http:// ou https://' }
  );

const horarioSchema = z.object({
  label:  z.string().min(1, 'O rótulo do horário não pode ficar vazio').max(60, 'O rótulo do horário passa de 60 caracteres'),
  hours:  z.string().min(1, 'O horário não pode ficar vazio').max(60, 'O horário passa de 60 caracteres'),
  closed: z.boolean(),
});

const updateSchema = z.object({
  businessName:    z.string().min(2, 'O nome da barbearia precisa ter ao menos 2 caracteres').max(100, 'O nome da barbearia passa de 100 caracteres'),
  shortName:       z.string().min(1, 'O nome curto não pode ficar vazio').max(40, 'O nome curto passa de 40 caracteres'),
  tagline:         ate(200, 'A frase do topo'),
  heroSubtitle:    ate(400, 'O texto abaixo da frase'),
  aboutText:       ate(600, 'O texto sobre a barbearia'),
  // Só dígitos, no formato do wa.me: DDI + DDD + número.
  whatsappNumber:  z.string().regex(/^\d{10,15}$/, 'O WhatsApp deve ter só dígitos, com DDI e DDD (ex: 5584999999999)'),
  whatsappDisplay: ate(40, 'O WhatsApp como aparece escrito'),
  instagramUrl:    urlOuVazio(300, 'O link do Instagram'),
  instagramHandle: ate(60, 'A arroba do Instagram'),
  addressStreet:   z.string().min(2, 'Informe a rua e o número').max(150, 'A rua e o número passam de 150 caracteres'),
  addressCity:     z.string().min(2, 'Informe a cidade e o estado').max(80, 'A cidade e o estado passam de 80 caracteres'),
  mapsUrl:         urlOuVazio(600, 'O link "traçar rota"'),
  mapsEmbedQuery:  ate(200, 'A busca do mapa embutido'),
  businessHours:   z.array(horarioSchema).max(10, 'No máximo 10 linhas de horário'),
  seoTitle:        ate(200, 'O título da página'),
  seoDescription:  ate(300, 'A descrição'),
  googleReviewsUrl: urlOuVazio(600, 'O link das avaliações'),
  googleRating:    z.string().regex(FORMA_DA_NOTA, 'A nota deve ser um número de 0 a 5 (ex: 4.8)'),
  googleReviewCount: z.number('A quantidade de avaliações tem de ser um número')
    .int('A quantidade de avaliações é um número inteiro')
    .min(0, 'A quantidade de avaliações não pode ser negativa')
    .max(1_000_000, 'A quantidade de avaliações passa de 1.000.000'),
  productsSectionTitle: z.string().min(1, 'O título da seção de produtos não pode ficar vazio').max(60, 'O título da seção de produtos passa de 60 caracteres'),
  // O g das promoções em horário ocioso (migration 0022): quantos clientes novos uma promoção
  // traz. Grava-se pela aba Promoções de /admin/combos, não por Configurações.
  promoClientesNovos: z.number('Os clientes novos têm de ser um número')
    .int('Os clientes novos são um número inteiro')
    .min(CLIENTES_NOVOS.minimo, `Os clientes novos vão de ${CLIENTES_NOVOS.minimo} a ${CLIENTES_NOVOS.maximo}`)
    .max(CLIENTES_NOVOS.maximo, `Os clientes novos vão de ${CLIENTES_NOVOS.minimo} a ${CLIENTES_NOVOS.maximo}`),
  // Cor de marca escolhida no painel. Só ela é aceita: `accentHover` e
  // `accentLight` NÃO vêm do cliente — são derivadas aqui (ver D5.2). Assim o
  // banco nunca guarda um trio inconsistente ou que reprove em contraste.
  accentColor:     z.string().refine(isHex, { message: 'Escolha uma cor no formato #rrggbb' }),
  // O fuso dos horários (12/10/2026). Não é coluna de `settings`: mora em
  // `tenants.timezone` e se grava à parte (`lib/fusoDaBarbearia.ts`).
  fuso:            z.string().refine(ehFusoDoBrasil, { message: 'Escolha um dos fusos da lista' }),
}).partial();

// GET — devolve a linha 1 crua, para o formulário preencher.
export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  const row = await first( db.select().from(settings).where(eq(settings.tenantId, tenant.id)));
  if (!row) return json({ error: 'Configuração não encontrada (migration 0009 aplicada?)' }, 404);
  return json(row);
};

// PATCH — atualiza os campos enviados e invalida o cache do processo.
export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return json({ error: 'Não autenticado' }, 401);
  const tenant = tenantDaSessao(session);
  // A marca da loja é do dono, não do barbeiro que só atende.
  if (session.role !== 'admin') return json({ error: 'Acesso restrito ao admin' }, 403);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    // A mensagem é para o dono ler; o campo, para a tela abrir a aba dele e pôr o cursor
    // nele (`pages/admin/configuracoes.astro`). Até 15/10/2026 o campo ia grudado na
    // mensagem — "googleRating: A nota deve ser…" —, e com as abas o campo errado podia
    // estar escondido noutra.
    const issue = parsed.error.issues[0];
    return json({ error: issue.message, campo: issue.path.join('.') || null }, 400);
  }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  for (const chave of Object.keys(d) as (keyof typeof d)[]) {
    if (d[chave] === undefined) continue;
    // accentColor é tratado à parte logo abaixo: ele gera três colunas, não uma.
    // E o fuso não é de `settings` — vai para `tenants`, mais abaixo.
    if (chave === 'accentColor' || chave === 'fuso') continue;
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

  const trocaFuso = d.fuso !== undefined && d.fuso !== fusoDe(tenant);
  if (Object.keys(updates).length === 0 && d.fuso === undefined) {
    return json({ error: 'Nenhum campo para atualizar' }, 400);
  }

  if (Object.keys(updates).length > 0) {
    const existe = await first( db.select({ id: settings.id, promoClientesNovos: settings.promoClientesNovos }).from(settings).where(eq(settings.tenantId, tenant.id)));
    if (!existe) return json({ error: 'Configuração não encontrada (migration 0009 aplicada?)' }, 404);

    updates.updatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    try {
      // Numa transação (19/11/2026): gravado o g menor e falhada a desativação, o g ficava e as
      // promoções do g antigo seguiam ativas — e salvar de novo não as pegava mais (o g já era o novo).
      await db.transaction(async (tx) => {
        await tx.update(settings).set(updates).where(eq(settings.tenantId, tenant.id));
        // Menos clientes novos por promoção, limite menor para todas: as ativas foram confirmadas com o
        // de antes e venderiam abaixo do lucro (19/11/2026). Mais clientes só aumenta o limite.
        if (d.promoClientesNovos !== undefined && d.promoClientesNovos < existe.promoClientesNovos) {
          await desativarPromocoesAfetadas(tenant.id, { todas: true }, new Date(), tx);
        }
      });
    } catch (err) {
      console.error('[api/admin/settings PATCH]', err);
      // O cache nunca fica diferente do banco, nem na falha.
      invalidateSettings();
      return json({ error: 'Falha ao salvar a configuração' }, 500);
    }
  }

  // O fuso, só quando mudou: a barbearia da SESSÃO, nunca a do corpo.
  if (trocaFuso) {
    try {
      await definirFusoDaBarbearia(tenant.id, d.fuso!);
    } catch (err) {
      console.error('[api/admin/settings PATCH] fuso', err);
      return json({ error: 'Falha ao salvar o fuso horário' }, 500);
    }
  }

  // ⚠️ Sem isto o painel salva e o site continua mostrando o valor velho até o
  // container reiniciar. Ver ARQUITETURA-PRODUTO-V1 D3.1.
  invalidateSettings();

  return json({ ok: true });
};
