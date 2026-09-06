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
  vite: { plugins: [tailwindcss()] },
});
