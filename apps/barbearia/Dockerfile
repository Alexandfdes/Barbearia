# Estágio 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Estágio 2: só as dependências de PRODUÇÃO.
#
# Até 11/10/2026 a imagem levava o `node_modules` inteiro do build — TypeScript,
# vitest, drizzle-kit e o esbuild antigo que vem com ele, com 4 falhas de segurança
# moderadas conhecidas (`npm audit`). Nada disso roda em produção. Instalado à parte,
# a partir do mesmo lock, só com o que o app e os scripts de suporte usam: o
# `npm audit --omit=dev` dá zero. O `tsx` é dependência de produção de propósito:
# é com ele que o provisionador roda no console do container.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Estágio 3: Produção (Node.js — Astro standalone com @astrojs/node)
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Onde a mídia enviada pelo dono da barbearia mora. Explícito de propósito:
# quando esta raiz saía de `DATABASE_PATH`, o porte para Postgres tirou a
# variável do `.env` e ela virou relativa — `/app/data/uploads`, dentro da
# camada da imagem, fora do volume. As fotos sumiriam no deploy seguinte.
ENV UPLOAD_ROOT=/data/uploads

# `pg_dump` NÃO vem no node:22-alpine, e `scripts/backup.mjs` é um wrapper dele.
# Sem esta linha o app sobe normalmente e TODO backup falha — o container fica
# rodando, o log reclama uma vez a cada 24h e ninguém percebe até precisar
# restaurar. A versão acompanha a do servidor: pg_dump mais VELHO que o
# servidor se recusa a rodar.
# O `tini` é o processo 1 (ENTRYPOINT, abaixo). Desde 27/10/2026: sem ele, o `sh` do
# Alpine passava o servidor a processo 1, e o Linux não entrega SIGTERM a processo 1
# que não o trata — todo redeploy esperava o prazo do orquestrador (~10 s) e acabava em
# SIGKILL. O `-g` manda o sinal ao grupo inteiro: o servidor e os dois daemons.
RUN apk add --no-cache postgresql16-client tini

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# O provisionador (`npm run db:provisionar`, `scripts/provisionar.mts`) importa o
# código de `src/lib` e `src/db` — e o `src/` não entrava na imagem: o script nunca
# rodou no container, e o documento de produção mandava rodá-lo lá. Só as duas
# pastas: o resto do `src/` já está compilado no `dist/`.
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/src/db ./src/db

# As 20 fotos do carrossel do Bayron, para `scripts/importar-galeria-bayron.mjs`
# levar para a galeria do banco (migration 0005). O `src/` não entra na imagem, e
# sem isto o script não teria de onde ler — passo do ROTEIRO-MIGRACAO-PRODUCAO.
# Depois de importadas em produção, esta linha e as fotos do repositório podem sair.
COPY --from=build /app/src/assets/fotos-videos/carrosel*.jpg ./seed/galeria-bayron/

# Volume persistente: uploads (/data/uploads) e os backups (/data/backups).
# O banco não mora mais aqui — é Postgres, num serviço separado.
VOLUME ["/data"]
EXPOSE 4321

# A saúde, para o orquestrador reiniciar o container que parou de responder. Até
# 26/10/2026 não havia: o app travado (o pool, `src/db/index.ts`) continuava com o
# processo vivo, e nada o reiniciava. `/api/saude` responde 503 quando o banco não
# responde em 3 s. O prazo de partida é longo de propósito: no deploy com migration,
# o boot faz o backup antes — com o banco grande, minutos — e matar o container no
# meio seria pior que esperar. A porta é a que o servidor ouve (o EasyPanel põe 80).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15m --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/api/saude').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Roda as migrations, sobe os daemons — o de backup (diário às 03:00) e o dos avisos
# por e-mail (de hora em hora, `scripts/avisos-daemon.mjs`) — e inicia o servidor
ENTRYPOINT ["/sbin/tini", "-g", "--"]
CMD ["sh", "-c", "node scripts/startup.mjs && (node scripts/backup-daemon.mjs &) && (node scripts/avisos-daemon.mjs &) && node dist/server/entry.mjs"]
