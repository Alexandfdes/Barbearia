/**
 * Autenticação da área de envios. Uma senha só, sua, vinda do ambiente.
 *
 * Não é sistema de usuários: é uma porta com cadeado numa área que só você
 * acessa. Se um dia houver mais de uma pessoa operando, isto vira tabela.
 *
 * O cookie é assinado com HMAC — o navegador não consegue forjar um válido
 * sem a senha. Sem biblioteca nova: só o `crypto` do próprio Node.
 */
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

export const COOKIE = 'envios_sessao';
const DURACAO_HORAS = 12;

/**
 * A senha vem do ambiente. Sem ela, a área fica fechada — nunca aberta por padrão.
 *
 * Duas defesas contra armadilhas clássicas de arquivo .env criado no Windows:
 *
 * 1. BOM. O PowerShell, com `Out-File -Encoding utf8`, grava três bytes
 *    invisíveis no início do arquivo. A primeira variável vira "\uFEFFADMIN_SENHA"
 *    e some. Aqui procuramos também por esse nome sujo.
 * 2. Fim de linha do Windows. Um "\r" pendurado no fim faz a senha certa ser
 *    recusada, porque o valor guardado tem um caractere invisível a mais.
 *    Por isso o trim.
 */
export function senhaConfigurada(): string | null {
  let bruta = process.env.ADMIN_SENHA;

  if (bruta === undefined) {
    const chaveSuja = Object.keys(process.env).find(
      (k) => k.replace(/^\uFEFF/, '').trim() === 'ADMIN_SENHA'
    );
    if (chaveSuja) bruta = process.env[chaveSuja];
  }

  const s = bruta?.trim();
  return s && s.length >= 6 ? s : null;
}

function segredo(): string {
  // Deriva o segredo de assinatura da própria senha. Trocar a senha invalida
  // todas as sessões abertas, que é o comportamento desejado.
  return process.env.SESSION_SECRET ?? senhaConfigurada() ?? randomBytes(32).toString('hex');
}

function assinar(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

/** Compara sem vazar tempo — evita descobrir a senha medindo a resposta. */
export function senhaCorreta(tentativa: string): boolean {
  const real = senhaConfigurada();
  if (!real) return false;
  const a = Buffer.from(tentativa);
  const b = Buffer.from(real);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function criarCookie(): string {
  const expira = Date.now() + DURACAO_HORAS * 3600_000;
  const payload = String(expira);
  const valor = `${payload}.${assinar(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${valor}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${DURACAO_HORAS * 3600}`;
}

export function limparCookie(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function autenticado(request: Request): boolean {
  if (!senhaConfigurada()) return false;
  const cabecalho = request.headers.get('cookie') ?? '';
  const m = cabecalho.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [payload, assinatura] = m[1].split('.');
  if (!payload || !assinatura) return false;
  const esperada = assinar(payload);
  if (assinatura.length !== esperada.length) return false;
  if (!timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return false;
  return Number(payload) > Date.now();
}
