/**
 * Resolvedor de tenant — o ÚNICO lugar que responde "de quem é esta requisição".
 *
 * Regra 5 da skill `barbearia-multi-tenant`: nenhuma rota lê o `Host` ou a sessão
 * direto. Tudo passa por aqui. É essa concentração que fez a migração ser uma
 * mudança de dias em vez de meses.
 *
 * ── POR QUE UM CACHE, E NÃO UMA CONSULTA POR REQUISIÇÃO ──────────────────────
 *
 * `tenantDaSessao()` é chamada em **53 rotas e páginas**. Ir ao banco em cada uma
 * a tornaria assíncrona, e aí seriam 53 arquivos para tocar — 53 chances de
 * esquecer um `await` e receber um `Promise<Tenant>` onde se espera um `Tenant`.
 * Já aconteceu neste projeto, em `Services.astro`: `cfg.shortName` virou
 * `undefined` em silêncio e o site do Bayron perdeu o próprio catálogo.
 *
 * Então a tabela `tenants` fica em memória. Ela é minúscula (uma linha por
 * barbearia, dezenas no cenário mais otimista) e muda raramente.
 *
 * ── O QUE O CACHE CUSTA ──────────────────────────────────────────────────────
 *
 * Um status mudado no banco — o pagamento que chegou, a barbearia tirada do ar à
 * mão — leva até `TTL_MS` para valer. É aceitável numa cobrança mensal.
 *
 * O TEMPO não atrasa: o teste que vence e a carência que acaba saem de
 * `lib/situacao.ts` a cada consulta, com o relógio de agora, a partir dos prazos
 * que o cache guarda (migration 0007).
 *
 * Barbearia recém-criada demora o mesmo tanto para aparecer. Por isso
 * `invalidarTenants()` existe: o provisionamento chama e o cliente novo não
 * espera.
 */
import { db } from '../db/index.js';
import { armazemTenant } from '../db/contexto.js';
import { tenants as tenantsTable } from '../db/schema.js';
import { situacaoDe, noAr, type StatusDaBarbearia } from './situacao.js';

export interface Tenant {
  id: number;
  /** Vira o subdomínio: <slug>.<DOMINIO_BASE> */
  slug: string;
  /** ⚠️ Não é a fase de agora — essa é `situacaoDe(tenant)`, em `lib/situacao.ts`. */
  status: StatusDaBarbearia;
  /** Domínio próprio, quando o cliente optou por um (ver `PRECIFICACAO.md` §6). */
  domain: string | null;
  /** Fim do teste grátis (`trial_ends_at`). */
  testeAte?: Date | null;
  /** Quando a cobrança falhou (`past_due_since`). */
  atrasadaDesde?: Date | null;
}

/** No ar AGORA: pagando, no teste ou na carência. */
const estaNoAr = (t: Tenant | undefined | null): t is Tenant => Boolean(t) && noAr(situacaoDe(t as Tenant));

/**
 * A barbearia única de antes dos tenants.
 *
 * ⚠️ Continua exportada porque `tenantAtual()` depende dela, mas **não deve ser
 * usada em código novo**. Ver o aviso naquela função.
 */
export const TENANT_UNICO: Tenant = {
  id: 1,
  slug: 'principal',
  status: 'active',
  domain: null,
};

/** Sessão do painel. O `tenantId` é gravado no login (passo 7). */
export interface SessaoComTenant {
  tenantId?: number;
}

const TTL_MS = 30_000;

let porId = new Map<number, Tenant>();
let porSlug = new Map<string, Tenant>();
let porDominio = new Map<string, Tenant>();
let carregadoEm = 0;

/**
 * Garante o cache quente. **Assíncrona de propósito, e chamada de um lugar só:**
 * `getSession()`, que toda rota do painel já executa antes de resolver o tenant.
 *
 * É isso que permite `tenantDaSessao()` continuar síncrona.
 */
