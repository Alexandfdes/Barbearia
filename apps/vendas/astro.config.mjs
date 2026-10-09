// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// Mesma convenção do projeto da barbearia: SSR é o padrão, páginas estáticas
// optam explicitamente com "export const prerender = true".
export default defineConfig({
  output: 'server',
  security: { checkOrigin: false },
  adapter: node({ mode: 'standalone' }),
  // ⚠️ Desde o Astro 7 o padrão é 'jsx', que apaga o espaço entre elementos de
  // linha (`<strong>…</strong> — texto` vira `…</strong>— texto`). As telas foram
  // escritas com a regra antiga, e a troca apagaria espaços em silêncio, tela a
  // tela. `true` é o comportamento do Astro 6 (atualizado em 09/10/2026).
  compressHTML: true,
  vite: { plugins: [tailwindcss()] },
});
