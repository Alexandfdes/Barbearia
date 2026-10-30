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

/**
 * Um cookie POR NÚMERO (`__fadeline_aparelho_<telefone>`): o dono de duas barbearias, com dois
 * números, não perde a exceção de uma ao entrar na outra (revisão de 30/10/2026).
 */
export const PREFIXO_DO_COOKIE = '__fadeline_aparelho_';
/** 60 dias (30/10/2026; era um ano): o aparelho de sempre renova a cada login certo. */
const VALIDADE = 60 * 24 * 60 * 60;

/** Quem entrou: o número, o barbeiro e quando — para a troca de senha derrubar a exceção. */
export interface QuemEntrou { telefone: string; barberId: number; senhaTrocadaEm: Date | null }

export async function cookieDoAparelho(quem: QuemEntrou, agora: Date = new Date()): Promise<string> {
  const lacre = await sealData({ telefone: quem.telefone, barberId: quem.barberId, em: agora.getTime() }, { password: secret(), ttl: VALIDADE });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${PREFIXO_DO_COOKIE}${quem.telefone}=${lacre}; HttpOnly${secure}; SameSite=Strict; Max-Age=${VALIDADE}; Path=/api/auth`;
}

/**
 * Este navegador já entrou com este número, como ESTE barbeiro, DEPOIS da última troca de senha?
 *
 * Até 30/10/2026 o lacre guardava só o telefone e valia um ano: quem entrou uma vez — o
 * ex-funcionário, o computador da barbearia, o notebook roubado — tirava o limite por conta de
 * qualquer IP, mesmo depois da senha trocada (revisão de 30/10/2026). Agora a exceção morre com a
 * senha trocada (`senha_trocada_em`, que também derruba as sessões) e com o barbeiro desligado.
 */
export async function aparelhoConhecido(request: Request, quem: QuemEntrou): Promise<boolean> {
  const nome = `${PREFIXO_DO_COOKIE}${quem.telefone}=`;
  const cookies = request.headers.get('cookie') ?? '';
  const valor = cookies.split(/;\s*/).find((c) => c.startsWith(nome))?.slice(nome.length);
  if (!valor) return false;
  try {
    const dado = await unsealData<{ telefone?: string; barberId?: number; em?: number }>(valor, { password: secret(), ttl: VALIDADE });
    if (dado.telefone !== quem.telefone || dado.barberId !== quem.barberId || typeof dado.em !== 'number') return false;
    return !quem.senhaTrocadaEm || dado.em >= quem.senhaTrocadaEm.getTime();
  } catch {
    return false;
  }
}
