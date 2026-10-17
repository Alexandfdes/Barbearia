const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_TRIES = 5;

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>();

interface RLOptions {
  maxTries?: number;
  windowMs?: number;
}

export function checkRateLimit(key: string, opts: RLOptions = {}): { ok: boolean; retryAfterSecs?: number } {
  const maxTries = opts.maxTries ?? DEFAULT_MAX_TRIES;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now   = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (entry.count >= maxTries) {
    return { ok: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { ok: true };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * O limite do login do painel por CONTA, de qualquer IP (`pages/api/auth/login.ts`):
 * 10 tentativas a cada 15 minutos e 50 por dia, por WhatsApp. A senha trocada pelo link
 * de "esqueci" zera os dois — é a saída do dono que alguém trancou de propósito.
 */
export const LIMITE_DA_CONTA = {
  curto: { maxTries: 10, windowMs: 15 * 60 * 1000 },
  dia: { maxTries: 50, windowMs: 24 * 60 * 60 * 1000 },
};
export const chavesDaConta = (telefone: string): [string, string] => [`admin-login-conta:${telefone}`, `admin-login-conta-dia:${telefone}`];
