# Estágio 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Estágio 2: Produção (Node.js — Astro standalone com @astrojs/node)
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
RUN apk add --no-cache postgresql16-client

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# As 20 fotos do carrossel do Bayron, para `scripts/importar-galeria-bayron.mjs`
# levar para a galeria do banco (migration 0005). O `src/` não entra na imagem, e
# sem isto o script não teria de onde ler — passo do ROTEIRO-MIGRACAO-PRODUCAO.
# Depois de importadas em produção, esta linha e as fotos do repositório podem sair.
COPY --from=build /app/src/assets/fotos-videos/carrosel*.jpg ./seed/galeria-bayron/

# Volume persistente: uploads (/data/uploads) e os backups (/data/backups).
# O banco não mora mais aqui — é Postgres, num serviço separado.
VOLUME ["/data"]
EXPOSE 4321

# Roda as migrations, sobe os daemons — o de backup (diário às 03:00) e o dos avisos
# por e-mail (de hora em hora, `scripts/avisos-daemon.mjs`) — e inicia o servidor
CMD ["sh", "-c", "node scripts/startup.mjs && (node scripts/backup-daemon.mjs &) && (node scripts/avisos-daemon.mjs &) && node dist/server/entry.mjs"]
