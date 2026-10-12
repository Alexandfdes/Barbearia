export const prerender = false;

/**
 * A lista de clientes da barbearia, em CSV (`lib/exportacao.ts`). Só o dono —
 * e também com a barbearia fora do ar: a sessão vem de `getSession()` ou de
 * `sessaoForaDoAr()`, como na tela de assinatura, e o `src/middleware.ts` deixa
 * passar.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/api.js';
import { getSession, sessaoForaDoAr } from '../../../../lib/session.js';
import { tenantDaSessao } from '../../../../lib/tenant.js';
import { arquivoDosClientes, nomeDoArquivo, respostaCsv } from '../../../../lib/exportacao.js';

export const GET: APIRoute = async ({ request }) => {
  const noAr = await getSession(request);
  const fora = noAr ? null : await sessaoForaDoAr(request);
  const sessao = noAr ?? fora?.sessao;
  if (!sessao) return json({ error: 'Não autenticado' }, 401);
  if (sessao.role !== 'admin') return json({ error: 'Só o dono da barbearia baixa a lista de clientes.' }, 403);
  const tenant = noAr ? tenantDaSessao(noAr) : fora!.tenant;

  const { conteudo, linhas } = await arquivoDosClientes(tenant.id);
  console.info(`[exportar] ${tenant.slug}: clientes, ${linhas} linha(s)${fora ? ' — com a barbearia fora do ar' : ''}`);
  return respostaCsv(nomeDoArquivo('clientes', tenant.slug), conteudo);
};
