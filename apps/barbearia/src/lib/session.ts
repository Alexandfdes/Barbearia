import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = '__bayron_session';
const TTL = 30 * 24 * 60 * 60;

import { and, eq } from 'drizzle-orm';
import type { SessaoComTenant, Tenant } from './tenant.js';
import { carregarTenants, tenantDaSessaoOuNulo, tenantPorIdMesmoForaDoAr } from './tenant.js';
import { situacaoDe, type Situacao } from './situacao.js';
import { db, first } from '../db/index.js';
import { barbers } from '../db/schema.js';

/**
 * Sessão do painel.
 *
 * Estende `SessaoComTenant` de propósito: é o que permite passar a sessão
 * direto para `tenantDaSessao()`. No passo 3 (`ARQUITETURA-MULTI-TENANT-V1.md`
 * §9) o `tenantId` deixa de ser opcional e passa a ser gravado no login — o
 * campo já existe aqui para que essa mudança não exija tocar em cada rota.
 */
export interface SessionData extends SessaoComTenant {
  barberId: number;
  role: 'admin' | 'barber';
  /**
   * Quando o cookie foi emitido, em milissegundos — carimbado por
   * `makeSessionCookie`, nunca por quem chama. É o que faz trocar a senha tirar
   * todo mundo de dentro: sessão emitida antes da troca deixa de valer
   * (`conferirBarbeiro`, abaixo). Cookie de antes de 09/10/2026 não tem; conta
   * como emitido no começo dos tempos.
   */
  emitidaEm?: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      'SESSION_SECRET não definido. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  if (s.length < 32) {
    throw new Error('SESSION_SECRET muito curto: iron-session exige no mínimo 32 caracteres.');
  }
  return s;
}

/**
 * Lê e VALIDA a sessão do painel.
 *
 * ⚠️ A validação do tenant mora aqui de propósito. Toda rota do painel já começa
 * com `if (!session) return 401`, então recusar aqui protege as **53** chamadas
 * de `tenantDaSessao()` sem tocar em nenhuma delas — e sem tornar aquela função
 * assíncrona, o que exigiria 53 `await` novos e 53 chances de esquecer um.
 *
 * Recusa em três casos, e todos aparecem para o barbeiro como "faça login":
 *
 *  1. **Sessão de antes do passo 7**, sem `tenantId`. Cair num tenant padrão
 *     serviria os dados da barbearia errada. Na prática: no dia da virada, cada
 *     barbeiro entra uma vez a mais.
 *  2. **Tenant que sumiu do banco.**
 *  3. **Barbearia fora do ar — suspensa ou encerrada.** É por aqui que o
 *     inadimplente perde o painel: o teste e a carência vencidos saem do relógio
 *     (`lib/situacao.ts`); o status mudado no banco, com até 30s de atraso, o TTL
 *     do cache em `lib/tenant.ts`. Quem está fora do ar ainda chega à tela de
 *     assinatura — por `sessaoForaDoAr()`, abaixo, e só por ela.
 */
export async function getSession(request: Request): Promise<SessionData | null> {
  try {
    const data = await lerCookie(request);
    if (!data) return null;

    // Aquece o cache ANTES de validar — é o que deixa `tenantDaSessao()` síncrona
    // nas 53 chamadas seguintes.
    await carregarTenants();
    if (!tenantDaSessaoOuNulo(data)) return null;

    return await conferirBarbeiro(data);
  } catch {
    return null;
  }
}

/**
 * A sessão de quem está com a barbearia FORA DO AR — e só dela.
 *
 * O painel de barbearia suspensa abre uma tela só, a de assinatura, com a agenda
 * para consulta (decisão de 08/10/2026, `docs/PLANO-PRODUTIZACAO.md` §13). Para o
 * resto do painel, essa sessão não existe: `getSession()` continua devolvendo
 * `null`, e as 53 rotas continuam respondendo "não autenticado" sem mudar uma
 * linha. Quem decide para onde ela vai é o `src/middleware.ts`.
 *
 * Encerrada não entra nem aqui.
 */
