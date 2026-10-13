/**
 * As cores da logo, para sugerir em Configurações — 13/10/2026, a ponta que faltava do
 * `docs/PENDENCIAS-ABERTAS.md` §4.2: "extrair cores candidatas da logo (sugerir, nunca
 * aplicar sozinho)".
 *
 * Recebe os pixels da logo já desenhada num `<canvas>` do navegador (RGBA, quatro
 * números por pixel) e devolve até `max` cores, da mais presente para a menos. Quem
 * aplica é o dono: tocar numa sugestão só preenche o campo da cor, e vale depois de
 * Salvar — a página não grava nada sozinha.
 *
 * O que fica de fora:
 *   - o fundo transparente;
 *   - o que não tem cor — preto, branco, cinza, e o quase-preto com um tom: são a
 *     maioria dos pixels de quase toda logo, e o `derivarAccent` os recusa (devolve o
 *     verde padrão, porque não há matiz para preservar);
 *   - a borda serrilhada: um tom que ocupa menos de 5% dos pixels com cor;
 *   - o tom quase igual a um já escolhido.
 *
 * Sem dependência de navegador: o teste passa pixels feitos à mão
 * (`tests/cores-da-logo.test.ts`).
 */
import { ACCENT_PADRAO, derivarAccent } from './accent.js';

type Rgb = [number, number, number];

const paraHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

const distancia = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Pixel que conta como cor — e não como fundo, contorno ou texto preto. */
function temCor(r: number, g: number, b: number, alfa: number): boolean {
  if (alfa < 128) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 24) return false;                 // cinza, e o quase-preto com um tom
  const l = (max + min) / 2 / 255;
  if (l < 0.08 || l > 0.95) return false;          // quase preto, quase branco
  const s = l > 0.5 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
  return s >= 0.15;                                 // o mesmo corte do `derivarAccent`
}

export function sugestoesDaLogo(rgba: ArrayLike<number>, max = 4): string[] {
  // Baldes de 32 níveis por canal: o mesmo tom com variação de compressão cai junto.
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>();
  let comCor = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (!temCor(r, g, b, rgba[i + 3])) continue;
    const chave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const balde = baldes.get(chave) ?? { n: 0, r: 0, g: 0, b: 0 };
    balde.n++; balde.r += r; balde.g += g; balde.b += b;
    baldes.set(chave, balde);
    comCor++;
  }

  const escolhidas: Rgb[] = [];
  for (const balde of [...baldes.values()].sort((a, b) => b.n - a.n)) {
    if (balde.n < comCor * 0.05) break;
    const rgb: Rgb = [balde.r / balde.n, balde.g / balde.n, balde.b / balde.n];
    if (escolhidas.some((e) => distancia(e, rgb) < 60)) continue;
    // `derivarAccent` devolve o próprio padrão quando a cor não tem matiz: sugerir o
    // verde do produto como "cor da sua logo" seria mentira.
    if (derivarAccent(paraHex(rgb)) === ACCENT_PADRAO) continue;
    escolhidas.push(rgb);
    if (escolhidas.length >= max) break;
  }
  return escolhidas.map(paraHex);
}
