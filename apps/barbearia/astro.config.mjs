// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
// output: 'server' — renderização sob demanda (SSR) é o PADRÃO. As páginas
// estáticas optam explicitamente com "export const prerender = true" (landing,
// agendar, 404, produtos/[slug]). Assim, uma rota nova criada sem o opt-in
// nasce dinâmica (auth e dados frescos garantidos) em vez de virar estática
// silenciosamente — que era o risco do modo 'static'.
export default defineConfig({
  output: 'server',
  // Atrás do proxy do EasyPanel, a origem que o Astro monta a partir da requisição
  // não batia com a do navegador, e a proteção CSRF nativa (checkOrigin) barrava
  // POST/PATCH/DELETE de formulário com "Cross-site ... form submissions are
  // forbidden". Por isso, desligada.
  //
  // ⚠️ Até 09/10/2026 este comentário dizia que o SameSite=Lax do cookie bastava.
  // Basta contra outro SITE, não contra outro SUBDOMÍNIO — e os sites das
  // barbearias são subdomínios do painel. Quem confere a origem agora é o
  // `src/middleware.ts`, pelo nome do endereço (`src/lib/origem.ts`,
  // `docs/PENDENCIAS-ABERTAS.md` §2.30).
  security: { checkOrigin: false },
  adapter: node({ mode: 'standalone' }),
  // ⚠️ Desde o Astro 7 o padrão é 'jsx', que apaga o espaço entre elementos de
  // linha (`<strong>…</strong> — texto` vira `…</strong>— texto`). As telas foram
  // escritas com a regra antiga, e a troca apagaria espaços em silêncio, tela a
  // tela. `true` é o comportamento do Astro 6 (atualizado em 09/10/2026).
  compressHTML: true,
  vite: {
    plugins: [tailwindcss()]
  }
});
