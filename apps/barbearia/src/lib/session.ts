import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = '__bayron_session';
const TTL = 30 * 24 * 60 * 60;

import { and, eq } from 'drizzle-orm';
import type { SessaoComTenant } from './tenant.js';
import { carregarTenants, tenantDaSessaoOuNulo } from './tenant.js';
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
 *  3. **Barbearia suspensa ou cancelada.** É por aqui que o inadimplente perde o
 *     acesso — com até 30s de atraso, o TTL do cache em `lib/tenant.ts`.
 */
export async function getSession(request: Request): Promise<SessionData | null> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    const data = await unsealData<SessionData>(match[1], { password: secret(), ttl: TTL });
    if (typeof data.barberId !== 'number' || !data.role) return null;

    // Aquece o cache ANTES de validar — é o que deixa `tenantDaSessao()` síncrona
    // nas 53 chamadas seguintes.
    await carregarTenants();
    if (!tenantDaSessaoOuNulo(data)) return null;

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
      .select({ role: barbers.role, active: barbers.active })
      .from(barbers)
      .where(and(eq(barbers.id, data.barberId), eq(barbers.tenantId, data.tenantId!))));

    if (!barbeiro || !barbeiro.active) return null;

    // O papel do banco vence o do cookie: rebaixar tem efeito na requisição
    // seguinte, sem precisar derrubar a sessão.
    return { ...data, role: barbeiro.role as SessionData['role'] };
  } catch {
    return null;
  }
}

export async function makeSessionCookie(data: SessionData): Promise<string> {
  const seal   = await sealData(data, { password: secret(), ttl: TTL });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${seal}; HttpOnly${secure}; SameSite=Lax; Max-Age=${TTL}; Path=/`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
