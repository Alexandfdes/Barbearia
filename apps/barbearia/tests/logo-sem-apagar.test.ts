// Subir a logo ou a capa não apaga o que foi digitado e não salvo (varredura de 26/10, nº 6;
// achado de novo na revisão de 27/10/2026, porque não tinha sido consertado).
//
// A imagem sobe na hora e a página recarrega para mostrá-la. Antes de recarregar, o rascunho
// vai para a sessão da aba; depois, volta aos campos. Conferido no navegador contra o build:
// a frase digitada sobrevive ao envio da logo, e o banco continua sem ela até o Salvar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const tela = readFileSync('src/pages/admin/configuracoes.astro', 'utf8');

describe('as imagens de Configurações', () => {
  it('todo recarregar depois de subir ou remover imagem guarda o rascunho antes', () => {
    const recargas = tela.match(/location\.reload\(\)/g) ?? [];
    const guardadas = tela.match(/guardarRascunho\(\);\s*location\.reload\(\)/g) ?? [];
    expect(recargas.length).toBeGreaterThan(0);
    expect(guardadas.length).toBe(recargas.length);
  });

  it('o rascunho volta aos campos ao abrir a tela', () => {
    expect(tela).toMatch(/function devolverRascunho\(\)/);
    expect(tela).toMatch(/\n\s*devolverRascunho\(\);/);
  });
});
