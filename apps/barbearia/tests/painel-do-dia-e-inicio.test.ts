// Três defeitos de tela achados no ensaio do roteiro de testes (revisão de 30/10/2026).
// Conferidos no navegador contra o build; aqui ficam as guardas de código.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const inicio = readFileSync('src/pages/admin/index.astro', 'utf8');
const dia = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');
const lista = readFileSync('src/components/admin/AgendaLista.astro', 'utf8');

describe('o gráfico "Receita esta semana" do Início', () => {
  it('as colunas esticam até a altura do gráfico e a barra ocupa o que sobra', () => {
    // Com items-end, cada coluna tinha só a altura do rótulo, a barra (em %) ficava com 0 px, e o
    // gráfico saía vazio.
    const grafico = inicio.slice(inicio.indexOf('data-grafico-semana') - 80, inicio.indexOf('data-grafico-semana') + 1200);
    expect(grafico).toMatch(/class="flex items-stretch gap-2 h-32" data-grafico-semana/);
    expect(grafico).toMatch(/class="relative w-full flex items-end flex-1 min-h-0"/);
    expect(grafico).not.toMatch(/style="height: 100%;"/);
  });
});

describe('a agenda do dia', () => {
  it('os bloqueios entram na mesma lista dos atendimentos, na ordem da hora', () => {
    // Vinham todos antes: o bloqueio das 15:00 acima do atendimento das 10:30.
    expect(dia).toMatch(/<AgendaLista appts=\{apptList\} role=\{session\.role\} bloqueios=\{blockList\} \/>/);
    expect(dia).not.toMatch(/blockList\.map\(/);
    expect(lista).toMatch(/\.sort\(\(x, y\) => \(x\.hora < y\.hora \? -1/);
  });

  it('depois de uma falta ou de um cancelamento, a página volta a ser montada — o "Próximo" se atualiza', () => {
    for (const status of ["'no_show'", "'cancelled'"]) {
      const i = dia.indexOf(`updateApptCardStatus(id, ${status});`);
      expect(i, status).toBeGreaterThan(0);
      expect(dia.slice(i, i + 220), status).toMatch(/recarregarResumo\(\);/);
    }
  });
});