export async function sessaoForaDoAr(
  request: Request,
): Promise<{ sessao: SessionData; tenant: Tenant; situacao: Situacao } | null> {
  try {
    const data = await lerCookie(request);
    if (!data) return null;

    await carregarTenants();
    const tenant = tenantPorIdMesmoForaDoAr(data.tenantId);
    if (!tenant) return null;
    const situacao = situacaoDe(tenant);
    if (situacao.fase !== 'suspensa') return null;

    const sessao = await conferirBarbeiro(data);
    return sessao ? { sessao, tenant, situacao } : null;
  } catch {
    return null;
  }
}

/** O cookie aberto e com forma de sessão — sem conferir barbearia nem barbeiro. */
async function lerCookie(request: Request): Promise<SessionData | null> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const data = await unsealData<SessionData>(match[1], { password: secret(), ttl: TTL });
  if (typeof data.barberId !== 'number' || !data.role || data.tenantId == null) return null;
  return data;
}

async function conferirBarbeiro(data: SessionData): Promise<SessionData | null> {
  // ⚠️ O BARBEIRO TAMBÉM É RECONSULTADO, E ANTES DISTO NÃO ERA.
  //
  // A barbearia era revalidada a cada requisição; o barbeiro, nunca. Papel e
  // situação viajavam **lacrados no cookie por até 30 dias**, então:
  //
  //   · demitir alguém (`active = false`) não tirava o acesso dele;
  //   · rebaixar de admin para barbeiro não tirava os poderes de admin;
  //   · trocar a senha não derrubava sessão nenhuma.
  //
  // "Tirar o acesso" que não tira o acesso é pior que não existir: o dono
  // acredita que resolveu, e não volta a olhar.
  //
  // É uma consulta por chave primária a cada requisição autenticada. Poderia ser
  // cache com TTL, como o de tenants — mas o painel serve poucas requisições por
  // minuto, e o atraso de um cache aqui é exatamente o que estamos consertando.
  //
  // O filtro por `tenant_id` não é zelo: este caminho roda ANTES de `comTenant`,
  // na conexão de dono, que enxerga todas as barbearias. Sem ele, um cookie com
  // `barberId` de uma barbearia e `tenantId` de outra passaria.
  const barbeiro = await first(db
    .select({ role: barbers.role, active: barbers.active, senhaTrocadaEm: barbers.senhaTrocadaEm })
    .from(barbers)
    .where(and(eq(barbers.id, data.barberId), eq(barbers.tenantId, data.tenantId!))));

  if (!barbeiro || !barbeiro.active) return null;

  // ⚠️ TROCAR A SENHA TIRA TODO MUNDO DE DENTRO — e até 09/10/2026 não tirava.
  //
  // O cookie é lacrado e não tem registro no servidor: uma sessão aberta valia
  // os 30 dias inteiros, com a senha trocada ou não (`PENDENCIAS-ABERTAS.md`
  // §2.13). O caso que importa é o pior: o dono desconfia que alguém sabe a
  // senha dele, troca — e quem já estava dentro continua dentro.
  //
  // A troca grava `senha_trocada_em` (migration 0008), e o cookie emitido ANTES
  // dela deixa de valer aqui. Pelo e-mail de senha nova, pela tela da equipe ou
  // pelo script de suporte: os três gravam.
  const trocada = barbeiro.senhaTrocadaEm?.getTime();
  if (trocada !== undefined && (data.emitidaEm ?? 0) < trocada) return null;

  // O papel do banco vence o do cookie: rebaixar tem efeito na requisição
  // seguinte, sem precisar derrubar a sessão.
  return { ...data, role: barbeiro.role as SessionData['role'] };
}

export async function makeSessionCookie(data: SessionData): Promise<string> {
  // O carimbo é sempre AGORA: quem chama não escolhe quando a sessão nasceu.
  const seal   = await sealData({ ...data, emitidaEm: Date.now() }, { password: secret(), ttl: TTL });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${seal}; HttpOnly${secure}; SameSite=Lax; Max-Age=${TTL}; Path=/`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
