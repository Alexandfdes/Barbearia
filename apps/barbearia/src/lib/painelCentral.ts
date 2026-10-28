/**
 * O painel só abre no endereço do painel — e nenhuma página se deixa emoldurar.
 *
 * ── O QUE ISTO IMPEDE ────────────────────────────────────────────────────────
 *
 * Até 17/10/2026 o painel funcionava em qualquer endereço: o rodapé do site leva a
 * `/admin`, e o barbeiro que clicava ali entrava no painel pelo endereço do SITE da
 * barbearia (`ze.<domínio>/admin`), com o cookie nascendo nesse endereço. Três efeitos
 * (achados na revisão de 17/10, `docs/PENDENCIAS-ABERTAS.md` §2.49):
 *
 *  1. A conferência de origem (`lib/origem.ts`, §2.30) compara `Origin` com `Host` — e
 *     ali os dois são o site. Um script no site da barbearia passava a agir NO PAINEL
 *     dela, e a ler as respostas: a exportação dos clientes, com nome, telefone e
 *     nascimento.
 *  2. O login é global: a senha da barbearia B entrava pelo endereço da A, e o site da
 *     A, naquele navegador, misturava as duas.
 *  3. Fora do ar, o endereço da barbearia mostra o aviso — o login nele também. Quem
 *     não tinha mais o cookie ficava sem caminho até a tela de assinatura.
 *
 * Agora: tela do painel pedida em outro endereço vai para o painel (302, com o mesmo
 * caminho); rota de API do painel em outro endereço responde 404. Só vale com o
 * endereçamento configurado (`PAINEL_URL` ou `DOMINIO_BASE`): sem eles — o
 * desenvolvimento numa porta só —, o painel e a barbearia 1 dividem o `localhost`.
 *
 * E o cabeçalho contra moldura em toda resposta: os subdomínios das barbearias são o
 * mesmo "site" do painel para o navegador, e o cookie `SameSite=Lax` vai junto num
 * iframe entre eles. Um clique no painel emoldurado sairia do próprio painel, com o
 * `Origin` dele. Não há como explorar sem um XSS antes — é a segunda parede.
 */
import { ehEnderecoDoPainel, urlDoPainel } from './tenant.js';

type Ambiente = Record<string, string | undefined>;

/**
 * As telas e as rotas do painel do dono — as de entrar inclusive, e o CADASTRO
 * (26/10/2026): ele abre sessão de dono, e feito no endereço de uma barbearia o
 * cookie nascia ali — aquele navegador passava a ver a barbearia nova no site da
 * outra, e o "você já está no painel" era falso.
 */
export function ehCaminhoDoPainel(caminho: string): boolean {
  return caminho === '/admin' || caminho.startsWith('/admin/')
    || caminho.startsWith('/api/admin/') || caminho.startsWith('/api/auth/')
    || caminho === '/cadastrar' || caminho === '/api/cadastrar';
}

/** `null`: segue. Senão, a resposta que leva ao painel — ou o 404 da API no endereço errado. */
export function desvioParaOPainel(request: Request, env: Ambiente = process.env): Response | null {
  const url = new URL(request.url);
  if (!ehCaminhoDoPainel(url.pathname)) return null;
  if (!env.PAINEL_URL?.trim() && !env.DOMINIO_BASE?.trim()) return null;
  const painel = urlDoPainel(env);
  if (!painel || ehEnderecoDoPainel(request.headers.get('host'), painel)) return null;

  const eTela = !url.pathname.startsWith('/api/');
  if (eTela && (request.method === 'GET' || request.method === 'HEAD')) {
    return new Response(null, { status: 302, headers: { location: `${painel}${url.pathname}${url.search}` } });
  }
  return new Response(JSON.stringify({ error: `O painel fica em ${painel}.` }), {
    status: 404, headers: { 'content-type': 'application/json' },
  });
}

/** `X-Frame-Options` e `frame-ancestors` — sem passar por cima do que a tela já disse. */
export function semMoldura(r: Response): Response {
  const aplicar = (h: Headers) => {
    if (!h.has('X-Frame-Options')) h.set('X-Frame-Options', 'DENY');
    if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', "frame-ancestors 'none'");
  };
  try {
    aplicar(r.headers);
    return r;
  } catch {
    // Resposta de cabeçalhos imutáveis (`Response.redirect`): copia e aplica.
    const copia = new Response(r.body, { status: r.status, statusText: r.statusText, headers: new Headers(r.headers) });
    aplicar(copia.headers);
    return copia;
  }
}
