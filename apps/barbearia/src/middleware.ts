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
  // ⚠️ O AQUECIMENTO VEM PRIMEIRO, E A ORDEM É O CONSERTO DE UM DEFEITO REAL.
  //
  // Antes de 15/09/2026 esta linha ficava DEPOIS da leitura da sessão. O efeito
  // aparecia assim: barbearia criada agora, dono entra no painel dela, e o topo
  // da tela mostra o nome de OUTRA barbearia.
  //
  // O caminho era este. `tenantDaSessaoOuNulo()` lê o cache; com o tenant novo
  // ainda fora dele, devolvia `null`. Caía para o host — que no painel central
  // não é de barbearia nenhuma — e devolvia `null` de novo. Sem tenant, a
  // requisição corria SEM contexto, e cada `getSettings()` caía no
  // `TENANT_UNICO` de `tenantAtual()`: a barbearia de id 1.
  //
  // O mais traiçoeiro é que metade da tela acertava: o que lê `session` direto
  // (o nome do barbeiro) vinha certo, e só o que passa pelo contexto vinha
  // errado. Meia tela certa não parece defeito de roteamento — parece dado
  // errado no banco, e manda procurar no lugar errado.
  //
  // Aquecer antes também é o que permite `tenantDoHost()` ser SÍNCRONA nas 15
  // rotas e páginas públicas que a chamam.
  await carregarTenants();

  const sessao = await getSession(request);
  const daSessao = sessao ? tenantDaSessaoOuNulo(sessao) : null;
  if (daSessao) return daSessao;

  return tenantDoHost(request);
}
