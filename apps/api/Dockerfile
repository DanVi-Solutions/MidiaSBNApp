FROM node:26.13.1-alpine AS base

FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@^2.11.13
COPY . .
RUN turbo prune midia_sbn_app-api --docker

FROM base AS installer
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=pruner /app/out/full/ .
RUN cd apps/api && npx prisma generate

FROM base AS runner
WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3333
ENV PATH=/app/node_modules/.bin:$PATH

COPY --from=installer --chown=node:node /app /app

USER node

EXPOSE 3333

CMD ["sh", "-c", "prisma migrate deploy && exec node src/server.js"]