export async function carregarTenants(forcar = false): Promise<void> {
  if (!forcar && Date.now() - carregadoEm < TTL_MS && porId.size > 0) return;

  const linhas = await db.select({
    id: tenantsTable.id,
    slug: tenantsTable.slug,
    status: tenantsTable.status,
    domain: tenantsTable.domain,
    testeAte: tenantsTable.trialEndsAt,
    atrasadaDesde: tenantsTable.pastDueSince,
  }).from(tenantsTable);

  const id = new Map<number, Tenant>();
  const slug = new Map<string, Tenant>();
  const dominio = new Map<string, Tenant>();

  for (const l of linhas) {
    const t: Tenant = {
      id: l.id,
      slug: l.slug,
      status: l.status as Tenant['status'],
      domain: l.domain ?? null,
      testeAte: l.testeAte ?? null,
      atrasadaDesde: l.atrasadaDesde ?? null,
    };
    id.set(t.id, t);
    slug.set(t.slug, t);
    if (t.domain) dominio.set(t.domain.toLowerCase(), t);
  }

  // Troca de uma vez: enquanto o SELECT roda, quem consultar vê o mapa antigo
  // inteiro, nunca um meio preenchido.
  porId = id;
  porSlug = slug;
  porDominio = dominio;
  carregadoEm = Date.now();
}

/** Descarta o cache. O provisionamento chama para o cliente novo não esperar o TTL. */
export function invalidarTenants(): void {
  carregadoEm = 0;
}

/**
 * Painel: a barbearia vem da sessão, não do endereço — o painel é central.
 *
 * ⚠️ Devolve `null` quando a sessão não tem tenant, quando ele sumiu do banco ou
 * quando a barbearia não está no ar — suspensa ou encerrada; o teste e a carência
 * contam como no ar (`lib/situacao.ts`). Quem chama trata como "não autenticado".
 *
 * Na prática ninguém precisa tratar: `getSession()` já faz essa checagem e
 * devolve `null`, e toda rota do painel começa com `if (!session) return 401`.
 * Esta função existir separada é o que mantém as 53 chamadas intactas.
 */
export function tenantDaSessao(session: SessaoComTenant | null): Tenant {
  const t = session?.tenantId != null ? porId.get(session.tenantId) : undefined;
  if (!estaNoAr(t)) {
    // Cair num tenant padrão aqui serviria os dados da barbearia errada. Estourar
    // é a única saída segura — e `getSession()` já barra antes de chegar aqui.
    throw new Error(
      'Sessão sem barbearia válida. Isto não deveria acontecer: getSession() ' +
      'deve ter recusado antes. Se apareceu, alguma rota resolveu o tenant sem ' +
      'validar a sessão.'
    );
  }
  return t;
}

/** Versão que não estoura — para `getSession()`, que precisa decidir em vez de falhar. */
export function tenantDaSessaoOuNulo(session: SessaoComTenant | null): Tenant | null {
  const t = session?.tenantId != null ? porId.get(session.tenantId) : undefined;
  return estaNoAr(t) ? t : null;
}

/**
 * A barbearia de um id, ESTEJA ELA NO AR OU NÃO.
 *
 * ⚠️ Existe para um caminho só: a sessão de quem está com a barbearia fora do ar
 * e precisa chegar à tela de assinatura para regularizar (`lib/session.ts`,
 * `sessaoForaDoAr`). Qualquer outro uso devolveria barbearia suspensa como se
 * estivesse valendo — use `tenantDaSessao()`.
 */
export function tenantPorIdMesmoForaDoAr(id: number | null | undefined): Tenant | null {
  return id != null ? porId.get(id) ?? null : null;
}

/**
 * Site público: descobre a barbearia pelo endereço acessado.
 *
 * ✅ **Passo 6, ligado em 11/09/2026.** Antes devolvia `TENANT_UNICO` fixo: o
 * produto tinha multi-tenant por dentro e uma barbearia só por fora — a segunda
 * podia existir no banco e **não tinha endereço**.
 *
 * ⚠️ Devolve `null` para endereço desconhecido, e quem chama responde **404**.
 * Nunca um tenant padrão: servir o site da barbearia errada é pior que não
 * servir nada, e um padrão silencioso é exatamente como isso aconteceria.
 *
 * ⚠️ **Continua SÍNCRONA, e isso depende do `src/middleware.ts`.** A resolução
 * lê o cache em memória; quem o aquece, uma vez por requisição e antes de
 * qualquer rota, é o middleware. Sem ele, a primeira visita depois de cada boot
 * cairia em 404 com o cache frio — defeito que aparece só em produção, no
 * primeiro acesso depois de cada deploy, e some quando alguém vai conferir.
 */
export function tenantDoHost(request: Request): Tenant | null {
  return resolverHost(request.headers.get('host'));
}

/**
 * Resolve `barbeariax.<DOMINIO_BASE>` pelo slug e um domínio próprio pela
 * coluna `domain`. Tenant não encontrado devolve `null`.
 */
