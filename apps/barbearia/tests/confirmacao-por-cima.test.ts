// A confirmação da agenda do dia abre por cima do detalhe do agendamento (revisão de 27/10/2026).
//
// "Faltou" e "Cancelar" ficam no detalhe (#detail-modal) e pedem confirmação (#confirm-modal).
// Os dois eram `z-50`, e o detalhe vem depois no HTML: a confirmação abria ATRÁS dele, e o
// botão "Sim, faltou" não recebia o clique — para o barbeiro, o botão não fazia nada.
// Reproduzido no navegador. Mesmo empate, mesma pilha: a ordem no HTML decide.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const pagina = readFileSync('src/pages/admin/dia/[date].astro', 'utf8');

function camada(id: string): number {
  const tag = pagina.match(new RegExp(`<div id="${id}"[^>]*class="([^"]*)"`));
  expect(tag, `#${id} existe`).toBeTruthy();
  const z = tag![1].match(/\bz-(?:\[(\d+)\]|(\d+))/);
  expect(z, `#${id} tem z-index`).toBeTruthy();
  return Number(z![1] ?? z![2]);
}

describe('a confirmação da agenda do dia', () => {
  it('fica acima de toda janela de onde ela é chamada', () => {
    const conf = camada('confirm-modal');
    for (const de of ['detail-modal', 'comanda-modal', 'sale-modal']) {
      expect(conf, `confirmação acima de #${de}`).toBeGreaterThan(camada(de));
    }
  });
});
