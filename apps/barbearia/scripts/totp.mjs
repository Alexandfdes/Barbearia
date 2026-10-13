/**
 * A conta do código de 6 dígitos (TOTP, RFC 6238) para o `scripts/operador-segundo-fator.mjs`.
 *
 * É a MESMA de `src/lib/segundoFator.ts` — o script roda com `node` puro, sem ler
 * TypeScript, e por isso tem a sua. `tests/segundo-fator.test.ts` confere as duas com os
 * exemplos da RFC. Mudou uma, mude a outra.
 */
import { createHmac, randomBytes } from 'node:crypto';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 da RFC 4648, sem `=` — o formato que todo aplicativo de código aceita. */
export function paraBase32(bytes) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

/** 20 bytes: o tamanho da chave do HMAC-SHA1 que a RFC recomenda. */
export function segredoNovo() {
  return randomBytes(20);
}

export function codigoDoPasso(segredo, passo) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', segredo).update(contador).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

export function passoDe(agoraMs) {
  return Math.floor(agoraMs / 1000 / 30);
}

/** O código confere com o de agora ou com o de 30 segundos antes ou depois? */
export function codigoConfere(codigo, segredo, agoraMs = Date.now()) {
  const limpo = String(codigo).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(limpo)) return false;
  const agora = passoDe(agoraMs);
  return [agora - 1, agora, agora + 1].some((p) => codigoDoPasso(segredo, p) === limpo);
}
