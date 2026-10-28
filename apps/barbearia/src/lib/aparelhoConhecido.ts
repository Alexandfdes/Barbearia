/**
 * O aparelho onde este WhatsApp já entrou no painel — o "cookie de aparelho" (27/10/2026).
 *
 * POR QUE EXISTE. O limite do login por CONTA (`LIMITE_DA_CONTA`, em `rateLimit.ts`) segura
 * a força bruta espalhada por vários IPs — e, de brinde, deixava qualquer pessoa trancar o
 * dono fora do painel: o login é o WhatsApp que está no site dele, e o limite contava antes
 * de conferir a senha, inclusive a certa. Com 2 IPs o bloqueio ficava contínuo. Achado na
 * revisão de 27/10/2026.
 *
 * A saída é a de sempre para isso: o navegador onde o dono já entrou ganha um cookie
 * lacrado com o número dele, e com ele o limite POR CONTA não vale — continua valendo o
 * por IP e por IP + número, que seguram quem tenta daquele aparelho. Quem tenta de fora não
 * tem o cookie e segue barrado; o dono, no aparelho de sempre, entra.
 *
 * O cookie só vai às rotas de `/api/auth/` e não dá acesso a nada sozinho: diz "este
 * navegador já acertou a senha deste número", nada mais.
 */
import { sealData, unsealData } from 'iron-session';
import { secret } from './session.js';

export const COOKIE_DO_APARELHO = '__fadeline_aparelho';
const UM_ANO = 365 * 24 * 60 * 60;

export async function cookieDoAparelho(telefone: string): Promise<string> {
  const lacre = await sealData({ telefone }, { password: secret(), ttl: UM_ANO });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_DO_APARELHO}=${lacre}; HttpOnly${secure}; SameSite=Strict; Max-Age=${UM_ANO}; Path=/api/auth`;
}

/** Este navegador já entrou com este número? */
export async function aparelhoConhecido(request: Request, telefone: string): Promise<boolean> {
  const cookies = request.headers.get('cookie') ?? '';
  const valor = cookies.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_DO_APARELHO}=`))?.slice(COOKIE_DO_APARELHO.length + 1);
  if (!valor) return false;
  try {
    const dado = await unsealData<{ telefone?: string }>(valor, { password: secret(), ttl: UM_ANO });
    return dado.telefone === telefone;
  } catch {
    return false;
  }
}
