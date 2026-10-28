// A página de 404 não mostra marca nenhuma fora de uma barbearia (26/10/2026).
//
// O middleware deixa passar SEM barbearia alguns caminhos que não são de ninguém
// (`/api/tarefas/`, `/api/asaas/`, `/operador/`…). Um caminho inexistente debaixo
// deles renderizava o 404 fora de `comTenant` — e o `getSettings()` da página e o
// do `Layout` caíam na barbearia de id 1: nome, telefone e endereço DELA, com o
// JSON-LD junto, no endereço de outra. Reproduzido no build na varredura de 26/10.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('o 404 fora de barbearia', () => {
  const pagina = readFileSync('src/pages/404.astro', 'utf8');
  const frontmatter = pagina.slice(0, pagina.indexOf('---', 4));

  it('sem barbearia na requisição, responde 404 seco — antes de ler settings', () => {
    const recusa = frontmatter.indexOf('armazemTenant.getStore()?.tenant');
    expect(recusa).toBeGreaterThan(-1);
    expect(recusa).toBeLessThan(frontmatter.indexOf('await getSettings('));
    expect(frontmatter).toMatch(/if \(!armazemTenant\.getStore\(\)\?\.tenant\) \{\s*return new Response\('Página não encontrada', \{ status: 404 \}\);/);
  });

  it('controle: os caminhos que o middleware deixa passar sem barbearia existem — é para eles que a recusa serve', () => {
    const mw = readFileSync('src/middleware.ts', 'utf8');
    for (const c of ["'/api/tarefas/'", "'/api/asaas/'"]) expect(mw).toContain(c);
  });
});
