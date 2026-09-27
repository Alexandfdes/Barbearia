// Script inline não é processado — então não pode ter `import` nem TypeScript.
//
// ── O DEFEITO ────────────────────────────────────────────────────────────────
//
// `admin/dia/[date].astro` — a agenda do dia, a tela que o barbeiro mais abre —
// ganhou `<script define:vars={{ TZ }}>` para receber o fuso do servidor. Só que
// `define:vars` implica `is:inline`: o Astro para de processar o bloco e o
// navegador recebe o texto como ele está no arquivo. O bloco tinha `import` e era
// TypeScript, e o navegador recusava TUDO com "Cannot use import statement outside
// a module". Calendário, WhatsApp, comanda, venda, concluir atendimento: mortos.
//
// Nenhum teste abria a tela no navegador — foi a verificação ao vivo de
// 25/09/2026 que viu o erro. Este guarda lê o fonte e não precisa de navegador.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

interface Bloco { arquivo: string; linha: number; atributos: string; corpo: string }

function blocosInline(): Bloco[] {
  const blocos: Bloco[] = [];
  for (const caminho of globSync('src/**/*.astro')) {
    const arquivo = caminho.split(sep).join('/');
    const fonte = readFileSync(caminho, 'utf8');
    // `^\s*` e a flag `m`: a tag de verdade abre a linha. Sem isso, um comentário
    // que CITA a tag (o de `clientData` na agenda cita) era tomado como o começo
    // do bloco, e o bloco real — com os atributos — ficava invisível. Foi assim
    // que a primeira versão deste guarda deixou passar a mutação que ele existe
    // para pegar.
    for (const m of fonte.matchAll(/^[ \t]*<script([^>]*)>([\s\S]*?)<\/script>/gm)) {
      if (!/define:vars|is:inline/.test(m[1])) continue;
      blocos.push({ arquivo, linha: fonte.slice(0, m.index).split('\n').length, atributos: m[1], corpo: m[2] });
    }
  }
  return blocos;
}

/** Linhas de código — sem os comentários, que podem falar de `as HTMLElement` à vontade. */
function codigo(corpo: string): string {
  return corpo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/** Sintaxe que só o TypeScript entende — no navegador é erro de sintaxe. */
const SO_TYPESCRIPT: [string, RegExp][] = [
  ['asserção não-nula `)!`', /\)!\s*[;.)]/],
  ['conversão `as Tipo`', /\bas\s+[A-Z]\w*/],
  ['parâmetro ou variável tipada', /[(,]\s*\w+\s*:\s*(string|number|boolean|any)\b|\b(let|const)\s+\w+\s*:\s*[A-Za-z{[]/],
  ['genérico em chamada `<Tipo>(`', /\w<[A-Z]\w*>\(/],
];

describe('scripts inline (`define:vars` / `is:inline`)', () => {
  it('o recorte acha os blocos inline que existem — guarda contra o regex quebrar em silêncio', () => {
    expect(blocosInline().length).toBeGreaterThanOrEqual(3);
  });

  it('nenhum tem `import` — script inline não é módulo', () => {
    const comImport = blocosInline()
      .filter((b) => /^\s*import\s/m.test(codigo(b.corpo)))
      .map((b) => `${b.arquivo}:${b.linha}`);
    expect(comImport, 'tire o define:vars e passe o dado por data-atributo').toEqual([]);
  });

  it('nenhum tem sintaxe de TypeScript — script inline não é transpilado', () => {
    const achados: string[] = [];
    for (const b of blocosInline()) {
      for (const [nome, re] of SO_TYPESCRIPT) {
        if (re.test(codigo(b.corpo))) achados.push(`${b.arquivo}:${b.linha} — ${nome}`);
      }
    }
    expect(achados, 'escreva JavaScript puro, ou tire o define:vars').toEqual([]);
  });
});
