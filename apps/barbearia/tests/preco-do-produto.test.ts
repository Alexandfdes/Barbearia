// A mensalidade aparece nos dois aplicativos: na landing, por `PRECO.mensal` de
// `apps/vendas/src/config.ts`, e na tela de assinatura do painel, por
// `PRECO_MENSAL` de `src/lib/produto.ts`. A landing promete; o painel cobra.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRECO_MENSAL } from '../src/lib/produto';

const mensalDoVendas = () =>
  Number(readFileSync('../vendas/src/config.ts', 'utf8').match(/export const PRECO = \{[\s\S]*?\bmensal:\s*(\d+)/)?.[1]);

describe('a mensalidade', () => {
  it('é a mesma na landing e no painel', () => {
    expect(mensalDoVendas()).toBe(PRECO_MENSAL);
  });
});
