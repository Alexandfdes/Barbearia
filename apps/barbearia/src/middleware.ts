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
 *
 * ── E A BARBEARIA FORA DO AR ─────────────────────────────────────────────────
 *
 * Teste ou carência vencidos sem pagamento, ou tirada do ar à mão
 * (`lib/situacao.ts`). As rotas não sabem disso, e não precisam: para elas a
 * barbearia simplesmente não existe — `tenantDoHost()` e `getSession()` devolvem
 * `null`, e cada uma responde 404 ou "não autenticado" como sempre respondeu. O
 * que muda é decidido aqui, antes delas: o site mostra o aviso com o WhatsApp da
 * barbearia, e o painel leva o dono à tela de assinatura (decisões de 08/10/2026,
 * `docs/PLANO-PRODUTIZACAO.md` §13).
 */
import { defineMiddleware } from 'astro:middleware';
import { comTenant } from './db/index.js';
import { getSession, sessaoForaDoAr } from './lib/session.js';
import {
  carregarTenants, tenantDaSessaoOuNulo, tenantDoHost, tenantSuspensoDoHost, type Tenant,
} from './lib/tenant.js';
import { getSettings } from './lib/settings.js';
import { respostaForaDoAr } from './lib/siteForaDoAr.js';
import { TELA_DE_ASSINATURA } from './lib/assinatura.js';

export const onRequest = defineMiddleware(async (contexto, next) => {
  const caminho = new URL(contexto.request.url).pathname;

  // As tarefas agendadas (`pages/api/tarefas/`) não são de barbearia nenhuma, e
  // quem as chama é o daemon, pela porta local — `Host: 127.0.0.1`. Sem este
  // desvio, o endereço decidiria: uma barbearia cadastrada com o endereço `127`
  // (válido: só números) capturaria a chamada, e, fora do ar, a tarefa receberia
  // a página de "temporariamente indisponível" no lugar da resposta. Os avisos
  // parariam para todas as barbearias por causa de uma.
  if (caminho.startsWith('/api/tarefas/')) return next();

  const { tenant, daSessao } = await tenantDaRequisicao(contexto.request);

  // ⚠️ ANTES de olhar o endereço: no desenvolvimento, o painel e a barbearia 1
  // dividem o `localhost`, e o endereço devolveria a barbearia 1 para quem está
  // com a sessão de outra, fora do ar — que cairia num laço entre o login e o
  // painel sem nunca ver por quê.
  if (!daSessao && ehDoPainel(caminho)) {
    const desvio = await painelDeBarbeariaForaDoAr(contexto.request, caminho, next);
    if (desvio) return desvio;
  }

  // Sem barbearia identificada, a requisição segue SEM contexto: roda como dono
  // do banco e as políticas de RLS não a alcançam.
  //
  // ⚠️ Isso não é buraco, é o painel. Ele fica num endereço central
  // (`painel.<dominio>`), que de propósito não é de barbearia nenhuma: quem diz
  // de quem é a requisição ali é a SESSÃO, e sem sessão a rota manda para o
  // login. O outro caso que cai aqui é host desconhecido — e aí cada rota e
  // página pública responde 404 antes de renderizar qualquer coisa
  // (`lib/tenant.ts`, passo 6).
  if (tenant === null) {
    // Endereço de barbearia FORA DO AR: em vez do 404, o aviso com o WhatsApp
    // dela (`lib/siteForaDoAr.ts`). As rotas públicas nem chegam a rodar.
    const suspensa = tenantSuspensoDoHost(contexto.request.headers.get('host'));
    if (suspensa) {
      return comTenant(suspensa, async () => respostaForaDoAr(caminho, await getSettings(suspensa)));
    }
    return next();
  }

  return servirComTenant(tenant, next);
});

/**
 * As telas de `/admin` que abrem sem sessão: o login e as duas da senha nova
 * (`lib/redefinicaoDeSenha.ts`). Nenhuma usa barbearia: quem está fora do ar
 * precisa conseguir entrar com outra conta — e trocar a senha que esqueceu.
 */
const PAINEL_PUBLICO = new Set(['/admin/login', '/admin/esqueci', '/admin/nova-senha']);

/** Rotas do painel — as que pedem sessão. */
function ehDoPainel(caminho: string): boolean {
  if (PAINEL_PUBLICO.has(caminho)) return false;
  return caminho === '/admin' || caminho.startsWith('/admin/') || caminho.startsWith('/api/admin/');
}

async function servirComTenant(tenant: Tenant, next: () => Promise<Response>): Promise<Response> {
  return comTenant(tenant, async () => {
    const r = await next();
    // Lê o corpo inteiro ainda dentro do contexto. Ver o aviso acima.
    if (!r.body) return r;
    const corpo = await r.arrayBuffer();
    return new Response(corpo, { status: r.status, statusText: r.statusText, headers: r.headers });
  });
}

/**
 * O painel de quem está com a barbearia FORA DO AR.
 *
 * `getSession()` não enxerga essa sessão, e as 53 rotas do painel continuam
 * respondendo "não autenticado" sozinhas. Faltava o caminho de volta: o dono que
 * entra com a senha certa vai para a tela de assinatura — e só ela abre, com a
 * barbearia dele no contexto. Página recebe redirecionamento; API, 402.
 *
 * Devolve `null` quando não é o caso, e a requisição segue o caminho de sempre.
 */
async function painelDeBarbeariaForaDoAr(
  request: Request, caminho: string, next: () => Promise<Response>,
): Promise<Response | null> {
  const fora = await sessaoForaDoAr(request);
  if (!fora) return null;

  if (caminho === TELA_DE_ASSINATURA) return servirComTenant(fora.tenant, next);
  if (caminho.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'A barbearia está fora do ar.', assinatura: TELA_DE_ASSINATURA }), {
      status: 402, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(null, { status: 303, headers: { location: TELA_DE_ASSINATURA } });
}

/**
 * De quem é esta requisição — e se quem disse foi a sessão do painel.
 *
 * A sessão do painel manda: o barbeiro pode estar acessando de qualquer
 * endereço. Sem sessão, decide o host — é o site público da barbearia.
 */
async function tenantDaRequisicao(request: Request): Promise<{ tenant: Tenant | null; daSessao: boolean }> {
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
  if (daSessao) return { tenant: daSessao, daSessao: true };

  return { tenant: tenantDoHost(request), daSessao: false };
}
