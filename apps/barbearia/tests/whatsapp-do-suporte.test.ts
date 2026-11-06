// O WhatsApp do suporte (05/11/2026, `src/lib/produto.ts`): o painel e os avisos mandam o dono
// para ele enquanto a cobrança está desligada. Tem de ser o mesmo da landing — o dono que fala com
// a landing e com o painel fala com a mesma pessoa —, e esta guarda reprova se divergirem.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { linkDoSuporte, WHATSAPP_SUPORTE } from '../src/lib/produto';

describe('o WhatsApp do suporte', () => {
  it('é o mesmo da landing', () => {
    const daLanding = readFileSync('../vendas/src/config.ts', 'utf8').match(/export const WHATSAPP = '(\d+)'/)?.[1];
    expect(daLanding).toBeTruthy();
    expect(WHATSAPP_SUPORTE).toBe(daLanding);
  });

  it('o link é o do wa.me, com a mensagem codificada', () => {
    expect(linkDoSuporte()).toBe(`https://wa.me/${WHATSAPP_SUPORTE}`);
    expect(linkDoSuporte('Olá! barbearia x & y')).toBe(`https://wa.me/${WHATSAPP_SUPORTE}?text=Ol%C3%A1!%20barbearia%20x%20%26%20y`);
  });
});
