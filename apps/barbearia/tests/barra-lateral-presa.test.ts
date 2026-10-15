// A barra lateral do painel fica presa na tela no computador — a do dono e a do operador.
//
// POR QUE ESTE TESTE EXISTE
//
// Até 15/10/2026 a lateral rolava junto com a página: no fim de uma tela longa — a de
// Configurações, a agenda do dia —, o menu tinha subido e sumido, e para trocar de tela o
// dono rolava tudo de volta. Pedido dele, testando o painel (`docs/PENDENCIAS-ABERTAS.md`
// §2.46). Agora, no computador, ela é da altura da janela e fica presa enquanto a página
// rola; o menu que não cabe rola por dentro, com o Sair sempre à vista no rodapé. No
// celular nada muda: é a gaveta que o botão do topo abre. Conferido no navegador, contra o
// build, no computador alto e baixo, no celular e no operador.
//
// E o empilhamento, que a lateral presa deixa à vista o tempo todo: ela fica acima da
// barra de salvar que vai de ponta a ponta (a de Configurações) e abaixo das janelas das
// telas, que escurecem tudo. Não precisa de banco.
//
// (Nenhuma classe nova do Tailwind escrita aqui: ele lê também os testes, e uma classe
// dele neste arquivo entraria no CSS do site. As que aparecem já estão nos layouts.)
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { sep } from 'node:path';

const LAYOUTS = ['src/layouts/AdminLayout.astro', 'src/layouts/OperadorLayout.astro'];
const ler = (c: string) => readFileSync(c, 'utf8');
const classes = (s: string) => s.split(/\s+/).filter(Boolean);

const daLateral = (texto: string) => classes(/<aside id="lateral"\s+class="([^"]+)"/.exec(texto)?.[1] ?? '');
const doMenu = (texto: string) => classes(/<aside id="lateral"[\s\S]*?<nav class="([^"]+)"/.exec(texto)?.[1] ?? '');
const doGrupo = (texto: string) => classes(/grupos\.map\(\(g\) => \(\s*<div class="([^"]+)"/.exec(texto)?.[1] ?? '');

/** O z-index de uma lista de classes, ou null: `z-50` → 50, `z-[60]` → 60. */
const zDe = (cs: string[]) => {
  for (const c of cs) {
    const m = /^z-(?:(\d+)|\[(\d+)\])$/.exec(c);
    if (m) return Number(m[1] ?? m[2]);
  }
  return null;
};

describe('a barra lateral presa na tela', () => {
  it('no computador, presa pelo topo e da altura da janela; no celular, a gaveta de sempre', () => {
    for (const l of LAYOUTS) {
      const cs = daLateral(ler(l));
      expect(cs.length, `${l}: achei a lateral`).toBeGreaterThan(5);
      // A posição no computador. As classes de posição do Tailwind são uma palavra só, e a
      // única de uma palavra com lg: na lateral tem de ser a que prende.
      expect(cs.filter((c) => /^lg:[a-z]+$/.test(c)), l).toEqual(['lg:sticky']);
      expect(cs, l).toEqual(expect.arrayContaining(['lg:h-screen', 'lg:bottom-auto']));
      // No celular: fora da tela, presa à janela, de cima a baixo, até o botão do topo abrir.
      expect(cs, l).toEqual(expect.arrayContaining(['fixed', 'inset-y-0', '-translate-x-full', 'lg:translate-x-0']));
      expect(ler(l), `${l}: o botão do topo ainda abre a gaveta`).toMatch(/classList\.toggle\('-translate-x-full', !abrir\)/);
    }
  });

  it('o menu que não cabe rola por dentro, e o Sair fica no rodapé, fora da rolagem', () => {
    for (const l of LAYOUTS) {
      const t = ler(l);
      expect(daLateral(t), l).toEqual(expect.arrayContaining(['flex', 'flex-col']));
      expect(doMenu(t), l).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto', '[scrollbar-width:thin]']));
      // O rodapé com o Sair vem depois do menu, ainda dentro da lateral.
      const lateral = t.slice(t.indexOf('<aside id="lateral"'), t.indexOf('</aside>'));
      expect(lateral.indexOf('</nav>'), l).toBeGreaterThan(0);
      expect(lateral.slice(lateral.indexOf('</nav>')), l).toMatch(/>Sair</);
      // O último grupo sem sobra embaixo: sem ela, o menu rolava por dentro com todos os
      // itens à vista, só por causa do espaço vazio do fim.
      expect(doGrupo(t), l).toContain('last:mb-0');
    }
  });

  it('as duas laterais são a mesma, como decidido em 12/10/2026', () => {
    const [dono, operador] = LAYOUTS.map(ler);
    expect(daLateral(operador)).toEqual(daLateral(dono));
    expect(doMenu(operador)).toEqual(doMenu(dono));
    expect(doGrupo(operador)).toEqual(doGrupo(dono));
  });

  it('acima da barra de salvar de ponta a ponta, abaixo das janelas que escurecem a tela', () => {
    const zLateral = zDe(daLateral(ler(LAYOUTS[0])));
    expect(zLateral).toBe(40);
    const arquivos = [
      ...globSync('src/pages/admin/**/*.astro'), ...globSync('src/components/admin/**/*.astro'),
      ...globSync('src/pages/operador/**/*.astro'), ...globSync('src/components/operador/**/*.astro'),
    ].map((c) => c.split(sep).join('/')).sort();
    expect(arquivos).toEqual(expect.arrayContaining(['src/pages/admin/configuracoes.astro', 'src/pages/admin/dia/[date].astro']));

    const janelas: string[] = [];
    const barras: string[] = [];
    for (const arq of arquivos) {
      for (const m of ler(arq).matchAll(/class="([^"]*)"/g)) {
        const cs = classes(m[1]);
        if (!cs.includes('fixed')) continue;
        if (cs.includes('inset-0')) {
          janelas.push(arq);
          expect(zDe(cs), `${arq}: a janela fica por cima da lateral`).toBeGreaterThan(zLateral!);
        }
        if (cs.includes('bottom-0') && cs.includes('left-0') && cs.includes('right-0')) {
          barras.push(arq);
          expect(zDe(cs), `${arq}: a barra de ponta a ponta fica embaixo da lateral, sem cobrir o Sair`).toBeLessThan(zLateral!);
        }
      }
    }
    // Guarda contra passar em silêncio: as cinco janelas da agenda do dia, a de produtos, a
    // de combos, e a barra de salvar de Configurações.
    expect(janelas.length).toBeGreaterThanOrEqual(7);
    expect(barras).toContain('src/pages/admin/configuracoes.astro');
  });
});
