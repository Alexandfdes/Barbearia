/**
 * Resolvedor de tenant — o ÚNICO lugar que responde "de quem é esta requisição".
 *
 * Regra 5 da skill `barbearia-multi-tenant`: nenhuma rota lê o `Host` ou a sessão
 * direto. Tudo passa por aqui. É essa concentração que faz a migração para
 * multi-tenant ser uma mudança de dias em vez de meses.
 *
 * ── ESTADO ATUAL ──────────────────────────────────────────────────────────────
 * O banco ainda é de uma barbearia só e a tabela `tenants` ainda não existe
 * (passo 3 de `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9). Então as duas funções
 * abaixo ignoram a entrada e devolvem `TENANT_UNICO`.
 *
 * Isso é deliberado: a FORMA já é a definitiva, só o corpo é provisório. Quando
 * os tenants entrarem, muda o miolo destas duas funções e nada mais.
 */

export interface Tenant {
  id: number;
  /** Vira o subdomínio: <slug>.barbearianoar.com.br */
  slug: string;
  status: 'active' | 'suspended' | 'cancelled';
}

/**
 * A barbearia única enquanto não há tabela `tenants`.
 * O id 1 casa com a linha 1 de `settings`, que é o que existe hoje no banco.
 */
export const TENANT_UNICO: Tenant = {
  id: 1,
  slug: 'principal',
  status: 'active',
};

/** Sessão do painel. Depois do passo 3 ela carrega `tenantId`. */
export interface SessaoComTenant {
  tenantId?: number;
}

/**
 * Site público: descobre a barbearia pelo endereço acessado.
 *
 * FUTURO (passo 3): normalizar o host e buscar em `tenants` por `domain` ou por
 * `slug` (subdomínio). Tenant não encontrado deve devolver 404 — nunca cair num
 * tenant padrão, que serviria o site da barbearia errada.
 */
export function tenantDoHost(_request: Request): Tenant {
  return TENANT_UNICO;
}

/**
 * Painel: a barbearia vem da sessão, não do endereço — o painel é central.
 *
 * FUTURO (passo 3): ler `session.tenantId`, buscar a linha em `tenants` e
 * **revalidar o status a cada requisição** (regra 6 da skill). Sessão viva de
 * tenant suspenso é como um inadimplente continua usando o sistema.
 */
export function tenantDaSessao(_session: SessaoComTenant | null): Tenant {
  return TENANT_UNICO;
}

/**
 * Ponte para código que ainda não recebe requisição nem sessão (componentes do
 * site que só chamam `getSettings()`).
 *
 * ⚠️ NÃO usar em código novo. Toda rota e toda página devem usar
 * `tenantDoHost()` ou `tenantDaSessao()`. Esta função existe só para o passo 1
 * não virar uma reescrita de dez componentes, e deve sumir no passo 3.
 */
export function tenantAtual(): Tenant {
  return TENANT_UNICO;
}
