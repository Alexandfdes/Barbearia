/**
 * QR code feito aqui mesmo, sem dependência — para o `scripts/operador-segundo-fator.mjs`
 * mostrar no terminal o código que o aplicativo do celular lê.
 *
 * Por que não um pacote do npm: o script roda uma vez, na máquina do dono, e o que ele
 * mostra é o segredo do segundo fator. Um pacote a mais seria mais um `npm install` antes
 * de usar, e mais um código de fora tocando no segredo. A conta é a da norma ISO/IEC
 * 18004, só a parte que este uso pede: modo byte, correção de erro M (aguenta ~15% do
 * código estragado), versões 1 a 10 — até 213 bytes, e o endereço `otpauth://` tem uns 90.
 *
 * Conferido de duas formas (`tests/qr.test.ts`): contra a tabela da norma (o polinômio
 * gerador e a informação de formato) e lendo de volta o que foi desenhado — formato,
 * máscara, os blocos com a correção de erro e o texto. E o script pede um código do
 * aplicativo antes de imprimir a variável: QR errado não passa dali.
 */

// ── Reed–Solomon sobre GF(256), polinômio 0x11D ────────────────────────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const multiplicar = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** O polinômio gerador de grau `grau`, do maior para o menor termo — `g[0]` é 1. */
export function geradorRS(grau) {
  let g = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j];
      novo[j + 1] ^= multiplicar(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

/** Os `grau` bytes de correção de erro de um bloco: o resto da divisão pelo gerador. */
export function correcaoRS(dados, grau) {
  const g = geradorRS(grau);
  const resto = new Array(grau).fill(0);
  for (const byte of dados) {
    const fator = byte ^ resto[0];
    resto.shift();
    resto.push(0);
    for (let j = 0; j < grau; j++) resto[j] ^= multiplicar(g[j + 1], fator);
  }
  return resto;
}

// ── As tabelas da norma, correção M ────────────────────────────────────────────

/** Por versão: bytes de correção por bloco, e os grupos [quantos blocos, bytes de dado cada]. */
export const BLOCOS_M = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
};

/** Onde ficam os centros dos padrões de alinhamento (os quadradinhos do meio). */
const ALINHAMENTO = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const bytesDeDado = (versao) => BLOCOS_M[versao][1].reduce((s, [n, d]) => s + n * d, 0);
const bitsDoTamanho = (versao) => (versao < 10 ? 8 : 16);

/** A menor versão em que o texto cabe — ou erro, acima da 10. */
export function versaoPara(bytes) {
  for (let v = 1; v <= 10; v++) {
    if (4 + bitsDoTamanho(v) + 8 * bytes.length <= 8 * bytesDeDado(v)) return v;
  }
  throw new Error(`Texto grande demais para o QR (${bytes.length} bytes; o máximo aqui é 213).`);
}