export function resolverHost(host: string | null): Tenant | null {
  if (!host) return null;
  const limpo = host.toLowerCase().split(':')[0].replace(/\.$/, '');

  const porDominioProprio = porDominio.get(limpo);
  if (estaNoAr(porDominioProprio)) return porDominioProprio;

  const sub = limpo.split('.')[0];
  const t = porSlug.get(sub);
  return estaNoAr(t) ? t : null;
}

/**
 * A barbearia SUSPENSA dona deste endereço — a que tem site, mas fora do ar.
 *
 * O site dela não dá 404: mostra que está temporariamente indisponível, com o
 * WhatsApp da barbearia (decisão de 08/10/2026, `docs/PLANO-PRODUTIZACAO.md` §13).
 * Quem responde é o `src/middleware.ts`; as rotas públicas continuam recebendo
 * `null` de `tenantDoHost()` e nunca servem nada de barbearia suspensa.
 *
 * Encerrada não entra: endereço de barbearia que saiu responde 404, como antes.
 */
export function tenantSuspensoDoHost(host: string | null): Tenant | null {
  if (!host) return null;
  const limpo = host.toLowerCase().split(':')[0].replace(/\.$/, '');
  const t = porDominio.get(limpo) ?? porSlug.get(limpo.split('.')[0]);
  return t && situacaoDe(t).fase === 'suspensa' ? t : null;
}

/**
 * A barbearia da requisição em curso, para quem não recebe requisição nem sessão.
 *
 * ── O QUE ELA ERA, E POR QUE PRECISOU MUDAR ──────────────────────────────────
 *
 * Até o passo 6 esta função devolvia `TENANT_UNICO` — a barbearia número 1,
 * sempre. Estava certo enquanto cada cliente tinha a própria instância.
 *
 * O problema aparecia no instante em que o host passasse a decidir: **doze
 * componentes e layouts chamam `await getSettings()` sem argumento** — topo,
 * cabeçalho, rodapé, serviços, produtos, galeria, depoimentos, FAQ,
 * localização, barra de WhatsApp e os dois layouts. Com a função devolvendo 1
 * fixo, abrir o endereço da segunda barbearia renderizaria o site dela com o
 * nome, o endereço, os horários e a marca da PRIMEIRA. Ligar o passo 6 sem
 * mexer aqui seria pior que não ligar.
 *
 * ── COMO FICOU ───────────────────────────────────────────────────────────────
 *
 * Lê a barbearia do contexto da requisição, que `src/middleware.ts` abre uma vez
 * por requisição — o mesmo contexto que grava `app.tenant_id` na conexão e liga
 * o RLS. Os doze pontos de chamada continuam iguais e passaram a estar certos
 * todos de uma vez.
 *
 * ⚠️ **Fora de requisição devolve `TENANT_UNICO`**, e isso é para scripts,
 * seeds e testes, que legitimamente falam da barbearia única. Numa requisição
 * isso não acontece: quando o host não resolve, as rotas e páginas públicas
 * respondem 404 antes de renderizar qualquer coisa.
 */
/**
 * O endereço PÚBLICO da barbearia — o site dela, não o painel.
 *
 * ⚠️ Existe porque `AdminLayout.astro` linkava "Ver meu site" para `/`.
 *
 * Isso estava certo quando cada barbearia tinha a própria instância e o painel
 * morava em `barbearia.com/admin`: a raiz era o site dela. Com o painel central
 * (`painel.<DOMINIO_BASE>`), `/` é a raiz do PAINEL, que não é barbearia
 * nenhuma — e o dono clicava no link para ver o site dele e recebia
 * "Barbearia não encontrada".
 *
 * A ordem aqui é a mesma de `resolverHost()`, e tem que continuar sendo: domínio
 * próprio primeiro, subdomínio depois. Se as duas divergirem, o link leva a um
 * endereço que o resolvedor não reconhece.
 *
 * `DOMINIO_BASE` fica em variável de ambiente porque o domínio do produto ainda
 * não foi registrado (`PENDENCIAS-ABERTAS.md` §0) e porque em desenvolvimento o
 * endereço é outro.
 */
export function urlDoSite(tenant: Tenant): string {
  if (tenant.domain) return `${protocoloDe(tenant.domain)}://${tenant.domain}`;

  const base = process.env.DOMINIO_BASE?.trim();
  if (base) return `${protocoloDe(base)}://${tenant.slug}.${base}`;

  // Sem domínio base configurado não dá para inventar um endereço. Devolver `/`
  // seria repetir o defeito; devolver vazio deixa a tela esconder o link.
  return '';
}

