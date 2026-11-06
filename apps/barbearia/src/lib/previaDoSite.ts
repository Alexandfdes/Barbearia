/**
 * O site que espera a aprovação do operador — o que o endereço mostra, e a prévia que o dono
 * e o operador veem antes de ele ir ao ar (decisão do dono em 05/11/2026, migration 0020).
 *
 * ── POR QUE O SITE ESPERA ────────────────────────────────────────────────────
 *
 * Com o cadastro aberto e o certificado curinga, a página de um estranho iria ao ar sob o
 * domínio do produto em minutos, sem ninguém ver. Uma só que seja golpe, e quem paga é o
 * domínio inteiro — nos filtros de e-mail e nos alertas do navegador —, e com ele o site de
 * todo cliente (revisão de 05/11/2026). Nos primeiros meses, o site de quem se cadastra pela
 * web abre depois que o operador olha e aprova (`aprovarSite`, em `lib/operadorBarbearias.ts`).
 *
 * ── O QUE O ENDEREÇO MOSTRA ATÉ LÁ ───────────────────────────────────────────
 *
 * "Em preparação" — e NADA que a pessoa escreveu: nem o nome, nem o WhatsApp. É justamente
 * o que ainda não foi olhado. Por isso o aviso de "fora do ar" (`lib/siteForaDoAr.ts`), que
 * mostra o nome e o WhatsApp, também não vale para quem nunca foi aprovado
 * (`tenantSuspensoDoHost`).
 *
 * ── A PRÉVIA ─────────────────────────────────────────────────────────────────
 *
 * Quem aprova precisa ver o site, e o dono precisa ver o que está montando. Os dois chegam
 * por um link que o PAINEL monta na hora do clique (`/admin/previa` e a prévia da ficha do
 * operador), e que vale 2 minutos — o bastante para o redirecionamento. No endereço do
 * site, ele vira um cookie daquele endereço, que abre o site por 8 horas naquele navegador,
 * e some da barra.
 *
 * ⚠️ O link curto é o que impede a prévia de virar a porta dos fundos da aprovação: quem se
 * cadastrou para aplicar golpe teria de mandar um link novo a cada vítima, e cada um morre
 * em 2 minutos. Na prévia, toda página diz que é uma prévia (`Layout.astro`), e nenhuma é
 * indexada (`X-Robots-Tag`, no `src/middleware.ts`).
 *
 * A assinatura é um HMAC com o `SESSION_SECRET`, com um prefixo por uso — o link e o cookie
 * não servem um no lugar do outro, nem para outra barbearia. Sem o segredo, não há prévia.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

type Ambiente = Record<string, string | undefined>;

/**
 * O site novo do cadastro pela web espera a aprovação? Sim — a não ser com
 * `SITE_SEM_APROVACAO=1`, para quando os primeiros meses passarem. A variável decide só o
 * NASCIMENTO: quem já espera continua esperando a sua aprovação.
 */
export function aprovacaoDoSiteLigada(env: Ambiente = process.env): boolean {
  return env.SITE_SEM_APROVACAO?.trim() !== '1';
}

export const COOKIE_DA_PREVIA = 'previa_do_site';
/** Quanto vale o link que o painel e a ficha montam: o bastante para o redirecionamento. */
export const VALIDADE_DO_LINK_MS = 2 * 60 * 1000;
/** Quanto a prévia fica aberta no navegador que entrou pelo link. */
export const VALIDADE_DA_PREVIA_S = 8 * 60 * 60;

/** O parâmetro do link. Fora da prévia, ninguém o lê. */
export const PARAMETRO_DA_PREVIA = 'previa';

