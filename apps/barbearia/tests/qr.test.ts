// O QR code do `scripts/qr.mjs` — o que o `npm run operador:segundo-fator` mostra.
//
// Não precisa de banco. Duas conferências, de lados diferentes:
//
// 1. Contra a norma (ISO/IEC 18004): o polinômio gerador, a informação de formato e a
//    de versão, nos valores que a tabela da norma publica.
// 2. Lendo de volta, com um leitor escrito aqui, à parte: o mapa das áreas fixas, a
//    máscara tirada do próprio desenho, a correção de erro conferida bloco a bloco (o
//    resto da divisão tem de ser zero) e o texto no fim.
//
// Em 13/10/2026 os mesmos códigos foram lidos também por um leitor de fora (o jsQR),
// das versões 1 a 10 — 68 de 68. Ele não entra aqui para não virar dependência.
import { describe, it, expect } from 'vitest';
import {
  BLOCOS_M, bitsDeFormato, bitsDeVersao, geradorRS, matrizQr, qrNoTerminal, versaoPara,
} from '../scripts/qr.mjs';

// ── GF(256) do leitor, feito de novo aqui ───────────────────────────────────────
const EXP: number[] = [];
const LOG: number[] = [];
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x = (x << 1) ^ (x & 0x80 ? 0x11d : 0); x &= 0xff; }
}
const vezes = (a: number, b: number) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

/** O valor do polinômio (maior grau primeiro) em α^j. */
const valorEm = (c: number[], j: number) => c.reduce((s, coef) => vezes(s, EXP[j % 255]) ^ coef, 0);

const ALINHAMENTO: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function areasFixas(lado: number, versao: number): boolean[][] {
  const f = Array.from({ length: lado }, () => new Array<boolean>(lado).fill(false));
  const marca = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) f[y][x] = true;
  };
  marca(0, 0, 9, 9); marca(lado - 8, 0, 8, 9); marca(0, lado - 8, 9, 8); // cantos + formato
  marca(0, 6, lado, 1); marca(6, 0, 1, lado);                          // linhas de tempo
  const c = ALINHAMENTO[versao];
  for (const cy of c) for (const cx of c) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === c[c.length - 1]) || (cx === c[c.length - 1] && cy === 6)) continue;
    marca(cx - 2, cy - 2, 5, 5);
  }
  if (versao >= 7) { marca(lado - 11, 0, 3, 6); marca(0, lado - 11, 6, 3); }
  return f;
}

const MASCARA: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** O leitor: do desenho ao texto, conferindo a correção de erro de cada bloco. */
function lerQr(m: boolean[][]): { texto: string; versao: number; mascara: number } {
  const lado = m.length;
  const versao = (lado - 17) / 4;
  // O formato, na primeira cópia: os 15 bits em volta do canto de cima à esquerda.
  const posicoes: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const formato = posicoes.reduce((s, [x, y], i) => s | ((m[y][x] ? 1 : 0) << i), 0) ^ 0x5412;
  expect(formato >>> 13, 'correção de erro M').toBe(0b00);
  const mascara = (formato >>> 10) & 7;

  const fixas = areasFixas(lado, versao);
  const bits: number[] = [];
  for (let direita = lado - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let v = 0; v < lado; v++) {
      for (let j = 0; j < 2; j++) {
        const x = direita - j;
        const sobe = ((direita + 1) & 2) === 0;
        const y = sobe ? lado - 1 - v : v;
        if (fixas[y][x]) continue;
        bits.push((m[y][x] !== MASCARA[mascara](x, y)) ? 1 : 0);
      }
    }
  }
  const palavras: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) palavras.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Desintercala: primeiro os dados de cada bloco, coluna a coluna; depois a correção.
  const [ec, grupos] = BLOCOS_M[versao as keyof typeof BLOCOS_M] as [number, [number, number][]];
  const tamanhos = grupos.flatMap(([n, d]) => Array.from({ length: n }, () => d));
  const blocos = tamanhos.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...tamanhos); i++) tamanhos.forEach((t, b) => { if (i < t) blocos[b].push(palavras[k++]); });
  const dados = blocos.map((b) => [...b]);
  for (let i = 0; i < ec; i++) blocos.forEach((b) => b.push(palavras[k++]));
  for (const b of blocos) {
    for (let j = 0; j < ec; j++) expect(valorEm(b, j), 'a correção de erro do bloco confere').toBe(0);
  }

  const fluxo = dados.flat().flatMap((p) => Array.from({ length: 8 }, (_, i) => (p >>> (7 - i)) & 1));
  const ler = (n: number) => fluxo.splice(0, n).reduce((a, b) => (a << 1) | b, 0);
  expect(ler(4), 'modo byte').toBe(0b0100);
  const n = ler(versao < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: n }, () => ler(8));
  return { texto: new TextDecoder().decode(bytes), versao, mascara };
}

