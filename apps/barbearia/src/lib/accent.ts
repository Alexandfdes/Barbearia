/**
 * Derivação da cor de destaque da barbearia.
 *
 * O dono manda a logo no onboarding; daí sai UMA cor de marca. Deste arquivo saem
 * os três valores que o tema usa (`--color-teal`, `--color-teal-hover`,
 * `--color-teal-light`), com contraste garantido.
 *
 * ⚠️ A REGRA DESTE SITE É O INVERSO DA DO SITE DE VENDAS.
 * Aqui o botão é PREENCHIMENTO ESCURO com TEXTO BRANCO. Logo:
 *   - o acento precisa ser escuro o bastante para o branco passar em cima dele;
 *   - o hover ESCURECE (clarear reduziria o contraste do texto branco);
 *   - a variante `light` é a que vira TEXTO sobre o fundo escuro do site.
 * No site de vendas é o contrário: preenchimento claro, texto grafite, hover clareia.
 * Não copiar a regra de um para o outro.
 *
 * Por que normalizar em vez de usar a cor da logo direto: quatro das cores mais
 * comuns em logo de barbearia (preto, vinho, marinho, vermelho) reprovam como
 * preenchimento. A matiz da marca é preservada; só a luminosidade é ajustada.
 */

export interface Accent {
  /** Preenchimento de botão. Texto branco por cima. */
  color: string;
  /** Estado hover — escurece, para o texto branco ganhar contraste. */
  hover: string;
  /** Variante clara: usada como TEXTO sobre as superfícies escuras do site. */
  light: string;
}

/** Padrão do produto, usado quando a logo não tem cor aproveitável. */
export const ACCENT_PADRAO: Accent = {
  color: '#0f766e',
  hover: '#0b5f58',
  light: '#5eead4',
};

/** Superfície mais clara do site — o pior caso para a variante `light`. */
const SUPERFICIE_CLARA = '#222222';
const ALVO = 4.5;

/** Aceita só #rgb ou #rrggbb. É o que impede injeção de CSS pelo campo do painel. */
export function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function normalizarHex(v: string): string {
  const h = v.trim().toLowerCase();
  if (h.length === 4) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

function paraRgb(hex: string): [number, number, number] {
  const h = normalizarHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function paraHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function canalLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminância relativa (WCAG 2.1). */
export function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex);
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** Razão de contraste entre duas cores (WCAG 2.1). Vai de 1 a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbParaHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = paraRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6;
  else if (max === g0) h = ((b0 - r0) / d + 2) / 6;
  else h = ((r0 - g0) / d + 4) / 6;
  return [h, s, l];
}

function hslParaHex(h: number, s: number, l: number): string {
  if (s === 0) return paraHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return paraHex(canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255);
}

/**
 * Deriva os três valores do tema a partir da cor de marca.
 *
 * - Logo sem cor (preto, branco, cinza): devolve o padrão. NÃO inventa matiz —
 *   forçar saturação em cinza produz cores absurdas (preto viraria rosa).
 * - Cor que já passa com branco: mantida como está.
 * - Cor clara demais: escurecida o mínimo necessário, preservando matiz.
 *
 * Nunca devolve combinação que reprove: o retorno é sempre seguro de aplicar.
 */
export function derivarAccent(marca: string): Accent {
  if (!isHex(marca)) return ACCENT_PADRAO;
  const hex = normalizarHex(marca);
  const [h, s, l] = rgbParaHsl(hex);

  // Logo em escala de cinza: não há matiz para preservar.
  if (s < 0.15) return ACCENT_PADRAO;

  // 1. Preenchimento: escurece só até o branco passar.
  let color = hex;
  if (contraste('#ffffff', color) < ALVO) {
    let p = l;
    color = ACCENT_PADRAO.color;
    while (p > 0.04) {
      p -= 0.01;
      const cand = hslParaHex(h, s, p);
      if (contraste('#ffffff', cand) >= ALVO) {
        color = cand;
        break;
      }
    }
  }

  // 2. Hover: escurece mais um pouco. Com texto branco, escurecer AUMENTA o contraste.
  const [, sc, lc] = rgbParaHsl(color);
  const hover = hslParaHex(h, sc, Math.max(lc - 0.07, 0.05));

  // 3. Variante clara: vira texto sobre a superfície escura. Clareia até passar.
  let light = hslParaHex(h, Math.min(sc, 0.75), Math.max(lc, 0.7));
  if (contraste(light, SUPERFICIE_CLARA) < ALVO) {
    let p = 0.7;
    while (p < 0.97) {
      p += 0.01;
      const cand = hslParaHex(h, Math.min(sc, 0.75), p);
      if (contraste(cand, SUPERFICIE_CLARA) >= ALVO) {
        light = cand;
        break;
      }
    }
  }

  return { color, hover, light };
}

/**
 * Monta o CSS que sobrescreve os tokens do Tailwind em runtime.
 *
 * Funciona porque o Tailwind v4 compila `bg-teal` para
 * `background-color: var(--color-teal)` — verificado no build real. Trocar a
 * variável retinge tudo que deriva dela, sem rebuild.
 *
 * Valores fora do formato hex são descartados: é isto que impede o campo do
 * painel de virar injeção de CSS.
 */
export function cssDoAccent(a: Partial<Accent>): string {
  const seguro = (v: unknown, padrao: string) => (isHex(v) ? normalizarHex(v as string) : padrao);
  const color = seguro(a.color, ACCENT_PADRAO.color);
  const hover = seguro(a.hover, ACCENT_PADRAO.hover);
  const light = seguro(a.light, ACCENT_PADRAO.light);
  return `:root{--color-teal:${color};--color-teal-hover:${hover};--color-teal-light:${light}}`;
}