function chave(env: Ambiente): string | null {
  const s = env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

function assinatura(uso: 'link' | 'cookie', tenantId: number, expira: number, segredo: string): string {
  return createHmac('sha256', segredo).update(`previa-do-site:${uso}:v1:${tenantId}:${expira}`).digest('base64url');
}

function selar(uso: 'link' | 'cookie', tenantId: number, validadeMs: number, agora: Date, env: Ambiente): string | null {
  const segredo = chave(env);
  if (!segredo) return null;
  const expira = agora.getTime() + validadeMs;
  return `${expira}.${assinatura(uso, tenantId, expira, segredo)}`;
}

/** O selo vale para esta barbearia, neste uso, agora? */
function confere(uso: 'link' | 'cookie', valor: string | null | undefined, tenantId: number, agora: Date, env: Ambiente): boolean {
  const segredo = chave(env);
  if (!segredo || !valor) return false;
  const m = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(valor);
  if (!m) return false;
  const expira = Number(m[1]);
  if (!(expira > agora.getTime())) return false;
  const certa = Buffer.from(assinatura(uso, tenantId, expira, segredo));
  const veio = Buffer.from(m[2]);
  return certa.length === veio.length && timingSafeEqual(certa, veio);
}

function lerCookie(request: Request, nome: string): string | null {
  const m = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`));
  return m ? m[1] : null;
}

/**
 * O link que abre a prévia do site em `site` (`urlDoSite`). Montado na hora do clique, por
 * quem já conferiu a sessão do dono ou a do operador. `null` sem endereço ou sem segredo.
 */
export function linkDaPrevia(site: string, tenantId: number, agora: Date = new Date(), env: Ambiente = process.env): string | null {
  const selo = selar('link', tenantId, VALIDADE_DO_LINK_MS, agora, env);
  return site && selo ? `${site}/?${PARAMETRO_DA_PREVIA}=${selo}` : null;
}

/** Este navegador está na prévia desta barbearia? (o cookie, conferido) */
export function emPrevia(request: Request, tenantId: number, agora: Date = new Date(), env: Ambiente = process.env): boolean {
  return confere('cookie', lerCookie(request, COOKIE_DA_PREVIA), tenantId, agora, env);
}

/**
 * O link da prévia chegando ao endereço do site: vira o cookie, e o endereço volta sem ele.
 * Link vencido ou de outra barbearia volta sem cookie — e o endereço mostra "em preparação".
 */
export function respostaDoLinkDaPrevia(
  request: Request, tenantId: number, agora: Date = new Date(), env: Ambiente = process.env,
): Response {
  const url = new URL(request.url);
  const selo = url.searchParams.get(PARAMETRO_DA_PREVIA);
  url.searchParams.delete(PARAMETRO_DA_PREVIA);
  const cabecalhos = new Headers({
    // Relativo: o mesmo endereço, sem o link na barra nem no histórico.
    location: `${url.pathname}${url.search}`,
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  });
  if (confere('link', selo, tenantId, agora, env)) {
    const valor = selar('cookie', tenantId, VALIDADE_DA_PREVIA_S * 1000, agora, env);
    const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
    cabecalhos.append('set-cookie', `${COOKIE_DA_PREVIA}=${valor}; HttpOnly${secure}; SameSite=Lax; Max-Age=${VALIDADE_DA_PREVIA_S}; Path=/`);
  }
  return new Response(null, { status: 303, headers: cabecalhos });
}

/** Uma hora: a aprovação é de pessoa, não de relógio — o número só diz "não é para sempre". */
const VOLTE_EM_SEGUNDOS = 3600;

/**
 * A página do endereço que espera a aprovação. ⚠️ Nada aqui vem da barbearia: é o que ainda
 * não foi olhado.
 */
export function paginaEmPreparacao(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Site em preparação</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
           background: #0a0a0a; color: #e8e0d4;
           font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    main { width: 100%; max-width: 30rem; text-align: center; }
    h1 { margin: 0 0 14px; font: 600 26px/1.25 Georgia, "Times New Roman", serif; text-wrap: balance; }
    p { margin: 0; color: #b8ad9d; }
  </style>
</head>
<body>
  <main>
    <h1>Este site está em preparação.</h1>
    <p>Ele abre em breve. Volte daqui a pouco.</p>
  </main>
</body>
</html>`;
}

/** A resposta inteira: a página para quem navega, JSON para quem chama a API. */
export function respostaEmPreparacao(caminho: string): Response {
  const cabecalhos = { 'Retry-After': String(VOLTE_EM_SEGUNDOS), 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (caminho.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Em preparação.' }), {
      status: 503,
      headers: { ...cabecalhos, 'content-type': 'application/json; charset=utf-8' },
    });
  }
  return new Response(paginaEmPreparacao(), {
    status: 503,
    headers: { ...cabecalhos, 'content-type': 'text/html; charset=utf-8' },
  });
}
