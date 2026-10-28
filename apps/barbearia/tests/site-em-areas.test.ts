// Todo conteúdo do site numa área da página — o topo (`<header>`), a principal (`<main>`),
// o rodapé (`<footer>`), a navegação (`<nav>`) ou uma área à parte (`<aside>`).
//
// POR QUE ESTE TESTE EXISTE
//
// Até 13/10/2026, seis telas do site tinham pedaços fora de qualquer área: o topo — o
// "Voltar" ou "Início" e o nome da barbearia — do agendar, da área do cliente (a de entrar
// e a de dentro), do link do horário e do portal, num bloco comum; e, no site de toda
// barbearia, o botão flutuante do WhatsApp. O leitor de tela lê esses pedaços, mas quem
// navega de área em área — o atalho dele — passava por cima. Conferido no navegador com o
// axe-core (a regra `region`), antes e depois (`docs/PENDENCIAS-ABERTAS.md` §2.40).
//
// A regra: numa página do site, o que fica fora da `<main>` está dentro de um `<header>`,
// `<footer>`, `<nav>` ou `<aside>` — da página ou do componente que ela usa —, ou não
// mostra nada: o fundo decorativo, o bloco que só embrulha. Não precisa de banco.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync, existsSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';

const normal = (c: string) => c.split(sep).join('/');

/**
 * O desenho do arquivo: sem o cabeçalho `---`, sem comentário, sem `<script>` e `<style>` —
 * e, no documento inteiro (o layout), só o `<body>`: o `<head>` não aparece na tela.
 */
function desenho(texto: string): string {
  const m = /^---\n[\s\S]*?\n---\n?/.exec(texto);
  let t = m ? texto.slice(m[0].length) : texto;
  const corpo = /<body\b[^>]*>([\s\S]*)<\/body>/.exec(t);
  if (corpo) t = corpo[1];
  return t
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '');
}

/** Os componentes que o arquivo importa, pelo nome: `Header` → `src/components/Header.astro`. */
function importados(arquivo: string, texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of texto.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.astro)['"]/g)) {
    mapa.set(m[1], normal(normalize(join(dirname(arquivo), m[2]))));
  }
  return mapa;
}

/** O que sobra fora das áreas: tira a `<main>` e cada `<header>`, `<footer>`, `<nav>`, `<aside>`. */
function foraDasAreas(t: string): string {
  let antes: string;
  do {
    antes = t;
    t = t.replace(/<(main|header|footer|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/, '');
  } while (t !== antes);
  return t;
}

/**
 * O que um arquivo deixa à mostra fora de qualquer área — vazio quando está tudo certo.
 * Componente usado fora das áreas é conferido por dentro, com a mesma regra.
 */
function soltos(arquivo: string, vistos = new Set<string>()): string[] {
  if (vistos.has(arquivo)) return [];
  vistos.add(arquivo);
  const texto = readFileSync(arquivo, 'utf8');
  const resto = foraDasAreas(desenho(texto));
  const achados: string[] = [];

  const usados = importados(arquivo, texto);
  for (const m of resto.matchAll(/<([A-Z]\w*)\b/g)) {
    const nome = m[1];
    if (nome === 'Fragment') continue;
    const caminho = usados.get(nome);
    if (!caminho || !existsSync(caminho)) { achados.push(`${arquivo}: componente <${nome}> sem arquivo`); continue; }
    achados.push(...soltos(caminho, vistos));
  }

  const semComponentes = resto.replace(/<\/?[A-Z]\w*\b[^>]*>/g, '');
  for (const m of semComponentes.matchAll(/<(a|button|img|input|select|textarea|svg|video|iframe|label)\b/g)) {
    achados.push(`${arquivo}: <${m[1]}> fora de qualquer área`);
  }
  const texto_ = semComponentes.replace(/<[^>]*>/g, '').replace(/<slot\s*\/>/g, '').replace(/\s+/g, ' ').trim();
  if (texto_) achados.push(`${arquivo}: texto fora de qualquer área — "${texto_.slice(0, 80)}"`);
  return achados;
}

const doSite = globSync('src/pages/**/*.astro').map(normal).sort()
  .filter((c) => /import\s+\w+\s+from\s+['"][./]+layouts\/Layout\.astro['"]/.test(readFileSync(c, 'utf8')));

describe('o site: todo conteúdo numa área da página', () => {
  it('o glob achou as telas do site (guarda contra passar em silêncio)', () => {
    expect(doSite).toEqual(expect.arrayContaining([
      'src/pages/index.astro', 'src/pages/agendar.astro', 'src/pages/cliente/entrar.astro',
      'src/pages/cliente/index.astro', 'src/pages/a/[token].astro', 'src/pages/portal.astro', 'src/pages/404.astro',
    ]));
  });

  it('nenhuma tela do site deixa conteúdo fora de uma área', () => {
    expect(doSite.flatMap((c) => soltos(c))).toEqual([]);
  });

  it('o botão do WhatsApp fica numa área própria, com nome', () => {
    const t = desenho(readFileSync('src/components/WhatsAppBar.astro', 'utf8'));
    expect(t).toMatch(/<aside aria-label="[^"]+">\s*<a\b[\s\S]*id="whatsapp-cta"[\s\S]*<\/a>\s*<\/aside>/);
  });

  it('controle: a regra pega o que as telas faziam até 13/10/2026', () => {
    // O topo num bloco comum, como estava no agendar.
    const topo = '<div class="border-b"><button>Voltar</button><span>{s.businessName}</span></div>\n<main>ok</main>';
    expect(foraDasAreas(topo)).toMatch(/Voltar/);
    expect(foraDasAreas(topo.replace('<div class="border-b">', '<header>').replace('</div>', '</header>'))).not.toMatch(/Voltar|businessName/);
    // O WhatsApp solto: o link fica de fora.
    expect(foraDasAreas('<a id="whatsapp-cta" aria-label="WhatsApp"><svg></svg></a>')).toMatch(/<a\b/);
    // O fundo decorativo não mostra nada: não conta. (Classe inventada de propósito: o
    // Tailwind lê também os testes, e uma classe dele aqui entraria no CSS do site.)
    const fundo = '<div class="embrulho"><div class="fundo-decorativo"></div><main>x</main></div>';
    expect(foraDasAreas(fundo).replace(/<[^>]*>/g, '').trim()).toBe('');
    // E o caminho até um componente, de verdade.
    expect(importados('src/pages/index.astro', readFileSync('src/pages/index.astro', 'utf8')).get('WhatsAppBar'))
      .toBe('src/components/WhatsAppBar.astro');
  });
});
