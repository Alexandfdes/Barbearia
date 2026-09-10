import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = '__bayron_session';
const TTL = 30 * 24 * 60 * 60;

import type { SessaoComTenant } from './tenant.js';
import { carregarTenants, tenantDaSessaoOuNulo } from './tenant.js';

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

    // Aquece o cache ANTES de validar — é o único `await` do caminho, e é o que
    // deixa `tenantDaSessao()` síncrona nas 53 chamadas seguintes.
    await carregarTenants();
    if (!tenantDaSessaoOuNulo(data)) return null;

    return data;
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
