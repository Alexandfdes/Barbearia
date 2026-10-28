/**
 * O segundo fator do painel do operador: o código de 6 dígitos de um aplicativo no
 * celular — Google Authenticator, Microsoft Authenticator, 1Password e companhia.
 * Escolhido pelo dono em 13/10/2026 (`docs/PENDENCIAS-ABERTAS.md` §3.9).
 *
 * ── POR QUE ──────────────────────────────────────────────────────────────────
 *
 * O painel do operador tira qualquer barbearia do ar e mostra a cobrança de todas. Até
 * aqui bastava a senha (`lib/operador.ts`): quem a descobrisse — num vazamento, num
 * computador emprestado — entrava. Com o código, a senha sozinha não abre.
 *
 * ── COMO LIGA ────────────────────────────────────────────────────────────────
 *
 * `npm run operador:segundo-fator`, na sua máquina, gera o segredo, mostra o QR code
 * para o aplicativo, pede um código para provar que o aplicativo ficou certo e só
 * então imprime a linha `OPERADOR_SEGUNDO_FATOR=totp:...` para o EasyPanel. Sem a
 * variável, a entrada continua sendo só a senha — como antes. Com ela fora do formato,
 * o painel do operador fica DESLIGADO (404), como com o hash da senha: quem pensa que
 * ligou o segundo fator não pode estar, sem saber, só com a senha.
 *
 * ── A CONTA ──────────────────────────────────────────────────────────────────
 *
 * TOTP, da RFC 6238, com os padrões que todo aplicativo entende: HMAC-SHA1, 6 dígitos,
 * 30 segundos. Vale o código de agora e o do passo de cada lado — 30 segundos de
 * relógio torto no celular ou no servidor. Código já usado não entra de novo: o último
 * passo aceito fica guardado, e um código igual ou mais velho é recusado. ⚠️ Guardado
 * na memória do processo, como os limites de tentativa: um deploy esquece, e o código
 * usado no minuto do deploy poderia entrar mais uma vez — com a senha junto.
 *
 * O `scripts/operador-segundo-fator.mjs` faz a mesma conta (`scripts/totp.mjs`), e
 * `tests/segundo-fator.test.ts` confere as duas com os exemplos da própria RFC.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type Ambiente = Record<string, string | undefined>;

export const VARIAVEL_DO_SEGUNDO_FATOR = 'OPERADOR_SEGUNDO_FATOR';

/** Os padrões que todo aplicativo entende. */
export const DIGITOS = 6;
export const PASSO_EM_SEGUNDOS = 30;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** `totp:` e o segredo em base32 — 16 bytes ou mais (26+ letras). O script gera 20. */
const FORMATO = /^totp:([A-Z2-7]{26,})$/;

/** Base32 da RFC 4648, sem `=`. Letra fora do alfabeto devolve `null`. */
export function deBase32(texto: string): Buffer | null {
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const letra of texto) {
    const i = ALFABETO.indexOf(letra);
    if (i === -1) return null;
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** O código de um passo (HOTP da RFC 4226 com o contador do relógio). */
export function codigoDoPasso(segredo: Buffer, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', segredo).update(contador).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

export function passoDe(agoraMs: number): number {
  return Math.floor(agoraMs / 1000 / PASSO_EM_SEGUNDOS);
}

let avisouFormato = false;

export type EstadoDoSegundoFator =
  | { ligado: false }
  | { ligado: true; segredo: Buffer; impressao: string }
  /** A variável existe, mas fora do formato: o painel do operador fica desligado. */
  | { ligado: 'invalido' };

/** O que a variável diz: sem ela, desligado; certa, ligado; torta, inválido. */
export function lerSegundoFator(env: Ambiente = process.env): EstadoDoSegundoFator {
  const limpo = env[VARIAVEL_DO_SEGUNDO_FATOR]?.trim();
  if (!limpo) return { ligado: false };
  const m = FORMATO.exec(limpo);
  const segredo = m ? deBase32(m[1]) : null;
  if (!segredo || segredo.length < 16) {
    if (!avisouFormato) {
      console.error(`[operador] ${VARIAVEL_DO_SEGUNDO_FATOR} está fora do formato de "npm run operador:segundo-fator" — o painel do operador fica desligado.`);
      avisouFormato = true;
    }
    return { ligado: 'invalido' };
  }
  return { ligado: true, segredo, impressao: createHash('sha256').update(limpo).digest('base64url').slice(0, 22) };
}

/** O último passo aceito, por segredo — o que impede o mesmo código de entrar duas vezes. */
const ultimoPassoAceito = new Map<string, number>();

/** Para os testes: esquece os códigos já usados. */
export function esquecerCodigosUsados(): void {
  ultimoPassoAceito.clear();
}

/**
 * O código confere com o de agora, ou com o de 30 segundos antes ou depois — e ainda
 * não foi usado? Aceito, o passo dele vira o último: o mesmo código não entra de novo.
 * Os três passos são conferidos sempre, em tempo constante.
 */
export function conferirCodigo(
  codigo: string,
  estado: Extract<EstadoDoSegundoFator, { ligado: true }>,
  agoraMs: number = Date.now(),
): boolean {
  const limpo = codigo.replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${DIGITOS}}$`).test(limpo)) return false;
  const digitado = Buffer.from(limpo);
  const agora = passoDe(agoraMs);
  const ultimo = ultimoPassoAceito.get(estado.impressao) ?? -Infinity;
  let aceito: number | null = null;
  for (const passo of [agora - 1, agora, agora + 1]) {
    const certo = timingSafeEqual(Buffer.from(codigoDoPasso(estado.segredo, passo)), digitado);
    if (certo && passo > ultimo && aceito === null) aceito = passo;
  }
  if (aceito === null) return false;
  ultimoPassoAceito.set(estado.impressao, aceito);
  return true;
}
