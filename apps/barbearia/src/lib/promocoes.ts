/**
 * O desconto máximo de uma promoção em horário ocioso — a regra, pura e só com inteiros
 * (decisão do dono, 17/11/2026: `docs/PENDENCIAS-ABERTAS.md` §2.72).
 *
 * Uma promoção num horário vazio só compensa se trouxer cliente novo bastante para cobrir o
 * desconto dado a quem já viria pagando o preço cheio:
 *
 *     d_max = g / (x + g) × (P − v) / P
 *
 *  - x: clientes que já pagariam o preço cheio naquele horário (a média do histórico);
 *  - g: clientes novos que a promoção traz — premissa da barbearia, de 2 a 6;
 *  - P: o preço cheio do combo, em centavos — o serviço mais o produto, sem desconto nenhum;
 *  - v: o custo do produto, em centavos.
 *
 * De onde sai: sem promoção, o lucro do horário é x·(P − v); com o desconto d, é
 * (x + g)·(P·(1 − d) − v). O segundo não pode ficar abaixo do primeiro.
 *
 * ⚠️ P é o preço CHEIO, mesmo no dia em que o combo já dá o desconto dele. Assim a conta fica
 * do lado seguro: quem já viria pagaria menos que P, e o limite exato seria maior que este —
 * nunca menor. A promoção só muda o preço quando passa do desconto do combo, porque os dois
 * não se somam: vale o maior (`descontoNoHorario`, em `lib/combo.ts`).
 *
 * ⚠️ Sem float. x é uma média — A atendidos em S semanas —, e entra como fração:
 *
 *     d_max = g·S·(P − v) / ((A + g·S)·P)
 *
 * O resultado é uma fração exata, e quem precisa de número escolhe o arredondamento: o
 * décimo mais próximo para mostrar ("28,6%"), e o inteiro DE BAIXO para o limite do campo —
 * o de cima passaria do desconto que mantém o lucro.
 *
 * Roda no servidor e no navegador: não importe nada de servidor aqui.
 */
import { centavosDoCampo } from './dinheiro.js';

/** Uma fração exata entre 0 e 1: `num / den`, com `den > 0`. */
export interface Fracao {
  readonly num: number;
  readonly den: number;
}

export interface PremissasDaPromocao {
  /** A: atendimentos concluídos na faixa, somados nas semanas que entraram na conta. */
  atendidos: number;
  /** S: quantas semanas entraram na soma. A média é `atendidos / semanas`. */
  semanas: number;
  /** g: clientes novos que a promoção traz. */
  clientesNovos: number;
  /** P: o preço cheio, em centavos. */
  precoCents: number;
  /** v: o custo do produto, em centavos. */
  custoCents: number;
}

const inteiroNaoNegativo = (n: number) => Number.isSafeInteger(n) && n >= 0;

/**
 * O desconto máximo que mantém o lucro, como fração do preço cheio. `null` quando a conta
 * não tem sentido: sem semana nenhuma, sem cliente novo, preço zero ou número que não é
 * inteiro não negativo. Custo maior ou igual ao preço dá zero — não há margem para dar.
 */
export function descontoMaximo(p: PremissasDaPromocao): Fracao | null {
  const { atendidos, semanas, clientesNovos, precoCents, custoCents } = p;
  if (![atendidos, semanas, clientesNovos, precoCents, custoCents].every(inteiroNaoNegativo)) return null;
  if (semanas === 0 || clientesNovos === 0 || precoCents === 0) return null;
  const margem = precoCents - custoCents;
  if (margem <= 0) return { num: 0, den: 1 };
  return {
    num: clientesNovos * semanas * margem,
    den: (atendidos + clientesNovos * semanas) * precoCents,
  };
}

/** Em décimos de ponto percentual, arredondado ao mais próximo (meio para cima): 2/7 → 286. */
export function emDecimosDePorcento(f: Fracao): number {
  const den = BigInt(f.den);
  return Number((BigInt(f.num) * 2000n + den) / (2n * den));
}

/** O maior percentual inteiro que não passa da fração: 2/7 (28,57%) → 28. */
export function porcentoInteiroAte(f: Fracao): number {
  return Number((BigInt(f.num) * 100n) / BigInt(f.den));
}

/** O teto de qualquer desconto de promoção — o mesmo do desconto do combo (0–90%). */
export const DESCONTO_MAXIMO_PCT = 90;

/** O maior desconto que o campo aceita: o inteiro de baixo do limite, até o teto. */
export function limiteDoCampo(f: Fracao): number {
  return Math.min(DESCONTO_MAXIMO_PCT, porcentoInteiroAte(f));
}

/** "28,6%", "20%" — décimos de ponto para gente ler. */
export function textoDoPorcento(decimos: number): string {
  const resto = decimos % 10;
  const inteiro = (decimos - resto) / 10;
  return resto === 0 ? `${inteiro}%` : `${inteiro},${resto}%`;
}

/**
 * O custo que o dono digitou no produto, em centavos. Vazio é "não informado" (`null`) — e a
 * promoção do combo com esse produto fica bloqueada. Até R$ 100.000, como o preço.
 */
export function custoDoCampo(texto: string): { ok: true; centavos: number | null } | { ok: false; erro: string } {
  const t = String(texto ?? '').trim();
  if (!t) return { ok: true, centavos: null };
  const centavos = centavosDoCampo(t);
  if (!Number.isFinite(centavos) || centavos < 0 || centavos > 10_000_000) {
    return { ok: false, erro: 'Custo inválido: use um valor em reais, como 12,50 — ou deixe em branco.' };
  }
  return { ok: true, centavos };
}

/** O g: quantos clientes novos uma promoção traz. A barbearia escolhe; o banco confere (0022). */
export const CLIENTES_NOVOS = { minimo: 2, maximo: 6, padrao: 4 } as const;

/** O g lido do banco, ou o padrão se vier fora da faixa — como o `hex()` faz com a cor. */
export function clientesNovosValido(n: unknown): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= CLIENTES_NOVOS.minimo && n <= CLIENTES_NOVOS.maximo
    ? n
    : CLIENTES_NOVOS.padrao;
}

/** Quantas semanas de histórico entram na conta, e o mínimo com dado para haver sugestão. */
export const SEMANAS_DO_HISTORICO = 8;
export const SEMANAS_MINIMAS = 4;

/** Horário ocioso: ocupação abaixo de 30% na faixa. */
export const OCUPACAO_OCIOSA_PCT = 30;

/**
 * Faixa com tempo de sobra para valer promoção: as mesmas 2 horas, somadas no período, que o
 * relatório pede para apontar a "faixa mais vazia" (`pages/admin/relatorios.astro`).
 */
export const DISPONIVEL_MINIMO_MIN = 120;

/** A faixa está ociosa? Ocupado abaixo de 30% do disponível — conta de inteiros, sem divisão. */
export function faixaOciosa(disponivelMin: number, ocupadoMin: number): boolean {
  return disponivelMin >= DISPONIVEL_MINIMO_MIN && ocupadoMin * 100 < OCUPACAO_OCIOSA_PCT * disponivelMin;
}