/** Os bytes que vão no desenho: dado, enchimento e correção, intercalados por bloco. */
export function palavrasDoQr(bytes, versao) {
  const [ec, grupos] = BLOCOS_M[versao];
  const capacidade = bytesDeDado(versao);
  const bits = [];
  const por = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  por(0b0100, 4);                       // modo byte
  por(bytes.length, bitsDoTamanho(versao));
  for (const b of bytes) por(b, 8);
  por(0, Math.min(4, capacidade * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const dados = [];
  for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; dados.length < capacidade; pad ^= 0xec ^ 0x11) dados.push(pad);

  const blocos = [];
  let k = 0;
  for (const [n, d] of grupos) {
    for (let i = 0; i < n; i++) {
      const bloco = dados.slice(k, k + d);
      k += d;
      blocos.push({ dados: bloco, ec: correcaoRS(bloco, ec) });
    }
  }
  const saida = [];
  const maior = Math.max(...blocos.map((b) => b.dados.length));
  for (let i = 0; i < maior; i++) for (const b of blocos) if (i < b.dados.length) saida.push(b.dados[i]);
  for (let i = 0; i < ec; i++) for (const b of blocos) saida.push(b.ec[i]);
  return saida;
}

// ── O desenho ──────────────────────────────────────────────────────────────────

/** Os 15 bits de formato: correção M (00) e a máscara, com o BCH e o XOR da norma. */
export function bitsDeFormato(mascara) {
  const dado = (0b00 << 3) | mascara;
  let resto = dado;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  return ((dado << 10) | resto) ^ 0x5412;
}

/** Os 18 bits de versão, da 7 em diante. */
export function bitsDeVersao(versao) {
  let resto = versao;
  for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
  return (versao << 12) | resto;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function desenharFormato(m, lado, mascara) {
  const bits = bitsDeFormato(mascara);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][lado - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[lado - 15 + i][8] = bit(i);
  m[lado - 8][8] = true; // o módulo escuro fixo
}

/** A pontuação de "difícil de ler" da norma — ganha a máscara com menos. */
function penalidade(m) {
  const lado = m.length;
  let pontos = 0;
  const linhas = [m, m[0].map((_, x) => m.map((linha) => linha[x]))];
  for (const grade of linhas) {
    for (const linha of grade) {
      // Regra 1: cinco ou mais iguais em sequência.
      let corrida = 1;
      for (let x = 1; x <= lado; x++) {
        if (x < lado && linha[x] === linha[x - 1]) corrida++;
        else { if (corrida >= 5) pontos += 3 + (corrida - 5); corrida = 1; }
      }
      // Regra 3: o desenho dos cantos (1:1:3:1:1) com 4 claros de um lado.
      const texto = linha.map((v) => (v ? '1' : '0')).join('');
      for (const padrao of ['10111010000', '00001011101']) {
        for (let i = texto.indexOf(padrao); i !== -1; i = texto.indexOf(padrao, i + 1)) pontos += 40;
      }
    }
  }
  // Regra 2: blocos 2×2 da mesma cor.
  for (let y = 0; y < lado - 1; y++) {
    for (let x = 0; x < lado - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) pontos += 3;
    }
  }
  // Regra 4: o quanto a proporção de escuros foge de 50%.
  const escuros = m.flat().filter(Boolean).length;
  pontos += 10 * Math.floor(Math.abs((escuros * 100) / (lado * lado) - 50) / 5);
  return pontos;
}

/**
 * O QR do texto: uma grade de `lado × lado`, `true` é escuro. Linha primeiro —
 * `m[y][x]`. Sem a margem clara (a "zona quieta"), que quem desenha acrescenta.
 *
 * `mascara` força uma das oito (para o teste conferir todas); sem ela, ganha a de
 * menor penalidade, como a norma manda.
 */
export function matrizQr(texto, { mascara } = {}) {
  const bytes = [...new TextEncoder().encode(texto)];
  const versao = versaoPara(bytes);
  const lado = 17 + 4 * versao;
  const m = Array.from({ length: lado }, () => new Array(lado).fill(false));
  const funcao = Array.from({ length: lado }, () => new Array(lado).fill(false));
  const pintar = (x, y, escuro) => { m[y][x] = escuro; funcao[y][x] = true; };

  for (let i = 0; i < lado; i++) { pintar(6, i, i % 2 === 0); pintar(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [lado - 4, 3], [3, lado - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= lado || y >= lado) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        pintar(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const pos = ALINHAMENTO[versao];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const canto = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (canto) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) pintar(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  // Reserva a área do formato (os bits certos entram com a máscara escolhida).
  desenharFormato(m, lado, 0);
  for (let i = 0; i < 9; i++) { funcao[i][8] = true; funcao[8][i] = true; }
  for (let i = 0; i < 8; i++) { funcao[8][lado - 1 - i] = true; funcao[lado - 1 - i][8] = true; }
  if (versao >= 7) {
    const bits = bitsDeVersao(versao);
    for (let i = 0; i < 18; i++) {
      const escuro = ((bits >>> i) & 1) === 1;
      const a = lado - 11 + (i % 3);
      const b = Math.floor(i / 3);
      pintar(a, b, escuro);
      pintar(b, a, escuro);
    }
  }

  // O dado, em zigue-zague de baixo para cima, de duas em duas colunas, pulando a 6.
  const palavras = palavrasDoQr(bytes, versao);
  let i = 0;
  for (let direita = lado - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let v = 0; v < lado; v++) {
      for (let j = 0; j < 2; j++) {
        const x = direita - j;
        const subindo = ((direita + 1) & 2) === 0;
        const y = subindo ? lado - 1 - v : v;
        if (!funcao[y][x] && i < palavras.length * 8) {
          m[y][x] = ((palavras[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  const comMascara = (k) => {
    const c = m.map((linha, y) => linha.map((v, x) => (funcao[y][x] ? v : v !== MASCARAS[k](x, y))));
    desenharFormato(c, lado, k);
    return c;
  };
  if (mascara !== undefined) return comMascara(mascara);
  let melhor = null;
  for (let k = 0; k < 8; k++) {
    const c = comMascara(k);
    const p = penalidade(c);
    if (!melhor || p < melhor.p) melhor = { c, p };
  }
  return melhor.c;
}

/**
 * O QR para o terminal: meio bloco por módulo, duas linhas da grade por linha de texto,
 * com a margem clara de 4 módulos. `cores`: preto sobre branco forçado pelo terminal
 * (ANSI) — sem isso, num terminal de fundo claro o código sairia invertido.
 */
export function qrNoTerminal(m, cores = true) {
  const margem = 4;
  const lado = m.length;
  const escuro = (x, y) => x >= 0 && y >= 0 && x < lado && y < lado && m[y][x];
  const linhas = [];
  for (let y = -margem; y < lado + margem; y += 2) {
    let linha = '';
    for (let x = -margem; x < lado + margem; x++) {
      const cima = escuro(x, y);
      const baixo = escuro(x, y + 1);
      linha += cima && baixo ? '█' : cima ? '▀' : baixo ? '▄' : ' ';
    }
    linhas.push(cores ? `\x1b[30;47m${linha}\x1b[0m` : linha);
  }
  return linhas.join('\n');
}
