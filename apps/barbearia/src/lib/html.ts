/**
 * Texto livre para dentro de HTML: escapa `&`, `<`, `>` e as duas aspas.
 *
 * ⚠️ Todo nome que o dono escreve no painel — da barbearia, do serviço, do
 * barbeiro, do produto, do combo — é texto livre: o painel limita o tamanho, não
 * os caracteres. Montado em `innerHTML` sem passar por aqui, "Corte <3" quebra a
 * tela e `<img onerror=…>` roda no navegador de todo cliente da barbearia (skill
 * `barbearia-vazamento-entre-clientes` §3).
 *
 * Sem dependência nenhuma: serve à página montada no servidor e ao script que
 * roda no navegador do cliente (`pages/agendar.astro`).
 */
const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto: unknown): string {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}