/**
 * O endereço público do site que está sendo servido: o que vai no canonical, no
 * og:url, na imagem de prévia e no `@id` do schema.org.
 *
 * ⚠️ Nunca uma constante. Até 27/09/2026 estes valores saíam de `SITE_URL`
 * (`src/config.ts`), o domínio do Bayron — herança de quando cada cliente tinha a
 * própria instância. No multi-tenant, todo site do produto dizia ao Google que a
 * página "de verdade" era a do Bayron, e o link mandado no WhatsApp mostrava a
 * foto e o nome dele (`public/og.jpg`).
 *
 * Sem `DOMINIO_BASE` (desenvolvimento), vale o endereço da própria requisição.
 */
export function enderecoPublicoDe(tenant: Tenant | null, origemDaRequisicao: string): string {
  return (tenant && urlDoSite(tenant)) || origemDaRequisicao;
}

export function enderecoPublico(request: Request, url: URL): string {
  return enderecoPublicoDe(tenantDoHost(request), url.origin);
}

/**
 * `http` para desenvolvimento, `https` para o resto.
 *
 * ⚠️ `DOMINIO_BASE=localhost:4321` é a forma de ver o multi-tenant funcionando na
 * máquina de desenvolvimento, e ela depende de um detalhe pouco conhecido: os
 * navegadores resolvem **qualquer** `*.localhost` para 127.0.0.1 sem precisar
 * mexer no arquivo `hosts`. Então `barbeariasalaojovem.localhost:4321` chega no
 * servidor local, e `resolverHost()` pega o primeiro rótulo — exatamente o
 * mesmo caminho de produção, sem atalho e sem a coluna `domain` preenchida à
 * mão.
 *
 * Cravar `https` quebraria isso: o servidor de desenvolvimento não tem TLS.
 */
function protocoloDe(host: string): 'http' | 'https' {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(host) ? 'http' : 'https';
}

/**
 * O tenant que o middleware resolveu para ESTA requisição — sessão primeiro,
 * endereço depois —, ou `null` quando ele não achou nenhum.
 *
 * ⚠️ Diferente de `tenantAtual()`, NUNCA cai num padrão. Para quem serve arquivo,
 * é a diferença entre responder 404 e entregar a mídia da barbearia 1 num
 * endereço que não é de ninguém.
 *
 * Existe por causa do painel. As rotas de arquivo olhavam só o endereço
 * (`tenantDoHost`), e o painel mora num endereço central, que não é de barbearia
 * nenhuma: a prévia da logo e da capa dava 404 em produção, para todo mundo. No
 * desenvolvimento isso não aparecia, porque a barbearia 1 tem o domínio
 * `localhost` — e o painel também roda em `localhost`.
 */
export function tenantResolvido(): Tenant | null {
  return (armazemTenant.getStore()?.tenant as Tenant | undefined) ?? null;
}

export function tenantAtual(): Tenant {
  const doContexto = armazemTenant.getStore()?.tenant;
  if (doContexto) return doContexto as Tenant;

  // ⚠️ O FALLBACK É LEGÍTIMO FORA DE REQUISIÇÃO, E PERIGOSO DENTRO DELA.
  //
  // Scripts, seeds e testes chamam isto sem contexto nenhum, e para eles cair
  // na barbearia 1 é o que se quer. DENTRO de uma requisição significa outra
  // coisa: "mostre a marca da barbearia de id 1 para quem pediu outra".
  //
  // Foi assim que, em 15/09/2026, o dono do Salão Jovem abriu o painel dele e
  // leu "Vintage" no topo. O fallback não errou sozinho — ele **escondeu** um
  // defeito de roteamento no middleware, devolvendo algo plausível em vez de
  // falhar. Silêncio que produz dado plausível é o pior modo de falhar que
  // existe: ninguém vai investigar uma tela que parece funcionar.
  //
  // O aviso não derruba nada — derrubar um script de manutenção seria pior.
  // Mas agora existe uma linha no log apontando para cá.
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[tenant] tenantAtual() sem contexto de requisição: caindo em ' +
      `"${TENANT_UNICO.slug}" (id ${TENANT_UNICO.id}). Se isto saiu durante uma ` +
      'requisição, ALGUÉM ESTÁ VENDO A BARBEARIA ERRADA — confira src/middleware.ts.'
    );
  }
  return TENANT_UNICO;
}