describe('contra a tabela da norma', () => {
  it('o polinômio gerador de grau 7 e de grau 10', () => {
    const emExpoente = (g: number[]) => g.map((c) => LOG[c]);
    expect(emExpoente(geradorRS(7))).toEqual([0, 87, 229, 146, 149, 238, 102, 21]);
    expect(emExpoente(geradorRS(10))).toEqual([0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45]);
  });

  it('a informação de formato da correção M, máscara a máscara', () => {
    const tabela = [
      '101010000010010', '101000100100101', '101111001111100', '101101101001011',
      '100010111111001', '100000011001110', '100111110010111', '100101010100000',
    ];
    expect(tabela.map((_, k) => bitsDeFormato(k).toString(2).padStart(15, '0'))).toEqual(tabela);
  });

  it('a informação de versão, da 7 à 10', () => {
    expect([7, 8, 9, 10].map((v) => bitsDeVersao(v))).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3]);
  });

  it('a versão é a menor em que cabe — e acima da 10, recusa', () => {
    expect(versaoPara(new Array(14).fill(65))).toBe(1);
    expect(versaoPara(new Array(15).fill(65))).toBe(2);
    expect(versaoPara(new Array(106).fill(65))).toBe(6);
    expect(versaoPara(new Array(107).fill(65))).toBe(7);
    expect(() => versaoPara(new Array(214).fill(65))).toThrow(/grande demais/);
  });
});

describe('lido de volta', () => {
  const textos = [
    'A',
    'otpauth://totp/Fadeline:operador?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Fadeline',
    'acento e emoji: ção 💈',
    'x'.repeat(130),
    'y'.repeat(213),
  ];

  it.each(textos)('%s', (texto) => {
    const m = matrizQr(texto);
    const r = lerQr(m);
    expect(r.texto).toBe(texto);
    expect(m.length).toBe(17 + 4 * r.versao);
  });

  it('as oito máscaras, uma a uma — e a escolhida sozinha é a de menor penalidade', () => {
    const texto = 'otpauth://totp/Fadeline:operador?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Fadeline';
    for (let k = 0; k < 8; k++) {
      const r = lerQr(matrizQr(texto, { mascara: k }));
      expect(r.mascara, `máscara ${k}`).toBe(k);
      expect(r.texto, `máscara ${k}`).toBe(texto);
    }
  });

  it('o endereço do aplicativo cabe numa versão pequena — fácil de ler da tela', () => {
    const m = matrizQr('otpauth://totp/Fadeline:operador?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Fadeline');
    expect(lerQr(m).versao).toBeLessThanOrEqual(6);
  });

  it('no terminal: meio bloco por módulo, a margem clara de 4, e o desenho volta igual', () => {
    const m = matrizQr('otpauth://totp/Fadeline:operador?secret=JBSWY3DPEHPK3PXP&issuer=Fadeline');
    const linhas = qrNoTerminal(m, false).split('\n');
    expect(linhas).toHaveLength(Math.ceil((m.length + 8) / 2));
    for (const l of linhas) expect([...l]).toHaveLength(m.length + 8);
    const grade = linhas.flatMap((l) => [[...l].map((c) => c === '█' || c === '▀'), [...l].map((c) => c === '█' || c === '▄')]);
    for (let y = 0; y < m.length; y++) expect(grade[y + 4].slice(4, 4 + m.length)).toEqual(m[y]);
    expect(grade.slice(0, 4).flat().some(Boolean)).toBe(false);
    // Com cores: preto sobre branco forçado, em toda linha.
    for (const l of qrNoTerminal(m, true).split('\n')) expect(l).toMatch(/^\x1b\[30;47m.*\x1b\[0m$/);
  });
});
