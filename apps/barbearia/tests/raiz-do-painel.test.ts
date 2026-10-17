// O endereço do painel sem o `/admin` (17/10/2026).
//
// `painel.<domínio>` é o endereço que o dono digita de cabeça — e até aqui ele dava
// "Barbearia não encontrada": a raiz é a página inicial do SITE, e o painel não é
// barbearia nenhuma. Agora a raiz do painel leva ao painel; todo outro endereço sem
// barbearia segue no 404 — o que impede um domínio qualquer apontado para o servidor
// de mostrar o site de alguém (o passo 6, `docs/ARQUITETURA-MULTI-TENANT-V1.md` §9).
//
// A página não roda no vitest (é `.astro`); o comportamento é conferido contra o build,
// e aqui fica a guarda do código e a da função que decide.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ehEnderecoDoPainel } from '../src/lib/tenant.js';
import { ehEnderecoDoPainel as doOperador } from '../src/lib/operador.js';

describe('a raiz do painel', () => {
  const pagina = readFileSync('src/pages/index.astro', 'utf8');

  it('leva ao painel só quando o endereço é o do painel, e só depois de nenhuma barbearia responder', () => {
    const semBarbearia = pagina.indexOf('if (!tenantDoHost(Astro.request)) {');
    const doPainel = pagina.indexOf("if (ehEnderecoDoPainel(Astro.request.headers.get('host'), urlDoPainel())) {");
    const redireciona = pagina.indexOf("return Astro.redirect('/admin', 302);");
    const quatroZeroQuatro = pagina.indexOf("return new Response('Barbearia não encontrada', { status: 404 });");
    expect(semBarbearia).toBeGreaterThan(0);
    // Dentro do "sem barbearia", e antes do 404 — que continua sendo a saída de todo o resto.
    expect(doPainel).toBeGreaterThan(semBarbearia);
    expect(redireciona).toBeGreaterThan(doPainel);
    expect(quatroZeroQuatro).toBeGreaterThan(redireciona);
  });

  it('o endereço do painel se decide num lugar só — o mesmo que abre o painel do operador', () => {
    expect(doOperador).toBe(ehEnderecoDoPainel);
    expect(ehEnderecoDoPainel('painel.fadeline.com.br', 'https://painel.fadeline.com.br')).toBe(true);
    expect(ehEnderecoDoPainel('zedabarbearia.fadeline.com.br', 'https://painel.fadeline.com.br')).toBe(false);
    expect(ehEnderecoDoPainel('outro-dominio.com', 'https://painel.fadeline.com.br')).toBe(false);
    // Sem painel configurado, nenhum endereço é o dele — a raiz segue no 404.
    expect(ehEnderecoDoPainel('painel.fadeline.com.br', '')).toBe(false);
  });
});
