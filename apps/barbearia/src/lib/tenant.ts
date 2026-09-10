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
 * Barbearia suspensa continua entrando por até `TTL_MS`. É aceitável numa
 * cobrança mensal, e o login já recusa suspensa na porta de entrada
 * (`pages/api/auth/login.ts`) — o atraso só afeta quem já estava dentro.
 *
 * Barbearia recém-criada demora o mesmo tanto para aparecer. Por isso
 * `invalidarTenants()` existe: o provisionamento chama e o cliente novo não
 * espera.
 */
import { db } from '../db/index.js';
import { tenants as tenantsTable } from '../db/schema.js';

export interface Tenant {
  id: number;
  /** Vira o subdomínio: <slug>.barbearianoar.com.br */
  slug: string;
  status: 'active' | 'suspended' | 'cancelled';
  /** Domínio próprio, quando o cliente optou por um (ver `PRECIFICACAO.md` §6). */
  domain: string | null;
}

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
 * quando a barbearia não está `active`. Quem chama trata como "não autenticado".
 *
 * Na prática ninguém precisa tratar: `getSession()` já faz essa checagem e
 * devolve `null`, e toda rota do painel começa com `if (!session) return 401`.
 * Esta função existir separada é o que mantém as 53 chamadas intactas.
 */
export function tenantDaSessao(session: SessaoComTenant | null): Tenant {
  const t = session?.tenantId != null ? porId.get(session.tenantId) : undefined;
  if (!t || t.status !== 'active') {
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
  return t && t.status === 'active' ? t : null;
}

/**
 * Site público: descobre a barbearia pelo endereço acessado.
 *
 * ⚠️ AINDA DEVOLVE `TENANT_UNICO`. Hoje cada barbearia tem a própria instância e
 * o próprio banco, então o host não precisa distinguir ninguém. Isso muda no
 * passo 6 (`ARQUITETURA-MULTI-TENANT-V1.md` §9), quando o site público passar a
 * servir várias barbearias do mesmo banco — aí `resolverHost()` abaixo entra no
 * lugar deste corpo.
 *
 * Ligar agora seria pior que esperar: sem o cache aquecido (nada aqui chama
 * `getSession()`), toda página pública precisaria de um await no caminho quente.
 */
export function tenantDoHost(_request: Request): Tenant {
  return TENANT_UNICO;
}

/**
 * O que `tenantDoHost()` vai usar no passo 6. Já testado, ainda não ligado.
 *
 * Resolve `barbeariax.barbearianoar.com.br` pelo slug e um domínio próprio pela
 * coluna `domain`. Tenant não encontrado devolve `null` — quem chama responde
 * **404**, nunca um tenant padrão: servir o site da barbearia errada é pior que
 * não servir nada.
 */
export function resolverHost(host: string | null): Tenant | null {
  if (!host) return null;
  const limpo = host.toLowerCase().split(':')[0].replace(/\.$/, '');

  const porDominioProprio = porDominio.get(limpo);
  if (porDominioProprio?.status === 'active') return porDominioProprio;

  const sub = limpo.split('.')[0];
  const t = porSlug.get(sub);
  return t && t.status === 'active' ? t : null;
}

/**
 * Ponte para código que não recebe requisição nem sessão — os componentes do
 * site que só chamam `await getSettings()`.
 *
 * ⚠️ NÃO usar em código novo. Enquanto o site público for uma instância por
 * barbearia, devolver `TENANT_UNICO` está certo. No passo 6 esta função precisa
 * sumir, e cada componente passar a receber o tenant de quem o renderizou.
 */
export function tenantAtual(): Tenant {
  return TENANT_UNICO;
}
