/**
 * O ícone da aba do navegador — o do site e o do painel de cada barbearia.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────────
 *
 * Sem ícone enviado em Configurações, o site e o painel caíam em
 * `public/favicon.svg`, que é o ícone que vem com o Astro — o framework do site.
 * Toda barbearia nova abria com a marca de um framework na aba do navegador do
 * cliente (conferido no código em 27/09/2026).
 *
 * Sem ícone próprio, a aba mostra a inicial da barbearia na cor de destaque dela.
 * A cor passa por `derivarAccent()`: é a cor dos botões do site, que já tem
 * contraste garantido com texto branco — a letra fica legível com qualquer cor
 * que o dono escolher (skill `barbearia-paleta`).
 */
import { derivarAccent } from './accent.js';

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** A primeira letra ou algarismo do nome, em maiúscula. Nome sem nenhum dos dois: um ponto. */
export function inicialDoNome(nome: string): string {
  const m = (nome ?? '').normalize('NFC').match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase('pt-BR') : '•';
}

/** Um SVG quadrado com a inicial do nome sobre a cor, como `data:` — não depende de arquivo nenhum. */
export function iconeComLetra(nome: string, cor: string): string {
  const fundo = derivarAccent(cor).color; // cor inválida cai no padrão do produto
  const letra = inicialDoNome(nome).replace(/[&<>"']/g, (c) => ENTIDADES[c]);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    `<rect width="64" height="64" rx="14" fill="${fundo}"/>` +
    '<text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="36" font-weight="700" fill="#ffffff">' +
    `${letra}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** O ícone que o dono enviou; sem ele, a inicial da barbearia na cor dela. */
export function iconeDaAba(s: {
  faviconPath: string | null;
  shortName: string;
  businessName: string;
  accentColor: string;
}): string {
  return s.faviconPath || iconeComLetra(s.shortName || s.businessName, s.accentColor);
}
