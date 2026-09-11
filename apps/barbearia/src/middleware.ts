/**
 * O tenant entra na conexão aqui — é o que liga o RLS (passo 5.1).
 *
 * ── O QUE ESTE ARQUIVO IMPEDE ────────────────────────────────────────────────
 *
 * Sem ele, as políticas da migration 0003 existiriam e não valeriam para nada:
 * elas dependem de `app.tenant_id` estar gravado na conexão, e é aqui que isso
 * acontece, uma vez por requisição, para todas as rotas de uma vez.
 *
 * ⚠️ A RESPOSTA É LIDA INTEIRA ANTES DE SAIR DAQUI, de propósito.
 *
 * O Astro devolve o corpo da página como stream: o `next()` volta antes de a
 * página terminar de renderizar, e o que ainda falta renderizar faz consultas.
 * Se a conexão reservada fosse devolvida ao pool nesse meio-tempo, essas
 * consultas rodariam fora do contexto — sem tenant, sob a rede desligada, ou
 * pior, numa conexão que já é de outra requisição.
 *
 * O preço é o navegador receber o primeiro byte só quando a página está pronta,
 * em vez de progressivamente. Nas páginas deste app — a maior tem 50 KB — é
 * diferença que não se vê. O ganho é a fronteira do contexto ser exata em vez
 * de "provavelmente".
 */
import { defineMiddleware } from 'astro:middleware';
import { comTenant } from './db/index.js';
import { getSession } from './lib/session.js';
import { tenantDaSessaoOuNulo, tenantDoHost } from './lib/tenant.js';

export const onRequest = defineMiddleware(async (contexto, next) => {
  const tenantId = await tenantDaRequisicao(contexto.request);

  // Sem tenant, a requisição roda como dono — e as políticas não a alcançam.
  //
  // ⚠️ Hoje isto não acontece: `tenantDoHost()` sempre devolve a barbearia
  // única, então toda requisição tem tenant. O ramo existe para o passo 6,
  // quando o host passar a decidir de verdade e um domínio desconhecido puder
  // chegar aqui. Quando isso valer, o certo é devolver 404 — não seguir sem
  // rede. Está marcado para não passar despercebido.
  if (tenantId === null) return next();

  const resposta = await comTenant(tenantId, async () => {
    const r = await next();
    // Lê o corpo inteiro ainda dentro do contexto. Ver o aviso acima.
    if (!r.body) return r;
    const corpo = await r.arrayBuffer();
    return new Response(corpo, { status: r.status, statusText: r.statusText, headers: r.headers });
  });

  return resposta;
});

/**
 * De quem é esta requisição.
 *
 * A sessão do painel manda: o barbeiro pode estar acessando de qualquer
 * endereço. Sem sessão, decide o host — é o site público da barbearia.
 */
async function tenantDaRequisicao(request: Request): Promise<number | null> {
  const sessao = await getSession(request);
  const daSessao = sessao ? tenantDaSessaoOuNulo(sessao) : null;
  if (daSessao) return daSessao.id;

  return tenantDoHost(request)?.id ?? null;
}
