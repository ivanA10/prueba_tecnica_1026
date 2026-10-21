# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/auth-service/Dockerfile .)
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates   && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/auth-service ./apps/auth-service
RUN pnpm install --frozen-lockfile --filter "@toka/auth-service..."
# Builds the shared @toka/* packages first, then prisma generate + tsc for the service.
RUN pnpm --filter "@toka/auth-service..." build

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates   && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/auth-service
EXPOSE 3001
# Migrations are applied on start (idempotent); then the service boots.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
