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
import { carregarTenants, tenantDaSessaoOuNulo, tenantDoHost, type Tenant } from './lib/tenant.js';

export const onRequest = defineMiddleware(async (contexto, next) => {
  const tenant = await tenantDaRequisicao(contexto.request);

  // Sem barbearia identificada, a requisição segue SEM contexto: roda como dono
  // do banco e as políticas de RLS não a alcançam.
  //
  // ⚠️ Isso não é buraco, é o painel. Ele fica num endereço central
  // (`painel.<dominio>`), que de propósito não é de barbearia nenhuma: quem diz
  // de quem é a requisição ali é a SESSÃO, e sem sessão a rota manda para o
  // login. O outro caso que cai aqui é host desconhecido — e aí cada rota e
  // página pública responde 404 antes de renderizar qualquer coisa
  // (`lib/tenant.ts`, passo 6).
  if (tenant === null) return next();

  const resposta = await comTenant(tenant, async () => {
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
async function tenantDaRequisicao(request: Request): Promise<Tenant | null> {
  const sessao = await getSession(request);
  const daSessao = sessao ? tenantDaSessaoOuNulo(sessao) : null;
  if (daSessao) return daSessao;

  // ⚠️ Aquecer o cache aqui é o que permite `tenantDoHost()` ser SÍNCRONA nas
  // 15 rotas e páginas públicas que a chamam.
  //
  // `getSession()` já aquece — mas só quando existe cookie, e visitante do site
  // não tem cookie nenhum. Sem esta linha, a primeira visita depois de cada
  // boot cairia em 404 com o cache frio: um defeito que só aparece em produção,
  // no primeiro acesso depois de cada deploy, e some quando alguém vai conferir.
  await carregarTenants();
  return tenantDoHost(request);
}
